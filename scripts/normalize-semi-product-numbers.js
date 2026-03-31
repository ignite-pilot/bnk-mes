#!/usr/bin/env node
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
    const [result] = await conn.query(`
      UPDATE delivery_semi_products
      SET
        thickness = CASE WHEN thickness IS NULL THEN NULL ELSE ROUND(thickness, 2) END,
        width = CASE WHEN width IS NULL THEN NULL ELSE ROUND(width, 0) END,
        ratio = CASE WHEN ratio IS NULL THEN NULL ELSE ROUND(ratio, 0) END
      WHERE deleted = 'N'
    `);
    console.log(`delivery_semi_products 숫자 정규화 완료 (affectedRows: ${result.affectedRows})`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

