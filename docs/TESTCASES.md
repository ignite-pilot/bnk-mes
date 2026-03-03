# 테스트 항목 (Test Cases)

## 백엔드 (Server)

### Health API (`server/routes/health.test.js`)
| No | 항목 | 설명 |
|----|------|------|
| 1 | GET /api/health 200 및 status ok | Health Check API가 200을 반환하고 body에 status, service, timestamp 포함 |

### Member API (`server/routes/member.test.js`)
| No | 항목 | 설명 |
|----|------|------|
| 1 | POST /api/member/register 성공 | loginId, password 제공 시 201, token 및 user 반환 |
| 2 | POST /api/member/register - loginId 누락 | 400, required 메시지 |
| 3 | POST /api/member/register - 중복 loginId | 409 |
| 4 | POST /api/member/login - 잘못된 계정 | 401 |
| 5 | POST /api/member/login 성공 | 등록된 계정으로 로그인 시 200, token 반환 |
| 6 | POST /api/member/login - password 누락 | 400 |
| 7 | GET /api/member/me - 토큰 없음 | 401 |
| 8 | GET /api/member/me - 유효 토큰 | 200, user 정보 반환 |

## 프론트엔드 (Client)

### App (`src/App.test.jsx`)
| No | 항목 | 설명 |
|----|------|------|
| 1 | 홈(/) 렌더링 | 레이아웃 및 "BNK MES - 생산 관리 시스템" 헤딩, 안내 문구 표시 |
| 2 | /login | 로그인 페이지 헤딩 표시 |
| 3 | /register | 회원가입 페이지 헤딩 표시 |

### PlaceholderPage (`src/components/PlaceholderPage.test.jsx`)
| No | 항목 | 설명 |
|----|------|------|
| 1 | 제목 및 안내 문구 | 전달된 title과 "이 화면은 준비 중입니다." 표시 |

### AuthContext (`src/context/AuthContext.test.jsx`)
| No | 항목 | 설명 |
|----|------|------|
| 1 | 초기 상태 | 비로그인 시 isAuthenticated false, user none |
| 2 | 로그인 성공 | login 호출 후 fetch 호출, 성공 시 인증 상태 및 user 갱신 |

## 실행 방법

```bash
npm test
```

- 서버 테스트: Jest (`npm run test:server`)
- 클라이언트 테스트: Vitest (`npm run test:client`)
