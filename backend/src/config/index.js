const env = process.env.NODE_ENV || 'development';
const isProd = env === 'production';

// Fail-fast on required secrets in production. The app would boot with a
// well-known default for JWT_SECRET ('change-me-in-production') and an
// open-all CORS policy ('*'); either one is trivially exploitable if it
// ships. Crashing at startup is a deliberate forcing function — ops must
// set the env vars before the container starts serving traffic.
if (isProd) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-me-in-production') {
    throw new Error('JWT_SECRET must be set to a strong random value in production');
  }
  if (!process.env.CORS_ORIGIN) {
    throw new Error('CORS_ORIGIN must be set in production (comma-separated list of allowed origins, not "*")');
  }
  if (process.env.CORS_ORIGIN.trim() === '*') {
    throw new Error('CORS_ORIGIN cannot be "*" in production — credentialed requests with a wildcard origin are unsafe');
  }
}

export const config = {
  env,
  port: parseInt(process.env.PORT || '3000', 10),

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    name: process.env.DB_NAME || 'whoareyou',
  },

  jwt: {
    // Dev gets a predictable default so local setup Just Works — the string
    // here is matched by the prod guard above to reject it. Don't change
    // this value casually; existing dev tokens were signed with it and
    // would become invalid, logging everyone out of the dev stack.
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
    // Dev default: permissive so `npm run dev` on any port works out of the
    // box. Prod is required to be explicit (enforced above).
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
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 100 * 1024 * 1024, // 100 MB (videos)
    image: {
      maxWidth: 1920,
      thumbnailSize: 200,
      avatarSize: 80,
      quality: 80,
    },
  },
};
