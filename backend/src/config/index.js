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
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

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
