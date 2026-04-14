/**
 * 공통 엑셀 내보내기 유틸
 * CSV → xlsx 변환
 */
import XLSX from 'xlsx';

/**
 * 데이터를 xlsx Buffer로 변환
 * @param {string[][]} headers - 헤더 행 배열 (예: [['차종','적용부','칼라']])
 * @param {any[][]} rows - 데이터 행 배열
 * @param {string} sheetName - 시트 이름 (기본: 'Sheet1')
 * @returns {Buffer} xlsx 파일 버퍼
 */
export function toXlsxBuffer(headers, rows, sheetName = 'Sheet1') {
  const wb = XLSX.utils.book_new();
  const data = [...headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(data);
  // 헤더 너비 자동 설정
  const colWidths = headers[0].map((h, i) => {
    let max = String(h).length;
    for (const row of rows) {
      const len = String(row[i] ?? '').length;
      if (len > max) max = len;
    }
    return { wch: Math.min(Math.max(max + 2, 8), 40) };
  });
  ws['!cols'] = colWidths;
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * "제목-YYYYMMDD.xlsx" 형식 파일명 생성
 * @param {string} title 한글 제목
 */
export function buildXlsxFilename(title) {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${title}-${yyyy}${mm}${dd}.xlsx`;
}

/**
 * Express res에 xlsx 파일 전송 (한글 파일명 지원)
 * - filenameOrTitle 이 .xlsx 확장자로 끝나지 않으면 한글 제목으로 간주하여 제목-YYYYMMDD.xlsx 변환
 * - RFC 5987 인코딩으로 한글 파일명 호환
 */
export function sendXlsx(res, headers, rows, filenameOrTitle, sheetName = 'Sheet1') {
  const buf = toXlsxBuffer(headers, rows, sheetName);
  const filename = filenameOrTitle.endsWith('.xlsx')
    ? filenameOrTitle
    : buildXlsxFilename(filenameOrTitle);
  const encoded = encodeURIComponent(filename);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`);
  res.send(buf);
}
