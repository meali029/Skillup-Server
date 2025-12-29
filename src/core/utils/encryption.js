import crypto from 'crypto';

/**
 * Encryption utilities for sensitive payment data
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Get encryption key from environment or generate one
 */
const getEncryptionKey = () => {
  const key = process.env.PAYMENT_ENCRYPTION_KEY;
  if (!key) {
    console.warn('PAYMENT_ENCRYPTION_KEY not set. Using default key (NOT SECURE FOR PRODUCTION)');
    // In production, this should throw an error
    return crypto.scryptSync('default-key-change-in-production', 'salt', KEY_LENGTH);
  }
  return Buffer.from(key, 'hex');
};

/**
 * Encrypt sensitive data
 * @param {string} text - Text to encrypt
 * @returns {string} Encrypted string (base64 encoded)
 */
export const encrypt = (text) => {
  if (!text) return null;
  
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag();
    
    // Combine iv, tag, and encrypted data
    const combined = Buffer.concat([
      iv,
      tag,
      Buffer.from(encrypted, 'hex'),
    ]);
    
    return combined.toString('base64');
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
};

/**
 * Decrypt sensitive data
 * @param {string} encryptedText - Encrypted string (base64 encoded)
 * @returns {string} Decrypted text
 */
export const decrypt = (encryptedText) => {
  if (!encryptedText) return null;
  
  try {
    const key = getEncryptionKey();
    const combined = Buffer.from(encryptedText, 'base64');
    
    const iv = combined.slice(0, IV_LENGTH);
    const tag = combined.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = combined.slice(IV_LENGTH + TAG_LENGTH);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encrypted, null, 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
};

/**
 * Hash sensitive data (one-way, for verification)
 * @param {string} text - Text to hash
 * @returns {string} Hashed string
 */
export const hash = (text) => {
  if (!text) return null;
  return crypto.createHash('sha256').update(text).digest('hex');
};

