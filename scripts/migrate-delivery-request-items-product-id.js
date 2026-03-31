#!/usr/bin/env node
/**
 * delivery_request_items: 레거시 item_id → product_id 컬럼명 통일
 * - API·스키마(create-delivery-tables)는 product_id 기준
 * - 실행: node scripts/migrate-delivery-request-items-product-id.js
 */
import 'dotenv/config';
import { execSync } from 'child_process';
import mysql from 'mysql2/promise';

const MYSQL_SECRET_ID = 'prod/ignite-pilot/mysql-realpilot';
const DB_NAME = process.env.DB_NAME || 'bnk_mes';
const TABLE = 'delivery_request_items';

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

async function columnExists(conn, columnName) {
  const [rows] = await conn.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [DB_NAME, TABLE, columnName]
  );
  return rows.length > 0;
}

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

    const [tables] = await conn.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
      [DB_NAME, TABLE]
    );
    if (tables.length === 0) {
      console.log(`테이블 ${TABLE} 없음 — npm run setup:delivery 또는 create-delivery-tables 먼저 실행하세요.`);
      process.exit(0);
    }

    const hasProductId = await columnExists(conn, 'product_id');
    const hasItemId = await columnExists(conn, 'item_id');

    if (hasProductId) {
      console.log(`${TABLE}.product_id 가 이미 있습니다. 변경 없음.`);
      return;
    }

    if (hasItemId) {
      await conn.query(`
        ALTER TABLE \`${TABLE}\`
        CHANGE COLUMN item_id product_id INT NOT NULL COMMENT '제품 ID'
      `);
      console.log(`${TABLE}: item_id → product_id 로 컬럼명 변경 완료.`);
      return;
    }

    console.error(`${TABLE}에 product_id / item_id 컬럼이 없습니다. 스키마를 확인하세요.`);
    process.exit(1);
  } catch (err) {
    console.error('실패:', err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

main();
