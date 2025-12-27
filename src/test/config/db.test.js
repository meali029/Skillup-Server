import connectDB from '../../config/db.js';
import mongoose from 'mongoose';

describe('config/db', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('logs host when connection is successful', async () => {
    const conn = { connection: { host: 'mongo-host' } };
    jest.spyOn(mongoose, 'connect').mockResolvedValue(conn);
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});

    await connectDB();
    expect(log).toHaveBeenCalledWith('MongoDB connected: mongo-host');
  });

  it('calls process.exit when connection fails', async () => {
    const err = new Error('failed to connect');
    jest.spyOn(mongoose, 'connect').mockRejectedValue(err);
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => {});

    await connectDB();

    expect(errSpy).toHaveBeenCalledWith(err);
    expect(exit).toHaveBeenCalledWith(1);
  });
});