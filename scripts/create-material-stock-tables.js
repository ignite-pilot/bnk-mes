#!/usr/bin/env node
/**
 * 원자재 재고 관리 테이블 생성 (원자재.md, 기본규칙.md)
 * - bnk_warehouses: 비엔케이 원자재 창고
 * - stock_snapshots: 재고 스냅샷 (업체/BNK 구분, 기준일)
 * - stock_snapshot_lines: 스냅샷별 원자재·수량
 * 실행: node scripts/create-material-stock-tables.js
 */
import 'dotenv/config';
import { execSync } from 'child_process';
import mysql from 'mysql2/promise';

const MYSQL_SECRET_ID = 'prod/ignite-pilot/mysql-realpilot';
const DB_NAME = process.env.DB_NAME || 'bnk_mes';
const BNK_WAREHOUSES_TABLE = 'bnk_warehouses';
const STOCK_SNAPSHOTS_TABLE = 'stock_snapshots';
const STOCK_LINES_TABLE = 'stock_snapshot_lines';

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
      CREATE TABLE IF NOT EXISTS \`${BNK_WAREHOUSES_TABLE}\` (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(200) NOT NULL COMMENT '창고 이름',
        address VARCHAR(500) DEFAULT NULL COMMENT '주소',
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        updated_by VARCHAR(100) DEFAULT NULL,
        deleted CHAR(1) NOT NULL DEFAULT 'N',
        INDEX idx_deleted (deleted)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='비엔케이 원자재 창고';
    `);
    console.log(`테이블 '${BNK_WAREHOUSES_TABLE}' 생성(또는 이미 존재) 완료.`);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`${STOCK_SNAPSHOTS_TABLE}\` (
        id INT AUTO_INCREMENT PRIMARY KEY,
        snapshot_type ENUM('supplier','bnk') NOT NULL COMMENT '원자재 업체 | 비엔케이',
        supplier_warehouse_id INT DEFAULT NULL COMMENT '원자재 업체 창고 ID',
        bnk_warehouse_id INT DEFAULT NULL COMMENT '비엔케이 창고 ID',
        stock_date DATE NOT NULL COMMENT '재고 기준일',
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        updated_by VARCHAR(100) DEFAULT NULL,
        deleted CHAR(1) NOT NULL DEFAULT 'N',
        INDEX idx_deleted (deleted),
        INDEX idx_stock_date (stock_date),
        INDEX idx_type (snapshot_type),
        FOREIGN KEY (supplier_warehouse_id) REFERENCES supplier_warehouses (id) ON DELETE SET NULL,
        FOREIGN KEY (bnk_warehouse_id) REFERENCES \`${BNK_WAREHOUSES_TABLE}\` (id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='재고 스냅샷';
    `);
    console.log(`테이블 '${STOCK_SNAPSHOTS_TABLE}' 생성(또는 이미 존재) 완료.`);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`${STOCK_LINES_TABLE}\` (
        id INT AUTO_INCREMENT PRIMARY KEY,
        snapshot_id INT NOT NULL,
        raw_material_id INT NOT NULL,
        quantity DECIMAL(15,4) NOT NULL DEFAULT 0 COMMENT '재고 수량',
        UNIQUE KEY uk_snapshot_material (snapshot_id, raw_material_id),
        FOREIGN KEY (snapshot_id) REFERENCES \`${STOCK_SNAPSHOTS_TABLE}\` (id) ON DELETE CASCADE,
        FOREIGN KEY (raw_material_id) REFERENCES raw_materials (id) ON DELETE CASCADE,
        INDEX idx_raw_material_id (raw_material_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='재고 스냅샷 라인';
    `);
    console.log(`테이블 '${STOCK_LINES_TABLE}' 생성(또는 이미 존재) 완료.`);
  } catch (err) {
    console.error('실패:', err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

main();
