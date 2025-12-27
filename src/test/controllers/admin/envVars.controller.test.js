import * as controller from '../../../modules/admin/env-vars/envVars.controller.js';
import envService from '../../../services/env/env.service.js';
import { refreshEnvFromDatabase } from '../../../core/utils/envLoader.js';

jest.mock('../../../services/env/env.service.js');
jest.mock('../../../core/utils/envLoader.js', () => ({ refreshEnvFromDatabase: jest.fn() }));

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe('envVars.controller', () => {
  describe('getEnvVars', () => {
    test('returns sanitized variables (encrypted shown as masked)', async () => {
      const variables = [
        { _id: '1', key: 'A', value: 'v1', description: 'd', category: 'c', isEncrypted: false, isPublic: false, updatedBy: 'u', createdAt: 'c1', updatedAt: 'u1' },
        { _id: '2', key: 'B', value: 'secret', description: 'd2', category: 'c2', isEncrypted: true, isPublic: true, updatedBy: 'u2', createdAt: 'c2', updatedAt: 'u2' },
      ];

      envService.getAllVariables.mockResolvedValue(variables);

      const req = {};
      const res = mockRes();
      const next = jest.fn();

      await controller.getEnvVars(req, res, next);

      expect(envService.getAllVariables).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: expect.objectContaining({ variables: expect.any(Array) }) }));
      const sentVars = res.json.mock.calls[0][0].data.variables;
      expect(sentVars[0].value).toBe('v1');
      expect(sentVars[1].value).toBe('***ENCRYPTED***');
    });
  });

  describe('getEnvVar', () => {
    test('returns single variable sanitized', async () => {
      const variable = {
        toObject: () => ({ _id: '1', key: 'A', value: 'value', isEncrypted: false }),
        isEncrypted: false,
      };

      envService.getVariable.mockResolvedValue(variable);

      const req = { params: { key: 'A' } };
      const res = mockRes();
      const next = jest.fn();

      await controller.getEnvVar(req, res, next);

      expect(envService.getVariable).toHaveBeenCalledWith('A');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: expect.objectContaining({ variable: expect.objectContaining({ key: 'A' }) }) }));
    });

    test('forwards not found error to next', async () => {
      envService.getVariable.mockResolvedValue(null);

      const req = { params: { key: 'X' } };
      const res = mockRes();
      const next = jest.fn();

      await controller.getEnvVar(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('setEnvVar', () => {
    test('throws when key or value missing', async () => {
      const req = { user: { _id: 'admin' }, body: {} };
      const res = mockRes();
      const next = jest.fn();

      await controller.setEnvVar(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    test('sets variable and refreshes env cache', async () => {
      const req = { user: { _id: 'admin' }, body: { key: 'X', value: 'V', description: 'D', category: 'cat', isEncrypted: true, isPublic: true } };
      const res = mockRes();
      const next = jest.fn();

      envService.setVariable.mockResolvedValue({ key: 'X', value: 'V' });

      await controller.setEnvVar(req, res, next);

      expect(envService.setVariable).toHaveBeenCalledWith('X', 'V', expect.objectContaining({ description: 'D', category: 'cat', isEncrypted: true, isPublic: true }), 'admin');
      expect(refreshEnvFromDatabase).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('deleteEnvVar', () => {
    test('deletes and refreshes cache', async () => {
      envService.deleteVariable.mockResolvedValue(true);

      const req = { params: { key: 'K' } };
      const res = mockRes();
      const next = jest.fn();

      await controller.deleteEnvVar(req, res, next);

      expect(envService.deleteVariable).toHaveBeenCalledWith('K');
      expect(refreshEnvFromDatabase).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('setBulkEnvVars', () => {
    test('throws when variables invalid', async () => {
      const req = { user: { _id: 'a' }, body: {} };
      const res = mockRes();
      const next = jest.fn();

      await controller.setBulkEnvVars(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));

      const req2 = { user: { _id: 'a' }, body: { variables: [] } };
      const res2 = mockRes();
      const next2 = jest.fn();
      await controller.setBulkEnvVars(req2, res2, next2);
      expect(next2).toHaveBeenCalledWith(expect.any(Error));
    });

    test('sets bulk variables and refreshes cache', async () => {
      envService.setBulkVariables.mockResolvedValue([{ key: 'A' }]);

      const req = { user: { _id: 'a' }, body: { variables: [{ key: 'A', value: 'V' }] } };
      const res = mockRes();
      const next = jest.fn();

      await controller.setBulkEnvVars(req, res, next);
      expect(envService.setBulkVariables).toHaveBeenCalledWith([{ key: 'A', value: 'V' }], 'a');
      expect(refreshEnvFromDatabase).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('getPublicEnvVars', () => {
    test('returns public variables', async () => {
      envService.getPublicVariables.mockResolvedValue([{ key: 'PUBLIC', value: '1' }]);

      const req = {};
      const res = mockRes();
      const next = jest.fn();

      await controller.getPublicEnvVars(req, res, next);
      expect(envService.getPublicVariables).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: expect.objectContaining({ variables: expect.any(Array) }) }));
    });
  });
});