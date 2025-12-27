import {
  validateSubmitProposal,
  validateUpdateProposal,
  validateProposalId,
  validateJobId,
  validateProposalQuery,
  validateRejectProposal,
  submitProposalSchema,
  updateProposalSchema,
  rejectProposalSchema
} from '../../../modules/proposals/proposal.validation.js';

describe('Proposal Validation middlewares and schemas', () => {
  const makeRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  test('validateSubmitProposal returns errors for invalid payload', () => {
    const req = { body: { jobId: 'bad', coverLetter: 'short', bidAmount: 10, deliveryTime: 0 } };
    const res = makeRes();
    const next = jest.fn();

    validateSubmitProposal(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, message: 'Validation failed' }));
    expect(next).not.toHaveBeenCalled();
  });

  test('validateSubmitProposal allows valid payload', () => {
    const body = {
      jobId: '507f1f77bcf86cd799439011',
      coverLetter: 'a'.repeat(100),
      bidAmount: 1000,
      deliveryTime: 7,
      attachments: [{ name: 'x', url: 'https://example.com' }]
    };
    const req = { body };
    const res = makeRes();
    const next = jest.fn();

    validateSubmitProposal(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.validatedData).toMatchObject({ jobId: body.jobId, bidAmount: 1000 });
  });

  test('validateUpdateProposal rejects empty body', () => {
    const req = { body: {} };
    const res = makeRes();
    const next = jest.fn();

    validateUpdateProposal(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  test('validateProposalId rejects invalid id', () => {
    const req = { params: { id: '123' } };
    const res = makeRes();
    const next = jest.fn();

    validateProposalId(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, message: 'Invalid proposal ID' }));
  });

  test('validateJobId rejects invalid id', () => {
    const req = { params: { jobId: 'nope' } };
    const res = makeRes();
    const next = jest.fn();

    validateJobId(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, message: 'Invalid job ID' }));
  });

  test('validateProposalQuery rejects invalid status and fixes defaults', () => {
    const req = { query: { status: 'unknown', page: '0', limit: '200' } };
    const res = makeRes();
    const next = jest.fn();

    validateProposalQuery(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));

    // valid query passes
    const req2 = { query: { status: 'accepted' } };
    const res2 = makeRes();
    const next2 = jest.fn();

    validateProposalQuery(req2, res2, next2);
    expect(next2).toHaveBeenCalled();
    expect(req2.validatedQuery).toMatchObject({ status: 'accepted', page: 1, limit: 10 });
  });

  test('validateRejectProposal rejects short reason but accepts empty', () => {
    const req = { body: { reason: 'short' } };
    const res = makeRes();
    const next = jest.fn();

    validateRejectProposal(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);

    const req2 = { body: { reason: '' } };
    const res2 = makeRes();
    const next2 = jest.fn();
    validateRejectProposal(req2, res2, next2);
    expect(next2).toHaveBeenCalled();

    const longReason = 'a'.repeat(20);
    const req3 = { body: { reason: longReason } };
    const res3 = makeRes();
    const next3 = jest.fn();
    validateRejectProposal(req3, res3, next3);
    expect(next3).toHaveBeenCalled();
  });

  // Also cover Joi schema-level behavior directly
  test('submitProposalSchema details', () => {
    const { error } = submitProposalSchema.validate({ jobId: 'bad', coverLetter: 'short', bidAmount: 1, deliveryTime: 0 }, { abortEarly: false });
    expect(error).toBeTruthy();
    const messages = error.details.map(d => d.message);
    expect(messages).toEqual(expect.arrayContaining([
      expect.stringContaining('Invalid job ID format'),
      expect.stringContaining('Cover letter must be at least 100 characters'),
      expect.stringContaining('Proposed price must be at least PKR 500')
    ]));
  });

  test('rejectProposalSchema enforces max length', () => {
    const long = 'a'.repeat(501);
    const { error } = rejectProposalSchema.validate({ reason: long });
    expect(error).toBeTruthy();
  });
});
