#!/usr/bin/env node
/**
 * 원자재 정보 테이블 생성
 * - DB_HOST 미설정 시 AWS Secret Manager "prod/ignite-pilot/mysql-realpilot" 에서 자동 조회 (AWS CLI 설정 필요)
 * - .env 또는 환경 변수: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 * - 실행: node scripts/create-raw-materials-table.js 또는 npm run setup:raw-materials
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
  } catch (err) {
    return null;
  }
}

const awsConfig = !process.env.DB_HOST ? getConfigFromAws() : null;

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS \`${TABLE}\` (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kind VARCHAR(100) NOT NULL COMMENT '원자재 종류',
  name VARCHAR(200) NOT NULL COMMENT '원자재 이름',
  color VARCHAR(50) DEFAULT NULL COMMENT '색상',
  thickness DECIMAL(12,4) DEFAULT NULL COMMENT '두께',
  width DECIMAL(12,4) DEFAULT NULL COMMENT '폭',
  length DECIMAL(12,4) DEFAULT NULL COMMENT '길이',
  supplier_safety_stock INT NOT NULL DEFAULT 0 COMMENT '원자재 업체 안전재고 수량',
  bnk_warehouse_safety_stock INT NOT NULL DEFAULT 0 COMMENT '비엔케이 창고 안전재고 수량',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by VARCHAR(100) DEFAULT NULL COMMENT '등록자',
  updated_by VARCHAR(100) DEFAULT NULL COMMENT '수정자',
  deleted CHAR(1) NOT NULL DEFAULT 'N' COMMENT '삭제여부',
  INDEX idx_deleted (deleted),
  INDEX idx_kind (kind),
  INDEX idx_name (name),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='원자재 정보';
`;

async function main() {
  const host = process.env.DB_HOST || awsConfig?.DB_HOST || 'localhost';
  const port = Number(process.env.DB_PORT || awsConfig?.DB_PORT) || 3306;
  const user = process.env.DB_USER || awsConfig?.DB_USER || 'root';
  const password = process.env.DB_PASSWORD ?? awsConfig?.DB_PASSWORD ?? '';

  if (!user) {
    console.error('DB_USER를 설정할 수 없습니다. .env 또는 AWS Secret Manager prod/ignite-pilot/mysql-realpilot 확인하세요.');
    process.exit(1);
  }

  let conn;
  try {
    conn = await mysql.createConnection({
      host,
      port,
      user,
      password,
      database: DB_NAME,
      multipleStatements: true,
    });
    await conn.query(CREATE_SQL);
    console.log(`테이블 '${TABLE}' 생성(또는 이미 존재) 완료.`);
  } catch (err) {
    console.error('테이블 생성 실패:', err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

main();
