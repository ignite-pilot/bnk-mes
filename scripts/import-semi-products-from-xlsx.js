#!/usr/bin/env node
import 'dotenv/config';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import fetch from 'node-fetch';
import mysql from 'mysql2/promise';
import xlsx from 'xlsx';
import { prepareRowsFromSheet, runSemiProductImportRows } from '../server/lib/semi-product-xlsx-import.js';

const FILE = process.argv[2];
const SEMI_TYPE = process.argv[3] || process.env.SEMI_PRODUCT_TYPE || '하지';
if (!FILE) {
  console.error('사용법: node scripts/import-semi-products-from-xlsx.js <xlsx-path> [semi-product-type]');
  console.error('  semi-product-type 생략 시 env SEMI_PRODUCT_TYPE 또는 기본값 "하지"');
  process.exit(1);
}

const MYSQL_SECRET_ID = 'prod/ignite-pilot/mysql-realpilot';
const DB_NAME = process.env.DB_NAME || 'bnk_mes';
const CONFIG_BASE = (process.env.CONFIG_MANAGER_URL || 'https://config-manager.ig-pilot.com').replace(/\/$/, '');
const CONFIG_API_KEY = process.env.CONFIG_MANAGER_API_KEY || '1df7b7a71fdb47f6b04e41662e7363f1';
const CONFIG_APP_CODE = process.env.CONFIG_MANAGER_APP_CODE || 'BNK_MES';

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

async function fetchCodeSet(codeValue) {
  const response = await fetch(`${CONFIG_BASE}/api/v1/codes/${codeValue}`, {
    headers: { 'X-API-Key': CONFIG_API_KEY, 'X-App-Code': CONFIG_APP_CODE, Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`config ${codeValue} fetch failed: ${response.status}`);
  }
  const data = await response.json();
  const set = new Set();
  for (const c of data?.code?.children || []) {
    set.add(String(c.value || '').trim());
  }
  return set;
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

  const wb = xlsx.readFile(FILE);
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rawRows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
  const rows = prepareRowsFromSheet(rawRows);
  const vehicleCodeSet = await fetchCodeSet('VEHICLE_CODE');
  const partCodeSet = await fetchCodeSet('PART_CODE');
  const colorCodeSet = await fetchCodeSet('COLOR_CODE');

  await conn.beginTransaction();
  let inserted;
  let failures;
  try {
    const result = await runSemiProductImportRows({
      conn,
      rows,
      rowExcelNumbers: null,
      vehicleCodeSet,
      partCodeSet,
      colorCodeSet,
      semiProductType: SEMI_TYPE,
      updatedBy: 'xlsx-batch-import',
    });
    inserted = result.inserted;
    failures = result.failures;
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.end();
  }

  const summary = {
    sourceFile: FILE,
    sheetName,
    semiProductType: SEMI_TYPE,
    totalRows: rows.length,
    inserted,
    failed: failures.length,
  };

  const reportPath = 'scripts/last-semi-product-batch-report.json';
  const failPath = 'scripts/last-semi-product-batch-failures.json';
  writeFileSync(reportPath, JSON.stringify({ ...summary, failures }, null, 2));
  writeFileSync(failPath, JSON.stringify({ sourceFile: FILE, sheetName, failed: failures.length, failures }, null, 2));

  console.log(JSON.stringify({ ...summary, reportPath, failPath }, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
