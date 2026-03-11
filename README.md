# BNK MES - 생산 관리 시스템

BNS를 위한 생산 관리 시스템(MES)입니다.

## 요구 사항

- Node.js 18+
- (선택) MySQL - DB 연동 시 사용. DB 정보는 CommonWebDevGuide.md 및 AWS Secret Manager `prod/ignite-pilot/mysql-realpilot` 참고

## 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 모드 (FE: Vite 5173, BE: Express 3000)
npm run dev

# 프로덕션 빌드 후 서버만 실행
npm run build
npm start
```

개발 시 브라우저는 `http://localhost:5173` 로 접속하면 되며, API는 `http://localhost:3000`으로 프록시됩니다.

## 환경 변수

`.env.example`을 참고해 `.env`를 생성하세요.

- `PORT`: 서버 포트 (기본 3000)
- `LOG_LEVEL`: 로그 레벨 (기본 info)
- `CLOUDWATCH_LOG_GROUP`: 설정 시 해당 로그 그룹으로 로그 전송 (AWS 인증 필요)
- `DB_*`: MySQL 접속 정보 (추후 DB 연동 시 사용)

## CloudWatch 로그

서버 로그는 Winston으로 출력하며, **CloudWatch Logs**로 보내려면 `.env`에 다음을 설정하세요.

- `CLOUDWATCH_LOG_GROUP`: 로그 그룹 이름 (예: `/bnk-mes/app`)
- `CLOUDWATCH_REGION` 또는 `AWS_REGION`: 리전 (예: `ap-northeast-2`)
- (선택) `CLOUDWATCH_LOG_STREAM`: 로그 스트림 이름. 미설정 시 자동 생성

AWS 인증은 IAM 역할(EC2/ECS/Lambda 등) 또는 `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`로 합니다. 미설정 시 콘솔에만 출력됩니다.

## API

- **Health Check**: `GET /api/health` — 서비스 상태 확인
- **회원 (ig-member 연동)**  
  - `POST /api/member/login`  
  - `POST /api/member/register`  
  - `GET /api/member/me`  
  - `POST /api/member/logout`  

## 입고 요청 이메일 발송 (ig-notification)

입고 요청 등록 시 선택한 **원자재 공급 업체**의 **담당자 이메일**로 알림이 발송됩니다. [ig-notification](https://github.com/ignite-pilot/ig-notification) API (`POST /api/v1/email/send`, multipart/form-data)를 사용합니다.

- **SMTP 설정**: 기본적으로 **AWS Secrets Manager** 시크릿 `prod/ignite-pilot/smtp-naver` 값을 참고합니다. 시크릿 JSON 예: `sender_email`, `smtp_host`, `smtp_port`, `smtp_username`, `smtp_password` (또는 `from`, `host`, `port`, `user`, `password`). 환경 변수로 동일 키를 설정하면 env 값이 우선됩니다.
- **환경 변수** (선택): `.env`에서 오버라이드 가능 — `IG_NOTIFICATION_SENDER_EMAIL`, `IG_NOTIFICATION_SMTP_HOST`, `IG_NOTIFICATION_SMTP_PORT`, `IG_NOTIFICATION_SMTP_USERNAME`, `IG_NOTIFICATION_SMTP_PASSWORD`. 시크릿 미사용 시 `IG_NOTIFICATION_SMTP_SECRET_ID`를 비우거나, 로컬 테스트 시 env만 설정해도 됩니다.
- **이메일이 안 갈 때 확인할 것**
  1. **담당자 이메일**: 원자재 관리 → 원자재 공급 업체에 **담당자 이메일**이 있는지 확인하세요.
  2. **SMTP**: 로그에 `notification: skip send, SMTP not configured`면 AWS 시크릿 `prod/ignite-pilot/smtp-naver` 접근 권한 및 시크릿 내용, 또는 env 설정을 확인하세요. `notification: failed to load SMTP from Secrets Manager`면 IAM/권한 또는 시크릿 ID를 확인하세요.
  3. **발송 실패**: `notification: send failed` 시 ig-notification 서버·URL·SMTP 계정을 확인하세요.
- **API 응답**: 입고 요청 생성 시 `emailSent`, `emailSkipReason`(예: `no_manager_email`, `smtp_not_configured`, `api_4xx`, `network_error`)이 포함됩니다.

## 테스트

```bash
# 전체 테스트 (서버 + 클라이언트)
npm test

# 서버만
npm run test:server

# 클라이언트만
npm run test:client
```

## 린트

```bash
npm run lint
npm run lint:fix
```

## 프로젝트 초기 설정 (CommonWebDevGuide.md 기준)

### 1. GitHub 저장소 생성

아래 **한 가지**만 실행하면 됩니다.

- **방법 A (AWS CLI 설정된 경우)**  
  토큰 없이 실행하면 AWS Secret Manager `prod/ignite-pilot/github`에서 자동 조회합니다.
  ```bash
  npm run setup:github
  ```
- **방법 A-2 (토큰 직접 입력)**  
  토큰을 붙여넣기:
  ```bash
  ./scripts/create-github-repo.sh
  ```
  저장소 생성 및 `origin` 추가 후, 푸시:
  ```bash
  git add .
  git commit -m "Initial commit"
  git branch -M main
  git push -u origin main
  ```

- **방법 B (환경 변수로 토큰 지정)**  
  ```bash
  export GITHUB_TOKEN=<your-token>
  npm run setup:github
  git add . && git commit -m "Initial commit" && git branch -M main && git push -u origin main
  ```

- **방법 C (gh CLI)**  
  ```bash
  gh auth login
  gh repo create bnk-mes --private --source=. --remote=origin --push
  ```

### 2. MySQL DB 생성

AWS CLI가 설정되어 있으면 접속 정보 없이 실행 시 Secret Manager에서 자동 조회합니다.

```bash
npm run setup:mysql
```

(미설정 시 `.env`에 DB_HOST, DB_USER, DB_PASSWORD 등 설정 후 실행하거나, SQL 직접 실행: `mysql -h $DB_HOST -u $DB_USER -p < scripts/schema/01-init.sql`)

### 3. ig-member 연동 (화면 연동)

[ig-member](https://github.com/ignite-pilot/ig-member)와 **화면 연동**되어 있습니다. API 직접 호출 없이 ig-member 로그인/회원가입 화면으로 이동합니다.

- **연동 URL**: `https://ig-member.ig-pilot.com` (기본값, 변경 시 `.env`에 `MEMBER_UI_BASE_URL` 설정)
- **로그인**: 로그인 페이지에서 "ig-member로 로그인" 클릭 → ig-member 로그인 화면으로 이동 → 로그인 성공 시 bnk-mes `/auth/callback`으로 리다이렉트 후 토큰 저장
- **회원가입**: "ig-member로 회원가입" 클릭 → ig-member 회원가입 화면에서 가입
- **사용자 조회**: 토큰은 bnk-mes 백엔드에서 ig-member `GET /api/users/me`로 프록시
- ig-member 측 CORS에 bnk-mes 프론트 오리진(배포 도메인 또는 `http://localhost:5173`) 추가 필요

## 메뉴 구성

- **원자재 관리**: 원자재 정보, 공급 업체, 창고 정보, 재고, 입고/발주 관리
- **납품 관리**: 완성차/납품사/연계 업체/창고 정보, 완제품·반제품, 재고, 입고요청/납품
- **생산 관리**: 공장 정보, 3개월/1주 주문 계획, 일별·공정별 계획/실적, 원자재 사용, 품질
- **재고 관리**: 비엔케이 창고 정보, 완제품/반제품 재고

현재는 메뉴 클릭 시 빈 페이지(준비 중)가 연결되어 있으며, **회원 기능(로그인/회원가입/로그아웃)**만 구축되어 있습니다.

## 디자인

- Simple 디자인
- 상단: 대메뉴, 왼쪽: 상세 메뉴, 하단: Footer
