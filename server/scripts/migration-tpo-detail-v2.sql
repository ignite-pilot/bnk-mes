-- 월별 TPO 상세 v2: 1~3월 포맷 기준 스키마 확장
-- 실행 전 8~12월 데이터는 화면에서 삭제 권장 (DELETE FROM tpo_monthly_header WHERE `year_month` IN ('2025-08',...))

-- 1) 기존 컬럼 month_plan 제거 (실제 엑셀에 해당 값 없음)
ALTER TABLE tpo_monthly_header DROP COLUMN month_plan;

-- 2) 신규 컬럼 추가
ALTER TABLE tpo_monthly_header
  ADD COLUMN cumulative_in         INT DEFAULT NULL COMMENT 'I 입고누계'                AFTER month_in_qty,
  ADD COLUMN month_order_total     INT DEFAULT NULL COMMENT 'BT 월 주문 합계'           AFTER current_stock,
  ADD COLUMN month_ship_total      INT DEFAULT NULL COMMENT 'BS 월 출고 합계'           AFTER month_order_total,
  ADD COLUMN month_unship_total    INT DEFAULT NULL COMMENT 'BU 월 미출고 합계'         AFTER month_ship_total,
  ADD COLUMN remaining             DECIMAL(12,2) DEFAULT NULL COMMENT 'BY 잔량'         AFTER month_unship_total,
  ADD COLUMN forecast_end_stock    DECIMAL(12,2) DEFAULT NULL COMMENT 'BZ 월말예상재고'  AFTER remaining,
  ADD COLUMN month_end_stock_ib    INT DEFAULT NULL COMMENT 'CW 입고실적 섹션 전월말재고' AFTER forecast_end_stock,
  ADD COLUMN current_stock_ib      INT DEFAULT NULL COMMENT 'CX 입고실적 섹션 현재고'    AFTER month_end_stock_ib,
  ADD COLUMN remaining_ib          DECIMAL(12,2) DEFAULT NULL COMMENT 'CZ 입고실적 섹션 잔량' AFTER current_stock_ib;

-- 3) 입고실적(전월 주별 계획/실적/달성율) 테이블
CREATE TABLE IF NOT EXISTS tpo_weekly_performance (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  header_id        INT UNSIGNED NOT NULL,
  week_no          INT          NOT NULL COMMENT '전월 주차(1~5)',
  plan_qty         INT          DEFAULT NULL,
  actual_qty       INT          DEFAULT NULL,
  achievement_rate DECIMAL(6,4) DEFAULT NULL COMMENT '달성율(비율 저장, 0.0 ~ 1.x)',
  PRIMARY KEY (id),
  INDEX idx_header_week (header_id, week_no),
  CONSTRAINT fk_tpo_perf_header FOREIGN KEY (header_id) REFERENCES tpo_monthly_header(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4) 당월 주별 입고실적(CP~CU) 테이블
CREATE TABLE IF NOT EXISTS tpo_weekly_inbound (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  header_id    INT UNSIGNED NOT NULL,
  week_no      INT          NOT NULL COMMENT '당월 주차(1~5) / 0=합계',
  inbound_qty  INT          DEFAULT NULL,
  PRIMARY KEY (id),
  INDEX idx_header_week (header_id, week_no),
  CONSTRAINT fk_tpo_inb_header FOREIGN KEY (header_id) REFERENCES tpo_monthly_header(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
