/**
 * 반제품 엑셀 일괄등록용 문자열·행 전처리 (scripts/제품 엑셀 업로드 규칙)
 */

/**
 * \r\n → 단일 공백(한 칸)으로 치환 후, 연속 공백은 1개로, trim
 * (scripts/제품 엑셀 업로드 규칙)
 */
export function sanitizeSemiProductField(v) {
  if (v == null) return '';
  return String(v)
    .replace(/\r\nr/gi, '')
    .replace(/\r\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function toNullableTwoDecimal(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Number(n.toFixed(2));
}

export function toNullableInt(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

/**
 * 병합 셀로 비어 있는 행 채우기: 이전 행 값 전진 복사
 * @param {Record<string, unknown>[]} rows sheet_to_json 결과
 * @param {string[]} columnKeys 엑셀 헤더 키 (예: 차종, 부위)
 */
export function forwardFillMergedCells(rows, columnKeys) {
  const last = Object.fromEntries(columnKeys.map((k) => [k, '']));
  return rows.map((row) => {
    const next = { ...row };
    for (const key of columnKeys) {
      const raw = row[key];
      const cleaned = sanitizeSemiProductField(raw);
      if (cleaned !== '') last[key] = cleaned;
      next[key] = last[key];
    }
    return next;
  });
}
