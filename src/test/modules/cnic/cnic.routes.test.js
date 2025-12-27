import express from 'express';
import router from '../../../modules/cnic/cnic.routes.js';
import multer from 'multer';

// helper to find middleware by searching route stack for function containing keywords
const findMiddleware = (keyword) => {
  for (const layer of router.stack) {
    // route-level middleware
    if (layer.route && layer.route.stack) {
      for (const routeLayer of layer.route.stack) {
        const fn = routeLayer.handle;
        if (fn && fn.toString && fn.toString().includes(keyword)) return fn;
      }
    }
    // direct middleware
    if (layer.handle && layer.handle.toString && layer.handle.toString().includes(keyword)) {
      return layer.handle;
    }
  }
  return undefined;
};

describe('CNIC routes', () => {
  test('exports an express router', () => {
    expect(router).toBeDefined();
    expect(typeof router).toBe('function'); // router is a function
  });

  test('handleMulterError handles MulterError file size', () => {
    const handle = findMiddleware('File size');
    expect(handle).toBeDefined();

    const err = new multer.MulterError('LIMIT_FILE_SIZE', 'field');
    err.code = 'LIMIT_FILE_SIZE';

    const req = {};
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    handle(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, message: expect.stringContaining('File size') }));
  });

  test('handleMulterError handles generic error', () => {
    const handle = findMiddleware('File size');
    const req = {};
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    handle(new Error('boom'), req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });
});