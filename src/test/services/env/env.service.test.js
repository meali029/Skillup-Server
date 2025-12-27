import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import envService from '../../../services/env/env.service.js';
import EnvironmentVariable from '../../../models/EnvironmentVariable.js';
import createAppError from '../../../core/errors/AppError.js';

jest.mock('../../../models/EnvironmentVariable.js', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  setVariable: jest.fn(),
  findOneAndDelete: jest.fn(),
  getPublicVariables: jest.fn(),
  getAllAsObject: jest.fn(),
}));

describe('EnvService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getAllVariables returns sorted variables', async () => {
    const mockVars = [{ key: 'A' }, { key: 'B' }];
    EnvironmentVariable.find.mockReturnValue({ sort: jest.fn().mockResolvedValue(mockVars) });

    await expect(envService.getAllVariables()).resolves.toEqual(mockVars);
    expect(EnvironmentVariable.find).toHaveBeenCalledWith({});
    expect(EnvironmentVariable.find().sort).toHaveBeenCalledWith({ key: 1 });
  });

  it('getAllVariables throws AppError on failure', async () => {
    EnvironmentVariable.find.mockImplementation(() => { throw new Error('dbfail'); });

    await expect(envService.getAllVariables()).rejects.toMatchObject({ message: 'Failed to retrieve environment variables', statusCode: 500 });
  });

  it('getVariable returns the found variable (and uppercases key)', async () => {
    const variable = { key: 'FOO', value: 'bar' };
    EnvironmentVariable.findOne.mockResolvedValue(variable);

    await expect(envService.getVariable('foo')).resolves.toEqual(variable);
    expect(EnvironmentVariable.findOne).toHaveBeenCalledWith({ key: 'FOO' });
  });

  it('getVariable throws AppError on failure', async () => {
    EnvironmentVariable.findOne.mockRejectedValue(new Error('dbfail'));

    await expect(envService.getVariable('x')).rejects.toMatchObject({ message: 'Failed to retrieve environment variable', statusCode: 500 });
  });

  it('setVariable calls model with uppercase key and passes updatedBy when adminId provided', async () => {
    const result = { key: 'KEY', value: 'val' };
    EnvironmentVariable.setVariable.mockResolvedValue(result);

    const res = await envService.setVariable('key', 'val', { isPublic: true }, 'admin1');

    expect(res).toEqual(result);
    expect(EnvironmentVariable.setVariable).toHaveBeenCalledWith('KEY', 'val', {
      key: 'KEY',
      value: 'val',
      isPublic: true,
      updatedBy: 'admin1',
    });
  });

  it('setVariable throws AppError on model failure', async () => {
    EnvironmentVariable.setVariable.mockRejectedValue(new Error('fail'));

    await expect(envService.setVariable('k', 'v')).rejects.toMatchObject({ message: 'Failed to set environment variable', statusCode: 500 });
  });

  it('deleteVariable returns deleted variable when found', async () => {
    const deleted = { key: 'K', value: 'V' };
    EnvironmentVariable.findOneAndDelete.mockResolvedValue(deleted);

    await expect(envService.deleteVariable('k')).resolves.toEqual(deleted);
    expect(EnvironmentVariable.findOneAndDelete).toHaveBeenCalledWith({ key: 'K' });
  });

  it('deleteVariable throws 404 when variable not found', async () => {
    EnvironmentVariable.findOneAndDelete.mockResolvedValue(null);

    await expect(envService.deleteVariable('k')).rejects.toMatchObject({ message: 'Environment variable not found', statusCode: 404 });
  });

  it('deleteVariable rethrows AppError if model throws an AppError', async () => {
    const appErr = createAppError('bad', 400);
    EnvironmentVariable.findOneAndDelete.mockRejectedValue(appErr);

    await expect(envService.deleteVariable('k')).rejects.toBe(appErr);
  });

  it('deleteVariable throws generic AppError when model throws non-AppError', async () => {
    EnvironmentVariable.findOneAndDelete.mockRejectedValue(new Error('dbfail'));

    await expect(envService.deleteVariable('k')).rejects.toMatchObject({ message: 'Failed to delete environment variable', statusCode: 500 });
  });

  it('setBulkVariables calls setVariable for each item and returns results', async () => {
    const spy = jest.spyOn(envService, 'setVariable').mockResolvedValueOnce('r1').mockResolvedValueOnce('r2');

    const items = [{ key: 'a', value: '1' }, { key: 'b', value: '2' }];
    const res = await envService.setBulkVariables(items, 'admin99');

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith('a', '1', {}, 'admin99');
    expect(spy).toHaveBeenCalledWith('b', '2', {}, 'admin99');
    expect(res).toEqual(['r1', 'r2']);

    spy.mockRestore();
  });

  it('setBulkVariables propagates error from setVariable', async () => {
    const spy = jest.spyOn(envService, 'setVariable').mockRejectedValue(new Error('boom'));

    const items = [{ key: 'a', value: '1' }];
    await expect(envService.setBulkVariables(items)).rejects.toMatchObject({ message: 'Failed to set bulk environment variables', statusCode: 500 });

    spy.mockRestore();
  });

  it('getPublicVariables returns model result', async () => {
    EnvironmentVariable.getPublicVariables.mockResolvedValue({ PUBLIC: 'X' });

    await expect(envService.getPublicVariables()).resolves.toEqual({ PUBLIC: 'X' });
  });

  it('getPublicVariables throws AppError on failure', async () => {
    EnvironmentVariable.getPublicVariables.mockRejectedValue(new Error('fail'));

    await expect(envService.getPublicVariables()).rejects.toMatchObject({ message: 'Failed to retrieve public environment variables', statusCode: 500 });
  });

  it('getAllAsObject returns model result', async () => {
    EnvironmentVariable.getAllAsObject.mockResolvedValue({ A: '1' });

    await expect(envService.getAllAsObject()).resolves.toEqual({ A: '1' });
  });

  it('getAllAsObject throws AppError on failure', async () => {
    EnvironmentVariable.getAllAsObject.mockRejectedValue(new Error('fail'));

    await expect(envService.getAllAsObject()).rejects.toMatchObject({ message: 'Failed to retrieve environment variables as object', statusCode: 500 });
  });
});
