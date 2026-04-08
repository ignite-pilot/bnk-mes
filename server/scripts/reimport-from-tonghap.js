/**
 * 통합 재고 관리.xls 기준 완제품/반제품/원자재 재임포트
 * 1. 완제품/반제품 전체 삭제 후 통합관리 재고 시트 기준으로 재입력
 * 2. 원자재에 없는 항목도 자동 추가 (상지/하지)
 * 3. config manager 누락 코드 자동 추가
 *
 * 사용: node server/scripts/reimport-from-tonghap.js
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
const VEHICLE_NORMALIZE = {
  'ME1a': 'ME1A', 'CN7 PE': 'CN7PE', 'RG3 PE': 'RG3PE', 'NX4 PE': 'NX4PE',
  'LX2 PE\n변경분': 'LX2 PE 변경분', 'SX2\n사이즈변경분': 'SX2 사이즈변경분',
};
const PART_NORMALIZE = {
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
const JUNK = new Set(['차종', '부위', '칼라', '합계', '']);
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
    body: JSON.stringify({ parent_id: parentId, value, name: value, createdBy: 'reimport-script' }),
  });
  if (r.ok) console.log(`  ✓ 코드 추가: ${value}`);
  else console.error(`  ✗ 코드 추가 실패: ${value}`);
}
async function ensureCodes(parentId, map, values) {
  for (const v of values) {
    if (v && !map[v]) { await addCode(parentId, v); map[v] = v; }
  }
}

async function main() {
  await initDb();
  const pool = getPool();

  // 1. 통합관리 재고 시트 파싱
  console.log('\n=== 1. 통합관리 재고 시트 파싱 ===');
  const wb = XLSX.readFile(path.join(DOC_DIR, '통합 재고 관리.xls'));
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['통합관리 재고'], { header: 1 }).slice(5);

  let pCar = '', pPart = '', pSupplier = '';
  const items = [];
  for (const r of rows) {
    if (r[0]) pCar = norm(r[0], VEHICLE_NORMALIZE);
    if (r[1]) pPart = norm(r[1], PART_NORMALIZE);
    if (r[4]) pSupplier = String(r[4]).trim();
    const color = r[2] ? String(r[2]).trim() : '';
    if (!color || JUNK.has(pCar)) continue;
    items.push({
      vehicle: pCar, part: pPart, color,
      code: r[3] ? String(r[3]).trim() : null,
      supplier: pSupplier || null,
      twoWidth: safeNum(r[5]), thickness: safeNum(r[6]),
      ratio: safeNum(r[7]), width: safeNum(r[8]), length: safeNum(r[9]),
    });
  }
  console.log(`파싱 완료: ${items.length}건`);

  // 2. Config Manager 코드 동기화
  console.log('\n=== 2. Config Manager 코드 동기화 ===');
  const tree = await getCodeTree();
  const vcNode = tree.find(t => t.value === 'VEHICLE_CODE');
  const pcNode = tree.find(t => t.value === 'PART_CODE');
  const ccNode = tree.find(t => t.value === 'COLOR_CODE');
  const vehicleMap = {}, partMap = {}, colorMap = {};
  vcNode.children.forEach(c => { vehicleMap[c.value] = c.name; });
  pcNode.children.forEach(c => { partMap[c.value] = c.name; });
  ccNode.children.forEach(c => { colorMap[c.value] = c.name; });

  const newV = new Set(), newP = new Set(), newC = new Set();
  for (const item of items) {
    if (item.vehicle && !vehicleMap[item.vehicle]) newV.add(item.vehicle);
    if (item.part && !partMap[item.part]) newP.add(item.part);
    if (item.color && !colorMap[item.color]) newC.add(item.color);
  }
  console.log(`누락 차종: ${newV.size}, 적용부: ${newP.size}, 색상: ${newC.size}`);
  await ensureCodes(vcNode.id, vehicleMap, newV);
  await ensureCodes(pcNode.id, partMap, newP);
  await ensureCodes(ccNode.id, colorMap, newC);

  // 3. 완제품 삭제 및 재입력
  console.log('\n=== 3. 완제품 재입력 ===');
  await pool.query("DELETE FROM master_finished_products");
  const fpSeen = new Set();
  const fpInsert = [];
  for (const item of items) {
    const key = `${item.vehicle}|${item.part}|${item.color}`;
    if (fpSeen.has(key)) continue;
    fpSeen.add(key);
    fpInsert.push([
      item.code,
      item.vehicle, vehicleMap[item.vehicle] || item.vehicle,
      item.part, partMap[item.part] || item.part,
      item.color, colorMap[item.color] || item.color,
      item.supplier,
      item.twoWidth, item.thickness, item.ratio, item.width, item.length,
      'reimport-script', 'reimport-script',
    ]);
  }
  if (fpInsert.length > 0) {
    const [result] = await pool.query(
      'INSERT INTO master_finished_products (code, vehicle_code, vehicle_name, part_code, part_name, color_code, color_name, supplier, two_width, thickness, ratio, width, `length`, created_by, updated_by) VALUES ?',
      [fpInsert]
    );
    console.log(`완제품 INSERT: ${result.affectedRows}건`);
  }

  // 4. 반제품 삭제 및 재입력 (표지 + 프라이머)
  console.log('\n=== 4. 반제품 재입력 (표지/프라이머) ===');
  await pool.query("DELETE FROM master_semi_products");
  const spSeen = new Set();
  const spInsert = [];
  for (const item of items) {
    // 표지
    const pyojiKey = `표지|${item.vehicle}|${item.part}|${item.color}`;
    if (!spSeen.has(pyojiKey)) {
      spSeen.add(pyojiKey);
      spInsert.push([
        '표지',
        item.vehicle, vehicleMap[item.vehicle] || item.vehicle,
        item.part, partMap[item.part] || item.part,
        item.color, colorMap[item.color] || item.color,
        item.supplier,
        item.thickness, item.width, item.ratio,
        'reimport-script', 'reimport-script',
      ]);
    }
    // 프라이머
    const primerKey = `프라이머|${item.vehicle}|${item.part}|${item.color}`;
    if (!spSeen.has(primerKey)) {
      spSeen.add(primerKey);
      spInsert.push([
        '프라이머',
        item.vehicle, vehicleMap[item.vehicle] || item.vehicle,
        item.part, partMap[item.part] || item.part,
        item.color, colorMap[item.color] || item.color,
        item.supplier,
        item.thickness, item.width, item.ratio,
        'reimport-script', 'reimport-script',
      ]);
    }
  }
  if (spInsert.length > 0) {
    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < spInsert.length; i += BATCH) {
      const [result] = await pool.query(
        'INSERT INTO master_semi_products (semi_type, vehicle_code, vehicle_name, part_code, part_name, color_code, color_name, supplier, thickness, width, ratio, created_by, updated_by) VALUES ?',
        [spInsert.slice(i, i + BATCH)]
      );
      inserted += result.affectedRows;
    }
    console.log(`반제품 INSERT: ${inserted}건`);
  }

  // 5. 원자재에 없는 항목 추가 (상지/하지)
  console.log('\n=== 5. 원자재 누락 항목 추가 ===');
  const [rmRows] = await pool.query("SELECT vehicle_code, part_code, color_code, kind_id FROM raw_materials WHERE deleted='N'");
  const rmKeys = new Set(rmRows.map(r => `${r.vehicle_code}|${r.part_code}|${r.color_code}`));

  const [typeRows] = await pool.query("SELECT id, name FROM material_types");
  const typeMap = {};
  typeRows.forEach(t => { typeMap[t.name] = t.id; });
  const sangjiId = typeMap['상지'] || 1;
  const hajiId = typeMap['하지'] || 2;

  const rmSeen = new Set();
  const rmInsert = [];
  for (const item of items) {
    const key = `${item.vehicle}|${item.part}|${item.color}`;
    if (rmKeys.has(key)) continue; // 이미 있음
    if (rmSeen.has(key)) continue;
    rmSeen.add(key);

    // 상지
    const sangjiName = [item.vehicle, item.part, item.color, '상지'].filter(Boolean).join(' ');
    rmInsert.push([
      sangjiId, item.code, sangjiName,
      item.color, item.vehicle, vehicleMap[item.vehicle] || item.vehicle,
      item.part, partMap[item.part] || item.part, item.color,
      item.thickness, item.width, null, null, null,
      'reimport-script', 'reimport-script',
    ]);
    // 하지
    const hajiName = [item.vehicle, item.part, item.color, '하지'].filter(Boolean).join(' ');
    rmInsert.push([
      hajiId, item.code, hajiName,
      item.color, item.vehicle, vehicleMap[item.vehicle] || item.vehicle,
      item.part, partMap[item.part] || item.part, item.color,
      item.thickness, item.width, null, null, null,
      'reimport-script', 'reimport-script',
    ]);
  }

  if (rmInsert.length > 0) {
    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < rmInsert.length; i += BATCH) {
      const [result] = await pool.query(
        'INSERT INTO raw_materials (kind_id, code, name, color, vehicle_code, vehicle_name, part_code, part_name, color_code, thickness, width, `length`, supplier_safety_stock, bnk_warehouse_safety_stock, created_by, updated_by) VALUES ?',
        [rmInsert.slice(i, i + BATCH)]
      );
      inserted += result.affectedRows;
    }
    console.log(`원자재 추가: ${inserted}건 (상지+하지)`);
  } else {
    console.log('추가할 원자재 없음 (모두 매칭됨)');
  }

  // 최종 확인
  console.log('\n=== 최종 결과 ===');
  const [[{fpT}]] = await pool.query("SELECT COUNT(*) as fpT FROM master_finished_products WHERE deleted='N'");
  const [[{spT}]] = await pool.query("SELECT COUNT(*) as spT FROM master_semi_products WHERE deleted='N'");
  const [[{rmT}]] = await pool.query("SELECT COUNT(*) as rmT FROM raw_materials WHERE deleted='N'");
  console.log(`완제품: ${fpT}건`);
  console.log(`반제품: ${spT}건`);
  const [spStats] = await pool.query("SELECT semi_type, COUNT(*) as cnt FROM master_semi_products WHERE deleted='N' GROUP BY semi_type");
  spStats.forEach(s => console.log(`  ${s.semi_type}: ${s.cnt}건`));
  console.log(`원자재: ${rmT}건`);
  const [rmStats] = await pool.query("SELECT mt.name, COUNT(*) as cnt FROM raw_materials rm JOIN material_types mt ON mt.id=rm.kind_id WHERE rm.deleted='N' GROUP BY mt.name");
  rmStats.forEach(s => console.log(`  ${s.name}: ${s.cnt}건`));

  process.exit(0);
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
