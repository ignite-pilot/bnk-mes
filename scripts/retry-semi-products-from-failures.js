#!/usr/bin/env node
/**
 * last-semi-product-batch-failures.json 에 기록된 엑셀 행만 재시도 (규칙: \r\n→공백 등 최신 sanitize 반영)
 * 사용법:
 *   node scripts/retry-semi-products-from-failures.js [xlsx-path] [failures-json-path]
 * 기본: failures = scripts/last-semi-product-batch-failures.json, xlsx = failures.sourceFile
 */
import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import mysql from 'mysql2/promise';
import xlsx from 'xlsx';
import fetch from 'node-fetch';
import { prepareRowsFromSheet, runSemiProductImportRows } from '../server/lib/semi-product-xlsx-import.js';

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
  const failPath = process.argv[3] || 'scripts/last-semi-product-batch-failures.json';
  const raw = readFileSync(failPath, 'utf-8');
  const report = JSON.parse(raw);
  const failures = report.failures || [];
  const semiProductType = report.semiProductType || process.env.SEMI_PRODUCT_TYPE || '하지';
  const rowSet = new Set(failures.map((f) => f.row).filter((n) => typeof n === 'number'));
  if (rowSet.size === 0) {
    console.error('재시도할 행이 없습니다:', failPath);
    process.exit(1);
  }

  const xlsxPath = process.argv[2] || report.sourceFile;
  if (!xlsxPath) {
    console.error('xlsx 경로를 지정하거나 failures JSON에 sourceFile이 있어야 합니다.');
    process.exit(1);
  }

  const awsConfig = !process.env.DB_HOST ? getConfigFromAws() : null;
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || awsConfig?.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || awsConfig?.DB_PORT) || 3306,
    user: process.env.DB_USER || awsConfig?.DB_USER || 'root',
    password: process.env.DB_PASSWORD ?? awsConfig?.DB_PASSWORD ?? '',
    database: DB_NAME,
  });

  const wb = xlsx.readFile(xlsxPath);
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rawRows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
  const rows = prepareRowsFromSheet(rawRows);

  const vehicleCodeSet = await fetchCodeSet('VEHICLE_CODE');
  const partCodeSet = await fetchCodeSet('PART_CODE');
  const colorCodeSet = await fetchCodeSet('COLOR_CODE');

  await conn.beginTransaction();
  let result;
  try {
    result = await runSemiProductImportRows({
      conn,
      rows,
      rowExcelNumbers: rowSet,
      vehicleCodeSet,
      partCodeSet,
      colorCodeSet,
      semiProductType,
      updatedBy: 'xlsx-batch-retry',
    });
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.end();
  }

  const summary = {
    mode: 'retry-failed-rows-only',
    sourceFile: xlsxPath,
    sheetName,
    failuresInput: failPath,
    retriedRows: rowSet.size,
    inserted: result.inserted,
    stillFailed: result.failures.length,
    semiProductType,
  };

  const outReport = 'scripts/last-semi-product-batch-retry-report.json';
  const outFail = 'scripts/last-semi-product-batch-retry-failures.json';
  writeFileSync(outReport, JSON.stringify({ ...summary, failures: result.failures }, null, 2));
  writeFileSync(outFail, JSON.stringify({ ...summary, failures: result.failures }, null, 2));

  console.log(JSON.stringify({ ...summary, reportPath: outReport, failPath: outFail }, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
