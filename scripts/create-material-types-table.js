#!/usr/bin/env node
/**
 * 원자재 종류 테이블 생성 및 시드 (상지, 하지, 프라이머, 접착제, Foam)
 * - raw_materials 테이블에 kind_id 추가 및 기존 kind 컬럼 마이그레이션
 * - 실행: node scripts/create-material-types-table.js 또는 npm run setup:material-types
 */
import 'dotenv/config';
import { execSync } from 'child_process';
import mysql from 'mysql2/promise';

const MYSQL_SECRET_ID = 'prod/ignite-pilot/mysql-realpilot';
const DB_NAME = process.env.DB_NAME || 'bnk_mes';
const TYPES_TABLE = 'material_types';
const MATERIALS_TABLE = 'raw_materials';

const DEFAULT_TYPES = [
  { name: '상지', sort_order: 1 },
  { name: '하지', sort_order: 2 },
  { name: '프라이머', sort_order: 3 },
  { name: '접착제', sort_order: 4 },
  { name: 'Foam', sort_order: 5 },
];

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

  if (!user) {
    console.error('DB_USER를 설정할 수 없습니다.');
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

    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`${TYPES_TABLE}\` (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(50) NOT NULL UNIQUE COMMENT '원자재 종류명',
        sort_order INT NOT NULL DEFAULT 0 COMMENT '정렬순서',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_sort (sort_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='원자재 종류';
    `);
    console.log(`테이블 '${TYPES_TABLE}' 생성(또는 이미 존재) 완료.`);

    for (const row of DEFAULT_TYPES) {
      await conn.query(
        `INSERT IGNORE INTO \`${TYPES_TABLE}\` (name, sort_order) VALUES (?, ?)`,
        [row.name, row.sort_order]
      );
    }
    console.log('원자재 종류 5건 시드 완료.');

    const [colsKindId] = await conn.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = 'kind_id'
    `, [DB_NAME, MATERIALS_TABLE]);
    const [colsKind] = await conn.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = 'kind'
    `, [DB_NAME, MATERIALS_TABLE]);
    const hasKindId = colsKindId.length > 0;
    const hasKind = colsKind.length > 0;

    if (!hasKindId) {
      await conn.query(`
        ALTER TABLE \`${MATERIALS_TABLE}\`
        ADD COLUMN kind_id INT NULL COMMENT '원자재 종류 FK' AFTER id,
        ADD INDEX idx_kind_id (kind_id)
      `);
      const [firstType] = await conn.query(`SELECT id FROM \`${TYPES_TABLE}\` ORDER BY sort_order LIMIT 1`);
      const defaultKindId = firstType[0]?.id ?? 1;
      await conn.query(`
        UPDATE \`${MATERIALS_TABLE}\` rm
        INNER JOIN \`${TYPES_TABLE}\` mt ON mt.name = rm.kind
        SET rm.kind_id = mt.id
        WHERE rm.kind IS NOT NULL
      `).catch(() => {});
      await conn.query(`UPDATE \`${MATERIALS_TABLE}\` SET kind_id = ? WHERE kind_id IS NULL`, [defaultKindId]);
      await conn.query(`
        ALTER TABLE \`${MATERIALS_TABLE}\` MODIFY COLUMN kind_id INT NOT NULL
      `);
      if (hasKind) await conn.query(`ALTER TABLE \`${MATERIALS_TABLE}\` DROP COLUMN kind`);
      await conn.query(`
        ALTER TABLE \`${MATERIALS_TABLE}\`
        ADD CONSTRAINT fk_raw_materials_kind
        FOREIGN KEY (kind_id) REFERENCES \`${TYPES_TABLE}\` (id)
      `);
      console.log(`'${MATERIALS_TABLE}' 테이블에 kind_id 반영 및 kind 컬럼 제거 완료.`);
    } else if (hasKind) {
      await conn.query(`ALTER TABLE \`${MATERIALS_TABLE}\` DROP FOREIGN KEY fk_raw_materials_kind`);
      await conn.query(`ALTER TABLE \`${MATERIALS_TABLE}\` MODIFY COLUMN kind_id INT NOT NULL`);
      await conn.query(`ALTER TABLE \`${MATERIALS_TABLE}\` DROP COLUMN kind`);
      await conn.query(`
        ALTER TABLE \`${MATERIALS_TABLE}\`
        ADD CONSTRAINT fk_raw_materials_kind
        FOREIGN KEY (kind_id) REFERENCES \`${TYPES_TABLE}\` (id)
      `);
      console.log(`'${MATERIALS_TABLE}' kind 컬럼 제거 및 FK 재적용 완료.`);
    } else {
      console.log(MATERIALS_TABLE + ' 테이블은 이미 kind_id로 마이그레이션되었습니다.');
    }

    const [hasUnique] = await conn.query(`
      SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = 'uk_raw_materials_name' AND NON_UNIQUE = 0
    `, [DB_NAME, MATERIALS_TABLE]);
    if (hasUnique.length === 0) {
      const [dupes] = await conn.query(`
        SELECT name, COUNT(*) AS cnt FROM \`${MATERIALS_TABLE}\` WHERE deleted = 'N' GROUP BY name HAVING cnt > 1
      `);
      if (dupes.length === 0) {
        await conn.query(`ALTER TABLE \`${MATERIALS_TABLE}\` ADD UNIQUE KEY uk_raw_materials_name (name)`);
        console.log('raw_materials.name UNIQUE(원자재 이름 중복 불가) 추가 완료.');
      }
    }
  } catch (err) {
    console.error('실패:', err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

main();
