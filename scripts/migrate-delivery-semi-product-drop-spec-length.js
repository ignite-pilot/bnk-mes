#!/usr/bin/env node
/**
 * delivery_semi_products 스키마 정리:
 * - spec 컬럼 삭제
 * - length 컬럼 삭제
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
    if (await columnExists(conn, 'spec')) {
      await conn.query(`ALTER TABLE \`${TABLE}\` DROP COLUMN spec`);
    }
    if (await columnExists(conn, 'length')) {
      await conn.query(`ALTER TABLE \`${TABLE}\` DROP COLUMN \`length\``);
    }
    console.log('delivery_semi_products spec/length 컬럼 삭제 완료');
  } catch (err) {
    console.error('실패:', err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();

