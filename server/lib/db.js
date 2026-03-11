/**
 * MySQL connection pool
 * - .env: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 * - DB_HOST 미설정 시 AWS Secrets Manager "prod/ignite-pilot/mysql-realpilot" 에서 조회 (ECS 태스크 롤에 secretsmanager:GetSecretValue 필요)
 * - 서버 기동 시 initDb() 호출 후 getPool() 사용
 */
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import mysql from 'mysql2/promise';
import logger from './logger.js';

const MYSQL_SECRET_ID = process.env.MYSQL_SECRET_ID || 'prod/ignite-pilot/mysql-realpilot';

/** @type {import('mysql2/promise').Pool | null} */
let pool = null;

/**
 * AWS Secrets Manager에서 MySQL 설정 조회 (env 우선, 없을 때만 사용)
 * @returns {Promise<{ host?: string, port?: number, user?: string, password?: string, database?: string } | null>}
 */
async function getConfigFromAws() {
  try {
    const client = new SecretsManagerClient({});
    const res = await client.send(new GetSecretValueCommand({ SecretId: MYSQL_SECRET_ID }));
    const raw = res.SecretString;
    if (!raw) return null;
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const host = data.host ?? data.HOST ?? data.DB_HOST;
    const port = data.port ?? data.PORT ?? data.DB_PORT;
    const user = data.user ?? data.USER ?? data.DB_USER;
    const password = data.password ?? data.PASSWORD ?? data.DB_PASSWORD;
    const database = data.database ?? data.DATABASE ?? data.DB_NAME ?? data.db;
    if (!host || !user) {
      logger.warn('db: secret missing required fields', { secretId: MYSQL_SECRET_ID, keys: Object.keys(data || {}) });
      return null;
    }
    return {
      host,
      port: port != null ? Number(port) : 3306,
      user,
      password: password ?? '',
      database: database ?? 'bnk_mes',
    };
  } catch (err) {
    logger.warn('db: failed to load config from Secrets Manager', { secretId: MYSQL_SECRET_ID, error: err.message });
    return null;
  }
}

/**
 * DB 풀 초기화 (서버 기동 시 1회 호출)
 * - env에 DB_HOST 등이 있으면 사용, 없으면 AWS Secrets Manager 조회
 */
export async function initDb() {
  if (pool) return;
  const fromEnv = process.env.DB_HOST
    ? {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD ?? '',
        database: process.env.DB_NAME || 'bnk_mes',
      }
    : null;
  const config = fromEnv || (await getConfigFromAws()) || {
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '',
    database: 'bnk_mes',
  };
  pool = mysql.createPool({
    ...config,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    charset: 'utf8mb4',
    connectTimeout: 10000,
  });
  logger.info('db: pool initialized', { host: config.host, database: config.database });
}

/**
 * 초기화된 풀 반환 (initDb() 호출 후에만 사용)
 * @returns {import('mysql2/promise').Pool}
 */
export function getPool() {
  if (!pool) throw new Error('DB not initialized: call initDb() before getPool()');
  return pool;
}

export default { initDb, getPool };
