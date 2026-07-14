import net from "net";
import { env } from "@/lib/env";

export class FileScanUnavailableError extends Error {
  constructor(message = "Die Sicherheitspruefung ist voruebergehend nicht verfuegbar") {
    super(message);
    this.name = "FileScanUnavailableError";
  }
}

export class FileRejectedError extends Error {
  constructor(message = "Die Datei wurde durch die Sicherheitspruefung abgelehnt") {
    super(message);
    this.name = "FileRejectedError";
  }
}

function scannerResponse(buffer: Buffer) {
  return buffer.toString("utf8").replace(/\0/g, "").trim();
}

export async function assertMalwareFree(bytes: Buffer) {
  if (!bytes.length) throw new FileRejectedError("Die Datei ist leer");

  const response = await new Promise<string>((resolve, reject) => {
    const socket = net.createConnection({ host: env.fileScannerHost, port: env.fileScannerPort });
    const chunks: Buffer[] = [];
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      callback();
    };

    socket.setTimeout(env.fileScannerTimeoutMs);
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
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.on("end", () => finish(() => resolve(scannerResponse(Buffer.concat(chunks)))));
    socket.on("timeout", () => finish(() => reject(new FileScanUnavailableError("Die Sicherheitspruefung hat zu lange gedauert"))));
    socket.on("error", () => finish(() => reject(new FileScanUnavailableError())));
  });

  if (/\bOK$/i.test(response)) return;
  if (/\bFOUND$/i.test(response)) throw new FileRejectedError();
  throw new FileScanUnavailableError();
}
