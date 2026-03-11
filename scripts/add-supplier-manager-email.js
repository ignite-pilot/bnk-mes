#!/usr/bin/env node
/**
 * raw_material_suppliers 테이블에 담당자 이메일(manager_email) 컬럼 추가
 * - 실행: node scripts/add-supplier-manager-email.js
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

    const [hasCol] = await conn.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = 'manager_email'`,
      [DB_NAME, TABLE]
    );
    if (hasCol.length === 0) {
      await conn.query(`
        ALTER TABLE \`${TABLE}\`
        ADD COLUMN manager_email VARCHAR(200) DEFAULT NULL COMMENT '담당자 이메일' AFTER manager_contact
      `);
      console.log('raw_material_suppliers에 manager_email 컬럼 추가 완료.');
    } else {
      console.log('manager_email 컬럼이 이미 존재합니다.');
    }
  } catch (err) {
    console.error('실패:', err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

main();
