#!/usr/bin/env node
/**
 * delivery_semi_products 스키마 보강(v2):
 * - name/code nullable 전환
 * - semi_product_type 컬럼 추가 (config-manager SEMI_PRODUCT 값)
 */
import 'dotenv/config';
import { execSync } from 'child_process';
import mysql from 'mysql2/promise';

const MYSQL_SECRET_ID = 'prod/ignite-pilot/mysql-realpilot';
const DB_NAME = process.env.DB_NAME || 'bnk_mes';
const TABLE = 'delivery_semi_products';

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

async function columnExists(conn, columnName) {
  const [rows] = await conn.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [DB_NAME, TABLE, columnName]
  );
  return rows.length > 0;
}

async function indexExists(conn, indexName) {
  const [rows] = await conn.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [DB_NAME, TABLE, indexName]
  );
  return rows.length > 0;
}

async function main() {
  const awsConfig = !process.env.DB_HOST ? getConfigFromAws() : null;
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || awsConfig?.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || awsConfig?.DB_PORT) || 3306,
    user: process.env.DB_USER || awsConfig?.DB_USER || 'root',
    password: process.env.DB_PASSWORD ?? awsConfig?.DB_PASSWORD ?? '',
    database: DB_NAME,
  });

  try {
    await conn.query(
      `ALTER TABLE \`${TABLE}\`
       MODIFY COLUMN name VARCHAR(200) NULL COMMENT '반제품 이름',
       MODIFY COLUMN code VARCHAR(100) NULL COMMENT '반제품 코드'`
    );

    if (!(await columnExists(conn, 'semi_product_type'))) {
      await conn.query(
        `ALTER TABLE \`${TABLE}\`
         ADD COLUMN semi_product_type VARCHAR(100) NULL COMMENT '반제품 종류 코드(SEMI_PRODUCT)' AFTER code`
      );
    }
    if (!(await indexExists(conn, 'idx_semi_product_type'))) {
      await conn.query(`ALTER TABLE \`${TABLE}\` ADD INDEX idx_semi_product_type (semi_product_type)`);
    }

    console.log('delivery_semi_products v2 마이그레이션 완료');
  } catch (err) {
    console.error('실패:', err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();

