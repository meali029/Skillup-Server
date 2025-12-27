import request from 'supertest';

describe('app additional health & bootstrap branches', () => {
  const mockAllRoutes = () => {
    const routes = [
      '../../modules/auth/auth.routes.js',
      '../../modules/jobs/job.routes.js',
      '../../modules/proposals/proposal.routes.js',
      '../../modules/profile/profile.routes.js',
      '../../modules/contracts/contract.routes.js',
      '../../modules/messages/message.routes.js',
      '../../modules/admin/users/user-management.routes.js',
      '../../modules/admin/jobs/job-checker.routes.js',
      '../../modules/admin/analytics/analytics.routes.js',
      '../../modules/admin/audit-logs/audit-logs.routes.js',
      '../../modules/admin/permissions/permissions.routes.js',
      '../../modules/admin/admin.settings.routes.js',
      '../../modules/admin/health/health.routes.js',
      '../../modules/admin/env-vars/envVars.routes.js',
      '../../modules/settings/settings.routes.js',
      '../../modules/cnic/cnic.routes.js',
      '../../modules/users/user.routes.js',
      '../../modules/notifications/notification.routes.js',
      '../../modules/disputes/dispute.routes.js',
    ];
    routes.forEach((r) => jest.doMock(r, () => {
      // Export a function that acts as a factory when called with no args
      // and as middleware when called with (req, res, next).
      return function mockRoute(...args) {
        if (args.length === 0) {
          return (req, res, next) => next();
        }
        const maybeNext = args[2];
        if (typeof maybeNext === 'function') {
          return maybeNext();
        }
      };
    }));

    // Also stub core middlewares so importing them doesn't pull in models that reference mongoose.Schema
    jest.doMock('../../core/middlewares/index.js', () => ({
      authenticate: (req, res, next) => next(),
      authorize: () => (req, res, next) => next(),
      authorizeAdmin: (req, res, next) => next(),
    }));

    // Ensure passport default export has initialize and session middleware functions and
    // initializePassport named export is present (so app.setup doesn't fail)
    jest.doMock('../../config/passport.js', () => ({ __esModule: true,
      initializePassport: jest.fn(),
      default: {
        initialize: () => (req, res, next) => next(),
        session: () => (req, res, next) => next(),
      },
    }));


  };

  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.NODE_ENV;
    delete process.env.MONGO_URI;
    delete process.env.SESSION_SECRET;
  });

  it('GET /api/health returns healthy when mongoose readyState 1', async () => {
    jest.isolateModules(async () => {
      jest.resetModules();
      // Mock the health helper so we don't touch mongoose in this test
      jest.doMock('../../core/health.js', () => ({ __esModule: true, getDatabaseHealth: async () => ({ status: 'healthy', state: 'connected', name: 'testDB', host: 'mongo-host', ready: true }), isDatabaseConnected: async () => true }));
      jest.doMock('../../config/passport.js', () => ({ __esModule: true, initializePassport: jest.fn(), default: { initialize: () => (req, res, next) => next(), session: () => (req, res, next) => next(), }, }));
      mockAllRoutes();
      // import app after mocking
      // eslint-disable-next-line global-require
      const app = require('../../app.js').default;
      return request(app)
        .get('/api/health')
        .expect(200)
        .then((res) => {
          expect(res.body.services.database.status).toBe('healthy');
          expect(res.body.status).toBe('healthy');
        });
    });
  });

  it('GET /api/health returns degraded when mongoose not connected', async () => {
    jest.isolateModules(async () => {
      jest.resetModules();
      // Mock the health helper to simulate DB disconnected
      jest.doMock('../../core/health.js', () => ({ __esModule: true, getDatabaseHealth: async () => ({ status: 'unhealthy', state: 'disconnected', name: 'none', host: 'none', ready: false }), isDatabaseConnected: async () => false }));
      jest.doMock('../../config/passport.js', () => ({ __esModule: true, initializePassport: jest.fn(), default: { initialize: () => (req, res, next) => next(), session: () => (req, res, next) => next(), }, }));
      mockAllRoutes();
      // eslint-disable-next-line global-require
      const app = require('../../app.js').default;
      return request(app)
        .get('/api/health')
        .expect(207)
        .then((res) => {
          expect(res.body.status).toBe('degraded');
          expect(res.body.success).toBe(false);
        });
    });
  });

  it('GET /api/health returns unhealthy when mongoose import throws', async () => {
    jest.isolateModules(async () => {
      jest.resetModules();
      // Make the helper throw (simulate mongoose import throwing) so app handles it gracefully
      jest.doMock('../../core/health.js', () => ({ __esModule: true, getDatabaseHealth: async () => { throw new Error('boom'); }, isDatabaseConnected: async () => { throw new Error('boom'); } }));
      jest.doMock('../../config/passport.js', () => ({ __esModule: true, initializePassport: jest.fn(), default: { initialize: () => (req, res, next) => next(), session: () => (req, res, next) => next(), }, }));
      // eslint-disable-next-line global-require
      mockAllRoutes();
      const app = require('../../app.js').default;
      return request(app)
        .get('/api/health')
        .expect(503)
        .then((res) => {
          expect(res.body.status).toBe('unhealthy');
          expect(res.body.services.database.error).toMatch(/boom/);
        });
    });
  });

  it('GET /api/health/ready returns 200 when connected and 503 when not', async () => {
    // connected
    jest.isolateModules(() => {
      jest.resetModules();
      jest.doMock('../../core/health.js', () => ({ __esModule: true, isDatabaseConnected: async () => true }));
      mockAllRoutes();
      // eslint-disable-next-line global-require
      const app = require('../../app.js').default;
      return request(app)
        .get('/api/health/ready')
        .expect(200)
        .then((res) => {
          expect(res.body.ready).toBe(true);
        });
    });

    // not connected
    jest.isolateModules(() => {
      jest.resetModules();
      jest.doMock('../../core/health.js', () => ({ __esModule: true, isDatabaseConnected: async () => false }));
      mockAllRoutes();
      // eslint-disable-next-line global-require
      const app2 = require('../../app.js').default;
      return request(app2)
        .get('/api/health/ready')
        .expect(503)
        .then((res) => {
          expect(res.body.ready).toBe(false);
        });
    });
  });

  it('GET /api/health/live returns alive true', async () => {
    jest.isolateModules(() => {
      jest.resetModules();
      jest.doMock('../../core/health.js', () => ({ __esModule: true, isDatabaseConnected: async () => true }));
      jest.doMock('../../config/passport.js', () => ({ __esModule: true, initializePassport: jest.fn(), default: { initialize: () => (req, res, next) => next(), session: () => (req, res, next) => next(), }, }));
      // eslint-disable-next-line global-require
      mockAllRoutes();
      const app = require('../../app.js').default;
      return request(app).get('/api/health/live').expect(200).then((res) => {
        expect(res.body.alive).toBe(true);
      });
    });
  });

  it('unknown route triggers 404 via AppError', async () => {
    jest.isolateModules(() => {
      jest.resetModules();
      jest.doMock('../../core/health.js', () => ({ __esModule: true, getDatabaseHealth: async () => ({ status: 'healthy', state: 'connected', name: 'testDB', host: 'mongo', ready: true }), isDatabaseConnected: async () => true }));
      jest.doMock('../../config/passport.js', () => ({ __esModule: true, initializePassport: jest.fn(), default: { initialize: () => (req, res, next) => next(), session: () => (req, res, next) => next(), }, }));
      // eslint-disable-next-line global-require
      mockAllRoutes();
      const app = require('../../app.js').default;
      return request(app).get('/some/random/path').expect(404).then((res) => {
        expect(res.body.success).toBe(false);
        expect(res.body.message).toMatch(/Cannot find/);
      });
    });
  });

  it('when NODE_ENV !== test, session store is configured via connect-mongo', async () => {
    // Simulate production environment and ensure connect-mongo.create is called and passed to session
    jest.isolateModules(() => {
      jest.resetModules();
      process.env.NODE_ENV = 'production';
      process.env.MONGO_URI = 'mongodb://localhost/test';
      process.env.SESSION_SECRET = 's3cr3t';

        // Mock all routes so app import is safe
      mockAllRoutes();

      const createMock = jest.fn(() => ({ mockedStore: true }));
      // provide both ESM default and named export shapes to satisfy import styles
      jest.doMock('connect-mongo', () => ({ __esModule: true, default: { create: createMock }, create: createMock }));

      const sessionMock = jest.fn((opts) => {
        // return middleware placeholder
        global.__sessionOptions = opts;
        return (req, res, next) => next();
      });
      jest.doMock('express-session', () => sessionMock);

      // Also mock passport module to avoid requiring models that depend on mongoose
      jest.doMock('../../config/passport.js', () => ({ __esModule: true, initializePassport: jest.fn(), default: { initialize: () => (req, res, next) => next(), session: () => (req, res, next) => next(), }, }));

      // ensure db health helper is stubbed so health check doesn't attempt to talk to real DB
      jest.doMock('../../core/health.js', () => ({ __esModule: true, getDatabaseHealth: async () => ({ status: 'healthy', state: 'connected', name: 'testDB', host: 'mongo', ready: true }), isDatabaseConnected: async () => true }));

      // eslint-disable-next-line global-require
      const app = require('../../app.js').default;

      // The module initialization should have invoked connect-mongo.create
      expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ mongoUrl: 'mongodb://localhost/test' }));
      expect(global.__sessionOptions).toBeDefined();
      expect(global.__sessionOptions.store).toEqual({ mockedStore: true });
    });
  });
});
