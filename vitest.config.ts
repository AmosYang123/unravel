import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ["react", "react-dom"], alias: { "@/theme": path.resolve(__dirname, "mobile/theme"), "@": path.resolve(__dirname, "src") } },
  test: { environment: "jsdom", include: ["tests/**/*.test.{ts,tsx}"], restoreMocks: true },
});
