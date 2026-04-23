-- 월별 TPO 상세 (경주물류창고 일자별 주문/출고)
-- 기존 production_tpo_plan 과 별도 운영

CREATE TABLE IF NOT EXISTS tpo_monthly_header (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `year_month`     VARCHAR(7)   NOT NULL COMMENT 'YYYY-MM',
  vehicle        VARCHAR(100) DEFAULT NULL,
  supplier       VARCHAR(100) DEFAULT NULL,
  part_no        VARCHAR(200) DEFAULT NULL,
  spec           VARCHAR(200) DEFAULT NULL,
  material_code  VARCHAR(100) DEFAULT NULL,
  month_plan     INT          DEFAULT NULL COMMENT '월 계획(EA)',
  prev_stock     INT          DEFAULT NULL COMMENT '전월말 재고',
  month_sales    INT          DEFAULT NULL COMMENT '당월 판매',
  month_in_qty   INT          DEFAULT NULL COMMENT '당월 생산입고',
  current_stock  INT          DEFAULT NULL COMMENT '현재고',
  row_order      INT          DEFAULT 0,
  upload_batch   VARCHAR(40)  DEFAULT NULL,
  uploaded_by    VARCHAR(100) DEFAULT NULL,
  uploaded_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_ym           (`year_month`),
  INDEX idx_material     (material_code),
  INDEX idx_vehicle      (vehicle)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tpo_daily_entry (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  header_id   INT UNSIGNED NOT NULL,
  ship_date   DATE         NOT NULL,
  week_no     INT          DEFAULT NULL,
  order_qty   INT          DEFAULT NULL,
  ship_qty    INT          DEFAULT NULL,
  PRIMARY KEY (id),
  INDEX idx_header    (header_id),
  INDEX idx_date      (ship_date),
  CONSTRAINT fk_tpo_daily_header FOREIGN KEY (header_id) REFERENCES tpo_monthly_header(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tpo_weekly_summary (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  header_id      INT UNSIGNED NOT NULL,
  week_no        INT          NOT NULL,
  order_total    INT          DEFAULT NULL,
  ship_total     INT          DEFAULT NULL,
  unship_total   INT          DEFAULT NULL,
  PRIMARY KEY (id),
  INDEX idx_header_week (header_id, week_no),
  CONSTRAINT fk_tpo_weekly_header FOREIGN KEY (header_id) REFERENCES tpo_monthly_header(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
