/**
 * 반제품 정보 API
 * - 목록(검색: name, code), 단건 조회, 등록, 수정, 삭제(플래그), 엑셀 다운로드
 * - 등록/수정/삭제 시 수정일자, 수정자 갱신
 */
import { Router } from 'express';
import { getPool } from '../lib/db.js';
import logger from '../lib/logger.js';

const router = Router();
const TABLE = 'delivery_semi_products';

const LIST_SELECT = `SELECT id, name, code, color_code, color_name, thickness, width, \`length\`, updated_at, updated_by
  FROM \`${TABLE}\``;

/**
 * 엑셀 다운로드 (CSV)
 * GET /api/delivery-semi-products/export-excel?name=&code=
 */
router.get('/export-excel', async (req, res) => {
  try {
    const { name = '', code = '' } = req.query;

    let where = 'WHERE deleted = ?';
    const params = ['N'];
    if (name && String(name).trim()) {
      where += ' AND name LIKE ?';
      params.push(`%${String(name).trim()}%`);
    }
    if (code && String(code).trim()) {
      where += ' AND code LIKE ?';
      params.push(`%${String(code).trim()}%`);
    }

    const [rows] = await getPool().query(
      `${LIST_SELECT} ${where} ORDER BY id DESC`,
      params
    );

    const BOM = '\uFEFF';
    const header = '반제품 이름,반제품 코드,색상 코드,색상 이름,두께,폭,길이,수정일자,수정자\n';
    const toCsvCell = (v) => {
      if (v == null) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const body = rows
      .map(
        (r) =>
          [
            toCsvCell(r.name),
            toCsvCell(r.code),
            toCsvCell(r.color_code),
            toCsvCell(r.color_name),
            toCsvCell(r.thickness),
            toCsvCell(r.width),
            toCsvCell(r.length),
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
 * 목록 조회 (삭제 플래그 N만, 검색: name, code)
 * GET /api/delivery-semi-products?name=&code=&page=1&limit=20
 */
export async function listHandler(req, res) {
  try {
    const { name = '', code = '', page = 1, limit = 20 } = req.query;
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, Math.max(1, parseInt(limit, 10)));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));

    let where = 'WHERE deleted = ?';
    const params = ['N'];
    if (name && String(name).trim()) {
      where += ' AND name LIKE ?';
      params.push(`%${String(name).trim()}%`);
    }
    if (code && String(code).trim()) {
      where += ' AND code LIKE ?';
      params.push(`%${String(code).trim()}%`);
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
 * 필수: name, code, updatedBy
 * 선택: color_code, color_name, thickness, width, length
 */
router.post('/', async (req, res) => {
  try {
    const {
      name,
      code,
      color_code = null,
      color_name = null,
      thickness = null,
      width = null,
      length = null,
      updatedBy = null,
    } = req.body || {};

    if (!name || String(name).trim() === '') {
      return res.status(400).json({ error: '반제품 이름은 필수입니다.' });
    }
    if (!code || String(code).trim() === '') {
      return res.status(400).json({ error: '반제품 코드는 필수입니다.' });
    }
    if (updatedBy == null || String(updatedBy).trim() === '') {
      return res.status(400).json({ error: '수정자는 필수입니다.' });
    }

    // 코드 중복 검사
    const [dup] = await getPool().query(
      `SELECT id FROM \`${TABLE}\` WHERE code = ? AND deleted = 'N'`,
      [String(code).trim()]
    );
    if (dup.length > 0) {
      return res.status(400).json({ error: '이미 사용 중인 반제품 코드입니다.' });
    }

    const updatedByTrimmed = String(updatedBy).trim();
    const [result] = await getPool().query(
      `INSERT INTO \`${TABLE}\` (name, code, color_code, color_name, thickness, width, \`length\`, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
      [
        String(name).trim(),
        String(code).trim(),
        color_code != null ? String(color_code).trim() : null,
        color_name != null ? String(color_name).trim() : null,
        thickness != null ? thickness : null,
        width != null ? width : null,
        length != null ? length : null,
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
      name,
      code,
      color_code,
      color_name,
      thickness,
      width,
      length,
      updatedBy,
    } = req.body || {};

    const [existing] = await getPool().query(
      `SELECT id FROM \`${TABLE}\` WHERE id = ? AND deleted = ?`,
      [id, 'N']
    );
    if (!existing.length) return res.status(404).json({ error: '반제품을 찾을 수 없습니다.' });

    // 코드 중복 검사 (변경 시)
    if (code !== undefined) {
      if (String(code).trim() === '') return res.status(400).json({ error: '반제품 코드는 필수입니다.' });
      const [dup] = await getPool().query(
        `SELECT id FROM \`${TABLE}\` WHERE code = ? AND deleted = 'N' AND id != ?`,
        [String(code).trim(), id]
      );
      if (dup.length > 0) {
        return res.status(400).json({ error: '이미 사용 중인 반제품 코드입니다.' });
      }
    }

    const updates = [];
    const params = [];
    if (name !== undefined) {
      if (String(name).trim() === '') return res.status(400).json({ error: '반제품 이름은 필수입니다.' });
      updates.push('name = ?');
      params.push(String(name).trim());
    }
    if (code !== undefined) {
      updates.push('code = ?');
      params.push(String(code).trim());
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
      params.push(thickness != null ? thickness : null);
    }
    if (width !== undefined) {
      updates.push('width = ?');
      params.push(width != null ? width : null);
    }
    if (length !== undefined) {
      updates.push('`length` = ?');
      params.push(length != null ? length : null);
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

    // 참조 검사
    const [refSupplier] = await getPool().query(
      `SELECT COUNT(*) AS cnt FROM delivery_supplier_semi_products WHERE semi_product_id = ?`,
      [id]
    );
    const [refRequest] = await getPool().query(
      `SELECT COUNT(*) AS cnt FROM delivery_request_items WHERE item_id = ? AND item_type = 'semi'`,
      [id]
    );
    if ((refSupplier[0]?.cnt || 0) > 0 || (refRequest[0]?.cnt || 0) > 0) {
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
