export const env = {
  appUrl: process.env.APP_URL || "http://localhost:8097",
  jwtSecret: process.env.JWT_SECRET || "bitte_ändern_langer_geheimer_wert",
  encryptionKey: process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || "bitte_ändern_langer_geheimer_wert",
  uploadPath: process.env.UPLOAD_PATH || "/app/uploads",
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES || 50 * 1024 * 1024),
  fileScannerHost: process.env.FILE_SCANNER_HOST || "clamav",
  fileScannerPort: Number(process.env.FILE_SCANNER_PORT || 3310),
  fileScannerTimeoutMs: Number(process.env.FILE_SCANNER_TIMEOUT_MS || 30_000),
  openAiApiKey: process.env.OPENAI_API_KEY || "",
  openAiTranscriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL || "whisper-1",
  emailSmtpHost: process.env.EMAIL_SMTP_HOST || "postfix",
  emailSmtpPort: Number(process.env.EMAIL_SMTP_PORT || 25),
  cronSecret: process.env.CRON_SECRET || ""
};
