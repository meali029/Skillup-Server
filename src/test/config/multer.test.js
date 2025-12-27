describe('config/multer', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it('creates uploads/cnic dir if missing', () => {
    const fs = require('fs');
    const origExists = fs.existsSync;
    const origMkdir = fs.mkdirSync;
    fs.existsSync = jest.fn().mockReturnValue(false);
    fs.mkdirSync = jest.fn();

    jest.isolateModules(() => {
      // eslint-disable-next-line global-require
      const mod = require('../../config/multer.js');
      expect(mod.uploadCNIC).toBeDefined();
      expect(typeof mod.uploadCNIC.single).toBe('function');
    });

    expect(fs.mkdirSync).toHaveBeenCalled();

    fs.existsSync = origExists;
    fs.mkdirSync = origMkdir;
  });

  it('exported uploadCNIC has single/array functions', () => {
    jest.isolateModules(() => {
      // eslint-disable-next-line global-require
      const mod = require('../../config/multer.js');
      expect(mod.uploadCNIC).toBeDefined();
      expect(typeof mod.uploadCNIC.single).toBe('function');
      expect(typeof mod.uploadCNIC.array).toBe('function');
    });
  });

  it('fileFilter allows and rejects mime types', () => {
    const mod = require('../../config/multer.js');
    const cb = jest.fn();
    mod.fileFilter({}, { mimetype: 'image/png' }, cb);
    expect(cb).toHaveBeenCalledWith(null, true);

    const cb2 = jest.fn();
    mod.fileFilter({}, { mimetype: 'application/pdf' }, cb2);
    expect(cb2).toHaveBeenCalled();
    const arg0 = cb2.mock.calls[0][0];
    expect(arg0).toBeInstanceOf(Error);
  });

  it('does not create dir when it already exists', () => {
    const fs = require('fs');
    const origExists = fs.existsSync;
    const origMkdir = fs.mkdirSync;
    fs.existsSync = jest.fn().mockReturnValue(true);
    fs.mkdirSync = jest.fn();

    jest.isolateModules(() => {
      // eslint-disable-next-line global-require
      const mod = require('../../config/multer.js');
      expect(mod.uploadCNIC).toBeDefined();
    });

    expect(fs.mkdirSync).not.toHaveBeenCalled();

    fs.existsSync = origExists;
    fs.mkdirSync = origMkdir;
  });

  it('storage destination and filename are wired to diskStorage', () => {
    // Mock multer.diskStorage to capture the destination/filename callbacks
    jest.isolateModules(() => {
      const diskStorage = jest.fn((opts) => {
        // capture callbacks for test
        global.__destCb = opts.destination;
        global.__nameCb = opts.filename;
        return {}; // storage placeholder
      });

      const multerFn = jest.fn(() => ({ single: jest.fn(), array: jest.fn() }));
      multerFn.diskStorage = diskStorage;

      jest.doMock('multer', () => ({ __esModule: true, default: multerFn }));
      // import module after mocking multer
      // eslint-disable-next-line global-require
      const mod = require('../../config/multer.js');

      // ensure the captured callbacks exist and behave
      expect(typeof global.__destCb).toBe('function');
      expect(typeof global.__nameCb).toBe('function');

      const cbDest = jest.fn();
      global.__destCb({}, { originalname: 'a.pdf' }, cbDest);
      expect(cbDest).toHaveBeenCalled();

      const cbName = jest.fn();
      // call filename cb and ensure it returns a name with cnic- prefix
      global.__nameCb({}, { originalname: 'file.png' }, cbName);
      expect(cbName).toHaveBeenCalled();
      const fname = cbName.mock.calls[0][1];
      expect(typeof fname).toBe('string');
      expect(fname.startsWith('cnic-')).toBe(true);
    });
  });
});