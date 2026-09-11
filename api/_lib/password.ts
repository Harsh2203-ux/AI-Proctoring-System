import bcrypt from 'bcryptjs';

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&^#_\-])[A-Za-z\d@$!%*?&^#_\-]{8,}$/;

export function validatePassword(password: string, confirm: string): string | null {
  if (password !== confirm) return 'Passwords do not match';
  if (!PASSWORD_RE.test(password)) {
    return 'Password must be at least 8 characters and include uppercase, lowercase, a digit, and a special character (@$!%*?&^#_-)';
  }
  return null;
}
