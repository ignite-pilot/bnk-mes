#!/usr/bin/env node
/**
 * delivery_finished_products 스키마 보강:
 * - name, code nullable 전환
 * - affiliate_id, two_width, ratio 컬럼 추가
 * - affiliate_id 인덱스/FK 추가 (delivery_affiliates.id, ON DELETE SET NULL)
 */
import 'dotenv/config';
import { execSync } from 'child_process';
import mysql from 'mysql2/promise';

const MYSQL_SECRET_ID = 'prod/ignite-pilot/mysql-realpilot';
const DB_NAME = process.env.DB_NAME || 'bnk_mes';
const TABLE = 'delivery_finished_products';

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

async function columnExists(conn, columnName) {
  const [rows] = await conn.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [DB_NAME, TABLE, columnName]
  );
  return rows.length > 0;
}

async function indexExists(conn, indexName) {
  const [rows] = await conn.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [DB_NAME, TABLE, indexName]
  );
  return rows.length > 0;
}

async function fkExists(conn, fkName) {
  const [rows] = await conn.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ? AND CONSTRAINT_NAME = ?`,
    [DB_NAME, fkName]
  );
  return rows.length > 0;
}

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

    await conn.query(
      `ALTER TABLE \`${TABLE}\`
       MODIFY COLUMN name VARCHAR(200) NULL COMMENT '완제품 이름',
       MODIFY COLUMN code VARCHAR(100) NULL COMMENT '완제품 코드'`
    );

    if (!(await columnExists(conn, 'affiliate_id'))) {
      await conn.query(
        `ALTER TABLE \`${TABLE}\`
         ADD COLUMN affiliate_id INT NULL COMMENT '납품사 연계 업체' AFTER code`
      );
    }
    if (!(await columnExists(conn, 'two_width'))) {
      await conn.query(
        `ALTER TABLE \`${TABLE}\`
         ADD COLUMN two_width DECIMAL(12,4) NULL COMMENT '두폭' AFTER width`
      );
    }
    if (!(await columnExists(conn, 'ratio'))) {
      await conn.query(
        `ALTER TABLE \`${TABLE}\`
         ADD COLUMN ratio DECIMAL(4,1) NULL COMMENT '배율' AFTER \`length\``
      );
    }

    if (!(await indexExists(conn, 'idx_affiliate_id'))) {
      await conn.query(
        `ALTER TABLE \`${TABLE}\`
         ADD INDEX idx_affiliate_id (affiliate_id)`
      );
    }

    const fkName = 'fk_delivery_finished_products_affiliate_id';
    if (!(await fkExists(conn, fkName))) {
      await conn.query(
        `ALTER TABLE \`${TABLE}\`
         ADD CONSTRAINT ${fkName}
         FOREIGN KEY (affiliate_id) REFERENCES delivery_affiliates (id)
         ON DELETE SET NULL`
      );
    }

    console.log('delivery_finished_products 마이그레이션 완료');
  } catch (err) {
    console.error('실패:', err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

main();
