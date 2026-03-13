#!/usr/bin/env node
/**
 * 납품 관리 테이블 생성
 * - delivery_finished_products: 완제품 정보
 * - delivery_semi_products: 반제품 정보
 * - delivery_suppliers: 납품사 정보
 * - delivery_supplier_finished_products: 납품사↔완제품 M:N
 * - delivery_supplier_semi_products: 납품사↔반제품 M:N
 * - delivery_affiliates: 납품사 연계 업체
 * - delivery_warehouses: 납품사 창고
 * - delivery_warehouse_products: 창고↔보관 완제품 M:N
 * - delivery_requests: 납품 요청
 * - delivery_request_items: 납품 요청 상세 품목
 * 실행: node scripts/create-delivery-tables.js
 */
import 'dotenv/config';
import { execSync } from 'child_process';
import mysql from 'mysql2/promise';

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

    // 1. delivery_finished_products — 완제품 정보
    await conn.query(`
      CREATE TABLE IF NOT EXISTS delivery_finished_products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(200) NOT NULL COMMENT '완제품 이름',
        code VARCHAR(100) NOT NULL COMMENT '완제품 코드',
        car_company VARCHAR(100) DEFAULT NULL COMMENT '완성차 회사 코드',
        vehicle_code VARCHAR(100) DEFAULT NULL COMMENT '차량 코드',
        vehicle_name VARCHAR(200) DEFAULT NULL COMMENT '차량 이름',
        part_code VARCHAR(100) DEFAULT NULL COMMENT '차량 부위 코드',
        part_name VARCHAR(200) DEFAULT NULL COMMENT '차량 부위 이름',
        color_code VARCHAR(100) DEFAULT NULL COMMENT '색상 코드',
        color_name VARCHAR(200) DEFAULT NULL COMMENT '색상 이름',
        thickness DECIMAL(12,4) DEFAULT NULL COMMENT '두께',
        width DECIMAL(12,4) DEFAULT NULL COMMENT '폭',
        \`length\` DECIMAL(12,4) DEFAULT NULL COMMENT '길이',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        updated_by VARCHAR(100) DEFAULT NULL,
        deleted CHAR(1) NOT NULL DEFAULT 'N',
        INDEX idx_deleted (deleted),
        INDEX idx_name (name),
        INDEX idx_code (code),
        INDEX idx_updated_at (updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='완제품 정보';
    `);
    console.log("테이블 'delivery_finished_products' 생성(또는 이미 존재) 완료.");

    // 2. delivery_semi_products — 반제품 정보
    await conn.query(`
      CREATE TABLE IF NOT EXISTS delivery_semi_products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(200) NOT NULL COMMENT '반제품 이름',
        code VARCHAR(100) NOT NULL COMMENT '반제품 코드',
        color_code VARCHAR(100) DEFAULT NULL COMMENT '색상 코드',
        color_name VARCHAR(200) DEFAULT NULL COMMENT '색상 이름',
        thickness DECIMAL(12,4) DEFAULT NULL,
        width DECIMAL(12,4) DEFAULT NULL,
        \`length\` DECIMAL(12,4) DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        updated_by VARCHAR(100) DEFAULT NULL,
        deleted CHAR(1) NOT NULL DEFAULT 'N',
        INDEX idx_deleted (deleted),
        INDEX idx_name (name),
        INDEX idx_code (code),
        INDEX idx_updated_at (updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='반제품 정보';
    `);
    console.log("테이블 'delivery_semi_products' 생성(또는 이미 존재) 완료.");

    // 3. delivery_suppliers — 납품사 정보
    await conn.query(`
      CREATE TABLE IF NOT EXISTS delivery_suppliers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(200) NOT NULL COMMENT '납품처 이름',
        address VARCHAR(500) DEFAULT NULL COMMENT '주소',
        postal_code VARCHAR(10) DEFAULT NULL,
        address_detail VARCHAR(300) DEFAULT NULL,
        contact VARCHAR(100) DEFAULT NULL COMMENT '연락처',
        manager_name VARCHAR(100) DEFAULT NULL COMMENT '담당자',
        manager_contact VARCHAR(100) DEFAULT NULL COMMENT '담당자 연락처',
        manager_email VARCHAR(200) DEFAULT NULL COMMENT '담당자 email',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        updated_by VARCHAR(100) DEFAULT NULL,
        deleted CHAR(1) NOT NULL DEFAULT 'N',
        INDEX idx_deleted (deleted),
        INDEX idx_name (name),
        INDEX idx_updated_at (updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='납품사 정보';
    `);
    console.log("테이블 'delivery_suppliers' 생성(또는 이미 존재) 완료.");

    // 4. delivery_supplier_finished_products — 납품사↔완제품 M:N
    await conn.query(`
      CREATE TABLE IF NOT EXISTS delivery_supplier_finished_products (
        supplier_id INT NOT NULL,
        finished_product_id INT NOT NULL,
        PRIMARY KEY (supplier_id, finished_product_id),
        FOREIGN KEY (supplier_id) REFERENCES delivery_suppliers (id) ON DELETE CASCADE,
        FOREIGN KEY (finished_product_id) REFERENCES delivery_finished_products (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='납품사↔완제품 M:N';
    `);
    console.log("테이블 'delivery_supplier_finished_products' 생성(또는 이미 존재) 완료.");

    // 5. delivery_supplier_semi_products — 납품사↔반제품 M:N
    await conn.query(`
      CREATE TABLE IF NOT EXISTS delivery_supplier_semi_products (
        supplier_id INT NOT NULL,
        semi_product_id INT NOT NULL,
        PRIMARY KEY (supplier_id, semi_product_id),
        FOREIGN KEY (supplier_id) REFERENCES delivery_suppliers (id) ON DELETE CASCADE,
        FOREIGN KEY (semi_product_id) REFERENCES delivery_semi_products (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='납품사↔반제품 M:N';
    `);
    console.log("테이블 'delivery_supplier_semi_products' 생성(또는 이미 존재) 완료.");

    // 6. delivery_affiliates — 납품사 연계 업체
    await conn.query(`
      CREATE TABLE IF NOT EXISTS delivery_affiliates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(200) NOT NULL COMMENT '연계사 이름',
        supplier_id INT NOT NULL COMMENT '납품 업체',
        postal_code VARCHAR(10) DEFAULT NULL,
        address VARCHAR(500) DEFAULT NULL,
        address_detail VARCHAR(300) DEFAULT NULL,
        contact VARCHAR(100) DEFAULT NULL,
        manager_name VARCHAR(100) DEFAULT NULL,
        manager_contact VARCHAR(100) DEFAULT NULL,
        manager_email VARCHAR(200) DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        updated_by VARCHAR(100) DEFAULT NULL,
        deleted CHAR(1) NOT NULL DEFAULT 'N',
        INDEX idx_deleted (deleted),
        INDEX idx_name (name),
        INDEX idx_supplier_id (supplier_id),
        INDEX idx_updated_at (updated_at),
        FOREIGN KEY (supplier_id) REFERENCES delivery_suppliers (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='납품사 연계 업체';
    `);
    console.log("테이블 'delivery_affiliates' 생성(또는 이미 존재) 완료.");

    // 7. delivery_warehouses — 납품사 창고
    await conn.query(`
      CREATE TABLE IF NOT EXISTS delivery_warehouses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        supplier_id INT NOT NULL COMMENT '보유 납품사',
        name VARCHAR(200) NOT NULL COMMENT '창고 이름',
        address VARCHAR(500) NOT NULL COMMENT '주소',
        postal_code VARCHAR(10) DEFAULT NULL,
        address_detail VARCHAR(300) DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        updated_by VARCHAR(100) DEFAULT NULL,
        deleted CHAR(1) NOT NULL DEFAULT 'N',
        INDEX idx_deleted (deleted),
        INDEX idx_name (name),
        INDEX idx_supplier_id (supplier_id),
        INDEX idx_updated_at (updated_at),
        FOREIGN KEY (supplier_id) REFERENCES delivery_suppliers (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='납품사 창고';
    `);
    console.log("테이블 'delivery_warehouses' 생성(또는 이미 존재) 완료.");

    // 8. delivery_warehouse_products — 창고↔보관 완제품 M:N
    await conn.query(`
      CREATE TABLE IF NOT EXISTS delivery_warehouse_products (
        warehouse_id INT NOT NULL,
        finished_product_id INT NOT NULL,
        PRIMARY KEY (warehouse_id, finished_product_id),
        FOREIGN KEY (warehouse_id) REFERENCES delivery_warehouses (id) ON DELETE CASCADE,
        FOREIGN KEY (finished_product_id) REFERENCES delivery_finished_products (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='창고↔보관 완제품 M:N';
    `);
    console.log("테이블 'delivery_warehouse_products' 생성(또는 이미 존재) 완료.");

    // 9. delivery_requests — 납품 요청
    await conn.query(`
      CREATE TABLE IF NOT EXISTS delivery_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        supplier_id INT NOT NULL COMMENT '납품사',
        request_date DATE NOT NULL COMMENT '납품 요청일',
        desired_date DATE NOT NULL COMMENT '납품 희망일',
        status ENUM('requested','partial','completed','all_returned','cancelled') NOT NULL DEFAULT 'requested' COMMENT '납품 요청 상태',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        updated_by VARCHAR(100) DEFAULT NULL,
        deleted CHAR(1) NOT NULL DEFAULT 'N',
        INDEX idx_deleted (deleted),
        INDEX idx_supplier_id (supplier_id),
        INDEX idx_status (status),
        INDEX idx_desired_date (desired_date),
        INDEX idx_updated_at (updated_at),
        FOREIGN KEY (supplier_id) REFERENCES delivery_suppliers (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='납품 요청';
    `);
    console.log("테이블 'delivery_requests' 생성(또는 이미 존재) 완료.");

    // 10. delivery_request_items — 납품 요청 상세 품목
    await conn.query(`
      CREATE TABLE IF NOT EXISTS delivery_request_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        request_id INT NOT NULL COMMENT '납품 요청',
        item_type ENUM('finished','semi') NOT NULL COMMENT '완제품/반제품',
        product_id INT NOT NULL COMMENT '제품 ID',
        quantity INT NOT NULL DEFAULT 0 COMMENT '수량',
        item_status ENUM('requested','delivered','returned','cancelled') NOT NULL DEFAULT 'requested' COMMENT '납품 상태',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_request_id (request_id),
        INDEX idx_item_type (item_type),
        INDEX idx_item_status (item_status),
        FOREIGN KEY (request_id) REFERENCES delivery_requests (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='납품 요청 상세 품목';
    `);
    console.log("테이블 'delivery_request_items' 생성(또는 이미 존재) 완료.");

  } catch (err) {
    console.error('실패:', err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

main();
