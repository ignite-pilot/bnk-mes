#!/usr/bin/env node
/**
 * 입고 요청 테이블 존재 여부 확인
 * 실행: node scripts/verify-material-inbound-tables.js
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

const awsConfig = !process.env.DB_HOST ? getConfigFromAws() : null;

async function main() {
  const host = process.env.DB_HOST || awsConfig?.DB_HOST || 'localhost';
  const port = Number(process.env.DB_PORT || awsConfig?.DB_PORT) || 3306;
  const user = process.env.DB_USER || awsConfig?.DB_USER || 'root';
  const password = process.env.DB_PASSWORD ?? awsConfig?.DB_PASSWORD ?? '';

  const required = [
    'raw_material_suppliers',
    'raw_materials',
    'material_inbound_requests',
    'material_inbound_request_lines',
  ];

  let conn;
  try {
    conn = await mysql.createConnection({
      host,
      port,
      user,
      password,
      database: DB_NAME,
    });
    console.log('DB 연결:', DB_NAME, '@', host);

    const [rows] = await conn.query(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (?, ?, ?, ?)",
      [DB_NAME, ...required]
    );
    const found = (rows || []).map((r) => r.TABLE_NAME);
    for (const name of required) {
      console.log(found.includes(name) ? '  OK  ' : '  없음', name);
    }
    if (found.length < required.length) {
      console.log('\n누락된 테이블이 있습니다. 다음을 실행하세요:');
      console.log('  npm run setup:material-inbound');
      process.exit(1);
    }

    const [cols] = await conn.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'raw_material_suppliers'",
      [DB_NAME]
    );
    const hasDeleted = (cols || []).some((c) => c.COLUMN_NAME === 'deleted');
    console.log("\nraw_material_suppliers.deleted 컬럼:", hasDeleted ? '있음' : '없음 (추가 필요)');
    if (!hasDeleted) {
      console.log('  npm run setup 시 supplier 테이블에 deleted 컬럼이 있어야 합니다.');
    }

    console.log('\n테이블 확인 완료.');
  } catch (err) {
    console.error('실패:', err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

main();
