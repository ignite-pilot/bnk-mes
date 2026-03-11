#!/usr/bin/env node
/**
 * material_inbound_requests.status 에 'received', 'returned' 추가
 * - 상세가 모두 입고 완료/전체 반품이면 부모 요청도 해당 상태로 저장
 * - 실행: node scripts/add-inbound-request-status-received-returned.js
 */
import 'dotenv/config';
import { execSync } from 'child_process';
import mysql from 'mysql2/promise';

const MYSQL_SECRET_ID = 'prod/ignite-pilot/mysql-realpilot';
const DB_NAME = process.env.DB_NAME || 'bnk_mes';
const TABLE = 'material_inbound_requests';

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

    await conn.query(`
      ALTER TABLE \`${TABLE}\`
      MODIFY COLUMN status ENUM('active','cancelled','received','returned') NOT NULL DEFAULT 'active'
      COMMENT '요청 상태(active|cancelled|received=전체입고완료|returned=전체반품)'
    `);
    console.log(`${TABLE}.status 에 'received', 'returned' 값 추가 완료.`);

    const LINES_TABLE = 'material_inbound_request_lines';
    await conn.query(`
      UPDATE \`${TABLE}\` r SET r.status = 'received', r.updated_at = CURRENT_TIMESTAMP
      WHERE r.status = 'active' AND r.deleted = 'N'
        AND (SELECT COUNT(*) FROM \`${LINES_TABLE}\` l WHERE l.request_id = r.id) > 0
        AND (SELECT COUNT(*) FROM \`${LINES_TABLE}\` l WHERE l.request_id = r.id AND l.status = 'received')
          = (SELECT COUNT(*) FROM \`${LINES_TABLE}\` l WHERE l.request_id = r.id)
    `);
    await conn.query(`
      UPDATE \`${TABLE}\` r SET r.status = 'returned', r.updated_at = CURRENT_TIMESTAMP
      WHERE r.status = 'active' AND r.deleted = 'N'
        AND (SELECT COUNT(*) FROM \`${LINES_TABLE}\` l WHERE l.request_id = r.id) > 0
        AND (SELECT COUNT(*) FROM \`${LINES_TABLE}\` l WHERE l.request_id = r.id AND l.status = 'returned')
          = (SELECT COUNT(*) FROM \`${LINES_TABLE}\` l WHERE l.request_id = r.id)
    `);
    console.log('기존 데이터 중 전체 입고/전체 반품 요청 상태 백필 완료.');
  } catch (err) {
    if (/Duplicate column name|already exists|ENUM.*received/i.test(err.message)) {
      console.log('status ENUM에 이미 received/returned가 있거나 변경 불필요.');
      return;
    }
    console.error('실패:', err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
