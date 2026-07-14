const net = require("net");

const host = process.env.FILE_SCANNER_HOST || "127.0.0.1";
const port = Number(process.env.FILE_SCANNER_PORT || 3310);
const timeout = Number(process.env.FILE_SCANNER_TIMEOUT_MS || 5000);
const eicar = Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*", "ascii");

function scan(bytes) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const chunks = [];
    socket.setTimeout(timeout);
    socket.on("connect", () => {
      socket.write(Buffer.from("zINSTREAM\0", "ascii"));
      const length = Buffer.allocUnsafe(4);
      length.writeUInt32BE(bytes.length);
      socket.write(length);
      socket.write(bytes);
      socket.write(Buffer.alloc(4));
    });
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.on("end", () => resolve(Buffer.concat(chunks).toString("utf8").replace(/\0/g, "").trim()));
    socket.on("timeout", () => reject(new Error("Scanner timeout")));
    socket.on("error", reject);
  });
}

async function main() {
  const clean = await scan(Buffer.from("Playplaner scanner health probe", "utf8"));
  if (!/\bOK$/i.test(clean)) throw new Error(`Clean-Probe unerwartet: ${clean}`);
  const infected = await scan(eicar);
  if (!/\bFOUND$/i.test(infected)) throw new Error(`EICAR nicht erkannt: ${infected}`);
  console.log("CLAMAV_INSTREAM_CLEAN_AND_EICAR_OK");
}

main().catch((error) => {
  console.error(`CLAMAV_INSTREAM_FAILED: ${error.message}`);
  process.exit(1);
});
