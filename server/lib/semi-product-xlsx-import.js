/**
 * 반제품 엑셀 → DB 삽입 (import / retry 공통)
 */
import {
  sanitizeSemiProductField,
  forwardFillMergedCells,
  toNullableTwoDecimal,
  toNullableInt,
} from './semi-product-import-helpers.js';

const SEMI_DEFAULT = '하지';

/**
 * @param {object} opts
 * @param {import('mysql2/promise').Connection} opts.conn
 * @param {Record<string, unknown>[]} opts.rows forwardFill 적용 후 sheet rows
 * @param {Set<number> | null} opts.rowExcelNumbers 엑셀 행 번호(1-based 헤더 다음). null이면 전체
 * @param {Set<string>} opts.vehicleCodeSet
 * @param {Set<string>} opts.partCodeSet
 * @param {Set<string>} opts.colorCodeSet
 * @param {string} [opts.semiProductType]
 * @param {string} [opts.updatedBy]
 */
export async function runSemiProductImportRows(opts) {
  const {
    conn,
    rows,
    rowExcelNumbers,
    vehicleCodeSet,
    partCodeSet,
    colorCodeSet,
    semiProductType = SEMI_DEFAULT,
    updatedBy = 'xlsx-batch-import',
  } = opts;

  const failures = [];
  let inserted = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const rowNo = i + 2;
    if (rowExcelNumbers != null && !rowExcelNumbers.has(rowNo)) continue;

    const r = rows[i] || {};

    const car = sanitizeSemiProductField(r['차종']);
    const part = sanitizeSemiProductField(r['부위']);
    const color = sanitizeSemiProductField(r['칼라']);
    const vendor = sanitizeSemiProductField(r['업체']);
    const codeRaw = r['완제품 코드'];
    const code =
      codeRaw == null || sanitizeSemiProductField(codeRaw) === ''
        ? null
        : sanitizeSemiProductField(codeRaw);
    const thickness = toNullableTwoDecimal(r['두께']);
    const width = toNullableInt(r['폭']);

    const isEmptyRow = !code && !car && !part && !color && !vendor && thickness == null && width == null;
    if (isEmptyRow) continue;

    const reasons = [];
    if (!car || !vehicleCodeSet.has(car)) reasons.push(`차량 코드 미매핑: ${car || '(빈값)'}`);
    if (!part || !partCodeSet.has(part)) reasons.push(`부위 코드 미매핑: ${part || '(빈값)'}`);
    if (!color || !colorCodeSet.has(color)) reasons.push(`색상 코드 미매핑: ${color || '(빈값)'}`);
    if (reasons.length > 0) {
      failures.push({ row: rowNo, code, reason: reasons.join('; ') });
      continue;
    }

    if (code) {
      const [dup] = await conn.query(
        "SELECT id FROM delivery_semi_products WHERE code = ? AND deleted = 'N' LIMIT 1",
        [code]
      );
      if ((dup || []).length > 0) {
        failures.push({ row: rowNo, code, reason: '이미 사용 중인 반제품 코드입니다.' });
        continue;
      }
    }

    try {
      await conn.query(
        "INSERT INTO delivery_semi_products (name, code, semi_product_type, vehicle_code, part_code, supplier_name, ratio, color_code, color_name, thickness, width, updated_at, updated_by, deleted) VALUES (NULL, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, CURRENT_TIMESTAMP, ?, 'N')",
        [code, semiProductType, car || null, part || null, vendor || null, color || null, thickness, width, updatedBy]
      );
      inserted += 1;
    } catch (err) {
      failures.push({ row: rowNo, code, reason: err.message });
    }
  }

  return { inserted, failures };
}

export function prepareRowsFromSheet(rawRows) {
  return forwardFillMergedCells(rawRows, ['차종', '부위', '칼라', '업체']);
}
