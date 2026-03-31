#!/usr/bin/env node
/**
 * delivery_semi_products 코드 필드 보강:
 * - vehicle_code (VEHICLE_CODE)
 * - part_code (PART_CODE)
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
    if (!(await columnExists(conn, 'vehicle_code'))) {
      await conn.query(
        `ALTER TABLE \`${TABLE}\`
         ADD COLUMN vehicle_code VARCHAR(100) NULL COMMENT '차량 코드(VEHICLE_CODE)' AFTER semi_product_type`
      );
    }
    if (!(await columnExists(conn, 'part_code'))) {
      await conn.query(
        `ALTER TABLE \`${TABLE}\`
         ADD COLUMN part_code VARCHAR(100) NULL COMMENT '부위 코드(PART_CODE)' AFTER vehicle_code`
      );
    }
    if (!(await indexExists(conn, 'idx_vehicle_code'))) {
      await conn.query(`ALTER TABLE \`${TABLE}\` ADD INDEX idx_vehicle_code (vehicle_code)`);
    }
    if (!(await indexExists(conn, 'idx_part_code'))) {
      await conn.query(`ALTER TABLE \`${TABLE}\` ADD INDEX idx_part_code (part_code)`);
    }

    console.log('delivery_semi_products code fields 마이그레이션 완료');
  } catch (err) {
    console.error('실패:', err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();

