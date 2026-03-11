/**
 * 입고 이메일 발송 (ig-notification 연동) 단위 테스트
 */
import { jest } from '@jest/globals';

process.env.IG_NOTIFICATION_SENDER_EMAIL = 'sender@test.com';
process.env.IG_NOTIFICATION_SMTP_HOST = 'smtp.test.com';
process.env.IG_NOTIFICATION_SMTP_PORT = '587';
process.env.IG_NOTIFICATION_SMTP_USERNAME = 'user';
process.env.IG_NOTIFICATION_SMTP_PASSWORD = 'pass';

const mockFetch = jest.fn();
jest.unstable_mockModule('node-fetch', () => ({ default: mockFetch }));

const mockSend = jest.fn();
jest.unstable_mockModule('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn(() => ({ send: mockSend })),
  GetSecretValueCommand: jest.fn(),
}));

const { sendInboundEmail } = await import('./notification.js');

describe('sendInboundEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('') });
    mockSend.mockResolvedValue({
      SecretString: JSON.stringify({
        sender_email: 'from-secret@test.com',
        smtp_host: 'smtp.secret.com',
        smtp_port: 465,
        smtp_username: 'secretuser',
        smtp_password: 'secretpass',
      }),
    });
  });

  it('toEmail 없으면 발송 생략하고 no_to_email 반환', async () => {
    expect(await sendInboundEmail('', '제목', '본문')).toEqual({ ok: false, reason: 'no_to_email' });
    expect(await sendInboundEmail(null, '제목', '본문')).toEqual({ ok: false, reason: 'no_to_email' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('정상 시 POST /api/v1/email/send 호출 및 multipart/form-data 사용', async () => {
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('') });
    const result = await sendInboundEmail('recipient@example.com', '입고 알림', '본문 내용');
    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/v1/email/send');
    expect(opts.method).toBe('POST');
    expect(opts.headers['content-type']).toMatch(/multipart\/form-data/);
    expect(opts.body).toBeDefined();
  });

  it('API 4xx 시 ok: false 및 reason 반환', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 422, text: () => Promise.resolve('validation error') });
    const result = await sendInboundEmail('to@test.com', '제목', '본문');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('api_422');
  });

  it('네트워크 오류 시 network_error 반환', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await sendInboundEmail('to@test.com', '제목', '본문');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('network_error');
    expect(result.detail).toBeDefined();
  });

  it('env 미설정 시 AWS Secrets Manager에서 SMTP 로드 후 발송 시도', async () => {
    delete process.env.IG_NOTIFICATION_SENDER_EMAIL;
    delete process.env.IG_NOTIFICATION_SMTP_HOST;
    delete process.env.IG_NOTIFICATION_SMTP_PORT;
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('') });
    const result = await sendInboundEmail('recipient@example.com', '제목', '본문');
    process.env.IG_NOTIFICATION_SENDER_EMAIL = 'sender@test.com';
    process.env.IG_NOTIFICATION_SMTP_HOST = 'smtp.test.com';
    process.env.IG_NOTIFICATION_SMTP_PORT = '587';
    expect(result).toEqual({ ok: true });
    expect(mockSend).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
