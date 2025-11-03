import { defineConfig } from "electron-vite";
import electron from "vite-plugin-electron";
import path from "path";

export default defineConfig({
  plugins: [electron()],
  main: {
    entry: "src/main/index.js",
  },
  preload: {
    input: {
      index: path.join(__dirname, "src/preload/index.js"),
    },
  },
  resolve: {
    alias: {
      // Alias the package name to the direct path of its ES module file
      "tabulator-tables": path.resolve(
        __dirname,
        "node_modules/tabulator-tables/dist/js/tabulator_esm.min.js"
      ),
    },
  },
  renderer: {
    root: "src/renderer",
    build: {
      outDir: "dist/renderer",
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, "src/renderer/index.html"),
          graphs: path.resolve(__dirname, "src/renderer/graphs.html"),
          videoplayer: path.resolve(__dirname, "src/renderer/videoplayer.html"),
        },
        external: [],
      },
      commonjsOptions: { include: [/node_modules/] },
    },
  },
  optimizeDeps: { include: ["tabulator-tables"] },
  //   ssr: { noExternal: ["tabulator-tables"] },
});
