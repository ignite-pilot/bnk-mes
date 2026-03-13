/**
 * delivery_affiliates 테이블에 postal_code, address_detail 컬럼 추가
 * 실행: node scripts/alter-delivery-affiliates-address.js
 */
import 'dotenv/config';
import { execSync } from 'child_process';
import mysql from 'mysql2/promise';

const MYSQL_SECRET_ID = 'prod/ignite-pilot/mysql-realpilot';
const DB_NAME = process.env.DB_NAME || 'bnk_mes';

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

(async () => {
  let connConfig;
  const awsCfg = getConfigFromAws();
  if (awsCfg) {
    connConfig = {
      host: awsCfg.host || process.env.DB_HOST || 'localhost',
      port: Number(awsCfg.port) || Number(process.env.DB_PORT) || 3306,
      user: awsCfg.username || process.env.DB_USER || 'root',
      password: awsCfg.password || process.env.DB_PASSWORD || '',
      database: DB_NAME,
    };
  } else {
    connConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: DB_NAME,
    };
  }

  const conn = await mysql.createConnection(connConfig);
  console.log('DB 연결 완료.');

  try {
    // 컬럼 존재 여부 확인
    const [cols] = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'delivery_affiliates' AND COLUMN_NAME IN ('postal_code', 'address_detail')`,
      [DB_NAME]
    );
    const existing = cols.map((c) => c.COLUMN_NAME);

    if (!existing.includes('postal_code')) {
      await conn.query(`ALTER TABLE delivery_affiliates ADD COLUMN postal_code VARCHAR(10) DEFAULT NULL AFTER supplier_id`);
      console.log("컬럼 'postal_code' 추가 완료.");
    } else {
      console.log("컬럼 'postal_code' 이미 존재.");
    }

    if (!existing.includes('address_detail')) {
      await conn.query(`ALTER TABLE delivery_affiliates ADD COLUMN address_detail VARCHAR(300) DEFAULT NULL AFTER address`);
      console.log("컬럼 'address_detail' 추가 완료.");
    } else {
      console.log("컬럼 'address_detail' 이미 존재.");
    }

    console.log('마이그레이션 완료.');
  } finally {
    await conn.end();
  }
})();
