import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    /** npm run dev 는 Express(3000)에 Vite 미들웨어가 붙어 동일 포트 사용. 단독 실행 시에만 5173 + /api 프록시 */
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
