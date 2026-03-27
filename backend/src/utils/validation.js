import { AppError } from './errors.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email) {
  if (!email || !EMAIL_REGEX.test(email)) {
    throw new AppError('Invalid email address');
  }
  return email.toLowerCase().trim();
}

export function validateRequired(fields, body) {
  for (const field of fields) {
    if (!body[field] || (typeof body[field] === 'string' && !body[field].trim())) {
      throw new AppError(`${field} is required`);
    }
  }
}

export function validatePassword(password) {
  if (!password || password.length < 8) {
    throw new AppError('Password must be at least 8 characters');
  }
  return password;
}
