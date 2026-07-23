import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // 상대 경로로 빌드해 GitHub Pages의 하위 경로(/저장소이름/)에서도 동작하게 합니다.
  base: "./",
  plugins: [react()],
  server: {
    port: 4173,
    proxy: {
      "/api": "http://localhost:4174",
      "/s": "http://localhost:4174",
    },
  },
});
