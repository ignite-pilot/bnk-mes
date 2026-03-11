/**
 * MySQL connection pool (작은 사이즈)
 * - .env: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 * - DB_HOST 미설정 시 AWS Secret Manager "prod/ignite-pilot/mysql-realpilot" 에서 자동 조회 (AWS CLI 설정 필요)
 */
import { execSync } from 'child_process';
import mysql from 'mysql2/promise';

const MYSQL_SECRET_ID = 'prod/ignite-pilot/mysql-realpilot';

function getConfigFromAws() {
  try {
    const out = execSync(
      `aws secretsmanager get-secret-value --secret-id "${MYSQL_SECRET_ID}" --query SecretString --output text`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    return JSON.parse(out.trim());
  } catch {
    return null;
  }
}

const awsConfig = !process.env.DB_HOST ? getConfigFromAws() : null;

const pool = mysql.createPool({
  host: process.env.DB_HOST || awsConfig?.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || awsConfig?.DB_PORT) || 3306,
  user: process.env.DB_USER || awsConfig?.DB_USER || 'root',
  password: process.env.DB_PASSWORD ?? awsConfig?.DB_PASSWORD ?? '',
  database: process.env.DB_NAME || awsConfig?.DB_NAME || 'bnk_mes',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  charset: 'utf8mb4',
  connectTimeout: 10000, // 10초 내 연결 실패 시 에러 반환 (무한 대기 방지)
});

export default pool;
