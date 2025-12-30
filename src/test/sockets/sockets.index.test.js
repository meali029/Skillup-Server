import http from 'http';
import { initializeSocketServer, emitUserNotification, emitJobEvent, emitMessage } from '../../sockets/index.js';

describe('sockets index', () => {
  it('warns when socket.io not initialized', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    emitUserNotification('u1', { test: true });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('emits to io when initialized', () => {
    const server = http.createServer();
    const io = initializeSocketServer(server);
    // stub io.to to capture emits
    io.to = jest.fn(() => ({ emit: jest.fn() }));

    emitUserNotification('u2', { a: 1 });

    expect(io.to).toHaveBeenCalledWith('user:u2');

    // test emitJobEvent uses io.to multiple times
    io.to = jest.fn(() => ({ emit: jest.fn() }));
    emitJobEvent('review', { jobId: 'j1', clientId: 'c1', action: 'flag', job: { _id: 'j1', title: 't' }, moderator: { name: 'm', role: 'admin' } });
    expect(io.to).toHaveBeenCalled();

    // test emitMessage handles excludeUserId
    io.to = jest.fn(() => ({ except: jest.fn(() => ({ emit: jest.fn() })), emit: jest.fn() }));
    emitMessage('conv1', { _id: 'm1', sender: { _id: 's1' }, content: 'hi' }, 's1');
    expect(io.to).toHaveBeenCalledWith('conversation:conv1');

    // clean up
    if (io && typeof io.close === 'function') io.close();
    server.close();
  });
});