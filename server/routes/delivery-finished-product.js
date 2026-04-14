/**
 * 완제품 정보 API
 * - 목록(검색: name, code), 단건 조회, 등록, 수정, 삭제(플래그), 엑셀 다운로드
 * - 등록/수정/삭제 시 수정일자, 수정자 갱신
 */
import { Router } from 'express';
import { sendXlsx } from '../lib/excel-export.js';
import { getPool } from '../lib/db.js';
import {
  countDeliveryRequestItemRefs,
  listFinishedProductDeliveryRequestBlockers,
} from '../lib/delivery-request-items.js';
import logger from '../lib/logger.js';

const router = Router();
const TABLE = 'delivery_finished_products';

const LIST_SELECT = `SELECT fp.id, fp.name, fp.code, fp.affiliate_id, a.name AS affiliate_name,
  fp.car_company, fp.vehicle_code, fp.vehicle_name, fp.part_code, fp.part_name, fp.color_code, fp.color_name,
  fp.thickness, fp.width, fp.two_width, fp.\`length\`, fp.ratio, fp.updated_at, fp.updated_by
  FROM \`${TABLE}\` fp
  LEFT JOIN delivery_affiliates a ON a.id = fp.affiliate_id`;

const SUPPLIER_FP_JUNCTION = 'delivery_supplier_finished_products';
const WAREHOUSE_FP_JUNCTION = 'delivery_warehouse_products';

function toNullableOneDecimal(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Number(n.toFixed(1));
}

function toNullableInt(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

/** 납품사·창고 M:N 행 제거 (테이블 없으면 무시) */
async function clearFinishedProductJunctions(pool, productId) {
  try {
    await pool.query(
      `DELETE FROM \`${SUPPLIER_FP_JUNCTION}\` WHERE finished_product_id = ?`,
      [productId]
    );
  } catch (err) {
    if (err.code !== 'ER_NO_SUCH_TABLE') throw err;
  }
  try {
    await pool.query(
      `DELETE FROM \`${WAREHOUSE_FP_JUNCTION}\` WHERE finished_product_id = ?`,
      [productId]
    );
  } catch (err) {
    if (err.code !== 'ER_NO_SUCH_TABLE') throw err;
  }
}

function toDateOnly(v) {
  if (v == null) return '';
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function mapDeliveryRequestBlockers(rows) {
  return (rows || []).map((r) => ({
    request_id: r.request_id,
    supplier_name: r.supplier_name != null ? String(r.supplier_name) : '',
    request_date: toDateOnly(r.request_date),
    desired_date: toDateOnly(r.desired_date),
    request_status: r.request_status,
    quantity: r.quantity,
    item_status: r.item_status,
    request_item_id: r.request_item_id,
  }));
}

/**
 * 엑셀 다운로드 (CSV)
 * GET /api/delivery-finished-products/export-excel?vehicleCode=&partCode=&colorCode=
 */
router.get('/export-excel', async (req, res) => {
  try {
    const { vehicleCode = '', partCode = '', colorCode = '' } = req.query;

    let where = 'WHERE fp.deleted = ?';
    const params = ['N'];
    if (vehicleCode && String(vehicleCode).trim()) {
      where += ' AND fp.vehicle_code = ?';
      params.push(String(vehicleCode).trim());
    }
    if (partCode && String(partCode).trim()) {
      where += ' AND fp.part_code = ?';
      params.push(String(partCode).trim());
    }
    if (colorCode && String(colorCode).trim()) {
      where += ' AND fp.color_code = ?';
      params.push(String(colorCode).trim());
    }

    const [rows] = await getPool().query(
      `${LIST_SELECT} ${where} ORDER BY fp.id DESC`,
      params
    );

    const headers = [['완제품 코드', '납품사 연계 업체', '완성차 회사', '차량 코드', '차량 이름', '부위 코드', '부위 이름', '색상 코드', '색상 이름', '두께', '폭', '두폭', '길이', '배율', '수정일자', '수정자']];
    const data = rows.map((r) => [
      r.code ?? '',
      r.affiliate_name ?? '',
      r.car_company ?? '',
      r.vehicle_code ?? '',
      r.vehicle_name ?? '',
      r.part_code ?? '',
      r.part_name ?? '',
      r.color_code ?? '',
      r.color_name ?? '',
      r.thickness ?? '',
      r.width ?? '',
      r.two_width ?? '',
      r.length ?? '',
      r.ratio ?? '',
      r.updated_at ? new Date(r.updated_at).toISOString().slice(0, 19).replace('T', ' ') : '',
      r.updated_by ?? '',
    ]);
    sendXlsx(res, headers, data, '납품사완제품정보');
  } catch (err) {
    logger.error('delivery-finished-product export error', { error: err.message });
    res.status(500).json({ error: '엑셀 다운로드에 실패했습니다.' });
  }
});

/**
 * 목록 조회 (삭제 플래그 N만, 검색: vehicleCode, partCode, colorCode)
 * GET /api/delivery-finished-products?vehicleCode=&partCode=&colorCode=&page=1&limit=20
 */
export async function listHandler(req, res) {
  try {
    const { vehicleCode = '', partCode = '', colorCode = '', page = 1, limit = 20 } = req.query;
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, Math.max(1, parseInt(limit, 10)));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));

    let where = 'WHERE fp.deleted = ?';
    const params = ['N'];
    if (vehicleCode && String(vehicleCode).trim()) {
      where += ' AND fp.vehicle_code = ?';
      params.push(String(vehicleCode).trim());
    }
    if (partCode && String(partCode).trim()) {
      where += ' AND fp.part_code = ?';
      params.push(String(partCode).trim());
    }
    if (colorCode && String(colorCode).trim()) {
      where += ' AND fp.color_code = ?';
      params.push(String(colorCode).trim());
    }

    const [rows] = await getPool().query(
      `${LIST_SELECT} ${where} ORDER BY fp.id DESC LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );
    const [countRows] = await getPool().query(
      `SELECT COUNT(*) AS total FROM \`${TABLE}\` fp ${where}`,
      params
    );
    const total = countRows?.[0]?.total != null ? Number(countRows[0].total) : 0;
    res.json({ list: rows || [], total, page: Number(page), limit: limitNum });
  } catch (err) {
    logger.error('delivery-finished-product list error', { error: err.message, stack: err.stack });
    const message = process.env.NODE_ENV === 'production'
      ? '목록 조회에 실패했습니다.'
      : `목록 조회 실패: ${err.message}`;
    res.status(500).json({ error: message });
  }
}

router.get('/', listHandler);

/**
 * 단건 조회
 * GET /api/delivery-finished-products/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });
    const [rows] = await getPool().query(
      `${LIST_SELECT} WHERE fp.id = ? AND fp.deleted = ?`,
      [id, 'N']
    );
    if (!rows.length) return res.status(404).json({ error: '완제품을 찾을 수 없습니다.' });
    res.json(rows[0]);
  } catch (err) {
    logger.error('delivery-finished-product get error', { error: err.message });
    res.status(500).json({ error: '조회에 실패했습니다.' });
  }
});

/**
 * 등록
 * POST /api/delivery-finished-products
 * 필수: updatedBy
 * 선택: code, affiliate_id, car_company, vehicle_code, vehicle_name, part_code, part_name, color_code, color_name, thickness, width, two_width, length, ratio
 */
router.post('/', async (req, res) => {
  try {
    const {
      code,
      affiliate_id = null,
      car_company = null,
      vehicle_code = null,
      vehicle_name = null,
      part_code = null,
      part_name = null,
      color_code = null,
      color_name = null,
      thickness = null,
      width = null,
      two_width = null,
      length = null,
      ratio = null,
      updatedBy = null,
    } = req.body || {};

    if (updatedBy == null || String(updatedBy).trim() === '') {
      return res.status(400).json({ error: '수정자는 필수입니다.' });
    }

    const codeTrimmed = code != null && String(code).trim() !== '' ? String(code).trim() : null;
    if (codeTrimmed != null) {
      const [dup] = await getPool().query(
        `SELECT id FROM \`${TABLE}\` WHERE code = ? AND deleted = 'N'`,
        [codeTrimmed]
      );
      if (dup.length > 0) {
        return res.status(400).json({ error: '이미 사용 중인 완제품 코드입니다.' });
      }
    }

    const updatedByTrimmed = String(updatedBy).trim();
    const [result] = await getPool().query(
      `INSERT INTO \`${TABLE}\` (name, code, affiliate_id, car_company, vehicle_code, vehicle_name, part_code, part_name, color_code, color_name, thickness, width, two_width, \`length\`, ratio, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
      [
        null,
        codeTrimmed,
        affiliate_id != null && String(affiliate_id).trim() !== '' ? Number(affiliate_id) : null,
        car_company != null ? String(car_company).trim() : null,
        vehicle_code != null ? String(vehicle_code).trim() : null,
        vehicle_name != null ? String(vehicle_name).trim() : null,
        part_code != null ? String(part_code).trim() : null,
        part_name != null ? String(part_name).trim() : null,
        color_code != null ? String(color_code).trim() : null,
        color_name != null ? String(color_name).trim() : null,
        toNullableOneDecimal(thickness),
        toNullableInt(width),
        toNullableInt(two_width),
        toNullableInt(length),
        toNullableInt(ratio),
        updatedByTrimmed,
      ]
    );

    const [rows] = await getPool().query(
      `${LIST_SELECT} WHERE fp.id = ?`,
      [result.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    logger.error('delivery-finished-product create error', { error: err.message });
    const message = process.env.NODE_ENV === 'production'
      ? '등록에 실패했습니다.'
      : `등록 실패: ${err.message}`;
    res.status(500).json({ error: message });
  }
});

/**
 * 수정
 * PATCH /api/delivery-finished-products/:id
 */
router.patch('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });
    const {
      name,
      code,
      affiliate_id,
      car_company,
      vehicle_code,
      vehicle_name,
      part_code,
      part_name,
      color_code,
      color_name,
      thickness,
      width,
      two_width,
      length,
      ratio,
      updatedBy,
    } = req.body || {};

    const [existing] = await getPool().query(
      `SELECT id FROM \`${TABLE}\` WHERE id = ? AND deleted = ?`,
      [id, 'N']
    );
    if (!existing.length) return res.status(404).json({ error: '완제품을 찾을 수 없습니다.' });

    // 코드 중복 검사 (변경 시)
    if (code !== undefined) {
      const codeTrimmed = String(code).trim();
      if (codeTrimmed !== '') {
        const [dup] = await getPool().query(
          `SELECT id FROM \`${TABLE}\` WHERE code = ? AND deleted = 'N' AND id != ?`,
          [codeTrimmed, id]
        );
        if (dup.length > 0) {
          return res.status(400).json({ error: '이미 사용 중인 완제품 코드입니다.' });
        }
      }
    }

    const updates = [];
    const params = [];
    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name != null && String(name).trim() !== '' ? String(name).trim() : null);
    }
    if (code !== undefined) {
      updates.push('code = ?');
      params.push(String(code).trim() !== '' ? String(code).trim() : null);
    }
    if (affiliate_id !== undefined) {
      updates.push('affiliate_id = ?');
      params.push(affiliate_id != null && String(affiliate_id).trim() !== '' ? Number(affiliate_id) : null);
    }
    if (car_company !== undefined) {
      updates.push('car_company = ?');
      params.push(car_company != null ? String(car_company).trim() : null);
    }
    if (vehicle_code !== undefined) {
      updates.push('vehicle_code = ?');
      params.push(vehicle_code != null ? String(vehicle_code).trim() : null);
    }
    if (vehicle_name !== undefined) {
      updates.push('vehicle_name = ?');
      params.push(vehicle_name != null ? String(vehicle_name).trim() : null);
    }
    if (part_code !== undefined) {
      updates.push('part_code = ?');
      params.push(part_code != null ? String(part_code).trim() : null);
    }
    if (part_name !== undefined) {
      updates.push('part_name = ?');
      params.push(part_name != null ? String(part_name).trim() : null);
    }
    if (color_code !== undefined) {
      updates.push('color_code = ?');
      params.push(color_code != null ? String(color_code).trim() : null);
    }
    if (color_name !== undefined) {
      updates.push('color_name = ?');
      params.push(color_name != null ? String(color_name).trim() : null);
    }
    if (thickness !== undefined) {
      updates.push('thickness = ?');
      params.push(toNullableOneDecimal(thickness));
    }
    if (width !== undefined) {
      updates.push('width = ?');
      params.push(toNullableInt(width));
    }
    if (length !== undefined) {
      updates.push('`length` = ?');
      params.push(toNullableInt(length));
    }
    if (two_width !== undefined) {
      updates.push('two_width = ?');
      params.push(toNullableInt(two_width));
    }
    if (ratio !== undefined) {
      updates.push('ratio = ?');
      params.push(toNullableInt(ratio));
    }
    if (updatedBy !== undefined) {
      updates.push('updated_by = ?');
      params.push(String(updatedBy));
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: '수정할 항목이 없습니다.' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    await getPool().query(
      `UPDATE \`${TABLE}\` SET ${updates.join(', ')} WHERE id = ? AND deleted = ?`,
      [...params, 'N']
    );

    const [rows] = await getPool().query(`${LIST_SELECT} WHERE fp.id = ?`, [id]);
    res.json(rows[0]);
  } catch (err) {
    logger.error('delivery-finished-product update error', { error: err.message });
    res.status(500).json({ error: '수정에 실패했습니다.' });
  }
});

/**
 * 삭제 (플래그만 변경, 수정일자 수정자 갱신)
 * DELETE /api/delivery-finished-products/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });

    // 납품 요청 상세에 남아 있으면 삭제 불가 (이력). 납품사/창고 M:N 은 끊고 soft delete 진행.
    const requestCnt = await countDeliveryRequestItemRefs(getPool(), id, 'finished');
    if (requestCnt > 0) {
      const rawBlockers = await listFinishedProductDeliveryRequestBlockers(getPool(), id);
      const blockers = mapDeliveryRequestBlockers(rawBlockers);
      logger.warn('delivery-finished-product delete blocked by delivery_request_items', {
        id,
        requestItemRefCount: requestCnt,
        blockerCount: blockers.length,
      });
      return res.status(400).json({
        error:
          '납품 요청에 등록된 완제품은 삭제할 수 없습니다. 아래 요청·품목에서 제거한 뒤 다시 시도하세요.',
        blockers,
      });
    }

    await clearFinishedProductJunctions(getPool(), id);

    const updatedBy = req.body?.updatedBy != null ? String(req.body.updatedBy).trim() : null;
    const [result] = await getPool().query(
      `UPDATE \`${TABLE}\` SET deleted = 'Y', updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ? AND deleted = 'N'`,
      [updatedBy, id]
    );
    if (result.affectedRows === 0) {
      logger.warn('delivery-finished-product delete: no row updated (missing or already deleted)', {
        id,
        updatedBy,
      });
      return res.status(404).json({ error: '완제품을 찾을 수 없습니다.' });
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error('delivery-finished-product delete error', {
      id: parseInt(req.params.id, 10),
      message: err.message,
      code: err.code,
      errno: err.errno,
      sqlState: err.sqlState,
      sqlMessage: err.sqlMessage,
      sql: err.sql,
      stack: err.stack,
    });
    res.status(500).json({ error: '삭제에 실패했습니다.' });
  }
});

export default router;
