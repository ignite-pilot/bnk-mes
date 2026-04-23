-- 하지(raw_materials) → master_semi_products 마이그레이션
-- 1. raw_materials에서 kind='하지'인 활성 레코드를 master_semi_products로 복사
-- 2. raw_materials 쪽은 soft delete 처리
-- 한 번만 실행되도록 트랜잭션으로 묶음

START TRANSACTION;

-- 이미 마이그레이션된 경우 재실행 방지 (master_semi_products에 '하지' 존재 시 abort)
SELECT COUNT(*) INTO @already
  FROM master_semi_products
  WHERE semi_type = '하지' AND deleted = 'N';

-- 마이그레이션 대상 개수 확인
SELECT COUNT(*) INTO @src_cnt
  FROM raw_materials rm
  JOIN material_types mt ON mt.id = rm.kind_id
  WHERE mt.name = '하지' AND rm.deleted = 'N';

INSERT INTO master_semi_products
  (semi_type, vehicle_code, vehicle_name, part_code, part_name,
   color_code, color_name, supplier, thickness, width, ratio,
   safety_stock, production_time, created_by, updated_by, deleted)
SELECT
  '하지' AS semi_type,
  rm.vehicle_code,
  rm.vehicle_name,
  rm.part_code,
  rm.part_name,
  rm.color_code,
  rm.color AS color_name,
  NULL AS supplier,
  rm.thickness,
  rm.width,
  NULL AS ratio,
  COALESCE(rm.bnk_warehouse_safety_stock, rm.supplier_safety_stock) AS safety_stock,
  NULL AS production_time,
  COALESCE(rm.created_by, 'migration-haji-to-semi') AS created_by,
  'migration-haji-to-semi' AS updated_by,
  'N' AS deleted
FROM raw_materials rm
JOIN material_types mt ON mt.id = rm.kind_id
WHERE mt.name = '하지' AND rm.deleted = 'N' AND @already = 0;

-- raw_materials 쪽은 soft delete
UPDATE raw_materials rm
JOIN material_types mt ON mt.id = rm.kind_id
SET rm.deleted = 'Y',
    rm.updated_by = 'migration-haji-to-semi'
WHERE mt.name = '하지' AND rm.deleted = 'N' AND @already = 0;

SELECT @already AS already_migrated_count,
       @src_cnt AS source_count,
       (SELECT COUNT(*) FROM master_semi_products WHERE semi_type='하지' AND deleted='N') AS semi_haji_after;

COMMIT;
