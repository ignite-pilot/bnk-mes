/**
 * DB 모듈 테스트 (initDb, getPool, env / AWS Secrets Manager 경로)
 */
import { jest } from '@jest/globals';

const mockCreatePool = jest.fn(() => ({
  query: jest.fn(),
  getConnection: jest.fn(),
  end: jest.fn(),
}));
jest.unstable_mockModule('mysql2/promise', () => ({
  default: {
    createPool: mockCreatePool,
  },
}));
jest.unstable_mockModule('./logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// AWS SDK 모킹: getConfigFromAws()가 호출될 때 사용 (DB_HOST 없을 때)
const mockSend = jest.fn();
jest.unstable_mockModule('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  GetSecretValueCommand: jest.fn(),
}));

const { initDb, getPool } = await import('./db.js');

describe('db', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.DB_HOST;
    delete process.env.DB_PORT;
    delete process.env.DB_USER;
    delete process.env.DB_PASSWORD;
    delete process.env.DB_NAME;
  });

  describe('getPool', () => {
    it('initDb 호출 전 getPool()은 에러를 던진다', () => {
      expect(() => getPool()).toThrow('DB not initialized');
    });
  });

  describe('initDb', () => {
    it('DB_HOST가 있으면 env 설정으로 풀을 생성하고 getPool()이 풀을 반환한다', async () => {
      process.env.DB_HOST = 'env-db-host';
      process.env.DB_PORT = '3307';
      process.env.DB_USER = 'envuser';
      process.env.DB_PASSWORD = 'envpass';
      process.env.DB_NAME = 'envdb';

      await initDb();

      expect(mockCreatePool).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'env-db-host',
          port: 3307,
          user: 'envuser',
          password: 'envpass',
          database: 'envdb',
          waitForConnections: true,
          connectionLimit: 5,
          charset: 'utf8mb4',
          connectTimeout: 10000,
        })
      );
      expect(getPool()).toBeDefined();
      expect(getPool().query).toBeDefined();
    });

    it('initDb는 두 번 호출해도 같은 풀을 반환한다', async () => {
      process.env.DB_HOST = 'single-pool-host';
      await initDb();
      const firstPool = getPool();
      await initDb();
      expect(getPool()).toBe(firstPool);
    });
  });
});
