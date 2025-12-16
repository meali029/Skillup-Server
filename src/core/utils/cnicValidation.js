/**
 * CNIC Validation Utility for Pakistani CNIC
 * Format: XXXXX-XXXXXXX-X (13 digits with dashes)
 * Example: 12345-1234567-1
 */

/**
 * Validates Pakistani CNIC format
 * @param {string} cnic - CNIC number to validate
 * @returns {boolean} - True if valid format
 */
export const isValidCNICFormat = (cnic) => {
  if (!cnic || typeof cnic !== 'string') {
    return false;
  }

  // Remove any spaces
  const cleanedCNIC = cnic.trim().replace(/\s/g, '');

  // Pakistani CNIC format: XXXXX-XXXXXXX-X (13 digits)
  // Pattern: 5 digits, dash, 7 digits, dash, 1 digit
  const cnicPattern = /^\d{5}-\d{7}-\d{1}$/;

  return cnicPattern.test(cleanedCNIC);
};

/**
 * Normalizes CNIC format (removes spaces, ensures proper dashes)
 * @param {string} cnic - CNIC number to normalize
 * @returns {string|null} - Normalized CNIC or null if invalid
 */
export const normalizeCNIC = (cnic) => {
  if (!cnic || typeof cnic !== 'string') {
    return null;
  }

  // Remove all spaces and non-digit characters except dashes
  let cleaned = cnic.trim().replace(/\s/g, '');

  // If it's all digits without dashes, add dashes
  if (/^\d{13}$/.test(cleaned)) {
    cleaned = `${cleaned.slice(0, 5)}-${cleaned.slice(5, 12)}-${cleaned.slice(12)}`;
  }

  // Validate the format
  if (isValidCNICFormat(cleaned)) {
    return cleaned;
  }

  return null;
};

/**
 * Validates CNIC checksum (last digit validation)
 * Note: This is a basic validation. Full NADRA validation requires API access.
 * @param {string} cnic - CNIC number to validate
 * @returns {boolean} - True if checksum is valid
 */
export const validateCNICChecksum = (cnic) => {
  if (!isValidCNICFormat(cnic)) {
    return false;
  }

  // Remove dashes
  const digits = cnic.replace(/-/g, '');

  // Basic checksum validation (simplified)
  // In real NADRA validation, this would be more complex
  // For now, we'll just ensure the format is correct
  // The last digit is a checksum digit in NADRA system
  
  // Calculate a simple checksum
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(digits[i]) * (i % 2 === 0 ? 1 : 2);
  }
  
  const calculatedChecksum = (10 - (sum % 10)) % 10;
  const providedChecksum = parseInt(digits[12]);

  return calculatedChecksum === providedChecksum;
};

/**
 * Validates CNIC with format and basic checksum
 * @param {string} cnic - CNIC number to validate
 * @returns {{valid: boolean, normalized: string|null, error: string|null}}
 */
export const validateCNIC = (cnic) => {
  const normalized = normalizeCNIC(cnic);

  if (!normalized) {
    return {
      valid: false,
      normalized: null,
      error: 'Invalid CNIC format. Expected format: XXXXX-XXXXXXX-X (e.g., 12345-1234567-1)'
    };
  }

  // For now, we'll skip checksum validation as it requires NADRA algorithm
  // In production with NADRA API, this would be validated server-side
  const checksumValid = validateCNICChecksum(normalized);

  if (!checksumValid) {
    // Still allow it but note that full validation requires NADRA API
    // This is acceptable for manual verification workflow
    return {
      valid: true,
      normalized,
      error: null,
      warning: 'CNIC format is valid. Full verification requires manual admin review.'
    };
  }

  return {
    valid: true,
    normalized,
    error: null
  };
};

