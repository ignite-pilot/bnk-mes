-- 표면처리 생산 실적 테이블
-- 엑셀 원본 컬럼: 생산일자, 업체, 구분, 차종, 칼라, 두께, 폭, 상지lot, 표지lot, 입고수량, 수량, 불량수량, 수율, 비고, 상태
CREATE TABLE IF NOT EXISTS production_surface (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  prod_date DATE NOT NULL,
  supplier VARCHAR(64) DEFAULT NULL,
  `div` VARCHAR(32) DEFAULT NULL,
  vehicle VARCHAR(64) DEFAULT NULL,
  color VARCHAR(32) DEFAULT NULL,
  thickness DECIMAL(8,3) DEFAULT NULL,
  width INT DEFAULT NULL,
  top_lot VARCHAR(64) DEFAULT NULL,
  cover_lot VARCHAR(64) DEFAULT NULL,
  in_qty INT DEFAULT NULL,
  out_qty INT DEFAULT NULL,
  defect_qty INT DEFAULT NULL,
  yield_rate DECIMAL(10,6) DEFAULT NULL,
  memo TEXT DEFAULT NULL,
  status VARCHAR(32) DEFAULT NULL,
  deleted CHAR(1) NOT NULL DEFAULT 'N',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by VARCHAR(64) DEFAULT NULL,
  updated_by VARCHAR(64) DEFAULT NULL,
  INDEX idx_prod_date (prod_date),
  INDEX idx_vehicle (vehicle),
  INDEX idx_color (color)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
