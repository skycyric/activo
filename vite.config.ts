import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import { viteSingleFile } from "vite-plugin-singlefile";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    // v2.3.2 still writes deprecated inlineDynamicImports in its recommended config,
    // so we opt out and provide equivalent modern build config ourselves.
    viteSingleFile({ useRecommendedBuildConfig: false }),
  ],
  base: "./",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    assetsDir: "",
    chunkSizeWarningLimit: 100_000_000,
    rollupOptions: {
      output: {
        codeSplitting: false,
      },
    },
  },
});
