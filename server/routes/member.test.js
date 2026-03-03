import request from 'supertest';
import app from '../index.js';

const originalEnv = process.env.MEMBER_API_BASE_URL;

describe('Member API', () => {
  beforeAll(() => {
    process.env.MEMBER_API_BASE_URL = '';
  });
  afterAll(() => {
    process.env.MEMBER_API_BASE_URL = originalEnv;
  });

  describe('POST /api/member/register', () => {
    it('returns 201 when loginId and password provided', async () => {
      const res = await request(app)
        .post('/api/member/register')
        .send({ loginId: 'testuser1', password: 'pass123', name: 'Test' });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user).toMatchObject({ loginId: 'testuser1', name: 'Test' });
    });

    it('returns 400 when loginId missing', async () => {
      const res = await request(app)
        .post('/api/member/register')
        .send({ password: 'pass123' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required');
    });

    it('returns 409 when loginId already exists', async () => {
      await request(app)
        .post('/api/member/register')
        .send({ loginId: 'dupuser', password: 'pass123' });
      const res = await request(app)
        .post('/api/member/register')
        .send({ loginId: 'dupuser', password: 'other' });
      expect(res.status).toBe(409);
    });
  });

  describe('POST /api/member/login', () => {
    it('returns 401 for invalid credentials', async () => {
      const res = await request(app)
        .post('/api/member/login')
        .send({ loginId: 'nonexistent', password: 'wrong' });
      expect(res.status).toBe(401);
    });

    it('returns 200 and token for valid credentials', async () => {
      await request(app)
        .post('/api/member/register')
        .send({ loginId: 'loginuser', password: 'secret' });
      const res = await request(app)
        .post('/api/member/login')
        .send({ loginId: 'loginuser', password: 'secret' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user.loginId).toBe('loginuser');
    });

    it('returns 400 when password missing', async () => {
      const res = await request(app)
        .post('/api/member/login')
        .send({ loginId: 'only' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/member/me', () => {
    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/member/me');
      expect(res.status).toBe(401);
    });

    it('returns 200 with valid token', async () => {
      const reg = await request(app)
        .post('/api/member/register')
        .send({ loginId: 'meuser', password: 'p' });
      const token = reg.body.token;
      const res = await request(app)
        .get('/api/member/me')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.user.loginId).toBe('meuser');
    });
  });
});
