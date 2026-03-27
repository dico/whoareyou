export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    name: process.env.DB_NAME || 'whoareyou',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-in-production',
    expiresIn: '15m',
  },

  session: {
    refreshExpiresInDays: 30,
    trustedRefreshExpiresInDays: 365,
    maxPerUser: 10,
    cleanupIntervalMs: 60 * 60 * 1000, // 1 hour
  },

  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },

  // WebAuthn / Passkeys
  webauthn: {
    rpName: process.env.WEBAUTHN_RP_NAME || 'WhoareYou',
    rpID: process.env.WEBAUTHN_RP_ID || process.env.VIRTUAL_HOST || 'localhost',
    origin: process.env.WEBAUTHN_ORIGIN || (process.env.VIRTUAL_HOST ? `https://${process.env.VIRTUAL_HOST}` : 'http://localhost:8080'),
  },

  // Trusted IP ranges — 2FA is not required from these networks
  // Comma-separated CIDR or single IPs: "192.168.1.0/24,10.0.0.0/8"
  trustedIpRanges: process.env.TRUSTED_IP_RANGES || '',

  uploads: {
    dir: process.env.UPLOADS_DIR || '/app/uploads',
    maxFileSize: 10 * 1024 * 1024, // 10 MB
    image: {
      maxWidth: 1920,
      thumbnailSize: 200,
      avatarSize: 80,
      quality: 80,
    },
  },
};
