/**
 * 목록 검색용 날짜 범위: 시작일 00:00:00 ~ 종료일 23:59:59
 */

/**
 * @param {Date|string} d
 * @returns {Date|null}
 */
function toDate(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/**
 * 해당일 00:00:00.000 (로컬)
 * @param {Date|string} d
 * @returns {Date|null}
 */
function startOfDay(d) {
  const dt = toDate(d);
  if (!dt) return null;
  const out = new Date(dt);
  out.setHours(0, 0, 0, 0);
  return out;
}

/**
 * 해당일 23:59:59.999 (로컬)
 * @param {Date|string} d
 * @returns {Date|null}
 */
function endOfDay(d) {
  const dt = toDate(d);
  if (!dt) return null;
  const out = new Date(dt);
  out.setHours(23, 59, 59, 999);
  return out;
}

/**
 * 'YYYY-MM-DD'
 * @param {Date|string} d
 * @returns {string|null}
 */
function toDateString(d) {
  const dt = toDate(d);
  if (!dt) return null;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * SQL 조건용: 해당일 00:00:00 문자열 'YYYY-MM-DD 00:00:00'
 * @param {Date|string} d
 * @returns {string|null}
 */
function toStartOfDayString(d) {
  const s = toDateString(d);
  return s ? `${s} 00:00:00` : null;
}

/**
 * SQL 조건용: 해당일 23:59:59 문자열 'YYYY-MM-DD 23:59:59'
 * @param {Date|string} d
 * @returns {string|null}
 */
function toEndOfDayString(d) {
  const s = toDateString(d);
  return s ? `${s} 23:59:59` : null;
}

export {
  startOfDay,
  endOfDay,
  toDate,
  toDateString,
  toStartOfDayString,
  toEndOfDayString,
};
