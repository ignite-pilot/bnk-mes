#!/usr/bin/env node
/**
 * 원자재 공급 업체 테이블 생성 (원자재.md 규칙)
 * - raw_material_suppliers: 공급 업체 정보
 * - supplier_raw_materials: 공급 업체 ↔ 원자재 N:N
 * - 실행: node scripts/create-material-suppliers-table.js
 */
import 'dotenv/config';
import { execSync } from 'child_process';
import mysql from 'mysql2/promise';

const MYSQL_SECRET_ID = 'prod/ignite-pilot/mysql-realpilot';
const DB_NAME = process.env.DB_NAME || 'bnk_mes';
const SUPPLIERS_TABLE = 'raw_material_suppliers';
const JUNCTION_TABLE = 'supplier_raw_materials';

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
      multipleStatements: true,
    });

    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`${SUPPLIERS_TABLE}\` (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(200) NOT NULL COMMENT '업체 명',
        address VARCHAR(500) NOT NULL COMMENT '주소 (Daum 검색)',
        postal_code VARCHAR(10) DEFAULT NULL COMMENT '우편번호',
        address_detail VARCHAR(300) DEFAULT NULL COMMENT '상세주소',
        contact VARCHAR(100) DEFAULT NULL COMMENT '업체 연락처',
        manager_name VARCHAR(100) DEFAULT NULL COMMENT '담당자',
        manager_contact VARCHAR(100) DEFAULT NULL COMMENT '담당자 연락처',
        manager_email VARCHAR(200) DEFAULT NULL COMMENT '담당자 이메일',
        inbound_lead_time INT DEFAULT NULL COMMENT '입고 요청 후 리드 타임(일)',
        order_lead_time INT DEFAULT NULL COMMENT '발주 요청 후 리드 타임(일)',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        updated_by VARCHAR(100) DEFAULT NULL COMMENT '수정자',
        deleted CHAR(1) NOT NULL DEFAULT 'N' COMMENT '삭제여부',
        INDEX idx_deleted (deleted),
        INDEX idx_name (name),
        INDEX idx_updated_at (updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='원자재 공급 업체';
    `);
    console.log(`테이블 '${SUPPLIERS_TABLE}' 생성(또는 이미 존재) 완료.`);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`${JUNCTION_TABLE}\` (
        supplier_id INT NOT NULL,
        raw_material_id INT NOT NULL,
        PRIMARY KEY (supplier_id, raw_material_id),
        FOREIGN KEY (supplier_id) REFERENCES \`${SUPPLIERS_TABLE}\` (id) ON DELETE CASCADE,
        FOREIGN KEY (raw_material_id) REFERENCES raw_materials (id) ON DELETE CASCADE,
        INDEX idx_raw_material_id (raw_material_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='공급 업체 제공 원자재';
    `);
    console.log(`테이블 '${JUNCTION_TABLE}' 생성(또는 이미 존재) 완료.`);
  } catch (err) {
    console.error('실패:', err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

main();
