// webpack.renderer.config.js

export default {
  target: "web", // Renderer runs in a browser-like environment
  module: {
    rules: [
      // Handle CSS (Tabulator, other libraries)
      {
        test: /\.css$/i,
        use: ["style-loader", "css-loader"],
      },

      // Handle native .node modules (if any)
      {
        test: /\.node$/i,
        use: "node-loader",
      },

      // Optional: handle images/fonts if needed
      {
        test: /\.(png|jpe?g|gif|svg|woff2?|ttf|eot)$/i,
        type: "asset/resource",
      },
    ],
  },
  resolve: {
    alias: {
      // Ensure imports of tabulator-tables point to ESM version
      "tabulator-tables": "tabulator-tables/dist/js/tabulator_esm.js",
    },
    extensions: [".js", ".css"],
  },
};
