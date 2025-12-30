import nodemailer from 'nodemailer';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

import { sendOTPEmail, sendPasswordResetConfirmation, verifyEmailConfig } from '../../../core/utils/emailService.js';

beforeEach(() => jest.resetAllMocks());

describe('Email Service', () => {
  test('sendOTPEmail sends mail and returns success', async () => {
    const transporter = { sendMail: jest.fn().mockResolvedValue(true) };
    nodemailer.createTransport.mockReturnValue(transporter);

    const out = await sendOTPEmail('a@b', '123456', 'Name');
    expect(out.success).toBe(true);
    expect(transporter.sendMail).toHaveBeenCalled();
  });

  test('sendPasswordResetConfirmation sends mail', async () => {
    const transporter = { sendMail: jest.fn().mockResolvedValue(true) };
    nodemailer.createTransport.mockReturnValue(transporter);

    const out = await sendPasswordResetConfirmation('a@b', 'Name');
    expect(out.success).toBe(true);
    expect(transporter.sendMail).toHaveBeenCalled();
  });

  test('verifyEmailConfig returns true on success and false on error', async () => {
    const transporter = { verify: jest.fn().mockResolvedValue(true) };
    nodemailer.createTransport.mockReturnValue(transporter);
    expect(await verifyEmailConfig()).toBe(true);

    transporter.verify.mockRejectedValue(new Error('bad'));
    expect(await verifyEmailConfig()).toBe(false);
  });
});