const fs = require("node:fs/promises");
const net = require("node:net");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");
const uploadRoot = path.resolve(process.env.UPLOAD_PATH || "/app/uploads");
const scannerHost = process.env.FILE_SCANNER_HOST || "clamav";
const scannerPort = Number(process.env.FILE_SCANNER_PORT || 3310);
const scannerTimeout = Number(process.env.FILE_SCANNER_TIMEOUT_MS || 30000);
const eicar = Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*", "ascii");

function scan(bytes) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: scannerHost, port: scannerPort });
    const response = [];
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      callback();
    };

    socket.setTimeout(scannerTimeout);
    socket.on("connect", () => {
      socket.write(Buffer.from("zINSTREAM\0", "ascii"));
      const chunkSize = 64 * 1024;
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
        const length = Buffer.allocUnsafe(4);
        length.writeUInt32BE(chunk.length);
        socket.write(length);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
    socket.on("data", (chunk) => response.push(chunk));
    socket.on("end", () => finish(() => resolve(Buffer.concat(response).toString("utf8").replace(/\0/g, "").trim())));
    socket.on("timeout", () => finish(() => reject(new Error("scanner_timeout"))));
    socket.on("error", () => finish(() => reject(new Error("scanner_unavailable"))));
  });
}

function absoluteStoragePath(storagePath) {
  const candidate = path.resolve(uploadRoot, storagePath);
  if (!candidate.startsWith(`${uploadRoot}${path.sep}`)) throw new Error("invalid_storage_path");
  return candidate;
}

async function assertScanner() {
  const clean = await scan(Buffer.from("Playplaner file backfill health probe", "utf8"));
  if (!/\bOK$/i.test(clean)) throw new Error("scanner_clean_probe_failed");
  const infected = await scan(eicar);
  if (!/\bFOUND$/i.test(infected)) throw new Error("scanner_eicar_probe_failed");
}

async function main() {
  await assertScanner();
  const assets = await prisma.fileAsset.findMany({
    where: { scanStatus: { in: ["PENDING", "ERROR"] } },
    select: { id: true, storagePath: true, scanStatus: true },
    orderBy: { createdAt: "asc" }
  });
  const result = { checked: 0, clean: 0, rejected: 0, missing: 0, errors: 0, updated: 0 };

  for (const asset of assets) {
    try {
      const bytes = await fs.readFile(absoluteStoragePath(asset.storagePath));
      result.checked += 1;
      const response = await scan(bytes);
      if (/\bOK$/i.test(response)) {
        result.clean += 1;
        if (apply) {
          const updated = await prisma.fileAsset.updateMany({
            where: { id: asset.id, scanStatus: asset.scanStatus },
            data: { scanStatus: "CLEAN", safetyCheckedAt: new Date(), quarantinedAt: null }
          });
          result.updated += updated.count;
        }
      } else if (/\bFOUND$/i.test(response)) {
        result.rejected += 1;
        if (apply) {
          const updated = await prisma.fileAsset.updateMany({
            where: { id: asset.id, scanStatus: asset.scanStatus },
            data: { scanStatus: "REJECTED", contentClassification: "QUARANTINED", safetyCheckedAt: new Date(), quarantinedAt: new Date() }
          });
          result.updated += updated.count;
        }
      } else {
        result.errors += 1;
      }
    } catch (error) {
      if (error && error.code === "ENOENT") result.missing += 1;
      else result.errors += 1;
    }
  }

  console.log(`FILE_SCAN_BACKFILL_${apply ? "APPLIED" : "DRY_RUN"} checked=${result.checked} clean=${result.clean} rejected=${result.rejected} missing=${result.missing} errors=${result.errors} updated=${result.updated}`);
  if (result.rejected || result.missing || result.errors) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(`FILE_SCAN_BACKFILL_FAILED:${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
