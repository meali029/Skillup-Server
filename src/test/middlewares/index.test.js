import * as middlewares from '../../core/middlewares/index.js';

describe('middlewares index exports', () => {
  it('re-exports auth functions and validate default', () => {
    expect(middlewares.authenticate).toBeDefined();
    expect(middlewares.authorize).toBeDefined();
    expect(middlewares.authorizeAdmin).toBeDefined();
    expect(middlewares.validate).toBeDefined();
  });
});