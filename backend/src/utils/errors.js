export class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  // Multer file upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large' });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ error: 'Too many files (max 50)' });
  }
  if (err.code?.startsWith('LIMIT_')) {
    return res.status(400).json({ error: 'Upload limit exceeded' });
  }

  // Body parser errors
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
}
