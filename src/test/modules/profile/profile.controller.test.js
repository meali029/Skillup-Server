import * as controller from '../../../modules/profile/profile.controller.js';
import * as service from '../../../modules/profile/profile.service.js';

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Profile Controller', () => {
  beforeEach(() => jest.restoreAllMocks());

  test('getUserProfile returns formatted user', async () => {
    const req = { params: { userId: 'u1' } };
    const res = makeRes();
    jest.spyOn(service, 'getProfile').mockResolvedValue({ _id: 'u1', name: 'A' });

    await controller.getUserProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('getMyProfile returns formatted user', async () => {
    const req = { user: { id: 'u1' } };
    const res = makeRes();
    jest.spyOn(service, 'getProfile').mockResolvedValue({ _id: 'u1', name: 'A' });

    await controller.getMyProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('updateUserProfile calls service and returns updated user', async () => {
    const req = { user: { id: 'u1' }, validatedData: { name: 'X' } };
    const res = makeRes();
    jest.spyOn(service, 'updateProfile').mockResolvedValue({ _id: 'u1', name: 'X' });

    await controller.updateUserProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('uploadAvatar calls next with error when no file', async () => {
    const req = { user: { id: 'u1' } };
    const res = makeRes();
    const next = jest.fn();

    await controller.uploadAvatar(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0]).toBeDefined();
  });

  test('uploadAvatar updates avatar on success', async () => {
    const req = { user: { id: 'u1' }, file: { filename: 'a.png' } };
    const res = makeRes();
    jest.spyOn(service, 'updateAvatar').mockResolvedValue({ _id: 'u1', avatar: '/uploads/a.png' });

    await controller.uploadAvatar(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('uploadPortfolioImage returns imageUrl or error when missing file', async () => {
    const next = jest.fn();
    await controller.uploadPortfolioImage({ user: { id: 'u1' } }, makeRes(), next);
    expect(next).toHaveBeenCalled();

    const req = { user: { id: 'u1' }, file: { filename: 'p.png' } };
    const res = makeRes();
    await controller.uploadPortfolioImage(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('add/update/delete portfolio call service and return user', async () => {
    const res = makeRes();
    jest.spyOn(service, 'addPortfolioItem').mockResolvedValue({ _id: 'u1' });
    await controller.addPortfolio({ user: { id: 'u1' }, validatedData: { title: 't' } }, res);
    expect(res.status).toHaveBeenCalledWith(201);

    jest.spyOn(service, 'updatePortfolioItem').mockResolvedValue({ _id: 'u1' });
    await controller.updatePortfolio({ user: { id: 'u1' }, params: { portfolioId: 'p1' }, validatedData: { title: 't' } }, res);
    expect(res.status).toHaveBeenCalledWith(200);

    jest.spyOn(service, 'deletePortfolioItem').mockResolvedValue({ _id: 'u1' });
    await controller.deletePortfolio({ user: { id: 'u1' }, params: { portfolioId: 'p1' } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
