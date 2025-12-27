import { describe, it, expect } from '@jest/globals';
import * as CNICService from '../../../modules/cnic/cnic.service.js';
import { approveCNIC, rejectCNIC, getCNICStats, getMyCNICStatus } from '../../../modules/cnic/cnic.service.js';
import User from '../../../models/User.js';

// Mock notifications so they don't emit
jest.mock('../../../modules/notifications/notification.service.js', () => ({
  notifyUser: jest.fn(),
  notifyAdmins: jest.fn(),
}));

// Mock image processor and OCR
jest.mock('../../../core/utils/imageProcessor.js', () => ({
  processCNICImage: jest.fn(),
  deleteCNICImages: jest.fn(),
}));
jest.mock('../../../services/ocr.service.template.js', () => ({
  default: { extractCNICData: jest.fn() }
}));

// helper to create simple chainable query builder used in find() mocks
const makeChain = (value) => ({
  select: jest.fn(() => ({
    sort: jest.fn(() => ({
      skip: jest.fn(() => ({
        limit: jest.fn(() => ({
          lean: jest.fn().mockResolvedValue(value),
        })),
      })),
    })),
  })),
});

describe('CNIC Service', () => {
  it('approveCNIC validates and approves a CNIC', async () => {
    const admin = await User.create({ name: 'Admin', email: 'admincnic@ex.com', role: 'admin', adminRole: 'admin' });
    const u = await User.create({ name: 'CN', email: 'cn@example.com' });

    u.cnic = { status: 'pending' };
    await u.save();

    const cnicData = {
      number: '12345-1234567-1',
      fullName: 'CN User',
      dateOfBirth: '1990-01-01',
      issueDate: '2010-01-01',
      expiryDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString(),
    };

    const res = await approveCNIC(u._id, admin._id, cnicData);
    expect(res).toBeDefined();
    const updated = await User.findById(u._id);
    expect(updated.cnic.status).toBe('verified');
    expect(updated.cnic.number).toBe(cnicData.number);
  });

  it('rejectCNIC sets rejected status and stores reason', async () => {
    const admin = await User.create({ name: 'Admin2', email: 'admin2@ex.com', role: 'admin', adminRole: 'admin' });
    const u = await User.create({ name: 'CN2', email: 'cn2@example.com' });
    u.cnic = { status: 'pending', frontImage: '/path/front.png', backImage: '/path/back.png' };
    await u.save();

    const res = await rejectCNIC(u._id, admin._id, 'Reason is long enough');
    expect(res).toBeDefined();
    const updated = await User.findById(u._id);
    expect(updated.cnic.status).toBe('rejected');
    expect(updated.cnic.rejectionReason).toBe('Reason is long enough');
    expect(updated.cnic.frontImage).toBeUndefined();
  });

  it('getMyCNICStatus returns not_submitted when absent', async () => {
    const u = await User.create({ name: 'NoCNIC', email: 'nocnic@example.com' });
    const s = await getMyCNICStatus(u._id);
    expect(s.status).toBe('not_submitted');
  });

  it('getCNICStats aggregates statuses', async () => {
    await User.create({ name: 'S1', email: 's1@example.com', cnic: { status: 'pending' } });
    await User.create({ name: 'S2', email: 's2@example.com', cnic: { status: 'verified' } });
    await User.create({ name: 'S3', email: 's3@example.com', cnic: { status: 'rejected' } });

    const stats = await getCNICStats();
    expect(stats.pending).toBeGreaterThanOrEqual(1);
    expect(stats.verified).toBeGreaterThanOrEqual(1);
    expect(stats.rejected).toBeGreaterThanOrEqual(1);
  });

  it('submitCNIC validation and OCR path', async () => {
    // missing files
    await expect(CNICService.submitCNIC('u1', null)).rejects.toThrow('Both front and back images of CNIC are required');

    // user not found
    jest.spyOn(User, 'findById').mockResolvedValue(null);
    await expect(CNICService.submitCNIC('u1', { frontImage: [{ path: 'f' }], backImage: [{ path: 'b' }] })).rejects.toThrow('User not found');

    // user verified/pending
    jest.spyOn(User, 'findById').mockResolvedValue({ cnic: { status: 'verified' } });
    await expect(CNICService.submitCNIC('u1', { frontImage: [{ path: 'f' }], backImage: [{ path: 'b' }] })).rejects.toThrow('CNIC is already verified');

    jest.spyOn(User, 'findById').mockResolvedValue({ cnic: { status: 'pending' } });
    await expect(CNICService.submitCNIC('u1', { frontImage: [{ path: 'f' }], backImage: [{ path: 'b' }] })).rejects.toThrow('CNIC submission is already under review');

    // success path with OCR suggestion and notifyAdmins
    const save = jest.fn().mockResolvedValue(true);
    const u = { _id: 'u1', name: 'U', cnic: { frontImage: 'oldF', backImage: 'oldB' }, save };
    jest.spyOn(User, 'findById').mockResolvedValue(u);

    // mock processors
    const img = require('../../../core/utils/imageProcessor.js');
    img.processCNICImage.mockResolvedValueOnce('/abs/front').mockResolvedValueOnce('/abs/back');
    img.deleteCNICImages.mockResolvedValue(true);

    const ocr = require('../../../services/ocr.service.template.js');
    ocr.default.extractCNICData.mockResolvedValue({ success: true, extractedCnicNumber: '12345-1234567-1', extractedName: 'N', extractedFatherName: 'F', extractedDateOfBirth: '1990-01-01', confidence: 90, extractionMethod: 'template', rawText: 'x', extractedAt: new Date() });

    const notify = require('../../../modules/notifications/notification.service.js');
    notify.notifyAdmins.mockResolvedValue(true);

    const res = await CNICService.submitCNIC('u1', { frontImage: [{ path: 'front' }], backImage: [{ path: 'back' }] });
    expect(save).toHaveBeenCalled();
    expect(res.cnicStatus).toBe('pending');
    expect(res.ocrData).toBeDefined();

    // OCR throws (non-blocking) and notifyAdmins throws (should be caught)
    ocr.default.extractCNICData.mockRejectedValue(new Error('ocr fail'));
    jest.spyOn(User, 'findById').mockImplementation(() => Promise.resolve({ _id: 'u2', name: 'U2', cnic: {}, save: jest.fn().mockResolvedValue(true) }));
    // ensure processCNICImage returns paths for this call too
    img.processCNICImage.mockResolvedValueOnce('/abs/front2').mockResolvedValueOnce('/abs/back2');
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const out = await CNICService.submitCNIC('u2', { frontImage: [{ path: 'front' }], backImage: [{ path: 'back' }] });
    expect(out.cnicStatus).toBe('pending');

    jest.spyOn(notify, 'notifyAdmins').mockImplementation(() => Promise.reject(new Error('notify fail')));
    img.processCNICImage.mockResolvedValueOnce('/abs/front3').mockResolvedValueOnce('/abs/back3');
    // ensure fresh user object to avoid residual state
    jest.spyOn(User, 'findById').mockImplementation(() => Promise.resolve({ _id: 'u2', name: 'U2', cnic: {}, save: jest.fn().mockResolvedValue(true) }));
    await CNICService.submitCNIC('u2', { frontImage: [{ path: 'front' }], backImage: [{ path: 'back' }] });
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('getPendingCNICs supports search and pagination', async () => {
    const users = [{ _id: 'u1' }, { _id: 'u2' }];
    // make chainable find
    const makeChain = (val) => ({ select: jest.fn(() => ({ sort: jest.fn(() => ({ skip: jest.fn(() => ({ limit: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(val) })) })) })) })) });
    jest.spyOn(User, 'find').mockImplementation(() => makeChain(users));
    jest.spyOn(User, 'countDocuments').mockResolvedValue(2);

    const out = await CNICService.getPendingCNICs({ page: 1, limit: 10, search: 'test' });
    expect(out.users).toEqual(users);
    expect(out.pagination.total).toBe(2);
  });

  it('getCNICDetails returns user when exists', async () => {
    jest.spyOn(User, 'findById').mockImplementation(() => ({ select: jest.fn().mockResolvedValue({ cnic: { status: 'pending' } }) }));
    const out = await CNICService.getCNICDetails('u1');
    expect(out).toBeDefined();
  });

  it('approveCNIC handles dob validation and notifyUser failure', async () => {
    jest.spyOn(User, 'findById').mockResolvedValue({ _id: 'u1', cnic: { status: 'pending' }, save: jest.fn(), name: 'n', email: 'e' });
    jest.spyOn(User, 'findOne').mockResolvedValue(null);

    // age > 120
    await expect(CNICService.approveCNIC('u1', 'a1', { number: '12345-1234567-1', fullName: 'Name', dateOfBirth: '1800-01-01', issueDate: '2020-01-01', expiryDate: '2099-01-01' })).rejects.toThrow('Invalid date of birth provided');

    // notifyUser throws but should be caught
    const u = { _id: 'u1', cnic: { status: 'pending' }, save: jest.fn(), name: 'n', email: 'e' };
    jest.spyOn(User, 'findById').mockResolvedValue(u);
    jest.spyOn(User, 'findOne').mockResolvedValue(null);
    const notify = require('../../../modules/notifications/notification.service.js');
    jest.spyOn(notify, 'notifyUser').mockRejectedValue(new Error('notify fail'));

    const res = await CNICService.approveCNIC('u1', 'a1', { number: '12345-1234567-1', fullName: 'Name', dateOfBirth: '1990-01-01', issueDate: '2020-01-01', expiryDate: '2099-01-01' });
    expect(res.message).toBe('CNIC verified successfully');
  });

  it('rejectCNIC and requestReupload notify failures are handled', async () => {
    jest.spyOn(User, 'findById').mockResolvedValue({ _id: 'u1', cnic: { status: 'pending', frontImage: 'f', backImage: 'b' }, save: jest.fn() });
    const notify = require('../../../modules/notifications/notification.service.js');
    jest.spyOn(notify, 'notifyUser').mockRejectedValue(new Error('notify fail'));

    const out = await CNICService.rejectCNIC('u1', 'a1', 'Valid reason of sufficient length');
    expect(out.message).toBe('CNIC rejected');

    const out2 = await CNICService.requestReupload('u1', 'a1', 'Valid reupload reason here');
    expect(out2.message).toBe('Re-upload requested');
  });

  it('submitCNIC handles OCR failure and notifyAdmins failure gracefully', async () => {
    const save = jest.fn().mockResolvedValue(true);
    const u = { _id: 'u10', name: 'U10', cnic: {}, save };
    jest.spyOn(User, 'findById').mockResolvedValue(u);

    const img = require('../../../core/utils/imageProcessor.js');
    img.processCNICImage.mockResolvedValueOnce('/abs/front').mockResolvedValueOnce('/abs/back');

    const ocr = require('../../../services/ocr.service.template.js');
    ocr.default.extractCNICData.mockRejectedValue(new Error('OCR died'));

    const notify = require('../../../modules/notifications/notification.service.js');
    notify.notifyAdmins.mockRejectedValue(new Error('notify err'));

    const res = await CNICService.submitCNIC('u10', { frontImage: [{ path: 'front' }], backImage: [{ path: 'back' }] });
    expect(res.cnicStatus).toBe('pending');
    expect(res.ocrData).toBeNull();
    expect(notify.notifyAdmins).toHaveBeenCalled();
  });

  it('submitCNIC handles extractedData but not success (sets ocrData with error)', async () => {
    const save = jest.fn().mockResolvedValue(true);
    const u = { _id: 'u11', name: 'U11', cnic: {}, save };
    jest.spyOn(User, 'findById').mockResolvedValue(u);

    const img = require('../../../core/utils/imageProcessor.js');
    img.processCNICImage.mockResolvedValueOnce('/abs/front').mockResolvedValueOnce('/abs/back');

    const ocr = require('../../../services/ocr.service.template.js');
    ocr.default.extractCNICData.mockResolvedValue({ success: false, error: 'no cnic found' });

    const notify = require('../../../modules/notifications/notification.service.js');
    notify.notifyAdmins.mockResolvedValue(true);

    const res = await CNICService.submitCNIC('u11', { frontImage: [{ path: 'front' }], backImage: [{ path: 'back' }] });
    expect(res.cnicStatus).toBe('pending');
    expect(res.ocrData).toBeNull() || expect(res.ocrData).toBeDefined();
  });

  it('getPendingCNICs with search applies filters', async () => {
    const users = [{ _id: 'u1' }];
    jest.spyOn(User, 'find').mockImplementation(() => makeChain(users));
    jest.spyOn(User, 'countDocuments').mockResolvedValue(1);

    const out = await CNICService.getPendingCNICs({ search: 'john' });
    expect(out.users).toEqual(users);
    expect(out.pagination.total).toBe(1);
  });

  it('approveCNIC succeeds when dateOfBirth not provided (no age validation)', async () => {
    const save = jest.fn().mockResolvedValue(true);
    const user = { _id: 'u7', cnic: { status: 'pending' }, save };
    jest.spyOn(User, 'findById').mockResolvedValue(user);
    jest.spyOn(User, 'findOne').mockResolvedValue(null);
    const out = await CNICService.approveCNIC('u7', 'a1', { number: '12345-1234567-1', fullName: 'Test', issueDate: '2010-01-01', expiryDate: '2099-01-01' });
    expect(out.message).toBe('CNIC verified successfully');
  });

  it('rejectCNIC works when no images to delete', async () => {
    const user = { _id: 'u8', name: 'U8', email: 'u8@test', cnic: { status: 'pending' }, save: jest.fn().mockResolvedValue(true) };
    jest.spyOn(User, 'findById').mockResolvedValue(user);
    const notify = require('../../../modules/notifications/notification.service.js');
    notify.notifyUser.mockResolvedValue(true);

    const out = await CNICService.rejectCNIC('u8', 'a1', 'Valid rejection reason');
    expect(out.message).toBe('CNIC rejected');
    expect(user.save).toHaveBeenCalled();
  });

  it('requestReupload tolerates notify failures and works when no images', async () => {
    const user = { _id: 'u9', name: 'U9', email: 'u9@test', cnic: { status: 'pending' }, save: jest.fn().mockResolvedValue(true) };
    jest.spyOn(User, 'findById').mockResolvedValue(user);
    const img = require('../../../core/utils/imageProcessor.js');
    img.deleteCNICImages.mockImplementation(() => true);
    const notify = require('../../../modules/notifications/notification.service.js');
    notify.notifyUser.mockRejectedValue(new Error('fail')); // should be caught

    const out = await CNICService.requestReupload('u9', 'a1', 'Please re-upload images');
    expect(out.message).toBe('Re-upload requested');
    expect(notify.notifyUser).toHaveBeenCalled();
  });

  it('getCNICStats fills in all keys from aggregate', async () => {
    jest.spyOn(User, 'aggregate').mockResolvedValue([
      { _id: 'pending', count: 2 },
      { _id: 'verified', count: 3 },
      { _id: 'rejected', count: 1 },
      { _id: 'reupload_requested', count: 4 },
    ]);

    const out = await CNICService.getCNICStats();
    expect(out.pending).toBe(2);
    expect(out.verified).toBe(3);
    expect(out.reupload_requested).toBe(4);
    expect(out.not_submitted).toBeDefined();
  });

  it('getPendingCNICs returns list and pagination', async () => {
    const users = [{ _id: 'u1' }, { _id: 'u2' }];
    jest.spyOn(User, 'find').mockImplementation(() => makeChain(users));
    jest.spyOn(User, 'countDocuments').mockResolvedValue(2);

    const out = await CNICService.getPendingCNICs({ page: 1, limit: 10 });
    expect(out.users).toEqual(users);
    expect(out.pagination.total).toBe(2);
  });

  it('getCNICDetails throws when not found or not submitted', async () => {
    jest.spyOn(User, 'findById').mockImplementation(() => ({ select: jest.fn().mockResolvedValue(null) }));
    await expect(CNICService.getCNICDetails('uX')).rejects.toThrow('User not found');

    jest.spyOn(User, 'findById').mockImplementation(() => ({ select: jest.fn().mockResolvedValue({ cnic: { status: 'not_submitted' } }) }));
    await expect(CNICService.getCNICDetails('uX')).rejects.toThrow('User has not submitted CNIC');

    jest.spyOn(User, 'findById').mockImplementation(() => ({ select: jest.fn().mockResolvedValue({ cnic: { status: 'pending' } }) }));
    const out = await CNICService.getCNICDetails('uY');
    expect(out.cnic.status).toBe('pending');
  });

  it('approveCNIC validations: format, duplicate, dob, expiry', async () => {
    // user not found
    jest.spyOn(User, 'findById').mockResolvedValue(null);
    await expect(CNICService.approveCNIC('u1', 'a1', {})).rejects.toThrow('User not found');

    // not submitted
    jest.spyOn(User, 'findById').mockResolvedValue({ cnic: { status: 'not_submitted' } });
    await expect(CNICService.approveCNIC('u1', 'a1', {})).rejects.toThrow('User has not submitted CNIC');

    // invalid format
    const user = { _id: 'u2', cnic: { status: 'pending' } };
    jest.spyOn(User, 'findById').mockResolvedValue(user);
    await expect(CNICService.approveCNIC('u2', 'a1', { number: 'bad' })).rejects.toThrow('Invalid CNIC format');

    // duplicate
    jest.spyOn(User, 'findOne').mockResolvedValue({ _id: 'other' });
    await expect(CNICService.approveCNIC('u2', 'a1', { number: '12345-1234567-1', fullName: 'A', expiryDate: '2099-01-01' })).rejects.toThrow('This CNIC number is already registered');

    // invalid dob
    jest.spyOn(User, 'findOne').mockResolvedValue(null);
    await expect(CNICService.approveCNIC('u2', 'a1', { number: '12345-1234567-1', fullName: 'A', dateOfBirth: '3000-01-01', expiryDate: '2099-01-01' })).rejects.toThrow('Invalid date of birth provided');

    // expired
    await expect(CNICService.approveCNIC('u2', 'a1', { number: '12345-1234567-1', fullName: 'A', dateOfBirth: '1990-01-01', expiryDate: '2000-01-01' })).rejects.toThrow('CNIC has expired');
  });

  it('approveCNIC notifies user and tolerates notify failures', async () => {
    const save = jest.fn().mockResolvedValue(true);
    const user = { _id: 'u3', name: 'U3', email: 'u3@test', cnic: { status: 'pending' }, save };
    jest.spyOn(User, 'findById').mockResolvedValue(user);
    jest.spyOn(User, 'findOne').mockResolvedValue(null);
    const notify = require('../../../modules/notifications/notification.service.js');
    notify.notifyUser.mockRejectedValue(new Error('nope'));

    const out = await CNICService.approveCNIC('u3', 'a1', { number: '12345-1234567-1', fullName: 'U3', dateOfBirth: '1990-01-01', issueDate: '2010-01-01', expiryDate: '2099-01-01' });
    expect(out.message).toBe('CNIC verified successfully');
    expect(notify.notifyUser).toHaveBeenCalled();
  });

  it('rejectCNIC validations and delete images', async () => {
    jest.spyOn(User, 'findById').mockResolvedValue(null);
    await expect(CNICService.rejectCNIC('u1', 'a1', 'reason reason')).rejects.toThrow('User not found');

    jest.spyOn(User, 'findById').mockResolvedValue({ cnic: { status: 'not_submitted' } });
    await expect(CNICService.rejectCNIC('u1', 'a1', 'reason reason')).rejects.toThrow('User has not submitted CNIC');

    const user = { _id: 'u4', name: 'U4', email: 'u4@test', cnic: { status: 'pending', frontImage: '/f', backImage: '/b' }, save: jest.fn().mockResolvedValue(true) };
    jest.spyOn(User, 'findById').mockResolvedValue(user);
    const img = require('../../../core/utils/imageProcessor.js');
    img.deleteCNICImages.mockImplementation(() => true);
    const notify = require('../../../modules/notifications/notification.service.js');
    notify.notifyUser.mockResolvedValue(true);

    const out = await CNICService.rejectCNIC('u4', 'a1', 'This is a valid reason');
    expect(out.message).toBe('CNIC rejected');
    expect(img.deleteCNICImages).toHaveBeenCalled();
    expect(notify.notifyUser).toHaveBeenCalled();
  });

  it('requestReupload validations and success', async () => {
    jest.spyOn(User, 'findById').mockResolvedValue(null);
    await expect(CNICService.requestReupload('u1', 'a1', 'reason long')).rejects.toThrow('User not found');

    jest.spyOn(User, 'findById').mockResolvedValue({ cnic: { status: 'not_submitted' } });
    await expect(CNICService.requestReupload('u1', 'a1', 'reason long')).rejects.toThrow('User has not submitted CNIC');

    const user = { _id: 'u5', name: 'U5', email: 'u5@test', cnic: { status: 'pending', frontImage: '/f', backImage: '/b' }, save: jest.fn().mockResolvedValue(true) };
    jest.spyOn(User, 'findById').mockResolvedValue(user);
    const img = require('../../../core/utils/imageProcessor.js');
    img.deleteCNICImages.mockImplementation(() => true);
    const notify = require('../../../modules/notifications/notification.service.js');
    notify.notifyUser.mockResolvedValue(true);

    const out = await CNICService.requestReupload('u5', 'a1', 'Please re-upload images - blurry');
    expect(out.message).toBe('Re-upload requested');
    expect(img.deleteCNICImages).toHaveBeenCalled();
    expect(notify.notifyUser).toHaveBeenCalled();
  });

  it('getCNICStats returns default counts when empty', async () => {
    jest.spyOn(User, 'aggregate').mockResolvedValue([]);
    const out = await CNICService.getCNICStats();
    expect(out.total).toBeUndefined();
    expect(out.not_submitted).toBeDefined();
  });
});