module.exports = {
  /**
   * Main process needs to be compiled to run in a Node environment.
   */
  target: "electron-main",

  /**
   * The entry point is defined in forge.config.js.
   * By default, it uses 'src/index.js' (or .ts/.ts).
   */
  entry: "./src/index.js",

  /**
   * Put your main process modules and loaders here (if needed).
   */
  module: {
    rules: require("./webpack.rules"),
  },

  // Add more configurations as needed (e.g., resolve aliases)
};
