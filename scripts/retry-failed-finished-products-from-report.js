#!/usr/bin/env node
import 'dotenv/config';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import fetch from 'node-fetch';
import mysql from 'mysql2/promise';
import xlsx from 'xlsx';

const REPORT_PATH = process.argv[2] || 'scripts/last-finished-product-batch-report.json';
const OUT_PATH = process.argv[3] || 'scripts/last-finished-product-batch-report-retry.json';

const MYSQL_SECRET_ID = 'prod/ignite-pilot/mysql-realpilot';
const DB_NAME = process.env.DB_NAME || 'bnk_mes';
const CONFIG_BASE = (process.env.CONFIG_MANAGER_URL || 'https://config-manager.ig-pilot.com').replace(/\/$/, '');
const CONFIG_API_KEY = process.env.CONFIG_MANAGER_API_KEY || '1df7b7a71fdb47f6b04e41662e7363f1';
const CONFIG_APP_CODE = process.env.CONFIG_MANAGER_APP_CODE || 'BNK_MES';
const VEHICLE_CODE_ALIASES = {
  '9533': 'RG3PE',
  '634': 'SX2 사이즈변경분',
};

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

async function fetchCodeMap(codeValue) {
  const response = await fetch(`${CONFIG_BASE}/api/v1/codes/${codeValue}`, {
    headers: { 'X-API-Key': CONFIG_API_KEY, 'X-App-Code': CONFIG_APP_CODE, Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`config ${codeValue} fetch failed: ${response.status}`);
  }
  const data = await response.json();
  const m = new Map();
  for (const c of data?.code?.children || []) {
    m.set(String(c.value || '').trim(), String(c.name || '').trim());
  }
  return m;
}

function normalizeText(v) {
  return String(v || '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toOneDecimal(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Number(n.toFixed(1));
}

function toInt(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

async function main() {
  const report = JSON.parse(readFileSync(REPORT_PATH, 'utf-8'));
  const sourceFile = report.sourceFile;
  if (!sourceFile) throw new Error('리포트에 sourceFile이 없습니다.');

  const workbook = xlsx.readFile(sourceFile);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

  const awsConfig = !process.env.DB_HOST ? getConfigFromAws() : null;
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || awsConfig?.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || awsConfig?.DB_PORT) || 3306,
    user: process.env.DB_USER || awsConfig?.DB_USER || 'root',
    password: process.env.DB_PASSWORD ?? awsConfig?.DB_PASSWORD ?? '',
    database: DB_NAME,
  });

  const [affiliateRows] = await conn.query("SELECT id, name FROM delivery_affiliates WHERE deleted = 'N'");
  const affiliateMap = new Map((affiliateRows || []).map((r) => [normalizeText(r.name), r.id]));
  const vehicleMap = await fetchCodeMap('VEHICLE_CODE');
  const partMap = await fetchCodeMap('PART_CODE');
  const colorMap = await fetchCodeMap('COLOR_CODE');

  const retryTargets = Array.isArray(report.failures) ? report.failures : [];
  let retriedInserted = 0;
  const remainingFailures = [];

  await conn.beginTransaction();
  try {
    for (const fail of retryTargets) {
      const excelRow = Number(fail.row);
      const row = rows[excelRow - 2] || {};

      const rawVehicleCode = normalizeText(row['차량코드']);
      const vehicleCode = VEHICLE_CODE_ALIASES[rawVehicleCode] || rawVehicleCode;
      const partCode = normalizeText(row['차량부위']);
      const colorCode = normalizeText(row['색상']);
      const affiliateName = normalizeText(row['연계 업체']);

      const twoWidth = toInt(row['두폭']);
      const thickness = toOneDecimal(row['두께']);
      const ratio = toInt(row['배율']);
      const width = toInt(row['폭']);
      const length = toInt(row['길이']);

      const reasons = [];
      if (!vehicleMap.has(vehicleCode)) reasons.push(`차량코드 미매칭: ${vehicleCode}`);
      if (!partMap.has(partCode)) reasons.push(`차량부위 미매칭: ${partCode}`);
      if (!colorMap.has(colorCode)) reasons.push(`색상 미매칭: ${colorCode}`);
      const affiliateId = affiliateMap.get(affiliateName);
      if (!affiliateId) reasons.push(`연계업체 미매칭: ${affiliateName}`);

      if (reasons.length > 0) {
        remainingFailures.push({
          row: excelRow,
          vehicleCode,
          partCode,
          colorCode,
          affiliateName,
          reason: reasons.join('; '),
        });
        continue;
      }

      await conn.query(
        `INSERT INTO delivery_finished_products
          (name, code, affiliate_id, car_company, vehicle_code, vehicle_name, part_code, part_name, color_code, color_name, thickness, width, two_width, \`length\`, ratio, updated_at, updated_by, deleted)
         VALUES
          (NULL, NULL, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, 'N')`,
        [
          affiliateId,
          vehicleCode,
          vehicleMap.get(vehicleCode) || null,
          partCode,
          partMap.get(partCode) || null,
          colorCode,
          colorMap.get(colorCode) || null,
          thickness,
          width,
          twoWidth,
          length,
          ratio,
          'xlsx-retry-import',
        ]
      );
      retriedInserted += 1;
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.end();
  }

  const result = {
    sourceReport: REPORT_PATH,
    sourceFile,
    failedInSourceReport: retryTargets.length,
    retriedInserted,
    stillFailed: remainingFailures.length,
    failures: remainingFailures,
  };

  writeFileSync(OUT_PATH, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ retriedInserted, stillFailed: remainingFailures.length, outPath: OUT_PATH }, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
