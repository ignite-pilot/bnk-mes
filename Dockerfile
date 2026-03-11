# BNK-MES: Node + Vite 빌드 후 단일 서버로 서빙
# 빌드: docker build -t bnk-mes .
# 실행: docker run -p 3000:3000 --env-file .env bnk-mes

# ---- 빌드 스테이지 ----
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY vite.config.js index.html ./
COPY src ./src
COPY server ./server

RUN npm run build

# ---- 프로덕션 스테이지 ----
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server

EXPOSE 3000

CMD ["node", "server/index.js"]
