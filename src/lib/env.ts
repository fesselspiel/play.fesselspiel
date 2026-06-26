export const env = {
  appUrl: process.env.APP_URL || "http://localhost:8097",
  jwtSecret: process.env.JWT_SECRET || "bitte_ändern_langer_geheimer_wert",
  encryptionKey: process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || "bitte_ändern_langer_geheimer_wert",
  uploadPath: process.env.UPLOAD_PATH || "/app/uploads",
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES || 50 * 1024 * 1024),
  openAiApiKey: process.env.OPENAI_API_KEY || "",
  openAiTranscriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL || "whisper-1",
  emailSmtpHost: process.env.EMAIL_SMTP_HOST || "postfix",
  emailSmtpPort: Number(process.env.EMAIL_SMTP_PORT || 25),
  cronSecret: process.env.CRON_SECRET || "",
  apnsTeamId: process.env.APNS_TEAM_ID || "",
  apnsKeyId: process.env.APNS_KEY_ID || "",
  apnsBundleId: process.env.APNS_BUNDLE_ID || "fspiel.playplaner",
  apnsPrivateKey: (process.env.APNS_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  apnsEnvironment: process.env.APNS_ENVIRONMENT || "production"
};
