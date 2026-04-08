/**
 * 원자재 전체 재임포트 스크립트
 * 1. 기존 원자재 데이터 전체 삭제
 * 2. 업체 컬럼 제거
 * 3. config manager에 없는 코드 자동 추가
 * 4. 현진엠아이 + 협성 + 통합재고 Excel에서 원자재 재입력
 *
 * 사용: node server/scripts/reimport-raw-materials.js
 */
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import { getPool, initDb } from '../lib/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_DIR = path.join(__dirname, '../../BNK_DOC');

const CONFIG_BASE = (process.env.CONFIG_MANAGER_URL || 'https://config-manager.ig-pilot.com').replace(/\/$/, '');
const CONFIG_APP_ID = 2; // BNK_MES

// ── 정규화 매핑 (확실한 것만) ──

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

const COLOR_NORMALIZE = {
  // 괄호 포함 색상은 신규로 등록 (불확실 → 새로 만듦)
};

// 쓰레기 데이터 필터
const JUNK_VALUES = new Set(['차종', '부위', '칼라', '색상', '합계', 'ff', '']);

// ── Config Manager 헬퍼 ──

async function getCodeTree() {
  const r = await fetch(`${CONFIG_BASE}/api/apps/${CONFIG_APP_ID}/codes/tree`, {
    headers: { 'Accept': 'application/json' },
  });
  const d = await r.json();
  return d.tree;
}

async function addCodeChild(parentId, value, name) {
  const r = await fetch(`${CONFIG_BASE}/api/apps/${CONFIG_APP_ID}/codes/tree`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parent_id: parentId, value, name, createdBy: 'reimport-script' }),
  });
  if (!r.ok) {
    const err = await r.text();
    console.error(`  ✗ 코드 추가 실패: ${value} → ${err}`);
    return null;
  }
  const d = await r.json();
  console.log(`  ✓ 코드 추가: ${value} (id: ${d.id || d.code?.id || '?'})`);
  return d;
}

async function ensureCode(parentId, codeMap, value) {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  if (codeMap[v]) return v; // 이미 있음
  // 추가
  await addCodeChild(parentId, v, v);
  codeMap[v] = v;
  return v;
}

// ── Excel 파싱 ──

function norm(val, map) {
  if (!val) return '';
  const v = String(val).trim();
  return map[v] || v;
}

function readHyunjin() {
  const fpath = path.join(DOC_DIR, '0_RE_ 안녕하세요. 이그나이트 조윤식입니다._260223 (1)/현진엠아이_KOLON TPO _재고 수량_260214 (1).xlsx');
  const wb = XLSX.readFile(fpath);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['재고수량'], { header: 1 }).slice(3);
  const items = [];
  for (const r of rows) {
    if (!r[1]) continue;
    const vehicle = norm(r[1], VEHICLE_NORMALIZE);
    const part = norm(r[2], PART_NORMALIZE);
    const color = norm(r[4], COLOR_NORMALIZE);
    if (JUNK_VALUES.has(vehicle) || JUNK_VALUES.has(part) || JUNK_VALUES.has(color)) continue;
    items.push({
      source: '현진',
      code: r[0] ? String(r[0]).trim() : null,
      vehicle,
      part,
      colorCode: String(r[3] || '').trim(),
      color,
      kind: String(r[5] || '').trim(),
      thickness: r[6] != null ? Number(r[6]) : null,
      width: r[7] != null ? Number(r[7]) : null,
    });
  }
  return items;
}

function readHyupsung() {
  const fpath = path.join(DOC_DIR, '0_RE_ 안녕하세요. 이그나이트 조윤식입니다._260223 (1)/협성 재고현황_20260212(비앤케이).xlsx');
  const wb = XLSX.readFile(fpath);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['협성 자재코드(공유)'], { header: 1 }).slice(3);
  const items = [];
  for (const r of rows) {
    if (!r[3]) continue;
    const vehicle = norm(r[3], VEHICLE_NORMALIZE);
    const part = norm(r[4], PART_NORMALIZE);
    const color = norm(r[5], COLOR_NORMALIZE);
    if (JUNK_VALUES.has(vehicle) || JUNK_VALUES.has(part) || JUNK_VALUES.has(color)) continue;
    items.push({
      source: '협성',
      code: r[0] ? String(r[0]).trim() : null,
      vehicle,
      part,
      colorCode: '',
      color,
      kind: String(r[2] || '').trim(),
      thickness: r[6] != null ? Number(r[6]) : null,
      width: r[7] != null ? Number(r[7]) : null,
    });
  }
  return items;
}

function readTonghap() {
  const fpath = path.join(DOC_DIR, '통합 재고 관리.xls');
  const wb = XLSX.readFile(fpath);

  const items = [];

  // 1-1. 상지 입고
  const sangji = XLSX.utils.sheet_to_json(wb.Sheets['1-1. 상지 입고'], { header: 1 }).slice(5);
  let pCar = '', pPart = '';
  for (const r of sangji) {
    if (r[1]) pCar = norm(r[1], VEHICLE_NORMALIZE);
    if (r[2]) pPart = norm(r[2], PART_NORMALIZE);
    const color = norm(r[3], COLOR_NORMALIZE);
    if (!color || JUNK_VALUES.has(pCar) || JUNK_VALUES.has(color)) continue;
    items.push({
      source: '통합',
      code: null,
      vehicle: pCar,
      part: pPart,
      colorCode: '',
      color,
      kind: '상지',
      thickness: r[5] != null ? Number(r[5]) : null,
      width: r[6] != null ? Number(r[6]) : null,
    });
  }

  // 3. 하지 입고
  const haji = XLSX.utils.sheet_to_json(wb.Sheets['3. 하지 입고'], { header: 1 }).slice(5);
  pCar = ''; pPart = '';
  for (const r of haji) {
    if (r[0]) pCar = norm(r[0], VEHICLE_NORMALIZE);
    if (r[1]) pPart = norm(r[1], PART_NORMALIZE);
    const color = norm(r[2], COLOR_NORMALIZE);
    if (!color || JUNK_VALUES.has(pCar) || JUNK_VALUES.has(color)) continue;
    items.push({
      source: '통합',
      code: r[3] ? String(r[3]).trim() : null,
      vehicle: pCar,
      part: pPart,
      colorCode: '',
      color,
      kind: '하지',
      thickness: r[5] != null ? Number(r[5]) : null,
      width: r[6] != null ? Number(r[6]) : null,
    });
  }

  return items;
}

// ── 메인 ──

async function main() {
  await initDb();
  const pool = getPool();

  // 1. 기존 원자재 전체 삭제 (hard delete)
  console.log('\n=== 1. 기존 원자재 데이터 삭제 ===');
  const [delResult] = await pool.query("DELETE FROM raw_materials");
  console.log(`삭제 완료: ${delResult.affectedRows}건`);

  // 2. 업체 컬럼 제거
  console.log('\n=== 2. supplier 컬럼 제거 ===');
  try {
    await pool.query("ALTER TABLE raw_materials DROP COLUMN supplier");
    console.log('supplier 컬럼 제거 완료');
  } catch (e) {
    if (e.message.includes("check that column/key exists")) {
      console.log('supplier 컬럼이 이미 없음 (skip)');
    } else {
      throw e;
    }
  }

  // 3. Config Manager 코드 확인 및 추가
  console.log('\n=== 3. Config Manager 코드 동기화 ===');
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

  // 4. Excel 데이터 읽기
  console.log('\n=== 4. Excel 데이터 읽기 ===');
  const hyunjin = readHyunjin();
  const hyupsung = readHyupsung();
  const tonghap = readTonghap();
  console.log(`현진: ${hyunjin.length}건, 협성: ${hyupsung.length}건, 통합: ${tonghap.length}건`);

  const allItems = [...hyunjin, ...hyupsung, ...tonghap];

  // 5. 코드 수집 및 config manager에 없는 코드 추가
  console.log('\n=== 5. 누락 코드 추가 ===');
  const newVehicles = new Set();
  const newParts = new Set();
  const newColors = new Set();

  for (const item of allItems) {
    if (item.vehicle && !vehicleMap[item.vehicle]) newVehicles.add(item.vehicle);
    if (item.part && !partMap[item.part]) newParts.add(item.part);
    if (item.color && !colorMap[item.color]) newColors.add(item.color);
  }

  console.log(`추가할 차종: ${newVehicles.size}, 적용부: ${newParts.size}, 색상: ${newColors.size}`);

  for (const v of newVehicles) {
    await ensureCode(vcNode.id, vehicleMap, v);
  }
  for (const p of newParts) {
    await ensureCode(pcNode.id, partMap, p);
  }
  for (const c of newColors) {
    await ensureCode(ccNode.id, colorMap, c);
  }

  // 6. material_types 맵
  const [typeRows] = await pool.query("SELECT id, name FROM material_types");
  const typeMap = {};
  typeRows.forEach(t => { typeMap[t.name] = t.id; });
  console.log('\n원자재 종류:', JSON.stringify(typeMap));

  // kind → kind_id 매핑 (상지/하지/프라이머 등)
  function resolveKindId(kind) {
    if (!kind) return typeMap['상지'] || 1;
    const k = kind.trim();
    // "B 상지" → "상지", "B 하지" → "하지" 등
    if (k.includes('상지')) return typeMap['상지'] || 1;
    if (k.includes('하지')) return typeMap['하지'] || 2;
    if (k.includes('프라이머')) return typeMap['프라이머'] || 3;
    if (k.includes('Foam') || k.includes('폼')) return typeMap['Foam'] || typeMap['폼'] || 5;
    return typeMap['상지'] || 1;
  }

  // 7. 중복 제거 (차종+적용부+색상+종류+두께+폭 기준)
  console.log('\n=== 6. 중복 제거 및 INSERT ===');
  const seen = new Set();
  const insertRows = [];

  for (const item of allItems) {
    const kindId = resolveKindId(item.kind);
    const key = `${item.vehicle}|${item.part}|${item.color}|${kindId}|${item.thickness}|${item.width}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // name 생성: 차종 적용부 색상 종류
    const kindName = item.kind || '상지';
    const name = [item.vehicle, item.part, item.color, kindName].filter(Boolean).join(' ');

    const safeNum = (v) => (v != null && !Number.isNaN(v) && isFinite(v)) ? v : null;

    insertRows.push([
      kindId,
      item.code || null,
      name,
      item.color || null,
      item.vehicle || null,
      vehicleMap[item.vehicle] || item.vehicle || null,
      item.part || null,
      partMap[item.part] || item.part || null,
      item.color || null,
      safeNum(item.thickness),
      safeNum(item.width),
      null,
      null,
      null,
      'reimport-script',
      'reimport-script',
    ]);
  }

  console.log(`중복제거 후 INSERT할 건수: ${insertRows.length}`);

  if (insertRows.length > 0) {
    // 배치 INSERT (500건씩)
    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < insertRows.length; i += BATCH) {
      const batch = insertRows.slice(i, i + BATCH);
      const [result] = await pool.query(
        `INSERT INTO raw_materials (kind_id, code, name, color, vehicle_code, vehicle_name, part_code, part_name, color_code, thickness, width, \`length\`, supplier_safety_stock, bnk_warehouse_safety_stock, created_by, updated_by) VALUES ?`,
        [batch]
      );
      inserted += result.affectedRows;
    }
    console.log(`INSERT 완료: ${inserted}건`);
  }

  // 최종 확인
  const [[{ total }]] = await pool.query("SELECT COUNT(*) as total FROM raw_materials WHERE deleted = 'N'");
  const [kindStats] = await pool.query("SELECT mt.name, COUNT(*) as cnt FROM raw_materials rm JOIN material_types mt ON mt.id = rm.kind_id WHERE rm.deleted = 'N' GROUP BY mt.name");
  console.log(`\n=== 최종 결과: ${total}건 ===`);
  kindStats.forEach(s => console.log(`  ${s.name}: ${s.cnt}건`));

  process.exit(0);
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
