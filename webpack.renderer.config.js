import rules from "./webpack.rules.js";

/**
 * You can include an empty array or the standard rule for CSS here.
 * This is crucial for bundling Tabulator's CSS files.
 */
rules.push({
  test: /\.css$/,
  use: [
    {
      loader: "style-loader",
    },
    {
      loader: "css-loader",
    },
  ],
});

export default {
  // Renderer process is targeting the web environment
  target: "web",

  // Entry point is already defined in forge.config.js
  module: {
    rules: rules,
  },

  resolve: {
    // Allows importing files with these extensions without specifying them (e.g., 'src/options' instead of 'src/options.js')
    extensions: [".js", ".jsx", ".ts", ".tsx", ".json"],
  },
};
