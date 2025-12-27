jest.mock('sharp', () => {
  return (filePath) => ({
    resize: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    toFile: jest.fn().mockResolvedValue(true),
  });
});

import * as img from '../../../core/utils/imageProcessor.js';
import fs from 'fs';

jest.mock('fs');

beforeEach(() => jest.resetAllMocks());

describe('Image processor', () => {
  test('processCNICImage resizes, converts and deletes original', async () => {
    const tmp = 'tmp/front.jpg';
    fs.existsSync = jest.fn().mockReturnValue(true);
    fs.unlinkSync = jest.fn();

    const out = await img.processCNICImage(tmp);
    expect(out).toMatch(/-processed/);
    expect(fs.unlinkSync).toHaveBeenCalledWith(tmp);
  });

  test('deleteCNICImages removes files when present and handles errors', () => {
    fs.existsSync = jest.fn().mockReturnValue(true);
    fs.unlinkSync = jest.fn();
    img.deleteCNICImages('a', 'b');
    expect(fs.unlinkSync).toHaveBeenCalledTimes(2);

    fs.existsSync = jest.fn().mockReturnValue(false);
    fs.unlinkSync = jest.fn();
    img.deleteCNICImages(null, null);
    expect(fs.unlinkSync).not.toHaveBeenCalled();
  });
});