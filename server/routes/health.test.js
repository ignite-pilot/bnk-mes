import request from 'supertest';
import app from '../index.js';

describe('GET /api/health', () => {
  it('returns 200 and status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('service', 'bnk-mes');
    expect(res.body).toHaveProperty('timestamp');
  });
});
