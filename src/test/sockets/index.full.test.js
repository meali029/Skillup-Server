/* eslint-env jest */

jest.mock('socket.io', () => {
  class FakeServer {
    constructor(httpServer, opts) {
      this.httpServer = httpServer;
      this.opts = opts;
      this._middleware = null;
      this._events = {};
      this.emitted = [];
    }

    use(fn) {
      this._middleware = fn;
    }

    on(event, fn) {
      this._events[event] = fn;
    }

    to(room) {
      const self = this;
      return {
        emit(event, data) {
          self.emitted.push({ room, event, data });
        },
        except(excluded) {
          return {
            emit(event, data) {
              self.emitted.push({ room, event, data, except: excluded });
            }
          };
        }
      };
    }

    close() {}
  }

  return { Server: FakeServer };
});

import jwt from 'jsonwebtoken';
import User from '../../models/User.js';

describe('sockets/index - full coverage', () => {
  let consoleWarnSpy;
  let consoleLogSpy;

  beforeEach(() => {
    jest.resetModules(); // reset internal module state so `io` is undefined between tests
    process.env.JWT_SECRET = 'test-secret';
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('getIO throws when not initialized and emits warn for uninitialized emits', () => {
    const sockets = require('../../sockets/index.js');
    expect(() => sockets.getIO()).toThrow('Socket.io not initialized');

    sockets.emitToRoom('room', 'ev', { a: 1 });
    sockets.emitUserNotification('u1', { t: true });
    sockets.emitMessage('c', { _id: 'm' }, 'u2');
    sockets.emitMessageEdited('c', { _id: 'm', content: 'x' });
    sockets.emitMessageDeleted('c', 'mid');
    sockets.emitContractEvent('ct1', 'updated', { clientId: 'c1', freelancerId: 'f1' });
    sockets.emitJobEvent('review', { jobId: 'j1', clientId: 'c1', action: 'flag' });

    expect(consoleWarnSpy).toHaveBeenCalled();
  });

  it('middleware: handles missing token', async () => {
    const sockets = require('../../sockets/index.js');
    const server = sockets.initializeSocketServer({});
    const middleware = server._middleware;

    const socketNoToken = { handshake: { auth: {} } };
    const next1 = jest.fn();
    await middleware(socketNoToken, next1);
    expect(next1).toHaveBeenCalled();
    expect(next1.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(next1.mock.calls[0][0].message).toMatch(/Authentication token required/);
  });

  it('middleware: invalid token', async () => {
    jest.resetModules();
    const jwt = require('jsonwebtoken');
    const sockets = require('../../sockets/index.js');
    const server = sockets.initializeSocketServer({});
    const middleware = server._middleware;

    jest.spyOn(jwt, 'verify').mockImplementation(() => { throw new Error('bad'); });
    const socketBadToken = { handshake: { auth: { token: 'bad' } } };
    const next2 = jest.fn();
    await middleware(socketBadToken, next2);
    expect(next2).toHaveBeenCalled();
    expect(next2.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(next2.mock.calls[0][0].message).toMatch(/Invalid authentication token/);

    jwt.verify.mockRestore();
  });

  it('middleware: user not found', async () => {
    jest.resetModules();
    const jwt = require('jsonwebtoken');
    const UserLocal = require('../../models/User.js').default;
    const sockets = require('../../sockets/index.js');
    const server = sockets.initializeSocketServer({});
    const middleware = server._middleware;

    jest.spyOn(jwt, 'verify').mockReturnValue({ id: 'notfound' });
    jest.spyOn(UserLocal, 'findById').mockImplementation(() => ({ select: jest.fn().mockResolvedValue(null) }));

    const socketNF = { handshake: { auth: { token: 'ok' } } };
    const next3 = jest.fn();
    await middleware(socketNF, next3);
    expect(next3).toHaveBeenCalled();
    expect(next3.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(next3.mock.calls[0][0].message).toMatch(/User not found/);

    UserLocal.findById.mockRestore();
    jwt.verify.mockRestore();
  });

  it('middleware: banned user', async () => {
    jest.resetModules();
    const jwt = require('jsonwebtoken');
    const UserLocal = require('../../models/User.js').default;
    const sockets = require('../../sockets/index.js');
    const server = sockets.initializeSocketServer({});
    const middleware = server._middleware;

    jest.spyOn(jwt, 'verify').mockReturnValue({ id: 'banned' });
    const bannedUser = { _id: 'banned', isBanned: true, isActive: true, role: 'admin', name: 'B' };
    jest.spyOn(UserLocal, 'findById').mockImplementation(() => ({ select: jest.fn().mockResolvedValue(bannedUser) }));

    const socketBanned = { handshake: { auth: { token: 'tok' } } };
    const next4 = jest.fn();
    await middleware(socketBanned, next4);
    expect(next4).toHaveBeenCalled();
    expect(next4.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(next4.mock.calls[0][0].message).toMatch(/Account is not active/);

    UserLocal.findById.mockRestore();
    jwt.verify.mockRestore();
  });

  it('middleware: success path', async () => {
    jest.resetModules();
    const jwt = require('jsonwebtoken');
    const UserLocal = require('../../models/User.js').default;
    const sockets = require('../../sockets/index.js');
    const server = sockets.initializeSocketServer({});
    const middleware = server._middleware;

    jest.spyOn(jwt, 'verify').mockReturnValue({ id: 'okuser' });
    const okUser = { _id: 'okuser', isBanned: false, isActive: true, role: 'freelancer', name: 'Joe' };
    jest.spyOn(UserLocal, 'findById').mockImplementation(() => ({ select: jest.fn().mockResolvedValue(okUser) }));

    const socketGood = { handshake: { auth: { token: 'tok' } } };
    const next5 = jest.fn();
    await middleware(socketGood, next5);
    expect(next5).toHaveBeenCalledWith();
    // middleware attaches user data
    expect(socketGood.userId).toBeDefined();
    expect(socketGood.userRole).toBe('freelancer');
    expect(socketGood.userName).toBe('Joe');

    UserLocal.findById.mockRestore();
    jwt.verify.mockRestore();
  });

  it('connection: joins rooms and responds to socket events (subscribe/unsubscribe/join/typing/read/presence/disconnect)', async () => {
    const sockets = require('../../sockets/index.js');
    const server = sockets.initializeSocketServer({});

    // Prepare middleware and emulate it to set user info
    const middleware = server._middleware;
    jest.spyOn(jwt, 'verify').mockReturnValue({ id: 'u-1' });
    const testUser = { _id: 'u-1', isBanned: false, isActive: true, role: 'freelancer', name: 'Frank' };
    jest.spyOn(User, 'findById').mockImplementation(() => ({ select: jest.fn().mockResolvedValue(testUser) }));

    // Build socket mock
    const socket = {
      handshake: { auth: { token: 't' } },
      join: jest.fn(),
      leave: jest.fn(),
      emit: jest.fn(),
      onHandlers: {},
      on(event, cb) { this.onHandlers[event] = cb; },
      to(room) { const self = this; return { emit: (ev, data) => { self.lastTo = { room, ev, data }; } }; },
      broadcast: { emit: jest.fn() },
      // ensure userId will be truthy even if _id is a string
      userId: 'u-1',
    };

    // Run middleware then connection (also ensure role set for reliable test)
    const next = jest.fn();
    await middleware(socket, next);
    // Some environments may not set socket.userRole through middleware in our mock; ensure it's set
    socket.userRole = socket.userRole || 'freelancer';
    socket.userName = socket.userName || 'Frank';

    const connHandler = server._events['connection'];
    expect(typeof connHandler).toBe('function');

    // Call connection handler
    connHandler(socket);

    // Should have joined user & role rooms
    expect(socket.join).toHaveBeenCalledWith(`user:${socket.userId}`);
    expect(socket.join).toHaveBeenCalledWith('freelancers');
    expect(socket.join).toHaveBeenCalledWith('jobs');

    // 'connected' emitted
    expect(socket.emit).toHaveBeenCalledWith('connected', expect.objectContaining({ userId: socket.userId, role: 'freelancer' }));

    // Subscribe to job
    socket.onHandlers['subscribe:job']('job123');
    expect(socket.join).toHaveBeenCalledWith('job:job123');

    // Unsubscribe
    socket.onHandlers['unsubscribe:job']('job123');
    expect(socket.leave).toHaveBeenCalledWith('job:job123');

    // Join conversation
    socket.onHandlers['join_conversation']('conv1');
    expect(socket.join).toHaveBeenCalledWith('conversation:conv1');
    expect(socket.emit).toHaveBeenCalledWith('conversation:joined', expect.objectContaining({ conversationId: 'conv1', success: true }));

    // Leave conversation
    socket.onHandlers['leave_conversation']('conv1');
    expect(socket.leave).toHaveBeenCalledWith('conversation:conv1');

    // Typing start
    socket.onHandlers['typing:start']({ conversationId: 'conv1' });
    expect(socket.lastTo).toBeDefined();
    expect(socket.lastTo.ev).toBe('user:typing');

    // Typing stop
    socket.onHandlers['typing:stop']({ conversationId: 'conv1' });
    expect(socket.lastTo.ev).toBe('user:stopped_typing');

    // message read
    socket.onHandlers['message:read']({ conversationId: 'conv1', messageIds: ['m1'] });
    expect(socket.lastTo.ev).toBe('messages:read');
    expect(socket.lastTo.data.readBy).toBe(socket.userId);

    // presence update
    socket.onHandlers['presence:update']('busy');
    expect(socket.broadcast.emit).toHaveBeenCalledWith('user:presence', expect.objectContaining({ userId: socket.userId, status: 'busy' }));

    // disconnect
    socket.onHandlers['disconnect']();
    expect(socket.broadcast.emit).toHaveBeenCalledWith('user:presence', expect.objectContaining({ userId: socket.userId, status: 'offline' }));

    jwt.verify.mockRestore();
    User.findById.mockRestore();
  });

  it('emits events correctly when initialized (jobs, room, message/edit/delete, contract)', () => {
    const sockets = require('../../sockets/index.js');
    const server = sockets.initializeSocketServer({});

    // Ensure to(room).emit pushes to server.emitted
    server.emitted = [];

    // emitJobEvent
    sockets.emitJobEvent('review', { jobId: 'j1', clientId: 'c1', action: 'flag', job: { _id: 'j1', title: 't', status: 's', moderationStatus: 'm', isFeatured: false, isFlagged: true }, moderator: { name: 'Mo', role: 'admin' }, reason: 'reason' });
    expect(server.emitted.some(e => e.room === 'user:c1' && e.event === 'job:moderation')).toBe(true);
    expect(server.emitted.some(e => e.room === 'freelancers' && e.event === 'jobs:update')).toBe(true);
    expect(server.emitted.some(e => e.room === 'job:j1' && e.event === 'job:updated')).toBe(true);

    // emitToRoom
    sockets.emitToRoom('custom:room', 'custom:event', { x: 1 });
    expect(server.emitted.some(e => e.room === 'custom:room' && e.event === 'custom:event')).toBe(true);

    // emitMessage without exclude
    server.emitted = [];
    sockets.emitMessage('conv-1', { _id: 'm1', sender: 's1' }, null);
    expect(server.emitted.some(e => e.room === 'conversation:conv-1' && e.event === 'message:new')).toBe(true);

    // emitMessageEdited
    server.emitted = [];
    sockets.emitMessageEdited('conv-2', { _id: 'm2', content: 'edited' });
    expect(server.emitted.some(e => e.room === 'conversation:conv-2' && e.event === 'message:edited')).toBe(true);

    // emitMessageDeleted
    server.emitted = [];
    sockets.emitMessageDeleted('conv-3', 'mid');
    expect(server.emitted.some(e => e.room === 'conversation:conv-3' && e.event === 'message:deleted')).toBe(true);

    // emitContractEvent
    server.emitted = [];
    sockets.emitContractEvent('ct1', 'updated', { clientId: 'c1', freelancerId: 'f1' });
    expect(server.emitted.some(e => e.room === 'user:c1' && e.event === 'contract:updated')).toBe(true);
    expect(server.emitted.some(e => e.room === 'user:f1' && e.event === 'contract:updated')).toBe(true);
  });

  it('connection: client and admin roles join their respective rooms', () => {
    const sockets = require('../../sockets/index.js');
    const server = sockets.initializeSocketServer({});

    const clientSocket = { join: jest.fn(), emit: jest.fn(), on: jest.fn(), userId: 'c-1', userRole: 'client', userName: 'C' };
    const adminSocket = { join: jest.fn(), emit: jest.fn(), on: jest.fn(), userId: 'a-1', userRole: 'admin', userName: 'A' };

    const connHandler = server._events['connection'];
    connHandler(clientSocket);
    expect(clientSocket.join).toHaveBeenCalledWith('clients');

    connHandler(adminSocket);
    expect(adminSocket.join).toHaveBeenCalledWith('admins');
  });

  it('initializeSocketServer logs initialization message', () => {
    jest.resetModules();
    const sockets = require('../../sockets/index.js');
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const server = sockets.initializeSocketServer({});
    expect(logSpy).toHaveBeenCalledWith('[Socket] Socket.io server initialized');
    expect(server).toBeDefined();
    logSpy.mockRestore();
  });

  it('getIO returns the io instance after initialization', () => {
    jest.resetModules();
    const sockets = require('../../sockets/index.js');
    const server = sockets.initializeSocketServer({});
    const ioInstance = sockets.getIO();
    expect(ioInstance).toBeDefined();
    expect(ioInstance).toBe(server);
  });
});
