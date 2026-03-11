#!/usr/bin/env node
/**
 * raw_material_suppliers 테이블에 우편번호(postal_code), 상세주소(address_detail) 컬럼 추가
 * - 실행: node scripts/add-supplier-address-fields.js
 */
import 'dotenv/config';
import { execSync } from 'child_process';
import mysql from 'mysql2/promise';

const MYSQL_SECRET_ID = 'prod/ignite-pilot/mysql-realpilot';
const DB_NAME = process.env.DB_NAME || 'bnk_mes';
const TABLE = 'raw_material_suppliers';

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

async function main() {
  const host = process.env.DB_HOST || awsConfig?.DB_HOST || 'localhost';
  const port = Number(process.env.DB_PORT || awsConfig?.DB_PORT) || 3306;
  const user = process.env.DB_USER || awsConfig?.DB_USER || 'root';
  const password = process.env.DB_PASSWORD ?? awsConfig?.DB_PASSWORD ?? '';

  let conn;
  try {
    conn = await mysql.createConnection({
      host,
      port,
      user,
      password,
      database: DB_NAME,
    });

    const [hasPostal] = await conn.query(`
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = 'postal_code'
    `, [DB_NAME, TABLE]);
    if (hasPostal.length === 0) {
      await conn.query(`
        ALTER TABLE \`${TABLE}\`
        ADD COLUMN postal_code VARCHAR(10) DEFAULT NULL COMMENT '우편번호' AFTER address,
        ADD COLUMN address_detail VARCHAR(300) DEFAULT NULL COMMENT '상세주소' AFTER postal_code
      `);
      console.log('raw_material_suppliers에 postal_code, address_detail 컬럼 추가 완료.');
    } else {
      console.log('postal_code, address_detail 컬럼이 이미 존재합니다.');
    }
  } catch (err) {
    console.error('실패:', err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

main();
