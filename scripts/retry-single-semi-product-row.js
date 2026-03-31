#!/usr/bin/env node
import 'dotenv/config';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
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

  const payload = {
    excelRow: 157,
    semi_product_type: '하지',
    code: '10415225',
    vehicle_code: 'LX2',
    part_code: 'CTR RR',
    color: 'NNB',
    vendor: '공용 사용',
    thickness: 0.25,
    width: 1180,
  };

  let result;
  try {
    const [dup] = await conn.query(
      "SELECT id FROM delivery_semi_products WHERE code = ? AND deleted = 'N' LIMIT 1",
      [payload.code]
    );

    if ((dup || []).length > 0) {
      result = { ok: false, reason: '이미 사용 중인 반제품 코드입니다.', existingId: dup[0].id };
    } else {
      const [ins] = await conn.query(
        "INSERT INTO delivery_semi_products (name, code, semi_product_type, vehicle_code, part_code, ratio, color_code, color_name, thickness, width, updated_at, updated_by, deleted) VALUES (NULL, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, CURRENT_TIMESTAMP, ?, 'N')",
        [payload.code, payload.semi_product_type, payload.vehicle_code, payload.part_code, payload.color, payload.thickness, payload.width, 'xlsx-batch-retry']
      );
      result = { ok: true, insertId: ins.insertId };
    }
  } finally {
    await conn.end();
  }

  const report = {
    source: 'manual-retry-single-row',
    processedAt: new Date().toISOString(),
    payload,
    result,
  };

  const reportPath = 'scripts/last-semi-product-batch-retry-single.json';
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ reportPath, ...result }, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

