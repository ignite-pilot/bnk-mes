/**
 * 원자재 마스터 재구축 v2 — 두께+폭까지 포함한 고유 키
 * 1. 기존 원자재 전체 삭제 (+ 재고 스냅샷 라인도 정리)
 * 2. 현진엠아이 + 협성 + 통합재고 Excel → 두께+폭 포함 개별 레코드
 * 3. config manager 누락 코드 자동 추가
 *
 * 사용: node server/scripts/reimport-raw-materials-v2.js
 */
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import { getPool, initDb } from '../lib/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_DIR = path.join(__dirname, '../../BNK_DOC');

const CONFIG_BASE = (process.env.CONFIG_MANAGER_URL || 'https://config-manager.ig-pilot.com').replace(/\/$/, '');
const CONFIG_APP_ID = 2;

// ── 정규화 ──
const VN = {
  'ME1a': 'ME1A', 'CN7 PE': 'CN7PE', 'RG3 PE': 'RG3PE', 'NX4 PE': 'NX4PE',
  'LX2 PE\n변경분': 'LX2 PE 변경분', 'SX2\n사이즈변경분': 'SX2 사이즈변경분',
  'RG3 PE EV': 'RG3PE EV',
};
const PN = {
  'Main': 'MAIN', 'Main FRT': 'MAIN FRT', 'Main RR': 'MAIN RR',
  'Main/FRT': 'MAIN FRT', 'Main/RR': 'MAIN RR',
  'A/Rest': 'A/REST', 'A/Rest FRT': 'A/REST FRT', 'A/Rest RR': 'A/REST RR',
  'A/Rest UPR FRT': 'A/REST UPR FRT', 'A/REST/FRT': 'A/REST FRT',
  'CTR/FRT': 'CTR FRT', 'CTR/RR': 'CTR RR',
  'UPR/FRT': 'UPR FRT', 'UPR/RR': 'UPR RR',
  'UPR F': 'UPR FRT', 'UPR R': 'UPR RR',
  'UPR  4CVT': 'UPR 4CVT', 'UPR  FRT': 'UPR FRT', 'UPR  RR': 'UPR RR',
  'H/INR': 'H/INNER',
};
const JUNK = new Set(['차종', '부위', '칼라', '색상', '합계', 'ff', '']);
function norm(v, m) { if (!v) return ''; const s = String(v).trim(); return m[s] || s; }
function safeNum(v) { if (v == null) return null; const n = Number(v); return (!Number.isNaN(n) && isFinite(n)) ? n : null; }

// ── Config Manager ──
async function getCodeTree() {
  const r = await fetch(`${CONFIG_BASE}/api/apps/${CONFIG_APP_ID}/codes/tree`, { headers: { 'Accept': 'application/json' } });
  return (await r.json()).tree;
}
async function addCode(parentId, value) {
  const r = await fetch(`${CONFIG_BASE}/api/apps/${CONFIG_APP_ID}/codes/tree`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parent_id: parentId, value, name: value, createdBy: 'reimport-v2' }),
  });
  if (r.ok) console.log(`  ✓ 코드 추가: ${value}`);
  else console.error(`  ✗ 코드 추가 실패: ${value}`);
}

async function main() {
  await initDb();
  const pool = getPool();

  // 1. 기존 원자재 + 관련 재고 삭제
  console.log('\n=== 1. 기존 데이터 삭제 ===');
  await pool.query("DELETE FROM stock_snapshot_lines");
  await pool.query("DELETE FROM stock_snapshots");
  await pool.query("DELETE FROM raw_materials");
  console.log('원자재, 재고 스냅샷 전체 삭제 완료');

  // 2. material_types 맵
  const [typeRows] = await pool.query("SELECT id, name FROM material_types");
  const typeMap = {};
  typeRows.forEach(t => { typeMap[t.name] = t.id; });
  const sangjiId = typeMap['상지'] || 1;
  const hajiId = typeMap['하지'] || 2;

  // 3. Excel 읽기
  console.log('\n=== 2. Excel 데이터 읽기 ===');
  const allItems = []; // { vehicle, part, color, kind, thickness, width, code }

  // 현진엠아이
  const wb1 = XLSX.readFile(path.join(DOC_DIR, '0_RE_ 안녕하세요. 이그나이트 조윤식입니다._260223 (1)/현진엠아이_KOLON TPO _재고 수량_260214 (1).xlsx'));
  const hj = XLSX.utils.sheet_to_json(wb1.Sheets['재고수량'], { header: 1 }).slice(3);
  for (const r of hj) {
    if (!r[1]) continue;
    const v = norm(r[1], VN), p = norm(r[2], PN), c = String(r[4] || '').trim();
    const kindStr = String(r[5] || '').trim();
    if (JUNK.has(v) || JUNK.has(c)) continue;
    const k = kindStr.includes('상지') ? '상지' : '하지';
    allItems.push({ vehicle: v, part: p, color: c, kind: k, thickness: safeNum(r[6]), width: safeNum(r[7]), code: r[0] ? String(r[0]).trim() : null });
  }
  console.log(`현진: ${hj.length}행`);

  // 협성
  const wb2 = XLSX.readFile(path.join(DOC_DIR, '0_RE_ 안녕하세요. 이그나이트 조윤식입니다._260223 (1)/협성 재고현황_20260212(비앤케이).xlsx'));
  const hs = XLSX.utils.sheet_to_json(wb2.Sheets['협성 자재코드(공유)'], { header: 1 }).slice(3);
  for (const r of hs) {
    if (!r[3]) continue;
    const v = norm(r[3], VN), p = norm(r[4], PN), c = String(r[5] || '').trim();
    const k = String(r[2] || '').includes('하지') ? '하지' : '상지';
    if (JUNK.has(v) || JUNK.has(c)) continue;
    allItems.push({ vehicle: v, part: p, color: c, kind: k, thickness: safeNum(r[6]), width: safeNum(r[7]), code: r[0] ? String(r[0]).trim() : null });
  }
  console.log(`협성: ${hs.length}행`);

  // 통합 재고 — 상지 입고
  const wb3 = XLSX.readFile(path.join(DOC_DIR, '통합 재고 관리.xls'));
  const sangji = XLSX.utils.sheet_to_json(wb3.Sheets['1-1. 상지 입고'], { header: 1 }).slice(5);
  let pCar = '', pPart = '';
  for (const r of sangji) {
    if (r[1]) pCar = norm(r[1], VN);
    if (r[2]) pPart = norm(r[2], PN);
    const c = r[3] ? String(r[3]).trim() : '';
    if (!c || JUNK.has(pCar) || JUNK.has(c)) continue;
    allItems.push({ vehicle: pCar, part: pPart, color: c, kind: '상지', thickness: safeNum(r[5]), width: safeNum(r[6]), code: null });
  }

  // 통합 재고 — 하지 입고
  const haji = XLSX.utils.sheet_to_json(wb3.Sheets['3. 하지 입고'], { header: 1 }).slice(5);
  pCar = ''; pPart = '';
  for (const r of haji) {
    if (r[0]) pCar = norm(r[0], VN);
    if (r[1]) pPart = norm(r[1], PN);
    const c = r[2] ? String(r[2]).trim() : '';
    if (!c || JUNK.has(pCar) || JUNK.has(c)) continue;
    allItems.push({ vehicle: pCar, part: pPart, color: c, kind: '하지', thickness: safeNum(r[5]), width: safeNum(r[6]), code: r[3] ? String(r[3]).trim() : null });
  }
  console.log(`통합(상지+하지): ${sangji.length + haji.length}행`);
  console.log(`총 파싱: ${allItems.length}건`);

  // 4. Config Manager 코드 동기화
  console.log('\n=== 3. Config Manager 코드 동기화 ===');
  const tree = await getCodeTree();
  const vcNode = tree.find(t => t.value === 'VEHICLE_CODE');
  const pcNode = tree.find(t => t.value === 'PART_CODE');
  const ccNode = tree.find(t => t.value === 'COLOR_CODE');
  const vehicleMap = {}, partMap = {}, colorMap = {};
  vcNode.children.forEach(c => { vehicleMap[c.value] = c.name; });
  pcNode.children.forEach(c => { partMap[c.value] = c.name; });
  ccNode.children.forEach(c => { colorMap[c.value] = c.name; });

  const newV = new Set(), newP = new Set(), newC = new Set();
  for (const item of allItems) {
    if (item.vehicle && !vehicleMap[item.vehicle]) newV.add(item.vehicle);
    if (item.part && !partMap[item.part]) newP.add(item.part);
    if (item.color && !colorMap[item.color]) newC.add(item.color);
  }
  console.log(`누락 차종: ${newV.size}, 적용부: ${newP.size}, 색상: ${newC.size}`);
  for (const v of newV) { await addCode(vcNode.id, v); vehicleMap[v] = v; }
  for (const p of newP) { await addCode(pcNode.id, p); partMap[p] = p; }
  for (const c of newC) { await addCode(ccNode.id, c); colorMap[c] = c; }

  // 5. 중복 제거 (차종+적용부+색상+종류+두께+폭)
  console.log('\n=== 4. 중복 제거 및 INSERT ===');
  const seen = new Set();
  const insertRows = [];
  for (const item of allItems) {
    const kindId = item.kind === '하지' ? hajiId : sangjiId;
    const key = `${item.vehicle}|${item.part}|${item.color}|${kindId}|${item.thickness}|${item.width}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const name = [item.vehicle, item.part, item.color, item.kind].filter(Boolean).join(' ');
    insertRows.push([
      kindId, item.code || null, name,
      item.color || null,
      item.vehicle || null, vehicleMap[item.vehicle] || item.vehicle || null,
      item.part || null, partMap[item.part] || item.part || null,
      item.color || null,
      item.thickness, item.width,
      null, null, null,
      'reimport-v2', 'reimport-v2',
    ]);
  }
  console.log(`중복제거 후: ${insertRows.length}건`);

  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < insertRows.length; i += BATCH) {
    const batch = insertRows.slice(i, i + BATCH);
    const [result] = await pool.query(
      'INSERT INTO raw_materials (kind_id, code, name, color, vehicle_code, vehicle_name, part_code, part_name, color_code, thickness, width, `length`, supplier_safety_stock, bnk_warehouse_safety_stock, created_by, updated_by) VALUES ?',
      [batch]
    );
    inserted += result.affectedRows;
  }
  console.log(`INSERT 완료: ${inserted}건`);

  // 최종 확인
  const [[{ total }]] = await pool.query("SELECT COUNT(*) as total FROM raw_materials WHERE deleted='N'");
  const [kindStats] = await pool.query("SELECT mt.name, COUNT(*) as cnt FROM raw_materials rm JOIN material_types mt ON mt.id=rm.kind_id WHERE rm.deleted='N' GROUP BY mt.name");
  console.log(`\n=== 최종 결과: ${total}건 ===`);
  kindStats.forEach(s => console.log(`  ${s.name}: ${s.cnt}건`));

  // 중복 규격 확인
  const [dupeCheck] = await pool.query(`
    SELECT vehicle_code, part_code, color_code, kind_id, COUNT(*) as cnt
    FROM raw_materials WHERE deleted='N'
    GROUP BY vehicle_code, part_code, color_code, kind_id
    HAVING cnt > 1 LIMIT 5
  `);
  if (dupeCheck.length) {
    console.log(`\n규격 다른 동일 조합 샘플:`);
    for (const d of dupeCheck) {
      const [rows] = await pool.query(
        'SELECT id, thickness, width FROM raw_materials WHERE vehicle_code=? AND part_code=? AND color_code=? AND kind_id=? AND deleted="N"',
        [d.vehicle_code, d.part_code, d.color_code, d.kind_id]
      );
      console.log(`  ${d.vehicle_code}|${d.part_code}|${d.color_code} (${d.cnt}건):`);
      rows.forEach(r => console.log(`    id:${r.id} 두께:${r.thickness} 폭:${r.width}`));
    }
  }

  process.exit(0);
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
