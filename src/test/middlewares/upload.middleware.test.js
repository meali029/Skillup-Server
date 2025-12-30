import multer from 'multer';
import { fileFilter, cnicFileFilter, handleUploadError } from '../../core/middlewares/upload.js';

describe('upload middleware', () => {
  it('fileFilter allows images', () => {
    const cb = jest.fn();
    fileFilter({}, { mimetype: 'image/png' }, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it('fileFilter rejects non-images', () => {
    const cb = jest.fn();
    fileFilter({}, { mimetype: 'application/zip' }, cb);
    expect(cb).toHaveBeenCalled();
    const arg0 = cb.mock.calls[0][0];
    expect(arg0).toBeInstanceOf(Error);
  });

  it('cnicFileFilter allows pdf and images', () => {
    const cb = jest.fn();
    cnicFileFilter({}, { mimetype: 'application/pdf' }, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
    const cb2 = jest.fn();
    cnicFileFilter({}, { mimetype: 'image/jpeg' }, cb2);
    expect(cb2).toHaveBeenCalledWith(null, true);
  });

  it('handleUploadError handles MulterError', () => {
    const err = new multer.MulterError('LIMIT_FILE_SIZE');
    const next = jest.fn();
    handleUploadError(err, {}, {}, next);
    expect(next).toHaveBeenCalled();
  });

  it('handleUploadError returns proper messages for specific codes', () => {
    const err1 = new multer.MulterError('LIMIT_FILE_SIZE');
    const next1 = jest.fn();
    handleUploadError(err1, {}, {}, next1);
    const e1 = next1.mock.calls[0][0];
    expect(e1.message).toMatch(/File size too large/);
    expect(e1.statusCode).toBe(400);

    const err2 = new multer.MulterError('LIMIT_UNEXPECTED_FILE');
    const next2 = jest.fn();
    handleUploadError(err2, {}, {}, next2);
    const e2 = next2.mock.calls[0][0];
    expect(e2.message).toMatch(/Too many files uploaded/);
    expect(e2.statusCode).toBe(400);

    const err3 = new multer.MulterError('SOME_OTHER');
    err3.message = 'Some error';
    const next3 = jest.fn();
    handleUploadError(err3, {}, {}, next3);
    const e3 = next3.mock.calls[0][0];
    expect(e3.message).toBe('Some error');
  });

  it('handleUploadError passes through non-multer errors', () => {
    const err = new Error('not multer');
    const next = jest.fn();
    handleUploadError(err, {}, {}, next);
    expect(next).toHaveBeenCalledWith(err);
  });

  it('creates uploads dir if missing during module load', () => {
    jest.resetModules();
    const fs = require('fs');
    const origExists = fs.existsSync;
    const origMkdir = fs.mkdirSync;
    fs.existsSync = jest.fn().mockReturnValue(false);
    fs.mkdirSync = jest.fn();

    jest.isolateModules(() => {
      // eslint-disable-next-line global-require
      require('../../core/middlewares/upload.js');
    });

    expect(fs.mkdirSync).toHaveBeenCalled();

    // restore
    fs.existsSync = origExists;
    fs.mkdirSync = origMkdir;
  });
});