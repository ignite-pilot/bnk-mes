#!/usr/bin/env node
import 'dotenv/config';
import { execSync } from 'child_process';
import mysql from 'mysql2/promise';

const MYSQL_SECRET_ID = 'prod/ignite-pilot/mysql-realpilot';
const DB_NAME = process.env.DB_NAME || 'bnk_mes';
const TABLE = 'supplier_raw_material_types';

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
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`${TABLE}\` (
        supplier_id INT NOT NULL,
        raw_material_type_code VARCHAR(100) NOT NULL COMMENT 'RAW_MATERIAL_TYPE 코드값',
        PRIMARY KEY (supplier_id, raw_material_type_code),
        CONSTRAINT fk_supplier_raw_material_types_supplier
          FOREIGN KEY (supplier_id) REFERENCES raw_material_suppliers(id) ON DELETE CASCADE,
        INDEX idx_raw_material_type_code (raw_material_type_code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='공급 업체 제공 원자재 종류 코드';
    `);
    console.log(`테이블 '${TABLE}' 생성(또는 이미 존재) 완료.`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
