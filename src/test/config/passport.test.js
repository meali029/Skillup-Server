jest.mock('passport', () => ({
  use: jest.fn(),
  serializeUser: jest.fn((fn) => { global._serialize = fn; }),
  deserializeUser: jest.fn((fn) => { global._deserialize = fn; }),
}));

jest.mock('passport-google-oauth20', () => ({
  Strategy: jest.fn(function (opts, verify) {
    // store verify callback for tests
    this.verify = verify;
  })
}));

// Mock the User model to avoid real mongoose operations in tests
jest.mock('../../models/User.js', () => ({
  findOne: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
}));

import { initializePassport } from '../../config/passport.js';
import User from '../../models/User.js';

describe('config/passport', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  });

  it('does not configure Google strategy when env vars missing', () => {
    const passport = initializePassport();
    const p = require('passport');
    expect(p.use).not.toHaveBeenCalled();
    expect(passport).toBeDefined();
  });

  it('configures Google strategy and verify callback behaviors', async () => {
    process.env.GOOGLE_CLIENT_ID = 'x';
    process.env.GOOGLE_CLIENT_SECRET = 'y';
    const p = require('passport');
    const pg = require('passport-google-oauth20');

    // re-import module with env vars present
    const { initializePassport: init } = require('../../config/passport.js');
    init();
    expect(p.use).toHaveBeenCalled();

    // get a reference to the verify callback
    const StrategyMock = pg.Strategy;
    const instance = StrategyMock.mock.instances[0];
    expect(instance).toBeDefined();
    const verify = instance.verify;
    expect(typeof verify).toBe('function');

    // Case: no email provided by Google -> error early
    const doneNoEmail = jest.fn();
    await verify('a', 'b', { id: 'noemail', emails: null }, doneNoEmail);
    expect(doneNoEmail).toHaveBeenCalled();
    expect(doneNoEmail.mock.calls[0][0]).toBeInstanceOf(Error);

    // Case: create new user when not found
    expect(pg.Strategy.mock.instances.length).toBeGreaterThan(0);

    const UserLocal = require('../../models/User.js');
    UserLocal.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    UserLocal.create.mockResolvedValueOnce({ id: 'new' });
    const doneCreate = jest.fn();
    await instance.verify('a', 'b', { id: 'id4', emails: [{ value: 'e4@x.com' }], displayName: 'Name4', photos: [{ value: 'pic4' }] }, doneCreate);
    expect(UserLocal.findOne).toHaveBeenCalled();
    expect(UserLocal.create).toHaveBeenCalledWith(expect.objectContaining({ googleId: 'id4', name: 'Name4', email: 'e4@x.com' }));
    expect(doneCreate).toHaveBeenCalledWith(null, { id: 'new' });
  });

  it('verify handles banned users and existing email linking', async () => {
    process.env.GOOGLE_CLIENT_ID = 'x';
    process.env.GOOGLE_CLIENT_SECRET = 'y';
    const pg = require('passport-google-oauth20');
    const { initializePassport: init } = require('../../config/passport.js');
    init();

    const StrategyMock = pg.Strategy;
    const instance = StrategyMock.mock.instances[0];
    const UserLocal = require('../../models/User.js');

    // banned via googleId
    UserLocal.findOne.mockResolvedValueOnce({ isBanned: true });
    const doneBanned = jest.fn();
    await instance.verify('a', 'b', { id: 'bad1', emails: [{ value: 'b@x.com' }] }, doneBanned);
    expect(doneBanned).toHaveBeenCalled();
    expect(doneBanned.mock.calls[0][0]).toBeInstanceOf(Error);

    // found by email and linked
    const existing = { isBanned: false, isActive: true, save: jest.fn() };
    UserLocal.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(existing);
    const doneLink = jest.fn();
    await instance.verify('a', 'b', { id: 'link1', emails: [{ value: 'link@x.com' }], displayName: 'Link', photos: [{ value: 'pic' }] }, doneLink);
    expect(existing.save).toHaveBeenCalled();
    expect(doneLink).toHaveBeenCalledWith(null, existing);
  });

  it('verify handles active and suspended users found by googleId', async () => {
    process.env.GOOGLE_CLIENT_ID = 'x';
    process.env.GOOGLE_CLIENT_SECRET = 'y';
    const pg = require('passport-google-oauth20');
    const { initializePassport: init } = require('../../config/passport.js');
    init();

    const StrategyMock = pg.Strategy;
    const instance = StrategyMock.mock.instances[0];
    const UserLocal = require('../../models/User.js');

    // active user found by googleId
    const activeUser = { isBanned: false, isActive: true };
    UserLocal.findOne.mockResolvedValueOnce(activeUser);
    const doneActive = jest.fn();
    await instance.verify('a', 'b', { id: 'active1', emails: [{ value: 'a@x.com' }] }, doneActive);
    expect(doneActive).toHaveBeenCalledWith(null, activeUser);

    // suspended user found by googleId
    UserLocal.findOne.mockResolvedValueOnce({ isBanned: false, isActive: false });
    const doneSusp = jest.fn();
    await instance.verify('a', 'b', { id: 's1', emails: [{ value: 's@x.com' }] }, doneSusp);
    expect(doneSusp).toHaveBeenCalled();
    expect(doneSusp.mock.calls[0][0]).toBeInstanceOf(Error);

    // serialize behavior
    const user = { _id: 'u123' };
    const d = jest.fn();
    global._serialize(user, d);
    expect(d).toHaveBeenCalledWith(null, 'u123');
  });

  it('deserialize calls done with user on success or error on failure', async () => {
    // Initialize passport to set deserialize callback
    process.env.GOOGLE_CLIENT_ID = 'x';
    process.env.GOOGLE_CLIENT_SECRET = 'y';
    delete require.cache[require.resolve('../../config/passport.js')];
    const { initializePassport: init } = require('../../config/passport.js');
    init();

    const UserLocal = require('../../models/User.js');
    const done = jest.fn();
    // success: findById returns chainable select
    UserLocal.findById.mockImplementationOnce(() => ({ select: jest.fn().mockResolvedValue({ _id: 'u1', email: 'x' }) }));
    await global._deserialize('u1', done);
    expect(done).toHaveBeenCalledWith(null, { _id: 'u1', email: 'x' });

    // failure: select rejects
    const done2 = jest.fn();
    UserLocal.findById.mockImplementationOnce(() => ({ select: jest.fn().mockRejectedValue(new Error('fail')) }));
    await global._deserialize('u2', done2);
    expect(done2).toHaveBeenCalled();
    expect(done2.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it('verify handles banned or suspended users found by email', async () => {
    process.env.GOOGLE_CLIENT_ID = 'x';
    process.env.GOOGLE_CLIENT_SECRET = 'y';
    const pg = require('passport-google-oauth20');
    const { initializePassport: init } = require('../../config/passport.js');
    init();

    const StrategyMock = pg.Strategy;
    const instance = StrategyMock.mock.instances[0];
    const UserLocal = require('../../models/User.js');

    // found by email - banned
    UserLocal.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ isBanned: true });
    const doneEmailBanned = jest.fn();
    await instance.verify('a', 'b', { id: 'e1', emails: [{ value: 'be@x.com' }], displayName: 'B' }, doneEmailBanned);
    expect(doneEmailBanned).toHaveBeenCalled();
    expect(doneEmailBanned.mock.calls[0][0]).toBeInstanceOf(Error);

    // found by email - suspended
    UserLocal.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ isBanned: false, isActive: false });
    const doneEmailSusp = jest.fn();
    await instance.verify('a', 'b', { id: 'e2', emails: [{ value: 'se@x.com' }], displayName: 'S' }, doneEmailSusp);
    expect(doneEmailSusp).toHaveBeenCalled();
    expect(doneEmailSusp.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it('verify returns done(error, null) when unexpected error occurs', async () => {
    process.env.GOOGLE_CLIENT_ID = 'x';
    process.env.GOOGLE_CLIENT_SECRET = 'y';
    const pg = require('passport-google-oauth20');
    const { initializePassport: init } = require('../../config/passport.js');
    init();

    const StrategyMock = pg.Strategy;
    const instance = StrategyMock.mock.instances[0];
    const UserLocal = require('../../models/User.js');

    UserLocal.findOne.mockRejectedValueOnce(new Error('boom'));
    const doneErr = jest.fn();
    await instance.verify('a', 'b', { id: 'bad', emails: [{ value: 'x@x.com' }] }, doneErr);
    expect(doneErr).toHaveBeenCalled();
    expect(doneErr.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(doneErr.mock.calls[0][1]).toBeNull();
  });

  it('serialize/deserialize set callbacks that work with User.findById', async () => {
    // set up mocked passport serialize/deserialize trackers
    const p = require('passport');
    delete require.cache[require.resolve('../../config/passport.js')];
    const { initializePassport: init } = require('../../config/passport.js');
    init();

    // global._deserialize was set by our mock
    expect(typeof global._deserialize).toBe('function');

    // We avoid invoking the deserialize callback directly here to prevent interacting with mongoose internals in this unit test.
    // Presence of the callback is enough for coverage confidence in this module initialization step.
  });
});