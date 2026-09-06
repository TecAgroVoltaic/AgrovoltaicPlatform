// Pruebas unitarias y de componente. Convive con `npm run verificar`, que es
// otra cosa: aquel renderiza las vistas de la consola con react-dom/server para
// afirmar propiedades del HTML; este prueba lógica y componentes en jsdom.
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": rootDir } },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./vitest.setup.ts"],
    include: ["app/**/*.test.ts", "app/**/*.test.tsx"],
  },
});
