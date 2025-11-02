import { defineConfig } from "electron-vite";
import path from "path";

export default defineConfig({
  main: {
    entry: "src/main/index.js",
  },
  preload: {
    input: {
      index: path.join(__dirname, "src/preload/index.js"),
    },
  },
  renderer: {
    root: "src/renderer",
    build: {
      outDir: "../../dist/renderer",
    },
  },
});
