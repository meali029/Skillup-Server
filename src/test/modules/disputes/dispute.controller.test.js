import * as controller from '../../../modules/disputes/dispute.controller.js';
import service from '../../../modules/disputes/dispute.service.js';

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Dispute Controller', () => {
  beforeEach(() => jest.restoreAllMocks());

  test('createDispute success', async () => {
    const req = { user: { _id: 'u1' }, body: { contractId: 'c1' } };
    const res = makeRes();

    jest.spyOn(service, 'createDispute').mockResolvedValue({ _id: 'd1' });

    await controller.createDispute(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('createDispute handles service error', async () => {
    const req = { user: { _id: 'u1' }, body: { contractId: 'c1' } };
    const res = makeRes();
    const spy = jest.spyOn(service, 'createDispute').mockRejectedValue(new Error('boom'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await controller.createDispute(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(consoleSpy).toHaveBeenCalled();
  });

  test('getAllDisputes success and error', async () => {
    const req = { query: {} };
    const res = makeRes();
    jest.spyOn(service, 'getAllDisputes').mockResolvedValue({ disputes: [], pagination: {} });
    await controller.getAllDisputes(req, res);
    expect(res.status).toHaveBeenCalledWith(200);

    jest.spyOn(service, 'getAllDisputes').mockRejectedValue(new Error('boom'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await controller.getAllDisputes(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(consoleSpy).toHaveBeenCalled();
  });

  test('getDisputeById success and not found', async () => {
    const req = { params: { disputeId: 'd1' } };
    const res = makeRes();
    jest.spyOn(service, 'getDisputeById').mockResolvedValue({ _id: 'd1' });
    await controller.getDisputeById(req, res);
    expect(res.status).toHaveBeenCalledWith(200);

    jest.spyOn(service, 'getDisputeById').mockRejectedValue(new Error('not found'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await controller.getDisputeById(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(consoleSpy).toHaveBeenCalled();
  });

  test('getDisputesByContract success and error', async () => {
    const req = { params: { contractId: 'c1' } };
    const res = makeRes();
    jest.spyOn(service, 'getDisputesByContract').mockResolvedValue([]);
    await controller.getDisputesByContract(req, res);
    expect(res.status).toHaveBeenCalledWith(200);

    jest.spyOn(service, 'getDisputesByContract').mockRejectedValue(new Error('boom'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await controller.getDisputesByContract(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(consoleSpy).toHaveBeenCalled();
  });

  test('resolveDispute validations and success', async () => {
    const req = { params: { disputeId: 'd1' }, body: {}, user: { _id: 'a1' } };
    const res = makeRes();

    // missing resolution
    await controller.resolveDispute(req, res);
    expect(res.status).toHaveBeenCalledWith(400);

    // success
    req.body = { resolution: 'ok' };
    jest.spyOn(service, 'resolveDispute').mockResolvedValue({ _id: 'd1' });
    await controller.resolveDispute(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('rejectDispute validations and success', async () => {
    const req = { params: { disputeId: 'd1' }, body: {}, user: { _id: 'a1' } };
    const res = makeRes();

    // missing reason
    await controller.rejectDispute(req, res);
    expect(res.status).toHaveBeenCalledWith(400);

    // success
    req.body = { reason: 'not eligible' };
    jest.spyOn(service, 'rejectDispute').mockResolvedValue({ _id: 'd1' });
    await controller.rejectDispute(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('addAdminNote validations and success', async () => {
    const req = { params: { disputeId: 'd1' }, body: {}, user: { _id: 'a1' } };
    const res = makeRes();

    // missing note
    await controller.addAdminNote(req, res);
    expect(res.status).toHaveBeenCalledWith(400);

    req.body = { note: 'note' };
    jest.spyOn(service, 'addAdminNote').mockResolvedValue({ _id: 'd1' });
    await controller.addAdminNote(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('getDisputeStats success and error', async () => {
    const res = makeRes();
    jest.spyOn(service, 'getDisputeStats').mockResolvedValue({ total: 1 });
    await controller.getDisputeStats({}, res);
    expect(res.status).toHaveBeenCalledWith(200);

    jest.spyOn(service, 'getDisputeStats').mockRejectedValue(new Error('boom'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await controller.getDisputeStats({}, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(consoleSpy).toHaveBeenCalled();
  });

  test('updateDisputeStatus validations and success', async () => {
    const req = { params: { disputeId: 'd1' }, body: {}, user: { _id: 'a1' } };
    const res = makeRes();

    // missing status
    await controller.updateDisputeStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(400);

    // invalid status
    req.body = { status: 'BAD' };
    await controller.updateDisputeStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(400);

    // success
    req.body = { status: 'RESOLVED', notes: 'ok' };
    jest.spyOn(service, 'updateDisputeStatus').mockResolvedValue({ _id: 'd1' });
    await controller.updateDisputeStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
