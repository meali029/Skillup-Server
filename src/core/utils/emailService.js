import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { getEmailQueue, addJob } from '../../config/queues.js';
import { isRedisConnected } from '../../config/redis.js';

// Create reusable transporter
// - `EMAIL_DEBUG=true` enables nodemailer debug output (only enable temporarily)
// - `EMAIL_CONNECTION_TIMEOUT` controls SMTP connection timeout (ms)
const createTransporter = () => {
  const transporterOptions = {
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT, 10) || 587,
    secure: process.env.EMAIL_SECURE === 'true' || false, // set true for port 465
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
    logger: process.env.EMAIL_DEBUG === 'true',
    debug: process.env.EMAIL_DEBUG === 'true',
    connectionTimeout: parseInt(process.env.EMAIL_CONNECTION_TIMEOUT, 10) || 10000,
  };

  return nodemailer.createTransport(transporterOptions);
};

// Get frontend URL from environment - CRITICAL for local/production consistency
const getFrontendUrl = () => {
  // Use FRONTEND_URL first, fallback to CLIENT_URL for backward compatibility
  const url = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:5173';
  // Remove trailing slash if present
  return url.replace(/\/$/, '');
};

// Get backend API URL for email verification links
const getBackendApiUrl = () => {
  // Use API_URL or construct from PORT
  const port = process.env.PORT || 5000;
  const url = process.env.API_URL || `http://localhost:${port}`;
  // Remove trailing slash if present
  return url.replace(/\/$/, '');
};

// Generate email verification token
export const generateEmailVerificationToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Send email verification email (direct SMTP — used by worker)
export const directSendEmailVerification = async (email, name, verificationToken) => {
  try {
    const transporter = createTransporter();
    // CRITICAL: Use backend API URL for verification - the backend handles verification and redirects to frontend
    const backendApiUrl = getBackendApiUrl();
    const verificationLink = `${backendApiUrl}/api/auth/verify-email?token=${verificationToken}`;
    const mailOptions = {
      from: `"SkillUp" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Verify Your Email - SkillUp',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #2F3E46; background-color: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
            .header { background: linear-gradient(135deg, #84A98C 0%, #52796F 100%); padding: 40px 30px; text-align: center; }
            .header h1 { color: #ffffff; font-size: 28px; font-weight: 600; margin: 0; }
            .header p { color: #CAD2C5; font-size: 14px; margin-top: 8px; }
            .content { padding: 40px 30px; background: #ffffff; }
            .greeting { font-size: 16px; color: #2F3E46; margin-bottom: 20px; }
            .greeting strong { color: #52796F; }
            .message { font-size: 15px; color: #354F52; margin-bottom: 30px; line-height: 1.7; }
            .button-container { text-align: center; margin: 30px 0; }
            .verify-button { display: inline-block; background: linear-gradient(135deg, #84A98C 0%, #52796F 100%); color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; }
            .verify-button:hover { opacity: 0.9; }
            .link-box { background: #F8F9FA; border: 1px solid #CAD2C5; border-radius: 8px; padding: 15px; margin: 20px 0; word-break: break-all; font-size: 12px; color: #52796F; }
            .warning-box { background: #FFF9E6; border-left: 4px solid #84A98C; padding: 20px; margin: 30px 0; border-radius: 6px; }
            .warning-box strong { color: #52796F; font-size: 15px; display: block; margin-bottom: 10px; }
            .warning-box p { color: #354F52; font-size: 14px; margin: 5px 0; }
            .footer { background: #2F3E46; padding: 30px; text-align: center; }
            .footer p { color: #CAD2C5; font-size: 13px; margin: 5px 0; }
            .footer a { color: #84A98C; text-decoration: none; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✉️ Email Verification</h1>
              <p>One more step to activate your account</p>
            </div>
            <div class="content">
              <p class="greeting">Hi <strong>${name}</strong>,</p>
              <p class="message">Welcome to SkillUp! Please verify your email address to complete your registration and access all features of the platform.</p>
              
              <div class="button-container">
                <a href="${verificationLink}" class="verify-button">Verify Email Address</a>
              </div>
              
              <p class="message" style="font-size: 13px; text-align: center; color: #666;">
                Or copy and paste this link in your browser:
              </p>
              <div class="link-box">
                ${verificationLink}
              </div>
              
              <div class="warning-box">
                <strong>⏱ Link Expiry</strong>
                <p>This verification link will expire in 24 hours.</p>
                <p>If you didn't create an account with SkillUp, please ignore this email.</p>
              </div>
            </div>
            <div class="footer">
              <p><strong style="color: #84A98C;">SkillUp</strong></p>
              <p>Pakistan's Smart Freelancing Platform</p>
              <p>© ${new Date().getFullYear()} SkillUp. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Hi ${name},
        
        Welcome to SkillUp! Please verify your email address to complete your registration.
        
        Click the link below to verify your email:
        ${verificationLink}
        
        This link will expire in 24 hours.
        
        If you didn't create an account with SkillUp, please ignore this email.
        
        © ${new Date().getFullYear()} SkillUp - Pakistan's Smart Freelancing Platform
      `,
    };

    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error('[EmailService] Failed to send verification email:', error?.message || error);
    console.error('[EmailService] SMTP error details:', {
      code: error?.code,
      response: error?.response ? (typeof error.response === 'string' ? error.response : error.response.toString()) : undefined,
      responseCode: error?.responseCode,
      command: error?.command,
      stack: error?.stack,
    });
    throw new Error('Failed to send verification email');
  }
};

// Resend email verification
export const resendEmailVerification = async (email, name, verificationToken) => {
  const mailOptions = {
    to: email,
    subject: 'Verify Your Email - SkillUp',
    html: `Please verify`,
    text: `Please verify`,
  };

  // Delegate to unified verification sender (handles enqueue or direct)
  return sendEmailVerification(email, name, verificationToken);
};

// Send OTP email (direct SMTP — used by worker)
export const directSendOTPEmail = async (email, otp, name) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: `"SkillUp Support" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Password Reset OTP - SkillUp',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #2F3E46; background-color: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
            .header { background: linear-gradient(135deg, #84A98C 0%, #52796F 100%); padding: 40px 30px; text-align: center; }
            .header h1 { color: #ffffff; font-size: 28px; font-weight: 600; margin: 0; }
            .header p { color: #CAD2C5; font-size: 14px; margin-top: 8px; }
            .content { padding: 40px 30px; background: #ffffff; }
            .greeting { font-size: 16px; color: #2F3E46; margin-bottom: 20px; }
            .greeting strong { color: #52796F; }
            .message { font-size: 15px; color: #354F52; margin-bottom: 30px; line-height: 1.7; }
            .otp-box { background: #F8F9FA; border: 2px solid #CAD2C5; border-radius: 12px; padding: 30px; text-align: center; margin: 30px 0; }
            .otp-label { font-size: 14px; color: #52796F; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
            .otp-code { font-size: 36px; font-weight: 700; color: #84A98C; letter-spacing: 8px; margin: 15px 0; font-family: 'Courier New', monospace; }
            .otp-validity { font-size: 13px; color: #354F52; margin-top: 12px; }
            .warning-box { background: #FFF9E6; border-left: 4px solid #84A98C; padding: 20px; margin: 30px 0; border-radius: 6px; }
            .warning-box strong { color: #52796F; font-size: 15px; display: block; margin-bottom: 10px; }
            .warning-box ul { margin: 10px 0 0 20px; color: #354F52; }
            .warning-box li { margin: 8px 0; font-size: 14px; }
            .footer-note { font-size: 14px; color: #354F52; margin-top: 30px; padding-top: 20px; border-top: 1px solid #CAD2C5; }
            .footer { background: #2F3E46; padding: 30px; text-align: center; }
            .footer p { color: #CAD2C5; font-size: 13px; margin: 5px 0; }
            .footer a { color: #84A98C; text-decoration: none; }
            .divider { height: 1px; background: #CAD2C5; margin: 30px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 Password Reset Request</h1>
              <p>Secure verification code for your account</p>
            </div>
            <div class="content">
              <p class="greeting">Hi <strong>${name}</strong>,</p>
              <p class="message">We received a request to reset your password for your SkillUp account. To proceed with the password reset, please use the verification code below:</p>
              
              <div class="otp-box">
                <div class="otp-label">Your Verification Code</div>
                <div class="otp-code">${otp}</div>
                <div class="otp-validity">⏱ Valid for 10 minutes</div>
              </div>
              
              <div class="warning-box">
                <strong>🛡️ Security Guidelines</strong>
                <ul>
                  <li>This code expires in 10 minutes for your security</li>
                  <li>Never share this code with anyone, including SkillUp staff</li>
                  <li>We will never ask you for this code via phone or email</li>
                  <li>If you didn't request this, please ignore this email</li>
                </ul>
              </div>
              
              <p class="footer-note">If you didn't request a password reset, no action is needed. Your account remains secure. If you have concerns, please contact our support team.</p>
            </div>
            <div class="footer">
              <p><strong style="color: #84A98C;">SkillUp</strong></p>
              <p>© ${new Date().getFullYear()} SkillUp. All rights reserved.</p>
              <p style="margin-top: 15px;">Need help? Contact us at <a href="mailto:support@skillup.com">support@skillup.com</a></p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Hi ${name},
        
        We received a request to reset your password for your SkillUp account.
        
        Your OTP Code: ${otp}
        
        This code will expire in 10 minutes.
        
        Security Notice:
        - Never share this code with anyone
        - SkillUp staff will never ask for your OTP
        
        If you didn't request a password reset, please ignore this email.
        
        © ${new Date().getFullYear()} SkillUp
      `,
    };

    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error('[EmailService] Failed to send OTP email:', error?.message || error);
    console.error('[EmailService] SMTP error details:', {
      code: error?.code,
      response: error?.response ? (typeof error.response === 'string' ? error.response : error.response.toString()) : undefined,
      responseCode: error?.responseCode,
      command: error?.command,
      stack: error?.stack,
    });
    throw new Error('Failed to send OTP email');
  }
};

// Send password reset confirmation email (direct SMTP — used by worker)
export const directSendPasswordResetConfirmation = async (email, name) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: `"SkillUp Support" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Password Reset Successful - SkillUp',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #2F3E46; background-color: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
            .header { background: linear-gradient(135deg, #84A98C 0%, #52796F 100%); padding: 40px 30px; text-align: center; }
            .header h1 { color: #ffffff; font-size: 28px; font-weight: 600; margin: 0; }
            .header p { color: #CAD2C5; font-size: 14px; margin-top: 8px; }
            .content { padding: 40px 30px; background: #ffffff; }
            .greeting { font-size: 16px; color: #2F3E46; margin-bottom: 20px; }
            .greeting strong { color: #52796F; }
            .message { font-size: 15px; color: #354F52; margin-bottom: 30px; line-height: 1.7; }
            .success-box { background: #E8F5E9; border-left: 4px solid #84A98C; padding: 20px; margin: 30px 0; border-radius: 6px; text-align: center; }
            .success-box strong { color: #52796F; font-size: 18px; display: block; }
            .success-icon { font-size: 48px; margin-bottom: 15px; }
            .info-box { background: #FFF9E6; border-left: 4px solid #84A98C; padding: 20px; margin: 30px 0; border-radius: 6px; }
            .info-box strong { color: #52796F; font-size: 15px; display: block; margin-bottom: 10px; }
            .info-box p { color: #354F52; font-size: 14px; margin-top: 10px; }
            .security-tips { background: #F8F9FA; padding: 20px; border-radius: 8px; margin: 30px 0; }
            .security-tips strong { color: #52796F; font-size: 15px; display: block; margin-bottom: 15px; }
            .security-tips ul { margin: 0 0 0 20px; color: #354F52; }
            .security-tips li { margin: 10px 0; font-size: 14px; }
            .footer-note { font-size: 14px; color: #354F52; margin-top: 30px; padding-top: 20px; border-top: 1px solid #CAD2C5; }
            .footer { background: #2F3E46; padding: 30px; text-align: center; }
            .footer p { color: #CAD2C5; font-size: 13px; margin: 5px 0; }
            .footer a { color: #84A98C; text-decoration: none; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Password Reset Successful</h1>
              <p>Your account security has been updated</p>
            </div>
            <div class="content">
              <p class="greeting">Hi <strong>${name}</strong>,</p>
              
              <div class="success-box">
                <div class="success-icon">✓</div>
                <strong>Your password has been successfully reset!</strong>
              </div>
              
              <p class="message">You can now log in to your SkillUp account using your new password. Your account remains secure and ready to use.</p>
              
              <div class="info-box">
                <strong>⚠️ Didn't make this change?</strong>
                <p>If you didn't reset your password, your account may be compromised. Please contact our support team immediately at <a href="mailto:support@skillup.com" style="color: #84A98C;">support@skillup.com</a></p>
              </div>
              
              <div class="security-tips">
                <strong>🛡️ Security Best Practices</strong>
                <ul>
                  <li>Use a strong, unique password for your SkillUp account</li>
                  <li>Never share your password with anyone</li>
                  <li>Enable two-factor authentication when available</li>
                  <li>Regularly update your password every few months</li>
                  <li>Be cautious of phishing emails asking for your credentials</li>
                </ul>
              </div>
              
              <p class="footer-note">This password reset was completed from your account. If you have any questions or concerns, our support team is here to help.</p>
            </div>
            <div class="footer">
              <p><strong style="color: #84A98C;">SkillUp</strong></p>
              <p>© ${new Date().getFullYear()} SkillUp. All rights reserved.</p>
              <p style="margin-top: 15px;">Need help? Contact us at <a href="mailto:support@skillup.com">support@skillup.com</a></p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Hi ${name},
        
        Your password has been successfully reset!
        
        You can now log in to your SkillUp account using your new password.
        
        Didn't make this change?
        If you didn't reset your password, please contact our support team immediately at support@skillup.com
        
        For your security, we recommend:
        - Using a strong, unique password
        - Enabling two-factor authentication (if available)
        - Never sharing your password with anyone
        
        © ${new Date().getFullYear()} SkillUp
      `,
    };

    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error('[EmailService] Failed to send password-reset confirmation email:', error?.message || error);
    console.error('[EmailService] SMTP error details:', {
      code: error?.code,
      response: error?.response ? (typeof error.response === 'string' ? error.response : error.response.toString()) : undefined,
      responseCode: error?.responseCode,
      command: error?.command,
      stack: error?.stack,
    });
    throw new Error('Failed to send confirmation email');
  }
};

// ── Public API: enqueue via BullMQ (falls back to direct SMTP) ──────

export const sendEmailVerification = async (email, name, verificationToken) => {
  if (isRedisConnected()) {
    const job = await addJob(getEmailQueue(), 'send-verification', { type: 'send-verification', email, name, token: verificationToken }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
    if (job) return { success: true, queued: true, jobId: job.id };
  }
  return directSendEmailVerification(email, name, verificationToken);
};

export const sendOTPEmail = async (email, otp, name) => {
  if (isRedisConnected()) {
    const job = await addJob(getEmailQueue(), 'send-otp', { type: 'send-otp', email, otp, name }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
    if (job) return { success: true, queued: true, jobId: job.id };
  }
  return directSendOTPEmail(email, otp, name);
};

export const sendPasswordResetConfirmation = async (email, name) => {
  if (isRedisConnected()) {
    const job = await addJob(getEmailQueue(), 'send-password-reset', { type: 'send-password-reset', email, name }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
    if (job) return { success: true, queued: true, jobId: job.id };
  }
  return directSendPasswordResetConfirmation(email, name);
};

// Verify email configuration
export const verifyEmailConfig = async () => {
  // Quick sanity checks to fail fast when env vars are missing
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    console.warn('⚠️  Email service configuration missing: EMAIL_USER or EMAIL_PASSWORD is not set');
    console.warn('⚠️  Email functionality will be disabled');
    return false;
  }

  // Skip SMTP verification in production to avoid blocking startup
  // (Many PaaS providers block outbound SMTP ports 25/465/587)
  if (process.env.NODE_ENV === 'production') {
    console.info('[EmailService] Running in production - skipping SMTP verification');
    console.info('[EmailService] Email sending will be attempted at runtime');
    return true;
  }

  // In development, verify SMTP connection
  try {
    const transporter = createTransporter();
    // set a short timeout for verification to avoid long startup delays
    const verifyPromise = transporter.verify();
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP verify timeout')), 5000));
    await Promise.race([verifyPromise, timeout]);
    console.info('✅ SMTP configuration verified successfully');
    return true;
  } catch (error) {
    console.error('❌ Email service configuration error:', error?.message || error);
    console.error('[EmailService] SMTP verify error details:', {
      code: error?.code,
      response: error?.response ? (typeof error.response === 'string' ? error.response : error.response.toString()) : undefined,
      responseCode: error?.responseCode,
      command: error?.command,
      stack: error?.stack,
    });
    return false;
  }
};
