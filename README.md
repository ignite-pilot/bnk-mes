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
- `MEMBER_API_BASE_URL`: ig-member 회원 API URL. 미설정 시 개발용 로컬 인증(메모리) 사용
- `DB_*`: MySQL 접속 정보 (추후 DB 연동 시 사용)

## API

- **Health Check**: `GET /api/health` — 서비스 상태 확인
- **회원 (ig-member 연동)**  
  - `POST /api/member/login`  
  - `POST /api/member/register`  
  - `GET /api/member/me`  
  - `POST /api/member/logout`  

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

- **방법 A (토큰 입력으로 한 번에)**  
  터미널에서 실행 후, AWS Secret Manager `prod/ignite-pilot/github`에서 확인한 토큰을 붙여넣기:
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

AWS Secret Manager `prod/ignite-pilot/mysql-realpilot`에서 접속 정보를 확인한 뒤 `.env`에 설정하고:

```bash
# .env 예: DB_HOST=xxx DB_USER=xxx DB_PASSWORD=xxx
npm run setup:mysql
```

또는 SQL 직접 실행:

```bash
mysql -h $DB_HOST -u $DB_USER -p < scripts/schema/01-init.sql
```

### 3. ig-member 연동

- ig-member 서비스를 기동한 URL을 `.env`에 설정:
  ```env
  MEMBER_API_BASE_URL=http://localhost:8080
  ```
- 인증 경로가 `/api/auth`가 아니면:
  ```env
  MEMBER_AUTH_PATH_PREFIX=/api/auth
  ```
- 연동 시 로그인/회원가입/로그아웃은 ig-member API를 호출하며, 응답 형식(accessToken/token, user 등)은 자동 정규화됩니다.
- `GET /api/health` 응답에 `member.available`로 ig-member 연결 여부를 확인할 수 있습니다.

## 메뉴 구성

- **원자재 관리**: 원자재 정보, 공급 업체, 창고 정보, 재고, 입고/발주 관리
- **납품 관리**: 완성차/납품사/연계 업체/창고 정보, 완제품·반제품, 재고, 입고요청/납품
- **생산 관리**: 공장 정보, 3개월/1주 주문 계획, 일별·공정별 계획/실적, 원자재 사용, 품질
- **재고 관리**: 비엔케이 창고 정보, 완제품/반제품 재고

현재는 메뉴 클릭 시 빈 페이지(준비 중)가 연결되어 있으며, **회원 기능(로그인/회원가입/로그아웃)**만 구축되어 있습니다.

## 디자인

- Simple 디자인
- 상단: 대메뉴, 왼쪽: 상세 메뉴, 하단: Footer
