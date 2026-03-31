/**
 * OpenAI 키 로드 (env / Secrets Manager)
 */
import { jest } from '@jest/globals';

const mockSend = jest.fn();
jest.unstable_mockModule('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  GetSecretValueCommand: jest.fn().mockImplementation((input) => input),
}));

describe('chat-config getOpenAiApiKey', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_SECRET_ID;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('OPENAI_API_KEY가 있으면 Secrets Manager를 호출하지 않는다', async () => {
    process.env.OPENAI_API_KEY = 'sk-from-env';
    const { getOpenAiApiKey } = await import('./chat-config.js');
    const key = await getOpenAiApiKey();
    expect(key).toBe('sk-from-env');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('OPENAI_SECRET_ID로 JSON 시크릿에서 OPENAI_API_KEY를 꺼낸다', async () => {
    process.env.OPENAI_SECRET_ID = 'test/secret';
    mockSend.mockResolvedValueOnce({
      SecretString: JSON.stringify({ OPENAI_API_KEY: 'sk-from-sm' }),
    });
    const { getOpenAiApiKey } = await import('./chat-config.js');
    const key = await getOpenAiApiKey();
    expect(key).toBe('sk-from-sm');
    expect(mockSend).toHaveBeenCalled();
  });

  it('JSON 시크릿에 percus-personal-key가 있으면 우선 사용한다', async () => {
    process.env.OPENAI_SECRET_ID = 'test/secret';
    mockSend.mockResolvedValueOnce({
      SecretString: JSON.stringify({
        'percus-personal-key': 'sk-percus',
        OPENAI_API_KEY: 'sk-other',
      }),
    });
    const { getOpenAiApiKey } = await import('./chat-config.js');
    const key = await getOpenAiApiKey();
    expect(key).toBe('sk-percus');
  });

  it('OPENAI_SECRET_ID로 평문 시크릿을 그대로 키로 쓴다', async () => {
    process.env.OPENAI_SECRET_ID = 'test/secret-plain';
    mockSend.mockResolvedValueOnce({ SecretString: 'sk-plain-key' });
    const { getOpenAiApiKey } = await import('./chat-config.js');
    const key = await getOpenAiApiKey();
    expect(key).toBe('sk-plain-key');
  });

  it('OPENAI_SECRET_ID 미설정 시 기본 시크릿 prod/ignite-pilot/chatgpt 로 조회한다', async () => {
    mockSend.mockResolvedValueOnce({ SecretString: 'sk-from-default-secret' });
    const { getOpenAiApiKey } = await import('./chat-config.js');
    const key = await getOpenAiApiKey();
    expect(key).toBe('sk-from-default-secret');
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ SecretId: 'prod/ignite-pilot/chatgpt' })
    );
  });
});
