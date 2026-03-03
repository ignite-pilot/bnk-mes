-- BNK MES 데이터베이스 초기화
-- AWS Secret Manager prod/ignite-pilot/mysql-realpilot 접속 정보로 실행

CREATE DATABASE IF NOT EXISTS bnk_mes
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE bnk_mes;

-- 추후 MES 테이블 추가 시 이 파일 또는 새 마이그레이션 파일에 작성
