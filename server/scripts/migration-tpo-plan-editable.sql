-- 코오롱 주문 계획 관리: 일자별 요청 수량 편집/메모 지원
ALTER TABLE production_tpo_plan_daily
  ADD COLUMN original_qty DECIMAL(12,2) DEFAULT NULL AFTER request_qty,
  ADD COLUMN memo         VARCHAR(500)  DEFAULT NULL AFTER original_qty,
  ADD COLUMN updated_at   DATETIME      DEFAULT NULL,
  ADD COLUMN updated_by   VARCHAR(100)  DEFAULT NULL,
  ADD UNIQUE KEY uk_header_date (header_id, plan_date);

-- 기존 데이터: 원본 수량을 현재 수량으로 백필 (모두 엑셀 원본 상태로 간주)
UPDATE production_tpo_plan_daily SET original_qty = request_qty WHERE original_qty IS NULL;

-- 변경 이력 테이블
CREATE TABLE IF NOT EXISTS production_tpo_plan_daily_history (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  daily_id     INT          DEFAULT NULL COMMENT '편집 대상 daily row (신규 행일 경우 NULL)',
  header_id    INT          NOT NULL,
  plan_month   VARCHAR(7)   NOT NULL,
  plan_date    DATE         NOT NULL,
  prev_qty     DECIMAL(12,2) DEFAULT NULL,
  new_qty      DECIMAL(12,2) DEFAULT NULL,
  prev_memo    VARCHAR(500) DEFAULT NULL,
  new_memo     VARCHAR(500) DEFAULT NULL,
  action       VARCHAR(20)  NOT NULL COMMENT 'create|update|delete',
  changed_by   VARCHAR(100) DEFAULT NULL,
  changed_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_month (plan_month),
  INDEX idx_header_date (header_id, plan_date),
  INDEX idx_changed_at (changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
