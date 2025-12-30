import * as utils from '../../../core/utils/index.js';

describe('utils index exports', () => {
  test('exports contain expected functions', () => {
    expect(utils.asyncHandler).toBeDefined();
    expect(utils.successResponse).toBeDefined();
    expect(utils.sendOTPEmail).toBeDefined();
    expect(utils.generateOTP).toBeDefined();
    expect(utils.isValidCNICFormat).toBeDefined();
  });
});