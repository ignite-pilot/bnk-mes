import { jest } from '@jest/globals';
import request from 'supertest';

const mockGetTokenFromCode = jest.fn();
const mockMe = jest.fn();

jest.unstable_mockModule('../lib/ig-member-client.js', () => ({
  getTokenFromCode: mockGetTokenFromCode,
  me: mockMe,
}));

const { default: app } = await import('../index.js');

describe('Member API (화면 연동)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/member/auth/token/:code', () => {
    it('returns 200 and token when code is valid', async () => {
      mockGetTokenFromCode.mockResolvedValue({
        ok: true,
        token: 'jwt-token-1',
        user: { id: 1, loginId: 'user@example.com', name: 'User' },
      });
      const res = await request(app).get('/api/member/auth/token/abc123');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token', 'jwt-token-1');
      expect(res.body.user).toMatchObject({ loginId: 'user@example.com', name: 'User' });
      expect(mockGetTokenFromCode).toHaveBeenCalledWith('abc123');
    });

    it('returns 400 when code is invalid', async () => {
      mockGetTokenFromCode.mockResolvedValue({ ok: false, status: 400, error: 'Invalid or expired code' });
      const res = await request(app).get('/api/member/auth/token/badcode');
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('GET /api/member/me', () => {
    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/member/me');
      expect(res.status).toBe(401);
    });

    it('returns 200 with valid token', async () => {
      mockMe.mockResolvedValue({
        ok: true,
        user: { id: 1, loginId: 'user@example.com', name: 'User' },
      });
      const res = await request(app)
        .get('/api/member/me')
        .set('Authorization', 'Bearer jwt-token-1');
      expect(res.status).toBe(200);
      expect(res.body.user.loginId).toBe('user@example.com');
      expect(mockMe).toHaveBeenCalledWith('Bearer jwt-token-1');
    });
  });

  describe('POST /api/member/logout', () => {
    it('returns 200', async () => {
      const res = await request(app).post('/api/member/logout');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
});
