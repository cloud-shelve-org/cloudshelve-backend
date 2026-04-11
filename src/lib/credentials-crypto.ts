import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;   // 96-bit IV recommended for GCM
const TAG_LENGTH = 16;  // 128-bit auth tag

function getKey(): Buffer {
  const keyHex = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!keyHex) throw new Error('CREDENTIALS_ENCRYPTION_KEY environment variable is not set');
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
  }
  return key;
}

/**
 * Encrypt a plain credentials object for storage in the DB.
 * Returns `{ encrypted: "<iv>:<authTag>:<ciphertext>" }` (all hex-encoded).
 */
export function encryptCredentials(credentials: Record<string, any>): Record<string, any> {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const plaintext = JSON.stringify(credentials);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encrypted: `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`,
  };
}

/**
 * Decrypt credentials read from the DB.
 * Handles both encrypted `{ encrypted: "..." }` and legacy plain objects gracefully.
 */
export function decryptCredentials(stored: Record<string, any>): Record<string, any> {
  if (!stored.encrypted) {
    // Legacy plain credentials — return as-is (no encryption key applied yet)
    return stored;
  }

  const key = getKey();
  const parts = (stored.encrypted as string).split(':');
  if (parts.length !== 3) throw new Error('Malformed encrypted credential blob');

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}
