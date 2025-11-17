import crypto from 'crypto';
import bcrypt from 'bcryptjs';

// Generate a 6-digit OTP
export const generateOTP = () => {
  // Generate a random 6-digit number
  const otp = crypto.randomInt(100000, 999999).toString();
  return otp;
};

// Hash OTP before storing in database
export const hashOTP = async (otp) => {
  try {
    const salt = await bcrypt.genSalt(10);
    const hashedOTP = await bcrypt.hash(otp, salt);
    return hashedOTP;
  } catch (error) {
    throw new Error('Failed to hash OTP');
  }
};

// Verify OTP against hashed version
export const verifyOTP = async (plainOTP, hashedOTP) => {
  try {
    const isValid = await bcrypt.compare(plainOTP, hashedOTP);
    return isValid;
  } catch (error) {
    throw new Error('Failed to verify OTP');
  }
};

// Calculate OTP expiry time (10 minutes from now)
export const getOTPExpiry = () => {
  const expiryTime = new Date();
  expiryTime.setMinutes(expiryTime.getMinutes() + 10);
  return expiryTime;
};

// Check if OTP has expired
export const isOTPExpired = (expiryDate) => {
  return new Date() > new Date(expiryDate);
};

// Generate OTP data object (hashed OTP + expiry)
export const generateOTPData = async () => {
  const otp = generateOTP();
  const hashedOTP = await hashOTP(otp);
  const expiry = getOTPExpiry();
  
  return {
    otp, // Plain OTP to send via email
    hashedOTP, // Hashed OTP to store in database
    expiry, // Expiry timestamp
  };
};
