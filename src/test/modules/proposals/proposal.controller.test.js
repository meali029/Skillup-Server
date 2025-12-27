import * as controller from '../../../modules/proposals/proposal.controller.js';
import * as service from '../../../modules/proposals/proposal.service.js';

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Proposal Controller', () => {
  beforeEach(() => jest.restoreAllMocks());

  test('submitProposal responds 201 on success', async () => {
    const req = { user: { id: 'u1' }, validatedData: { jobId: 'j1' } };
    const res = makeRes();

    jest.spyOn(service, 'createProposal').mockResolvedValue({ _id: 'p1' });

    await controller.submitProposal(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('getMyProposals returns paginated results', async () => {
    const req = { user: { id: 'u1' }, query: {} };
    const res = makeRes();

    jest.spyOn(service, 'getFreelancerProposals').mockResolvedValue({ proposals: [{ _id: 'p1' }], pagination: { page: 1, limit: 10, total: 1 } });

    await controller.getMyProposals(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('getClientProposalDetails handles notify error gracefully and returns proposal', async () => {
    const req = { user: { id: 'c1' }, params: { id: 'p1' } };
    const res = makeRes();

    jest.spyOn(service, 'getClientProposalById').mockResolvedValue({ _id: 'p1' });
    jest.spyOn(service, 'clientViewedProposalAndNotify').mockRejectedValue(new Error('boom'));
    jest.spyOn(console, 'debug').mockImplementation(() => {});

    await controller.getClientProposalDetails(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(console.debug).toHaveBeenCalled();
  });

  test('generateProposalDraft returns draft', async () => {
    const req = { user: { id: 'u1' }, params: { jobId: 'j1' } };
    const res = makeRes();

    jest.spyOn(service, 'generateProposalDraft').mockResolvedValue({ draft: { coverLetter: 'x' } });

    await controller.generateProposalDraft(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('acceptProposal returns proposal and conversation', async () => {
    const req = { user: { id: 'c1' }, params: { id: 'p1' } };
    const res = makeRes();

    jest.spyOn(service, 'acceptProposal').mockResolvedValue({ proposal: { _id: 'p1' }, conversation: { _id: 'c1' } });

    await controller.acceptProposal(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('rejectProposal returns updated proposal', async () => {
    const req = { user: { id: 'c1' }, params: { id: 'p1' }, body: { reason: 'not a fit' } };
    const res = makeRes();

    jest.spyOn(service, 'rejectProposal').mockResolvedValue({ _id: 'p1', status: 'rejected' });

    await controller.rejectProposal(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
