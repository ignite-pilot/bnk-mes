import { jest } from '@jest/globals';
import request from 'supertest';

const mockGetOpenAiApiKey = jest.fn();
const mockFetch = jest.fn();
const mockExecuteChatOp = jest.fn();

jest.unstable_mockModule('../lib/chat-config.js', () => ({
  getOpenAiApiKey: mockGetOpenAiApiKey,
}));

jest.unstable_mockModule('node-fetch', () => ({
  default: mockFetch,
}));

jest.unstable_mockModule('../lib/chat-execute.js', () => ({
  executeChatOp: mockExecuteChatOp,
}));

const { default: app } = await import('../index.js');

describe('Chat API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('OPENAI 키가 없으면 안내 문구를 반환한다', async () => {
    mockGetOpenAiApiKey.mockResolvedValue('');
    const res = await request(app)
      .post('/api/chat')
      .send({ messages: [{ role: 'user', content: '원자재 목록 보여줘' }] });

    expect(res.status).toBe(200);
    expect(res.body.content).toMatch(/OPENAI_API_KEY/);
    expect(res.body.content).toMatch(/OPENAI_SECRET_ID/);
    expect(res.body.action).toBeNull();
  });

  it('OpenAI 응답의 navigate JSON을 action으로 파싱한다', async () => {
    mockGetOpenAiApiKey.mockResolvedValue('sk-test');
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          { message: { content: '{"action":"navigate","path":"/material/info"} 원자재 정보 화면으로 이동합니다.' } },
        ],
      }),
    });

    const res = await request(app)
      .post('/api/chat')
      .send({ messages: [{ role: 'user', content: '원자재 정보 화면으로 가줘' }] });

    expect(res.status).toBe(200);
    expect(res.body.action).toEqual({ type: 'navigate', path: '/material/info' });
    expect(res.body.content).toMatch(/이동/);
    expect(mockExecuteChatOp).not.toHaveBeenCalled();
  });

  it('execute purge_delivery_requests 성공 시 납품 화면으로 navigate하고 executed를 반환한다', async () => {
    mockGetOpenAiApiKey.mockResolvedValue('sk-test');
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content:
                '{"action":"execute","op":"purge_delivery_requests"} 납품 요청을 모두 삭제합니다. 확인했습니다.',
            },
          },
        ],
      }),
    });
    mockExecuteChatOp.mockResolvedValue({
      ok: true,
      op: 'purge_delivery_requests',
      count: 2,
      message: '완제품 입고요청/납품 관리 데이터 2건을 삭제(비활성) 처리했습니다.',
    });

    const res = await request(app)
      .post('/api/chat')
      .send({
        messages: [{ role: 'user', content: '납품 요청 전부 삭제해줘' }],
        chatContext: { updatedBy: '관리자' },
      });

    expect(res.status).toBe(200);
    expect(mockExecuteChatOp).toHaveBeenCalledWith('purge_delivery_requests', {
      updatedBy: '관리자',
      params: {},
    });
    expect(res.body.executed?.ok).toBe(true);
    expect(res.body.action).toEqual({ type: 'navigate', path: '/delivery/inbound' });
    expect(res.body.content).toMatch(/2건/);
  });

  it('execute 실패 시 navigate 없이 오류 문구를 붙인다', async () => {
    mockGetOpenAiApiKey.mockResolvedValue('sk-test');
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"action":"execute","op":"purge_delivery_requests"} 삭제합니다.' } }],
      }),
    });
    mockExecuteChatOp.mockResolvedValue({ ok: false, error: '로그인 후 이용해 주세요.' });

    const res = await request(app)
      .post('/api/chat')
      .send({ messages: [{ role: 'user', content: '전부 삭제' }], chatContext: { updatedBy: '' } });

    expect(res.status).toBe(200);
    expect(res.body.executed?.ok).toBe(false);
    expect(res.body.action).toBeNull();
    expect(res.body.content).toMatch(/처리하지 못했습니다/);
  });

  it('완제품 일괄 등록 execute 성공 시 /delivery/product 로 이동한다', async () => {
    mockGetOpenAiApiKey.mockResolvedValue('sk-test');
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content:
                '{"action":"execute","op":"batch_create_finished_products","params":{"items":[{"code":"FP-1","affiliateName":"연계업체A","ratio":1.2}]}} 등록합니다.',
            },
          },
        ],
      }),
    });
    mockExecuteChatOp.mockResolvedValue({
      ok: true,
      op: 'batch_create_finished_products',
      count: 1,
      failed: 0,
      message: '완제품 1건을 등록했습니다.',
    });

    const res = await request(app)
      .post('/api/chat')
      .send({ messages: [{ role: 'user', content: '완제품 목록 일괄 등록해줘' }], chatContext: { updatedBy: '관리자' } });

    expect(res.status).toBe(200);
    expect(mockExecuteChatOp).toHaveBeenCalledWith('batch_create_finished_products', {
      updatedBy: '관리자',
      params: { items: [{ code: 'FP-1', affiliateName: '연계업체A', ratio: 1.2 }] },
    });
    expect(res.body.action).toEqual({ type: 'navigate', path: '/delivery/product' });
    expect(res.body.executed.ok).toBe(true);
  });

  it('완제품 일괄 등록 파일 업로드 시 OpenAI 없이 바로 execute 한다', async () => {
    mockGetOpenAiApiKey.mockResolvedValue('sk-test');
    mockExecuteChatOp.mockResolvedValue({
      ok: true,
      op: 'batch_create_finished_products',
      count: 1,
      failed: 0,
      message: '완제품 1건을 등록했습니다.',
    });

    const csv = '코드,납품사 연계 업체,배율\nFP-100,연계업체A,1.2\n';
    const res = await request(app)
      .post('/api/chat')
      .field('messages', JSON.stringify([{ role: 'user', content: '완제품 일괄 등록할게. 파일 업로드함' }]))
      .field('chatContext', JSON.stringify({ updatedBy: '관리자' }))
      .attach('file', Buffer.from(csv, 'utf-8'), { filename: 'products.csv', contentType: 'text/csv' });

    expect(res.status).toBe(200);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockExecuteChatOp).toHaveBeenCalledWith('batch_create_finished_products', {
      updatedBy: '관리자',
      params: { items: [{ code: 'FP-100', affiliateName: '연계업체A', carCompany: '', vehicleCode: '', vehicleName: '', partCode: '', partName: '', colorCode: '', colorName: '', thickness: '', width: '', twoWidth: '', length: '', ratio: '1.2' }] },
    });
    expect(res.body.action).toEqual({ type: 'navigate', path: '/delivery/product' });
    expect(res.body.executed.ok).toBe(true);
  });

  it('완제품 전체 삭제 execute 성공 시 /delivery/product 로 이동한다', async () => {
    mockGetOpenAiApiKey.mockResolvedValue('sk-test');
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '{"action":"execute","op":"purge_finished_products"} 완제품을 모두 삭제합니다.',
            },
          },
        ],
      }),
    });
    mockExecuteChatOp.mockResolvedValue({
      ok: true,
      op: 'purge_finished_products',
      count: 3,
      skipped: 1,
      message: '완제품 3건을 삭제(비활성) 처리했고, 1건은 납품 요청 이력 때문에 건너뛰었습니다.',
    });

    const res = await request(app)
      .post('/api/chat')
      .send({ messages: [{ role: 'user', content: '완제품 전부 삭제해줘' }], chatContext: { updatedBy: '관리자' } });

    expect(res.status).toBe(200);
    expect(mockExecuteChatOp).toHaveBeenCalledWith('purge_finished_products', { updatedBy: '관리자', params: {} });
    expect(res.body.action).toEqual({ type: 'navigate', path: '/delivery/product' });
    expect(res.body.executed.ok).toBe(true);
  });
});

