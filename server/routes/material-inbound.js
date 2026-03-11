/**
 * 원자재 입고 요청/입고 관리 API (원자재.md, 기본규칙.md)
 * - 목록(입고 요청 탭 / 입고 상세 현황 탭), 단건 조회, 등록, 취소/전체입고/전체반품/라인 입고·반품
 * - 삭제 플래그, 수정일자·수정자, 페이지네이션, 이메일 발송(ig-notification)
 */
import { Router } from 'express';
import pool from '../lib/db.js';
import logger from '../lib/logger.js';
import { toStartOfDayString, toEndOfDayString } from '../lib/dateUtils.js';
import { sendInboundEmail } from '../lib/notification.js';

const router = Router();
const REQUESTS_TABLE = 'material_inbound_requests';
const LINES_TABLE = 'material_inbound_request_lines';
const SUPPLIERS_TABLE = 'raw_material_suppliers';
const RAW_MATERIALS_TABLE = 'raw_materials';
const TYPES_TABLE = 'material_types';

function defaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);
  return { start, end };
}

function toDateString(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
}
/** 목록/엑셀 기간: 시작 00:00:00, 종료 23:59:59 */
function dateRangeStrings(startDate, endDate, defaultStart, defaultEnd) {
  const from = startDate ? new Date(startDate) : defaultStart;
  const to = endDate ? new Date(endDate) : defaultEnd;
  return { fromStr: toStartOfDayString(from), toStr: toEndOfDayString(to) };
}

const STATUS_LABEL = { request: '요청', received: '입고완료', returned: '반품', active: '활성', cancelled: '취소' };

/** 라인 수 카운트 값 정수 파싱 (MySQL 문자열/BigInt 대응) */
function parseLineCount(val) {
  if (val == null) return 0;
  const n = typeof val === 'number' ? val : parseInt(val, 10);
  return Number.isNaN(n) ? 0 : n;
}

/** 목록/상세 공통: 요청 status + 라인별 status 로 표시용 상태 라벨 (입고 요청 상태값) */
function toRequestStatusLabel(requestStatus, lines) {
  if (requestStatus === 'cancelled') return '입고 취소';
  if (requestStatus === 'received') return '전체 입고';
  if (requestStatus === 'returned') return '전체 반품';
  const lineList = Array.isArray(lines) ? lines : [];
  const req = lineList.filter((l) => l.status === 'request').length;
  const rec = lineList.filter((l) => l.status === 'received').length;
  const ret = lineList.filter((l) => l.status === 'returned').length;
  const totalLines = req + rec + ret;
  if (totalLines === 0) return '입고 요청';
  if (ret === totalLines) return '전체 반품';
  if (rec === totalLines) return '전체 입고';
  if (req === 0 && rec > 0 && ret > 0) return '전체 입고'; // 모두 입고 or 반품
  if (rec >= 1 || ret >= 1) return '부분 입고/반품';
  return '입고 요청';
}

function toCsvCell(v) {
  if (v == null) return '';
  const s = String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * 엑셀 다운로드 (CSV)
 * GET /api/material-inbound/export-excel?view=requests|lines&rawMaterialIds=&inboundStatus=&startDate=&endDate=
 */
export async function exportExcel(req, res) {
  try {
    const { view = 'requests', rawMaterialIds = '', inboundStatus = '', startDate, endDate } = req.query;
    const requestIdRaw = req.query.requestId ?? req.query.requestid ?? '';
    const { start, end } = defaultDateRange();
    const { fromStr, toStr } = dateRangeStrings(startDate, endDate, start, end);
    const materialIds = rawMaterialIds
      ? rawMaterialIds.split(',').map((x) => parseInt(x.trim(), 10)).filter((x) => !Number.isNaN(x) && x > 0)
      : [];
    const requestIdNum = typeof requestIdRaw === 'string' && requestIdRaw.trim() !== ''
      ? parseInt(requestIdRaw.trim(), 10)
      : (typeof requestIdRaw === 'number' && !Number.isNaN(requestIdRaw) ? requestIdRaw : null);
    const hasRequestId = requestIdNum != null && !Number.isNaN(requestIdNum) && requestIdNum > 0;
    const exportLimit = 10000;

    if (view === 'lines') {
      const whereParts = ["r.deleted = 'N'", "r.status IN ('active','received','returned')"];
      const params = [];
      if (hasRequestId) {
        whereParts.push('r.id = ?');
        params.push(requestIdNum);
      } else {
        whereParts.push('r.request_date >= ?', 'r.request_date <= ?');
        params.push(fromStr, toStr);
      }
      if (inboundStatus && ['request', 'received', 'returned'].includes(inboundStatus)) {
        whereParts.push('l.status = ?');
        params.push(inboundStatus);
      }
      if (materialIds.length) {
        whereParts.push(`l.raw_material_id IN (${materialIds.map(() => '?').join(',')})`);
        params.push(...materialIds);
      }
      const where = `WHERE ${whereParts.join(' AND ')}`;
      const sql = `
        SELECT r.request_date, r.desired_date, s.name AS supplier_name,
          COALESCE(mt.name, '') AS raw_material_kind, rm.name AS raw_material_name, l.quantity, l.status AS line_status
        FROM \`${REQUESTS_TABLE}\` r
        INNER JOIN \`${LINES_TABLE}\` l ON l.request_id = r.id
        INNER JOIN \`${SUPPLIERS_TABLE}\` s ON s.id = r.supplier_id AND s.deleted = 'N'
        INNER JOIN \`${RAW_MATERIALS_TABLE}\` rm ON rm.id = l.raw_material_id
        LEFT JOIN \`${TYPES_TABLE}\` mt ON mt.id = rm.kind_id
        ${where}
        ORDER BY r.request_date DESC, r.id DESC, l.id
        LIMIT ?
      `;
      const [rows] = await pool.query(sql, [...params, exportLimit]);
      const header = '입고 요청일,입고 희망일,원자재 업체,원자재 종류,원자재 명,수량,입고 상태\n';
      const body = (rows || [])
        .map(
          (r) =>
            [
              toCsvCell(toDateString(r.request_date)),
              toCsvCell(toDateString(r.desired_date)),
              toCsvCell(r.supplier_name),
              toCsvCell(r.raw_material_kind),
              toCsvCell(r.raw_material_name),
              toCsvCell(r.quantity),
              toCsvCell(STATUS_LABEL[r.line_status] || r.line_status),
            ].join(',')
        )
        .join('\n');
      const BOM = '\uFEFF';
      const csv = BOM + header + body;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="material_inbound_lines.csv"');
      return res.send(csv);
    }

    const wherePartsReq = ["r.deleted = 'N'"];
    const paramsReq = [];
    if (hasRequestId) {
      wherePartsReq.push('r.id = ?');
      paramsReq.push(requestIdNum);
    } else {
      wherePartsReq.push('r.request_date >= ?', 'r.request_date <= ?');
      paramsReq.push(fromStr, toStr);
    }
    if (inboundStatus === 'cancelled') wherePartsReq.push("r.status = 'cancelled'");
    else if (inboundStatus === 'active') wherePartsReq.push("r.status = 'active'");
    if (materialIds.length) {
      wherePartsReq.push(`EXISTS (SELECT 1 FROM \`${LINES_TABLE}\` l2 WHERE l2.request_id = r.id AND l2.raw_material_id IN (${materialIds.map(() => '?').join(',')}))`);
      paramsReq.push(...materialIds);
    }
    const whereReq = `WHERE ${wherePartsReq.join(' AND ')}`;
    const sql = `
      SELECT r.request_date, r.desired_date, s.name AS supplier_name,
        (SELECT COUNT(DISTINCT l.raw_material_id) FROM \`${LINES_TABLE}\` l WHERE l.request_id = r.id) AS material_kind_count,
        r.status,
        (SELECT COUNT(*) FROM \`${LINES_TABLE}\` l WHERE l.request_id = r.id AND l.status = 'request') AS line_request_count,
        (SELECT COUNT(*) FROM \`${LINES_TABLE}\` l WHERE l.request_id = r.id AND l.status = 'received') AS line_received_count,
        (SELECT COUNT(*) FROM \`${LINES_TABLE}\` l WHERE l.request_id = r.id AND l.status = 'returned') AS line_returned_count
      FROM \`${REQUESTS_TABLE}\` r
      INNER JOIN \`${SUPPLIERS_TABLE}\` s ON s.id = r.supplier_id AND s.deleted = 'N'
      ${whereReq}
      ORDER BY r.request_date DESC, r.id DESC
      LIMIT ?
    `;
    const [rows] = await pool.query(sql, [...paramsReq, exportLimit]);
    const toStatusLabel = (r) => {
      if (r.status === 'cancelled') return '입고 취소';
      if (r.status === 'received') return '전체 입고';
      if (r.status === 'returned') return '전체 반품';
      const req = parseLineCount(r.line_request_count);
      const rec = parseLineCount(r.line_received_count);
      const ret = parseLineCount(r.line_returned_count);
      const totalLines = req + rec + ret;
      if (totalLines === 0) return '입고 요청';
      if (ret === totalLines) return '전체 반품';
      if (rec === totalLines) return '전체 입고';
      if (req === 0 && rec > 0 && ret > 0) return '전체 입고';
      if (rec >= 1 || ret >= 1) return '부분 입고/반품';
      return '입고 요청';
    };
    const header = '입고 요청일,입고 희망일,원자재 업체,원자재 종류 개수,상태\n';
    const body = (rows || [])
      .map(
        (r) =>
          [
            toCsvCell(toDateString(r.request_date)),
            toCsvCell(toDateString(r.desired_date)),
            toCsvCell(r.supplier_name),
            toCsvCell(r.material_kind_count),
            toCsvCell(toStatusLabel(r)),
          ].join(',')
      )
      .join('\n');
    const BOM = '\uFEFF';
    const csv = BOM + header + body;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="material_inbound_requests.csv"');
    res.send(csv);
  } catch (err) {
    logger.error('material-inbound export-excel error', { error: err.message });
    res.status(500).json({ error: '엑셀 다운로드에 실패했습니다.', detail: err.message });
  }
}

router.get('/export-excel', exportExcel);

/** 입고 요청 목록 (Tab1: 요청 단위) - 앱에서 GET /api/material-inbound 로도 등록하여 404 방지 */
export async function listHandler(req, res) {
  try {
    const { view = 'requests', rawMaterialIds = '', inboundStatus = '', startDate, endDate, page = 1, limit = 20 } = req.query;
    const requestIdRaw = req.query.requestId ?? req.query.requestid ?? '';
    const { start, end } = defaultDateRange();
    const { fromStr, toStr } = dateRangeStrings(startDate, endDate, start, end);
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, Math.max(1, parseInt(limit, 10)));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const materialIds = rawMaterialIds
      ? rawMaterialIds.split(',').map((x) => parseInt(x.trim(), 10)).filter((x) => !Number.isNaN(x) && x > 0)
      : [];
    const requestIdNum = typeof requestIdRaw === 'string' && requestIdRaw.trim() !== ''
      ? parseInt(requestIdRaw.trim(), 10)
      : (typeof requestIdRaw === 'number' && !Number.isNaN(requestIdRaw) ? requestIdRaw : null);
    const hasRequestId = requestIdNum != null && !Number.isNaN(requestIdNum) && requestIdNum > 0;

    if (view === 'lines') {
      const whereParts = ["r.deleted = 'N'", "r.status IN ('active','received','returned')"];
      const params = [];
      if (hasRequestId) {
        whereParts.push('r.id = ?');
        params.push(requestIdNum);
      } else {
        whereParts.push('r.request_date >= ?', 'r.request_date <= ?');
        params.push(fromStr, toStr);
      }
      if (inboundStatus && ['request', 'received', 'returned'].includes(inboundStatus)) {
        whereParts.push('l.status = ?');
        params.push(inboundStatus);
      }
      if (materialIds.length) {
        whereParts.push(`l.raw_material_id IN (${materialIds.map(() => '?').join(',')})`);
        params.push(...materialIds);
      }
      const where = `WHERE ${whereParts.join(' AND ')}`;
      const listSql = `
        SELECT l.id AS line_id, r.id AS request_id, r.request_date, r.desired_date, r.supplier_id, s.name AS supplier_name,
          l.raw_material_id, l.quantity, l.status AS line_status,
          rm.name AS raw_material_name, mt.name AS raw_material_kind
        FROM \`${REQUESTS_TABLE}\` r
        INNER JOIN \`${LINES_TABLE}\` l ON l.request_id = r.id
        INNER JOIN \`${SUPPLIERS_TABLE}\` s ON s.id = r.supplier_id AND s.deleted = 'N'
        INNER JOIN \`${RAW_MATERIALS_TABLE}\` rm ON rm.id = l.raw_material_id
        LEFT JOIN \`${TYPES_TABLE}\` mt ON mt.id = rm.kind_id
        ${where}
        ORDER BY r.request_date DESC, r.id DESC, l.id
        LIMIT ? OFFSET ?
      `;
      const countSql = `
        SELECT COUNT(*) AS total
        FROM \`${REQUESTS_TABLE}\` r
        INNER JOIN \`${LINES_TABLE}\` l ON l.request_id = r.id
        ${where}
      `;
      const [rows] = await pool.query(listSql, [...params, limitNum, offset]);
      const [[countRow]] = await pool.query(countSql, params);
      const total = countRow?.total != null ? Number(countRow.total) : 0;
      return res.json({ list: rows || [], total, page: Number(page), limit: limitNum });
    }

    const whereParts = ["r.deleted = 'N'"];
    const params = [];
    if (hasRequestId) {
      whereParts.push('r.id = ?');
      params.push(requestIdNum);
    } else {
      whereParts.push('r.request_date >= ?', 'r.request_date <= ?');
      params.push(fromStr, toStr);
    }
    if (inboundStatus === 'cancelled') {
      whereParts.push("r.status = 'cancelled'");
    } else if (inboundStatus === 'active') {
      whereParts.push("r.status = 'active'");
    } else if (inboundStatus === 'received') {
      whereParts.push("r.status = 'received'");
    } else if (inboundStatus === 'returned') {
      whereParts.push("r.status = 'returned'");
    }
    if (materialIds.length) {
      whereParts.push(`EXISTS (SELECT 1 FROM \`${LINES_TABLE}\` l2 WHERE l2.request_id = r.id AND l2.raw_material_id IN (${materialIds.map(() => '?').join(',')}))`);
      params.push(...materialIds);
    }
    const where = `WHERE ${whereParts.join(' AND ')}`;
    const listSql = `
      SELECT r.id, r.supplier_id, s.name AS supplier_name, r.desired_date, r.request_date, r.status,
        (SELECT COUNT(DISTINCT l.raw_material_id) FROM \`${LINES_TABLE}\` l WHERE l.request_id = r.id) AS material_kind_count,
        (SELECT COUNT(*) FROM \`${LINES_TABLE}\` l WHERE l.request_id = r.id AND l.status = 'request') AS line_request_count,
        (SELECT COUNT(*) FROM \`${LINES_TABLE}\` l WHERE l.request_id = r.id AND l.status = 'received') AS line_received_count,
        (SELECT COUNT(*) FROM \`${LINES_TABLE}\` l WHERE l.request_id = r.id AND l.status = 'returned') AS line_returned_count
      FROM \`${REQUESTS_TABLE}\` r
      INNER JOIN \`${SUPPLIERS_TABLE}\` s ON s.id = r.supplier_id AND s.deleted = 'N'
      ${where}
      ORDER BY r.request_date DESC, r.id DESC
      LIMIT ? OFFSET ?
    `;
    const countSql = `SELECT COUNT(*) AS total FROM \`${REQUESTS_TABLE}\` r ${where}`;
    const [rows] = await pool.query(listSql, [...params, limitNum, offset]);
    const [[countRow]] = await pool.query(countSql, params);
    const total = countRow?.total != null ? Number(countRow.total) : 0;
    const list = (rows || []).map((row) => {
      const req = parseLineCount(row.line_request_count);
      const rec = parseLineCount(row.line_received_count);
      const ret = parseLineCount(row.line_returned_count);
      const totalLines = req + rec + ret;
      let statusLabel = '입고 요청';
      if (row.status === 'cancelled') statusLabel = '입고 취소';
      else if (row.status === 'received') statusLabel = '전체 입고';
      else if (row.status === 'returned') statusLabel = '전체 반품';
      else if (totalLines > 0) {
        if (ret === totalLines) statusLabel = '전체 반품';
        else if (rec === totalLines) statusLabel = '전체 입고';
        else if (req === 0 && rec > 0 && ret > 0) statusLabel = '전체 입고';
        else if (rec >= 1 || ret >= 1) statusLabel = '부분 입고/반품';
      }
      const canCancel = row.status === 'active' && totalLines > 0 && Number(req) === Number(totalLines);
      const { line_request_count, line_received_count, line_returned_count, ...rest } = row;
      return { ...rest, status_label: statusLabel, can_cancel: Boolean(canCancel) };
    });
    res.json({ list, total, page: Number(page), limit: limitNum });
  } catch (err) {
    logger.error('material-inbound list error', { error: err.message, stack: err.stack });
    const msg = err.message || '';
    let hint = '';
    if (/doesn't exist|Unknown table/i.test(msg)) {
      hint = ' 입고 테이블이 없을 수 있습니다. npm run setup:material-inbound 실행 후 서버 재시작.';
    } else if (/ECONNREFUSED|connect|ENOTFOUND/i.test(msg)) {
      hint = ' DB 연결 실패. .env의 DB_HOST 등이 테이블이 생성된 DB와 같은지 확인하세요.';
    }
    res.status(500).json({ error: '목록 조회에 실패했습니다.' + hint, detail: msg });
  }
}

router.get('/', listHandler);

/** 단건 조회 (요청 + 라인) */
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });
    const [reqRows] = await pool.query(
      `SELECT r.*, s.name AS supplier_name, s.manager_email
       FROM \`${REQUESTS_TABLE}\` r
       INNER JOIN \`${SUPPLIERS_TABLE}\` s ON s.id = r.supplier_id AND s.deleted = 'N'
       WHERE r.id = ? AND r.deleted = 'N'`,
      [id]
    );
    if (!reqRows.length) return res.status(404).json({ error: '입고 요청을 찾을 수 없습니다.' });
    const [lineRows] = await pool.query(
      `SELECT l.id, l.raw_material_id, l.quantity, l.status,
        rm.name AS raw_material_name, mt.name AS raw_material_kind
       FROM \`${LINES_TABLE}\` l
       INNER JOIN \`${RAW_MATERIALS_TABLE}\` rm ON rm.id = l.raw_material_id
       LEFT JOIN \`${TYPES_TABLE}\` mt ON mt.id = rm.kind_id
       WHERE l.request_id = ?`,
      [id]
    );
    const lines = lineRows || [];
    const request = reqRows[0];
    const status_label = toRequestStatusLabel(request.status, lines);
    res.json({ ...request, lines, status_label });
  } catch (err) {
    logger.error('material-inbound get error', { error: err.message });
    res.status(500).json({ error: '조회에 실패했습니다.' });
  }
});

/** 등록 */
router.post('/', async (req, res) => {
  try {
    const { supplierId, desiredDate, lines: bodyLines = [], updatedBy } = req.body || {};
    if (!supplierId || !desiredDate || String(desiredDate).trim() === '') {
      return res.status(400).json({ error: '원자재 업체와 입고 희망일은 필수입니다.' });
    }
    if (!updatedBy || String(updatedBy).trim() === '') {
      return res.status(400).json({ error: '수정자는 필수입니다.' });
    }
    const lineList = Array.isArray(bodyLines) ? bodyLines.filter((l) => l.raw_material_id && (l.quantity != null && l.quantity !== '')) : [];
    if (lineList.length === 0) return res.status(400).json({ error: '원자재 정보를 1건 이상 입력해 주세요.' });

    const sid = parseInt(supplierId, 10);
    if (Number.isNaN(sid) || sid < 1) return res.status(400).json({ error: '원자재 업체를 선택해 주세요.' });
    const [sup] = await pool.query(
      `SELECT id, name, manager_email FROM \`${SUPPLIERS_TABLE}\` WHERE id = ? AND deleted = 'N'`,
      [sid]
    );
    if (!sup.length) return res.status(400).json({ error: '선택한 업체를 찾을 수 없습니다.' });

    const requestDate = toDateString(new Date());
    const desiredDateStr = toDateString(new Date(desiredDate)) || String(desiredDate).trim().slice(0, 10);

    const [insertReq] = await pool.query(
      `INSERT INTO \`${REQUESTS_TABLE}\` (supplier_id, desired_date, request_date, status, updated_by)
       VALUES (?, ?, ?, 'active', ?)`,
      [sid, desiredDateStr, requestDate, String(updatedBy).trim()]
    );
    const requestId = insertReq.insertId;
    const lineRows = lineList.map((l) => [
      requestId,
      parseInt(l.raw_material_id, 10),
      Number(l.quantity) || 0,
    ]);
    await pool.query(
      `INSERT INTO \`${LINES_TABLE}\` (request_id, raw_material_id, quantity, status, updated_by) VALUES ?`,
      [lineRows.map((r) => [...r, 'request', String(updatedBy).trim()])]
    );

    const [created] = await pool.query(
      `SELECT r.*, s.name AS supplier_name FROM \`${REQUESTS_TABLE}\` r
       INNER JOIN \`${SUPPLIERS_TABLE}\` s ON s.id = r.supplier_id WHERE r.id = ?`,
      [requestId]
    );
    const [createdLines] = await pool.query(
      `SELECT l.*, rm.name AS raw_material_name, mt.name AS raw_material_kind
       FROM \`${LINES_TABLE}\` l
       INNER JOIN \`${RAW_MATERIALS_TABLE}\` rm ON rm.id = l.raw_material_id
       LEFT JOIN \`${TYPES_TABLE}\` mt ON mt.id = rm.kind_id
       WHERE l.request_id = ?`,
      [requestId]
    );
    const lines = createdLines || [];
    const toEmailRaw = sup[0].manager_email;
    const toEmail = toEmailRaw != null ? String(toEmailRaw).trim() : '';
    let emailSent = false;
    if (toEmail) {
      const lineSummary = lines.map((l) => `- ${(l.raw_material_kind ? l.raw_material_kind + ' / ' : '') + (l.raw_material_name || '')}: ${l.quantity}`).join('\n');
      try {
        emailSent = await sendInboundEmail(
          toEmail,
          `[BNK-MES] 원자재 입고 요청 - ${sup[0].name}`,
          `원자재 입고 요청이 등록되었습니다.\n업체: ${sup[0].name}\n입고 희망일: ${desiredDateStr}\n\n원자재:\n${lineSummary}`
        );
        if (!emailSent) {
          logger.warn('material-inbound: 입고 요청 이메일 발송 실패 (ig-notification 반환 실패)', { supplierId: sid, toEmail });
        }
      } catch (e) {
        logger.error('material-inbound: 입고 요청 이메일 발송 예외', { supplierId: sid, toEmail, error: e.message });
      }
    } else {
      logger.warn('material-inbound: 입고 요청 담당자 이메일 없음, 발송 생략', { supplierId: sid, supplierName: sup[0].name });
    }
    res.status(201).json({ ...created[0], lines, emailSent });
  } catch (err) {
    logger.error('material-inbound create error', { error: err.message });
    res.status(500).json({ error: '등록에 실패했습니다.', detail: err.message });
  }
});

/** 취소 / 전체 입고 / 전체 반품 (body: { action, updatedBy }) */
router.patch('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });
    const { action, updatedBy } = req.body || {};
    if (!action || !['cancel', 'receive-all', 'return-all'].includes(action)) {
      return res.status(400).json({ error: 'action은 cancel, receive-all, return-all 중 하나여야 합니다.' });
    }
    const [reqRows] = await pool.query(
      `SELECT r.*, s.name AS supplier_name, s.manager_email FROM \`${REQUESTS_TABLE}\` r
       INNER JOIN \`${SUPPLIERS_TABLE}\` s ON s.id = r.supplier_id AND s.deleted = 'N'
       WHERE r.id = ? AND r.deleted = 'N'`,
      [id]
    );
    if (!reqRows.length) return res.status(404).json({ error: '입고 요청을 찾을 수 없습니다.' });
    const request = reqRows[0];
    const [lines] = await pool.query(`SELECT id, raw_material_id, quantity, status FROM \`${LINES_TABLE}\` WHERE request_id = ?`, [id]);

    if (action === 'cancel') {
      const allRequest = lines.every((l) => l.status === 'request');
      if (!allRequest) return res.status(400).json({ error: '모든 원자재가 요청 상태일 때만 취소할 수 있습니다.' });
      await pool.query(
        `UPDATE \`${REQUESTS_TABLE}\` SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ?`,
        [updatedBy != null ? String(updatedBy) : null, id]
      );
      if (request.manager_email) {
        await sendInboundEmail(
          request.manager_email,
          `[BNK-MES] 원자재 입고 요청 취소 - ${request.supplier_name}`,
          `입고 요청이 취소되었습니다.\n업체: ${request.supplier_name}\n입고 희망일: ${request.desired_date}`
        );
      }
    } else if (action === 'receive-all') {
      await pool.query(
        `UPDATE \`${LINES_TABLE}\` SET status = 'received', updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE request_id = ?`,
        [updatedBy != null ? String(updatedBy) : null, id]
      );
      await pool.query(
        `UPDATE \`${REQUESTS_TABLE}\` SET status = 'received', updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ?`,
        [updatedBy != null ? String(updatedBy) : null, id]
      );
      if (request.manager_email) {
        await sendInboundEmail(
          request.manager_email,
          `[BNK-MES] 원자재 전체 입고 처리 - ${request.supplier_name}`,
          `입고 요청에 대해 전체 입고 처리되었습니다.\n업체: ${request.supplier_name}\n입고 희망일: ${request.desired_date}`
        );
      }
    } else if (action === 'return-all') {
      await pool.query(
        `UPDATE \`${LINES_TABLE}\` SET status = 'returned', updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE request_id = ?`,
        [updatedBy != null ? String(updatedBy) : null, id]
      );
      await pool.query(
        `UPDATE \`${REQUESTS_TABLE}\` SET status = 'returned', updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ?`,
        [updatedBy != null ? String(updatedBy) : null, id]
      );
      if (request.manager_email) {
        await sendInboundEmail(
          request.manager_email,
          `[BNK-MES] 원자재 전체 반품 처리 - ${request.supplier_name}`,
          `입고 요청에 대해 전체 반품 처리되었습니다.\n업체: ${request.supplier_name}\n입고 희망일: ${request.desired_date}`
        );
      }
    } else {
      return res.status(400).json({ error: 'action은 cancel, receive-all, return-all 중 하나여야 합니다.' });
    }

    const [updated] = await pool.query(
      `SELECT r.*, s.name AS supplier_name FROM \`${REQUESTS_TABLE}\` r
       INNER JOIN \`${SUPPLIERS_TABLE}\` s ON s.id = r.supplier_id WHERE r.id = ?`,
      [id]
    );
    const [updatedLines] = await pool.query(
      `SELECT l.*, rm.name AS raw_material_name, mt.name AS raw_material_kind
       FROM \`${LINES_TABLE}\` l
       INNER JOIN \`${RAW_MATERIALS_TABLE}\` rm ON rm.id = l.raw_material_id
       LEFT JOIN \`${TYPES_TABLE}\` mt ON mt.id = rm.kind_id
       WHERE l.request_id = ?`,
      [id]
    );
    res.json({ ...updated[0], lines: updatedLines || [] });
  } catch (err) {
    logger.error('material-inbound patch error', { error: err.message });
    res.status(500).json({ error: '처리에 실패했습니다.', detail: err.message });
  }
});

/** 라인 단위 입고/반품 (body: { status: 'received'|'returned', updatedBy }) */
router.patch('/:requestId/lines/:lineId', async (req, res) => {
  try {
    const requestId = parseInt(req.params.requestId, 10);
    const lineId = parseInt(req.params.lineId, 10);
    if (Number.isNaN(requestId) || Number.isNaN(lineId)) return res.status(400).json({ error: '잘못된 ID입니다.' });
    const { status, updatedBy } = req.body || {};
    if (status !== 'received' && status !== 'returned') {
      return res.status(400).json({ error: 'status는 received 또는 returned이어야 합니다.' });
    }
    const [lineRows] = await pool.query(
      `SELECT l.*, r.supplier_id, s.name AS supplier_name, s.manager_email, rm.name AS raw_material_name
       FROM \`${LINES_TABLE}\` l
       INNER JOIN \`${REQUESTS_TABLE}\` r ON r.id = l.request_id AND r.deleted = 'N'
       INNER JOIN \`${SUPPLIERS_TABLE}\` s ON s.id = r.supplier_id AND s.deleted = 'N'
       INNER JOIN \`${RAW_MATERIALS_TABLE}\` rm ON rm.id = l.raw_material_id
       WHERE l.id = ? AND l.request_id = ?`,
      [lineId, requestId]
    );
    if (!lineRows.length) return res.status(404).json({ error: '해당 라인을 찾을 수 없습니다.' });
    await pool.query(
      `UPDATE \`${LINES_TABLE}\` SET status = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ? AND request_id = ?`,
      [status, updatedBy != null ? String(updatedBy) : null, lineId, requestId]
    );
    const [allLines] = await pool.query(
      `SELECT status FROM \`${LINES_TABLE}\` WHERE request_id = ?`,
      [requestId]
    );
    const total = allLines.length;
    const receivedCount = allLines.filter((l) => l.status === 'received').length;
    const returnedCount = allLines.filter((l) => l.status === 'returned').length;
    let requestStatus = 'active';
    if (total > 0 && receivedCount === total) requestStatus = 'received';
    else if (total > 0 && returnedCount === total) requestStatus = 'returned';
    await pool.query(
      `UPDATE \`${REQUESTS_TABLE}\` SET status = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ?`,
      [requestStatus, updatedBy != null ? String(updatedBy) : null, requestId]
    );
    const line = lineRows[0];
    if (line.manager_email) {
      const actionText = status === 'received' ? '입고 처리' : '반품 처리';
      await sendInboundEmail(
        line.manager_email,
        `[BNK-MES] 원자재 ${actionText} - ${line.supplier_name}`,
        `원자재 "${line.raw_material_name}"에 대해 ${actionText}되었습니다.\n업체: ${line.supplier_name}`
      );
    }
    const [updated] = await pool.query(
      `SELECT l.*, rm.name AS raw_material_name, mt.name AS raw_material_kind
       FROM \`${LINES_TABLE}\` l
       INNER JOIN \`${RAW_MATERIALS_TABLE}\` rm ON rm.id = l.raw_material_id
       LEFT JOIN \`${TYPES_TABLE}\` mt ON mt.id = rm.kind_id
       WHERE l.id = ?`,
      [lineId]
    );
    res.json(updated[0]);
  } catch (err) {
    logger.error('material-inbound line patch error', { error: err.message });
    res.status(500).json({ error: '처리에 실패했습니다.', detail: err.message });
  }
});

export default router;
