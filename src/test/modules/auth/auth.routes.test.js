import createAuthRoutes from '../../../modules/auth/auth.routes.js';

function findRoute(router, path, method = 'get') {
  const layer = router.stack.find((s) => s.route && s.route.path === path);
  if (!layer) return null;
  return layer.route;
}

describe('Auth routes', () => {
  let originalGoogleId;
  let originalGoogleSecret;

  beforeAll(() => {
    originalGoogleId = process.env.GOOGLE_CLIENT_ID;
    originalGoogleSecret = process.env.GOOGLE_CLIENT_SECRET;
  });

  afterAll(() => {
    process.env.GOOGLE_CLIENT_ID = originalGoogleId;
    process.env.GOOGLE_CLIENT_SECRET = originalGoogleSecret;
  });

  test('oauth-config returns expected json', () => {
    const router = createAuthRoutes();
    const route = findRoute(router, '/oauth-config');
    expect(route).toBeDefined();

    const res = { json: jest.fn() };
    route.stack[0].handle({}, res);
    expect(res.json).toHaveBeenCalled();
    const obj = res.json.mock.calls[0][0];
    expect(obj).toHaveProperty('hasGoogleClientId');
    expect(obj).toHaveProperty('callbackURL');
  });

  test('google endpoints return 503 when not configured', () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    const router = createAuthRoutes();
    const route = findRoute(router, '/google');
    expect(route).toBeDefined();

    // The handler should respond with status 503
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    route.stack[0].handle({}, res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.any(String) }));

    const cbRoute = findRoute(router, '/google/callback');
    const res2 = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    cbRoute.stack[0].handle({}, res2);
    expect(res2.status).toHaveBeenCalledWith(503);
  });

  test('google endpoints present when env configured and call passport.authenticate', () => {
    process.env.GOOGLE_CLIENT_ID = 'id123';
    process.env.GOOGLE_CLIENT_SECRET = 'sec123';

    const passport = require('passport');
    jest.spyOn(passport, 'authenticate').mockImplementation((strategy, opts, cb) => {
      return (req, res, next) => {
        // simulate passport behavior by invoking callback if provided
        if (typeof cb === 'function') {
          cb(null, null, null); // simulate failure/no user
        }
        next();
      };
    });

    const router = createAuthRoutes();
    const route = findRoute(router, '/google');
    const cbRoute = findRoute(router, '/google/callback');
    expect(route).toBeDefined();
    expect(cbRoute).toBeDefined();

    // call handlers to exercise the branch lines
    const req = { query: {}, session: {}, user: null, logIn: jest.fn() };
    const res = { redirect: jest.fn(), cookie: jest.fn() };
    const next = jest.fn();

    // call google route middleware
    route.stack[0].handle(req, res, next);
    expect(passport.authenticate).toHaveBeenCalled();

    // call google/callback middleware (first handler)
    cbRoute.stack[0].handle(req, res, next);
    // since we simulated callback called with null user, controller will redirect inside the callback
    // check that next was called (passport wrapper invoked)
    expect(next).toHaveBeenCalled();

    passport.authenticate.mockRestore();
  });
});