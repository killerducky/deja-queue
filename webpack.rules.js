export default [
  // Add support for simple .js files
  {
    test: /\.js$/,
    exclude: /node_modules/,
    loader: "babel-loader",
  },
  // Add support for simple .node files
  {
    test: /\.node$/,
    use: "node-loader",
  },
];
