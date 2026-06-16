import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  // Em desenvolvimento (preview Lovable) servimos na raiz "/".
  // Em produção o destino final é https://atendenteai.com.br/consultor/,
  // então usamos "/consultor/" por padrão no build. Pode ser sobrescrito
  // com a variável de ambiente VITE_BASE se precisar publicar em outro caminho.
  base: process.env.VITE_BASE ?? (mode === "production" ? "/consultor/" : "/"),
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
