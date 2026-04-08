/**
 * 완제품/반제품 전체 재임포트 스크립트
 * 1. 기존 완제품/반제품 데이터 전체 삭제
 * 2. config manager에 없는 코드 자동 추가
 * 3. bnk완제품.xlsx / bnk반제품.xlsx 에서 재입력
 *
 * 사용: node server/scripts/reimport-products.js
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

// ── 정규화 매핑 (원자재와 동일) ──

const VEHICLE_NORMALIZE = {
  'ME1a': 'ME1A',
  'CN7 PE': 'CN7PE',
  'RG3 PE': 'RG3PE',
  'NX4 PE': 'NX4PE',
  'LX2 PE\n변경분': 'LX2 PE 변경분',
  'SX2\n사이즈변경분': 'SX2 사이즈변경분',
};

const PART_NORMALIZE = {
  'Main': 'MAIN',
  'Main FRT': 'MAIN FRT',
  'Main RR': 'MAIN RR',
  'Main/FRT': 'MAIN FRT',
  'Main/RR': 'MAIN RR',
  'A/Rest': 'A/REST',
  'A/Rest FRT': 'A/REST FRT',
  'A/Rest RR': 'A/REST RR',
  'A/Rest UPR FRT': 'A/REST UPR FRT',
  'A/REST/FRT': 'A/REST FRT',
  'A/REST FRT(4CVT)\n규격 변경 예정.우선': 'A/REST FRT(4CVT)',
  'A/REST UPR FRT\n규격 변경.다음': 'A/REST UPR FRT',
  'A/REST RR (4CVT)\n기존사양': 'A/REST RR (4CVT) 기존사양',
  'A/REST RR (4CVT)\n변경사양': 'A/REST RR (4CVT) 변경사양',
  'A/REST UPR RR (4CVT)\n기존사양': 'A/REST UPR RR (4CVT) 기존사양',
  'A/REST UPR RR (4CVT)\n변경사양': 'A/REST UPR RR (4CVT) 변경사양',
  'CTR/FRT': 'CTR FRT',
  'CTR/RR': 'CTR RR',
  'UPR/FRT': 'UPR FRT',
  'UPR/RR': 'UPR RR',
  'UPR F': 'UPR FRT',
  'UPR R': 'UPR RR',
  'UPR  4CVT': 'UPR 4CVT',
  'UPR  FRT': 'UPR FRT',
  'UPR  RR': 'UPR RR',
  'UPR GARNISH\n(리얼스티치 4CVT)': 'UPR GARNISH (리얼스티치 4CVT)',
  'UPR GARNISH\n(페이크 4CVT)': 'UPR GARNISH (페이크 4CVT)',
  'H/INR': 'H/INNER',
};

const JUNK_VALUES = new Set(['차종', '차량코드', '부위', '차량부위', '칼라', '색상', '합계', 'ff', '']);

function norm(val, map) {
  if (!val) return '';
  const v = String(val).trim();
  return map[v] || v;
}

function safeNum(v) {
  if (v == null) return null;
  const n = Number(v);
  return (!Number.isNaN(n) && isFinite(n)) ? n : null;
}

// ── Config Manager 헬퍼 ──

async function getCodeTree() {
  const r = await fetch(`${CONFIG_BASE}/api/apps/${CONFIG_APP_ID}/codes/tree`, {
    headers: { 'Accept': 'application/json' },
  });
  return (await r.json()).tree;
}

async function addCodeChild(parentId, value) {
  const r = await fetch(`${CONFIG_BASE}/api/apps/${CONFIG_APP_ID}/codes/tree`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parent_id: parentId, value, name: value, createdBy: 'reimport-script' }),
  });
  if (!r.ok) {
    console.error(`  ✗ 코드 추가 실패: ${value}`);
    return;
  }
  const d = await r.json();
  console.log(`  ✓ 코드 추가: ${value} (id: ${d.id || '?'})`);
}

async function ensureCodes(parentId, codeMap, values) {
  for (const v of values) {
    if (v && !codeMap[v]) {
      await addCodeChild(parentId, v);
      codeMap[v] = v;
    }
  }
}

// ── 메인 ──

async function main() {
  await initDb();
  const pool = getPool();

  // 1. 기존 데이터 삭제
  console.log('\n=== 1. 기존 데이터 삭제 ===');
  const [fpDel] = await pool.query("DELETE FROM master_finished_products");
  const [spDel] = await pool.query("DELETE FROM master_semi_products");
  console.log(`완제품 ${fpDel.affectedRows}건, 반제품 ${spDel.affectedRows}건 삭제`);

  // 2. Config Manager 코드 동기화
  console.log('\n=== 2. Config Manager 코드 동기화 ===');
  const tree = await getCodeTree();
  const vcNode = tree.find(t => t.value === 'VEHICLE_CODE');
  const pcNode = tree.find(t => t.value === 'PART_CODE');
  const ccNode = tree.find(t => t.value === 'COLOR_CODE');

  const vehicleMap = {};
  vcNode.children.forEach(c => { vehicleMap[c.value] = c.name; });
  const partMap = {};
  pcNode.children.forEach(c => { partMap[c.value] = c.name; });
  const colorMap = {};
  ccNode.children.forEach(c => { colorMap[c.value] = c.name; });

  console.log(`현재 차종: ${Object.keys(vehicleMap).length}, 적용부: ${Object.keys(partMap).length}, 색상: ${Object.keys(colorMap).length}`);

  // 3. 완제품 Excel 읽기
  console.log('\n=== 3. 완제품 Excel 읽기 ===');
  const fpWb = XLSX.readFile(path.join(DOC_DIR, 'bnk 완제품.xlsx'));
  const fpRows = XLSX.utils.sheet_to_json(fpWb.Sheets['6-1. 완제품 재단'], { header: 1 }).slice(1);

  const fpItems = [];
  const newV = new Set(), newP = new Set(), newC = new Set();

  for (const r of fpRows) {
    const vehicle = norm(r[0], VEHICLE_NORMALIZE);
    const part = norm(r[1], PART_NORMALIZE);
    const color = String(r[2] || '').trim();
    if (JUNK_VALUES.has(vehicle) || JUNK_VALUES.has(part) || !color) continue;

    if (!vehicleMap[vehicle]) newV.add(vehicle);
    if (!partMap[part]) newP.add(part);
    if (!colorMap[color]) newC.add(color);

    fpItems.push({
      vehicle, part, color,
      supplier: r[3] ? String(r[3]).trim() : null,
      twoWidth: safeNum(r[4]),
      thickness: safeNum(r[5]),
      ratio: safeNum(r[6]),
      width: safeNum(r[7]),
      length: safeNum(r[8]),
    });
  }
  console.log(`완제품 데이터: ${fpItems.length}건`);

  // 4. 반제품 Excel 읽기
  console.log('\n=== 4. 반제품 Excel 읽기 ===');
  const spWb = XLSX.readFile(path.join(DOC_DIR, 'bnk반제품.xlsx'));
  const spItems = [];

  // 표지 (시트: 2. 표지 입고)
  const pyoji = XLSX.utils.sheet_to_json(spWb.Sheets['2. 표지 입고(구미 코오롱입고)'], { header: 1 }).slice(1);
  for (const r of pyoji) {
    const vehicle = norm(r[0], VEHICLE_NORMALIZE);
    const part = norm(r[1], PART_NORMALIZE);
    const color = String(r[2] || '').trim();
    if (JUNK_VALUES.has(vehicle) || JUNK_VALUES.has(part) || !color) continue;
    if (!vehicleMap[vehicle]) newV.add(vehicle);
    if (!partMap[part]) newP.add(part);
    if (!colorMap[color]) newC.add(color);
    spItems.push({
      semiType: '표지',
      vehicle, part, color,
      supplier: r[4] ? String(r[4]).trim() : null,
      thickness: safeNum(r[5]),
      width: safeNum(r[6]),
      ratio: null,
    });
  }

  // 하지 (시트: 3. 하지 입고)
  const haji = XLSX.utils.sheet_to_json(spWb.Sheets['3. 하지 입고'], { header: 1 }).slice(1);
  for (const r of haji) {
    const vehicle = norm(r[0], VEHICLE_NORMALIZE);
    const part = norm(r[1], PART_NORMALIZE);
    const color = String(r[2] || '').trim();
    if (JUNK_VALUES.has(vehicle) || JUNK_VALUES.has(part) || !color) continue;
    if (!vehicleMap[vehicle]) newV.add(vehicle);
    if (!partMap[part]) newP.add(part);
    if (!colorMap[color]) newC.add(color);
    spItems.push({
      semiType: '하지',
      vehicle, part, color,
      supplier: r[4] ? String(r[4]).trim() : null,
      thickness: safeNum(r[5]),
      width: safeNum(r[6]),
      ratio: null,
    });
  }

  // 폼 (시트: 5-1. 폼 입고) - 칼라|차종|부위|업체|사양|두께|배율|폭
  const foam = XLSX.utils.sheet_to_json(spWb.Sheets['5-1. 폼 입고'], { header: 1 }).slice(1);
  for (const r of foam) {
    const vehicle = norm(r[1], VEHICLE_NORMALIZE);
    const part = norm(r[2], PART_NORMALIZE);
    const color = String(r[0] || '').trim();
    if (JUNK_VALUES.has(vehicle) || JUNK_VALUES.has(part) || !color) continue;
    if (!vehicleMap[vehicle]) newV.add(vehicle);
    if (!partMap[part]) newP.add(part);
    if (!colorMap[color]) newC.add(color);
    spItems.push({
      semiType: '폼',
      vehicle, part, color,
      supplier: r[3] ? String(r[3]).trim() : null,
      thickness: safeNum(r[5]),
      width: safeNum(r[7]),
      ratio: safeNum(r[6]),
    });
  }

  // 폼 프라이머 (시트: 5-2. 폼 프라이머 작업) - null|차종|부위|업체|사양|두께|배율|폭
  // 칼라 정보가 없으므로 폼 입고 기준으로 매칭하거나 색상 없이 입력
  const primer = XLSX.utils.sheet_to_json(spWb.Sheets['5-2. 폼 프라이머 작업'], { header: 1 }).slice(1);
  for (const r of primer) {
    const vehicle = norm(r[1], VEHICLE_NORMALIZE);
    const part = norm(r[2], PART_NORMALIZE);
    if (JUNK_VALUES.has(vehicle) || JUNK_VALUES.has(part)) continue;
    if (!vehicle) continue;
    if (!vehicleMap[vehicle]) newV.add(vehicle);
    if (!partMap[part]) newP.add(part);
    spItems.push({
      semiType: '프라이머',
      vehicle, part, color: '',
      supplier: r[3] ? String(r[3]).trim() : null,
      thickness: safeNum(r[5]),
      width: safeNum(r[7]),
      ratio: safeNum(r[6]),
    });
  }

  console.log(`반제품 데이터: 표지 ${pyoji.length}, 하지 ${haji.length}, 폼 ${foam.length}, 프라이머 ${primer.length} → 총 ${spItems.length}건`);

  // 5. 누락 코드 추가
  console.log('\n=== 5. 누락 코드 추가 ===');
  console.log(`차종: ${newV.size}, 적용부: ${newP.size}, 색상: ${newC.size}`);
  await ensureCodes(vcNode.id, vehicleMap, newV);
  await ensureCodes(pcNode.id, partMap, newP);
  await ensureCodes(ccNode.id, colorMap, newC);

  // 6. 완제품 INSERT (중복 제거)
  console.log('\n=== 6. 완제품 INSERT ===');
  const fpSeen = new Set();
  const fpInsert = [];
  for (const item of fpItems) {
    const key = `${item.vehicle}|${item.part}|${item.color}`;
    if (fpSeen.has(key)) continue;
    fpSeen.add(key);
    fpInsert.push([
      null, // code
      item.vehicle, vehicleMap[item.vehicle] || item.vehicle,
      item.part, partMap[item.part] || item.part,
      item.color, colorMap[item.color] || item.color,
      item.supplier,
      item.twoWidth, item.thickness, item.ratio, item.width, item.length,
      'reimport-script', 'reimport-script',
    ]);
  }
  console.log(`중복제거 후: ${fpInsert.length}건`);

  if (fpInsert.length > 0) {
    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < fpInsert.length; i += BATCH) {
      const batch = fpInsert.slice(i, i + BATCH);
      const [result] = await pool.query(
        'INSERT INTO master_finished_products (code, vehicle_code, vehicle_name, part_code, part_name, color_code, color_name, supplier, two_width, thickness, ratio, width, `length`, created_by, updated_by) VALUES ?',
        [batch]
      );
      inserted += result.affectedRows;
    }
    console.log(`완제품 INSERT 완료: ${inserted}건`);
  }

  // 7. 반제품 INSERT (중복 제거)
  console.log('\n=== 7. 반제품 INSERT ===');
  const spSeen = new Set();
  const spInsert = [];
  for (const item of spItems) {
    const key = `${item.semiType}|${item.vehicle}|${item.part}|${item.color}|${item.thickness}|${item.width}`;
    if (spSeen.has(key)) continue;
    spSeen.add(key);
    spInsert.push([
      item.semiType,
      item.vehicle, vehicleMap[item.vehicle] || item.vehicle,
      item.part, partMap[item.part] || item.part,
      item.color || null, item.color ? (colorMap[item.color] || item.color) : null,
      item.supplier,
      item.thickness, item.width, item.ratio,
      'reimport-script', 'reimport-script',
    ]);
  }
  console.log(`중복제거 후: ${spInsert.length}건`);

  if (spInsert.length > 0) {
    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < spInsert.length; i += BATCH) {
      const batch = spInsert.slice(i, i + BATCH);
      const [result] = await pool.query(
        'INSERT INTO master_semi_products (semi_type, vehicle_code, vehicle_name, part_code, part_name, color_code, color_name, supplier, thickness, width, ratio, created_by, updated_by) VALUES ?',
        [batch]
      );
      inserted += result.affectedRows;
    }
    console.log(`반제품 INSERT 완료: ${inserted}건`);
  }

  // 최종 확인
  const [[{fpTotal}]] = await pool.query("SELECT COUNT(*) as fpTotal FROM master_finished_products WHERE deleted='N'");
  const [[{spTotal}]] = await pool.query("SELECT COUNT(*) as spTotal FROM master_semi_products WHERE deleted='N'");
  console.log(`\n=== 최종 결과 ===`);
  console.log(`완제품: ${fpTotal}건`);
  console.log(`반제품: ${spTotal}건`);

  const [spStats] = await pool.query("SELECT semi_type, COUNT(*) as cnt FROM master_semi_products WHERE deleted='N' GROUP BY semi_type ORDER BY cnt DESC");
  spStats.forEach(s => console.log(`  ${s.semi_type}: ${s.cnt}건`));

  process.exit(0);
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
