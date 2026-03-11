#!/usr/bin/env node
/**
 * 원자재 입고 요청/입고 관리 테이블 생성 (원자재.md, 기본규칙.md)
 * - material_inbound_requests: 입고 요청 (업체, 입고 희망일, 삭제 플래그)
 * - material_inbound_request_lines: 요청별 원자재 라인 (원자재, 수량, 상태: request/received/returned)
 * 실행: node scripts/create-material-inbound-tables.js
 */
import 'dotenv/config';
import { execSync } from 'child_process';
import mysql from 'mysql2/promise';

const MYSQL_SECRET_ID = 'prod/ignite-pilot/mysql-realpilot';
const DB_NAME = process.env.DB_NAME || 'bnk_mes';
const REQUESTS_TABLE = 'material_inbound_requests';
const LINES_TABLE = 'material_inbound_request_lines';
const SUPPLIERS_TABLE = 'raw_material_suppliers';
const RAW_MATERIALS_TABLE = 'raw_materials';

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

    const sqlRequests =
      'CREATE TABLE IF NOT EXISTS `' + REQUESTS_TABLE + '` (' +
      'id INT AUTO_INCREMENT PRIMARY KEY,' +
      "supplier_id INT NOT NULL COMMENT '원자재 공급 업체 ID'," +
      "desired_date DATE NOT NULL COMMENT '입고 희망일'," +
      "request_date DATE NOT NULL COMMENT '입고 요청일'," +
      "status ENUM('active','cancelled','received','returned') NOT NULL DEFAULT 'active' COMMENT '요청 상태(active|cancelled|received=전체입고완료|returned=전체반품)'," +
      'updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,' +
      'updated_by VARCHAR(100) DEFAULT NULL,' +
      "deleted CHAR(1) NOT NULL DEFAULT 'N'," +
      'INDEX idx_deleted (deleted), INDEX idx_supplier (supplier_id),' +
      'INDEX idx_desired_date (desired_date), INDEX idx_request_date (request_date), INDEX idx_status (status),' +
      'FOREIGN KEY (supplier_id) REFERENCES `' + SUPPLIERS_TABLE + '` (id) ON DELETE CASCADE' +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='원자재 입고 요청'";
    await conn.query(sqlRequests);
    console.log("테이블 '" + REQUESTS_TABLE + "' 생성(또는 이미 존재) 완료.");

    const sqlLines =
      'CREATE TABLE IF NOT EXISTS `' + LINES_TABLE + '` (' +
      'id INT AUTO_INCREMENT PRIMARY KEY,' +
      'request_id INT NOT NULL, raw_material_id INT NOT NULL,' +
      'quantity DECIMAL(15,4) NOT NULL DEFAULT 0,' +
      "status ENUM('request','received','returned') NOT NULL DEFAULT 'request' COMMENT '요청|입고완료|반품'," +
      'updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,' +
      'updated_by VARCHAR(100) DEFAULT NULL,' +
      'FOREIGN KEY (request_id) REFERENCES `' + REQUESTS_TABLE + '` (id) ON DELETE CASCADE,' +
      'FOREIGN KEY (raw_material_id) REFERENCES `' + RAW_MATERIALS_TABLE + '` (id) ON DELETE CASCADE,' +
      'INDEX idx_request_id (request_id), INDEX idx_raw_material_id (raw_material_id), INDEX idx_status (status)' +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='입고 요청 라인'";
    await conn.query(sqlLines);
    console.log("테이블 '" + LINES_TABLE + "' 생성(또는 이미 존재) 완료.");
  } catch (err) {
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
