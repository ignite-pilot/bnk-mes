import { getPool } from './db.js';
import logger from './logger.js';
import { countDeliveryRequestItemRefs } from './delivery-request-items.js';

const TABLE = 'delivery_requests';
const ITEMS_TABLE = 'delivery_request_items';
const FINISHED_PRODUCTS_TABLE = 'delivery_finished_products';
const AFFILIATES_TABLE = 'delivery_affiliates';
const SUPPLIER_FP_JUNCTION = 'delivery_supplier_finished_products';
const WAREHOUSE_FP_JUNCTION = 'delivery_warehouse_products';

const ALLOWED_OPS = new Set([
  'purge_delivery_requests',
  'batch_create_finished_products',
  'purge_finished_products',
]);

/** 완제품 junction 제거 (테이블 없으면 무시) */
async function clearFinishedProductJunctions(pool, productId) {
  try {
    await pool.query(`DELETE FROM \`${SUPPLIER_FP_JUNCTION}\` WHERE finished_product_id = ?`, [productId]);
  } catch (err) {
    if (err.code !== 'ER_NO_SUCH_TABLE') throw err;
  }
  try {
    await pool.query(`DELETE FROM \`${WAREHOUSE_FP_JUNCTION}\` WHERE finished_product_id = ?`, [productId]);
  } catch (err) {
    if (err.code !== 'ER_NO_SUCH_TABLE') throw err;
  }
}

function toNullableTrimmed(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function toNullableNumber(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toNullableOneDecimal(v) {
  const n = toNullableNumber(v);
  if (n == null) return null;
  return Number(n.toFixed(1));
}

function toNullableInt(v) {
  const n = toNullableNumber(v);
  if (n == null) return null;
  return Math.round(n);
}

/**
 * 채팅에서만 허용하는 서버 작업 (화이트리스트)
 * @param {string} op
 * @param {{ updatedBy: string, params?: Record<string, unknown> }} ctx
 */
export async function executeChatOp(op, { updatedBy, params = {} }) {
  if (!ALLOWED_OPS.has(op)) {
    return { ok: false, error: '허용되지 않은 작업입니다. 시스템 관리자에게 문의하세요.' };
  }
  if (updatedBy == null || String(updatedBy).trim() === '') {
    return { ok: false, error: '로그인 후 이용해 주세요. (수정자 정보가 필요합니다.)' };
  }
  const by = String(updatedBy).trim();

  try {
    if (op === 'purge_delivery_requests') {
      const pool = getPool();
      const [rows] = await pool.query(`SELECT id FROM \`${TABLE}\` WHERE deleted = ?`, ['N']);
      const ids = (rows || []).map((r) => r.id);
      for (const id of ids) {
        await pool.query(
          `UPDATE \`${TABLE}\` SET deleted = 'Y', status = 'cancelled', updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ? AND deleted = 'N'`,
          [by, id]
        );
        await pool.query(
          `UPDATE \`${ITEMS_TABLE}\` SET item_status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE request_id = ?`,
          [id]
        );
      }
      const msg =
        ids.length === 0
          ? '삭제할 납품 요청이 없습니다. (이미 비어 있음)'
          : `완제품 입고요청/납품 관리 데이터 ${ids.length}건을 삭제(비활성) 처리했습니다.`;
      logger.info('chat execute: purge_delivery_requests', { count: ids.length, updatedBy: by });
      return { ok: true, op, count: ids.length, message: msg };
    }

    if (op === 'batch_create_finished_products') {
      const pool = getPool();
      const items = Array.isArray(params.items) ? params.items : [];
      if (items.length === 0) {
        return {
          ok: false,
          error: '등록할 완제품 목록이 비어 있습니다. 코드/연계업체/치수 정보를 1건 이상 보내 주세요.',
        };
      }
      if (items.length > 1000) {
        return { ok: false, error: '한 번에 최대 1000건까지만 등록할 수 있습니다.' };
      }

      let successCount = 0;
      const errors = [];

      for (let i = 0; i < items.length; i += 1) {
        const row = items[i] || {};
        const code = toNullableTrimmed(row.code);
        const affiliateName = toNullableTrimmed(row.affiliateName ?? row.affiliate_name);
        const carCompany = toNullableTrimmed(row.carCompany ?? row.car_company);
        const vehicleCode = toNullableTrimmed(row.vehicleCode ?? row.vehicle_code);
        const vehicleName = toNullableTrimmed(row.vehicleName ?? row.vehicle_name);
        const partCode = toNullableTrimmed(row.partCode ?? row.part_code);
        const partName = toNullableTrimmed(row.partName ?? row.part_name);
        const colorCode = toNullableTrimmed(row.colorCode ?? row.color_code);
        const colorName = toNullableTrimmed(row.colorName ?? row.color_name);
        const thickness = toNullableOneDecimal(row.thickness);
        const width = toNullableInt(row.width);
        const twoWidth = toNullableInt(row.twoWidth ?? row.two_width);
        const length = toNullableInt(row.length);
        const ratio = toNullableInt(row.ratio);

        if (
          !code &&
          !affiliateName &&
          !carCompany &&
          !vehicleCode &&
          !partCode &&
          !colorCode &&
          thickness == null &&
          width == null &&
          twoWidth == null &&
          length == null &&
          ratio == null
        ) {
          errors.push({ index: i + 1, reason: '빈 행입니다.' });
          continue;
        }

        if (code) {
          const [dup] = await pool.query(
            `SELECT id FROM \`${FINISHED_PRODUCTS_TABLE}\` WHERE code = ? AND deleted = 'N' LIMIT 1`,
            [code]
          );
          if ((dup || []).length > 0) {
            errors.push({ index: i + 1, code, reason: '이미 사용 중인 완제품 코드입니다.' });
            continue;
          }
        }

        let affiliateId = null;
        if (affiliateName) {
          const [affRows] = await pool.query(
            `SELECT id FROM \`${AFFILIATES_TABLE}\` WHERE name = ? AND deleted = 'N' ORDER BY id DESC LIMIT 1`,
            [affiliateName]
          );
          affiliateId = affRows[0]?.id ?? null;
          if (affiliateId == null) {
            errors.push({ index: i + 1, affiliateName, reason: '납품사 연계 업체를 찾을 수 없습니다.' });
            continue;
          }
        }

        await pool.query(
          `INSERT INTO \`${FINISHED_PRODUCTS_TABLE}\`
           (name, code, affiliate_id, car_company, vehicle_code, vehicle_name, part_code, part_name, color_code, color_name, thickness, width, two_width, \`length\`, ratio, updated_at, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
          [
            null,
            code,
            affiliateId,
            carCompany,
            vehicleCode,
            vehicleName,
            partCode,
            partName,
            colorCode,
            colorName,
            thickness,
            width,
            twoWidth,
            length,
            ratio,
            by,
          ]
        );
        successCount += 1;
      }

      const msg = `완제품 ${successCount}건을 등록했습니다.${errors.length > 0 ? ` 실패 ${errors.length}건` : ''}.`;
      logger.info('chat execute: batch_create_finished_products', {
        successCount,
        failCount: errors.length,
        updatedBy: by,
      });
      return { ok: true, op, count: successCount, failed: errors.length, errors, message: msg };
    }

    if (op === 'purge_finished_products') {
      const pool = getPool();
      const [rows] = await pool.query(
        `SELECT id, code FROM \`${FINISHED_PRODUCTS_TABLE}\` WHERE deleted = 'N' ORDER BY id DESC`
      );
      const items = rows || [];
      if (items.length === 0) {
        return { ok: true, op, count: 0, skipped: 0, message: '삭제할 완제품이 없습니다. (이미 비어 있음)' };
      }

      let deletedCount = 0;
      const skipped = [];

      for (const r of items) {
        const id = r.id;
        const code = r.code ?? null;
        const requestCnt = await countDeliveryRequestItemRefs(pool, id, 'finished');
        if (requestCnt > 0) {
          skipped.push({ id, code, reason: `납품 요청 품목 참조 ${requestCnt}건` });
          continue;
        }

        await clearFinishedProductJunctions(pool, id);
        await pool.query(
          `UPDATE \`${FINISHED_PRODUCTS_TABLE}\` SET deleted = 'Y', updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ? AND deleted = 'N'`,
          [by, id]
        );
        deletedCount += 1;
      }

      const msg =
        skipped.length === 0
          ? `완제품 ${deletedCount}건을 삭제(비활성) 처리했습니다.`
          : `완제품 ${deletedCount}건을 삭제(비활성) 처리했고, ${skipped.length}건은 납품 요청 이력 때문에 건너뛰었습니다.`;
      logger.info('chat execute: purge_finished_products', { deletedCount, skipped: skipped.length, updatedBy: by });
      return { ok: true, op, count: deletedCount, skipped: skipped.length, skippedItems: skipped, message: msg };
    }
  } catch (err) {
    logger.error('chat execute error', { op, error: err.message });
    return { ok: false, error: `처리 중 오류: ${err.message}` };
  }

  return { ok: false, error: '알 수 없는 작업입니다.' };
}
