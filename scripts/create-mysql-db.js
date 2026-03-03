#!/usr/bin/env node
/**
 * MySQL 데이터베이스 생성 스크립트
 * - 접속 정보: AWS Secret Manager "prod/ignite-pilot/mysql-realpilot" 참고
 * - .env 또는 환경 변수: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD
 * - 실행: node scripts/create-mysql-db.js
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const DB_NAME = process.env.DB_NAME || 'bnk_mes';

async function main() {
  const host = process.env.DB_HOST || 'localhost';
  const port = Number(process.env.DB_PORT) || 3306;
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';

  if (!user) {
    console.error('DB_USER 환경 변수를 설정하세요. (AWS Secret Manager prod/ignite-pilot/mysql-realpilot 참고)');
    process.exit(1);
  }

  let conn;
  try {
    conn = await mysql.createConnection({
      host,
      port,
      user,
      password,
      multipleStatements: true,
    });
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`데이터베이스 '${DB_NAME}' 생성(또는 이미 존재) 완료.`);
  } catch (err) {
    console.error('DB 생성 실패:', err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

main();
