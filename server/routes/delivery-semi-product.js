/**
 * 반제품 정보 API
 * - 목록(검색: name, code), 단건 조회, 등록, 수정, 삭제(플래그), 엑셀 다운로드
 * - 등록/수정/삭제 시 수정일자, 수정자 갱신
 */
import { Router } from 'express';
import { getPool } from '../lib/db.js';
import { countDeliveryRequestItemRefs } from '../lib/delivery-request-items.js';
import logger from '../lib/logger.js';

const router = Router();
const TABLE = 'delivery_semi_products';

const LIST_SELECT = `SELECT id, name, code, semi_product_type, vehicle_code, part_code, supplier_name, ratio, color_code, color_name, thickness, width, updated_at, updated_by
  FROM \`${TABLE}\``;

function toNullableTwoDecimal(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Number(n.toFixed(2));
}

function toNullableInt(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

/**
 * 엑셀 다운로드 (CSV)
 * GET /api/delivery-semi-products/export-excel?vehicleCode=&partCode=&colorCode=&supplierName=
 */
router.get('/export-excel', async (req, res) => {
  try {
    const {
      vehicleCode = '',
      partCode = '',
      colorCode = '',
      supplierName = '',
      semiProductType = '',
      semiProductTypeName = '',
    } = req.query;

    let where = 'WHERE deleted = ?';
    const params = ['N'];
    if (vehicleCode && String(vehicleCode).trim()) {
      where += ' AND vehicle_code = ?';
      params.push(String(vehicleCode).trim());
    }
    if (partCode && String(partCode).trim()) {
      where += ' AND part_code = ?';
      params.push(String(partCode).trim());
    }
    if (colorCode && String(colorCode).trim()) {
      where += ' AND color_code = ?';
      params.push(String(colorCode).trim());
    }
    if (supplierName && String(supplierName).trim()) {
      where += ' AND supplier_name LIKE ?';
      params.push(`%${String(supplierName).trim()}%`);
    }
    if (semiProductType && String(semiProductType).trim()) {
      const typeCode = String(semiProductType).trim();
      const typeName = String(semiProductTypeName || '').trim();
      if (typeName) {
        where += ' AND (semi_product_type = ? OR semi_product_type = ?)';
        params.push(typeCode, typeName);
      } else {
        where += ' AND semi_product_type = ?';
        params.push(typeCode);
      }
    }

    const [rows] = await getPool().query(
      `${LIST_SELECT} ${where} ORDER BY id DESC`,
      params
    );

    const BOM = '\uFEFF';
    const header = '반제품 종류,차량 코드,부위 코드,색상 코드,납품 업체,배율,두께,폭,수정일자,수정자\n';
    const toCsvCell = (v) => {
      if (v == null) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const body = rows
      .map(
        (r) =>
          [
            toCsvCell(r.semi_product_type),
            toCsvCell(r.vehicle_code),
            toCsvCell(r.part_code),
            toCsvCell(r.color_code),
            toCsvCell(r.supplier_name),
            toCsvCell(r.ratio),
            toCsvCell(r.thickness),
            toCsvCell(r.width),
            toCsvCell(r.updated_at ? new Date(r.updated_at).toISOString().slice(0, 19).replace('T', ' ') : ''),
            toCsvCell(r.updated_by),
          ].join(',')
      )
      .join('\n');
    const csv = BOM + header + body;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="delivery_semi_products.csv"');
    res.send(csv);
  } catch (err) {
    logger.error('delivery-semi-product export error', { error: err.message });
    res.status(500).json({ error: '엑셀 다운로드에 실패했습니다.' });
  }
});

/**
 * 목록 조회 (삭제 플래그 N만)
 * GET /api/delivery-semi-products?vehicleCode=&partCode=&colorCode=&supplierName=&page=1&limit=20
 */
export async function listHandler(req, res) {
  try {
    const {
      vehicleCode = '',
      partCode = '',
      colorCode = '',
      supplierName = '',
      semiProductType = '',
      semiProductTypeName = '',
      page = 1,
      limit = 20,
    } = req.query;
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, Math.max(1, parseInt(limit, 10)));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));

    let where = 'WHERE deleted = ?';
    const params = ['N'];
    if (vehicleCode && String(vehicleCode).trim()) {
      where += ' AND vehicle_code = ?';
      params.push(String(vehicleCode).trim());
    }
    if (partCode && String(partCode).trim()) {
      where += ' AND part_code = ?';
      params.push(String(partCode).trim());
    }
    if (colorCode && String(colorCode).trim()) {
      where += ' AND color_code = ?';
      params.push(String(colorCode).trim());
    }
    if (supplierName && String(supplierName).trim()) {
      where += ' AND supplier_name LIKE ?';
      params.push(`%${String(supplierName).trim()}%`);
    }
    if (semiProductType && String(semiProductType).trim()) {
      const typeCode = String(semiProductType).trim();
      const typeName = String(semiProductTypeName || '').trim();
      if (typeName) {
        where += ' AND (semi_product_type = ? OR semi_product_type = ?)';
        params.push(typeCode, typeName);
      } else {
        where += ' AND semi_product_type = ?';
        params.push(typeCode);
      }
    }

    const [rows] = await getPool().query(
      `${LIST_SELECT} ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );
    const [countRows] = await getPool().query(
      `SELECT COUNT(*) AS total FROM \`${TABLE}\` ${where}`,
      params
    );
    const total = countRows?.[0]?.total != null ? Number(countRows[0].total) : 0;
    res.json({ list: rows || [], total, page: Number(page), limit: limitNum });
  } catch (err) {
    logger.error('delivery-semi-product list error', { error: err.message, stack: err.stack });
    const message = process.env.NODE_ENV === 'production'
      ? '목록 조회에 실패했습니다.'
      : `목록 조회 실패: ${err.message}`;
    res.status(500).json({ error: message });
  }
}

router.get('/', listHandler);

/**
 * 단건 조회
 * GET /api/delivery-semi-products/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });
    const [rows] = await getPool().query(
      `${LIST_SELECT} WHERE id = ? AND deleted = ?`,
      [id, 'N']
    );
    if (!rows.length) return res.status(404).json({ error: '반제품을 찾을 수 없습니다.' });
    res.json(rows[0]);
  } catch (err) {
    logger.error('delivery-semi-product get error', { error: err.message });
    res.status(500).json({ error: '조회에 실패했습니다.' });
  }
});

/**
 * 등록
 * POST /api/delivery-semi-products
 * 필수: updatedBy
 * 선택: code, semi_product_type, vehicle_code, part_code, supplier_name, ratio, color_code, color_name, thickness, width
 */
router.post('/', async (req, res) => {
  try {
    const {
      code,
      semi_product_type = null,
      vehicle_code = null,
      part_code = null,
      supplier_name = null,
      ratio = null,
      color_code = null,
      color_name = null,
      thickness = null,
      width = null,
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
        return res.status(400).json({ error: '이미 사용 중인 반제품 코드입니다.' });
      }
    }

    const updatedByTrimmed = String(updatedBy).trim();
    const [result] = await getPool().query(
      `INSERT INTO \`${TABLE}\` (name, code, semi_product_type, vehicle_code, part_code, supplier_name, ratio, color_code, color_name, thickness, width, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
      [
        null,
        codeTrimmed,
        semi_product_type != null && String(semi_product_type).trim() !== '' ? String(semi_product_type).trim() : null,
        vehicle_code != null && String(vehicle_code).trim() !== '' ? String(vehicle_code).trim() : null,
        part_code != null && String(part_code).trim() !== '' ? String(part_code).trim() : null,
        supplier_name != null && String(supplier_name).trim() !== '' ? String(supplier_name).trim() : null,
        toNullableInt(ratio),
        color_code != null ? String(color_code).trim() : null,
        color_name != null ? String(color_name).trim() : null,
        toNullableTwoDecimal(thickness),
        toNullableInt(width),
        updatedByTrimmed,
      ]
    );

    const [rows] = await getPool().query(
      `${LIST_SELECT} WHERE id = ?`,
      [result.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    logger.error('delivery-semi-product create error', { error: err.message });
    const message = process.env.NODE_ENV === 'production'
      ? '등록에 실패했습니다.'
      : `등록 실패: ${err.message}`;
    res.status(500).json({ error: message });
  }
});

/**
 * 수정
 * PATCH /api/delivery-semi-products/:id
 */
router.patch('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });
    const {
      code,
      semi_product_type,
      vehicle_code,
      part_code,
      supplier_name,
      ratio,
      color_code,
      color_name,
      thickness,
      width,
      updatedBy,
    } = req.body || {};

    const [existing] = await getPool().query(
      `SELECT id FROM \`${TABLE}\` WHERE id = ? AND deleted = ?`,
      [id, 'N']
    );
    if (!existing.length) return res.status(404).json({ error: '반제품을 찾을 수 없습니다.' });

    if (code !== undefined) {
      const codeTrimmed = String(code).trim();
      if (codeTrimmed !== '') {
        const [dup] = await getPool().query(
          `SELECT id FROM \`${TABLE}\` WHERE code = ? AND deleted = 'N' AND id != ?`,
          [codeTrimmed, id]
        );
        if (dup.length > 0) {
          return res.status(400).json({ error: '이미 사용 중인 반제품 코드입니다.' });
        }
      }
    }

    const updates = [];
    const params = [];
    if (code !== undefined) {
      updates.push('code = ?');
      params.push(String(code).trim() !== '' ? String(code).trim() : null);
    }
    if (semi_product_type !== undefined) {
      updates.push('semi_product_type = ?');
      params.push(semi_product_type != null && String(semi_product_type).trim() !== '' ? String(semi_product_type).trim() : null);
    }
    if (vehicle_code !== undefined) {
      updates.push('vehicle_code = ?');
      params.push(vehicle_code != null && String(vehicle_code).trim() !== '' ? String(vehicle_code).trim() : null);
    }
    if (part_code !== undefined) {
      updates.push('part_code = ?');
      params.push(part_code != null && String(part_code).trim() !== '' ? String(part_code).trim() : null);
    }
    if (supplier_name !== undefined) {
      updates.push('supplier_name = ?');
      params.push(supplier_name != null && String(supplier_name).trim() !== '' ? String(supplier_name).trim() : null);
    }
    if (ratio !== undefined) {
      updates.push('ratio = ?');
      params.push(toNullableInt(ratio));
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
      params.push(toNullableTwoDecimal(thickness));
    }
    if (width !== undefined) {
      updates.push('width = ?');
      params.push(toNullableInt(width));
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

    const [rows] = await getPool().query(`${LIST_SELECT} WHERE id = ?`, [id]);
    res.json(rows[0]);
  } catch (err) {
    logger.error('delivery-semi-product update error', { error: err.message });
    res.status(500).json({ error: '수정에 실패했습니다.' });
  }
});

/**
 * 삭제 (플래그만 변경, 수정일자 수정자 갱신)
 * DELETE /api/delivery-semi-products/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });

    let supplierCnt = 0;
    try {
      const [refSupplier] = await getPool().query(
        `SELECT COUNT(*) AS cnt FROM delivery_supplier_semi_products WHERE semi_product_id = ?`,
        [id]
      );
      supplierCnt = Number(refSupplier[0]?.cnt ?? 0);
    } catch (err) {
      if (err.code === 'ER_NO_SUCH_TABLE') {
        logger.warn('delivery-semi-product delete: delivery_supplier_semi_products missing, ref count 0', {
          id,
          message: err.message,
        });
      } else {
        throw err;
      }
    }
    const requestCnt = await countDeliveryRequestItemRefs(getPool(), id, 'semi');
    if (supplierCnt > 0 || requestCnt > 0) {
      return res.status(400).json({ error: '해당 반제품을 사용하는 곳이 있어 삭제할 수 없습니다.' });
    }

    const updatedBy = req.body?.updatedBy != null ? String(req.body.updatedBy).trim() : null;
    const [result] = await getPool().query(
      `UPDATE \`${TABLE}\` SET deleted = 'Y', updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ? AND deleted = 'N'`,
      [updatedBy, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: '반제품을 찾을 수 없습니다.' });
    res.json({ ok: true });
  } catch (err) {
    logger.error('delivery-semi-product delete error', { error: err.message });
    res.status(500).json({ error: '삭제에 실패했습니다.' });
  }
});

export default router;
