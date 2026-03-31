#!/usr/bin/env node
/**
 * 완제품 입고요청/납품 관리(delivery_requests + delivery_request_items) 행을 DB에서 물리 삭제합니다.
 * delivery_request_items.request_id → delivery_requests.id (ON DELETE CASCADE)
 *
 * 사용:
 *   node scripts/purge-delivery-requests-hard-delete.js --dry-run   # 건수만 확인
 *   node scripts/purge-delivery-requests-hard-delete.js --confirm     # 실제 삭제
 *
 * 연결: .env의 DB_* (create-delivery-tables.js와 동일). DB_HOST 없으면 AWS CLI로 시크릿 조회 시도.
 */
import 'dotenv/config';
import { execSync } from 'child_process';
import mysql from 'mysql2/promise';
import { hardDeleteDeliveryRequests } from '../server/lib/delivery-requests-hard-delete.js';

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

const awsConfig = !process.env.DB_HOST ? getConfigFromAws() : null;

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');
  const confirm = args.has('--confirm');

  if (!dryRun && !confirm) {
    console.error('다음 중 하나를 지정하세요: --dry-run (건수만) 또는 --confirm (물리 삭제)');
    process.exit(1);
  }

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

    console.log(`DB: ${host}:${port}/${DB_NAME}`);

    const result = await hardDeleteDeliveryRequests(conn, { dryRun, confirm });
    console.log(`delivery_requests: ${result.reqCnt}건, delivery_request_items: ${result.itemCnt}건`);

    if (dryRun) {
      console.log('(--dry-run) 삭제하지 않았습니다.');
      return;
    }

    console.log(`삭제 완료: delivery_requests ${result.deleted}건 (품목은 CASCADE로 함께 제거됨)`);
  } catch (err) {
    console.error('실패:', err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

main();
