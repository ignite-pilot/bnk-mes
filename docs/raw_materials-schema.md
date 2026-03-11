# 원자재 정보 DB 및 입력 조건 (원자재.md 기준)

## 필수/선택 항목 (원자재.md 14~16행)

| 구분 | 항목 | DB 컬럼 | 비고 |
|------|------|---------|------|
| **필수** | 원자재 종류 | `kind_id` (FK → material_types.id) | NOT NULL |
| **필수** | 원자재 이름 | `name` | NOT NULL |
| **필수** | 등록일자 | `created_at` | 서버 자동 (DEFAULT CURRENT_TIMESTAMP) |
| **필수** | 등록자 | `created_by` | API 등록 시 필수 검증 |
| **선택** | 색상 | `color` | NULL 허용 |
| **선택** | 두께 | `thickness` | NULL 허용 (단위: mm) |
| **선택** | 폭 | `width` | NULL 허용 (단위: mm) |
| **선택** | 길이 | `length` | NULL 허용 (단위: mm) |
| **선택** | 원자재 업체 안전재고 수량 | `supplier_safety_stock` | DEFAULT 0 |
| **선택** | 비엔케이 창고 안전재고 수량 | `bnk_warehouse_safety_stock` | DEFAULT 0 |
| **선택** | 수정일자 | `updated_at` | 서버 자동 (ON UPDATE) |
| **선택** | 수정자 | `updated_by` | 수정 시 선택 |

## raw_materials 테이블 (현재 스키마)

- `id` — PK
- `kind_id` — 원자재 종류 (material_types.id FK), **필수**
- `name` — 원자재 이름, **필수**, **UNIQUE** (중복 불가)
- `color`, `thickness`, `width`, `length` — **선택** (NULL 허용)
- `supplier_safety_stock`, `bnk_warehouse_safety_stock` — **선택** (DEFAULT 0)
- `created_at`, `updated_at` — 서버 자동
- `created_by` — **필수**(API 검증), `updated_by` — 선택
- `deleted` — 삭제 플래그 (N/Y)

## 입력 조건 체크

- **API POST /api/material**: `kind_id`, `name`, `createdBy` 필수; 나머지 선택. **원자재 이름 중복 시 409.**
- **API PATCH /api/material/:id**: 수정 시 이름이 다른 행과 중복이면 **409.**
- **화면**: 필수 항목에 (필수), 선택 항목에 (선택) 표기. 등록 시 로그인 필요(등록자 자동 기록).
