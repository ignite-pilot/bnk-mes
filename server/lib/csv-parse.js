/**
 * 간단한 CSV 파서 (BOM 제거, 쌍따옴표 처리)
 * 반환: { headers: string[], rows: string[][] }
 */
export function parseCsv(text) {
  const cleaned = text.replace(/^\uFEFF/, '');
  const lines = [];
  let current = '';
  let inQuote = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inQuote) {
      if (ch === '"' && cleaned[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuote = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuote = true;
    } else if (ch === ',') {
      lines.push(current);
      current = '';
    } else if (ch === '\n' || (ch === '\r' && cleaned[i + 1] === '\n')) {
      lines.push(current);
      current = '';
      if (ch === '\r') i++;
      lines.push(null); // row separator
    } else if (ch === '\r') {
      lines.push(current);
      current = '';
      lines.push(null);
    } else {
      current += ch;
    }
  }
  if (current || lines.length > 0) lines.push(current);

  // Split into rows
  const rows = [];
  let row = [];
  for (const cell of lines) {
    if (cell === null) {
      if (row.length > 0) rows.push(row);
      row = [];
    } else {
      row.push(cell.trim());
    }
  }
  if (row.length > 0) rows.push(row);

  if (rows.length === 0) return { headers: [], rows: [] };
  return { headers: rows[0], rows: rows.slice(1).filter(r => r.some(c => c !== '')) };
}
