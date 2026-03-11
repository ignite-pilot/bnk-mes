#!/usr/bin/env node
/**
 * raw_materials.name 원자재 이름 중복 방지: UNIQUE 제약 추가
 * - 실행 전 동일 name 중복 데이터가 있으면 제거하거나 수정해야 함
 * - 실행: node scripts/add-raw-materials-name-unique.js
 */
import 'dotenv/config';
import { execSync } from 'child_process';
import mysql from 'mysql2/promise';

const MYSQL_SECRET_ID = 'prod/ignite-pilot/mysql-realpilot';
const DB_NAME = process.env.DB_NAME || 'bnk_mes';
const TABLE = 'raw_materials';

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

    const [hasUnique] = await conn.query(`
      SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = 'uk_raw_materials_name' AND NON_UNIQUE = 0
    `, [DB_NAME, TABLE]);
    if (hasUnique.length > 0) {
      console.log('raw_materials.name UNIQUE(uk_raw_materials_name) 이미 존재합니다.');
      return;
    }

    const [dupes] = await conn.query(`
      SELECT name, COUNT(*) AS cnt FROM \`${TABLE}\` WHERE deleted = 'N' GROUP BY name HAVING cnt > 1
    `);
    if (dupes.length > 0) {
      console.error('중복된 원자재 이름이 있어 UNIQUE를 추가할 수 없습니다. 다음 이름을 수정한 뒤 다시 실행하세요.');
      dupes.forEach((r) => console.error(`  - ${r.name} (${r.cnt}건)`));
      process.exit(1);
    }

    await conn.query(`
      ALTER TABLE \`${TABLE}\` ADD UNIQUE KEY uk_raw_materials_name (name)
    `);
    console.log('raw_materials.name UNIQUE(uk_raw_materials_name) 추가 완료.');
  } catch (err) {
    console.error('실패:', err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

main();
