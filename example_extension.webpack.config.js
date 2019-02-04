const path = require('path');
const nodeExternals = require('webpack-node-externals');

module.exports = {
  entry: {
    example_extension: './src/extensions/example_extension.ts',
  },
  devtool: 'none',
  devServer: {
    contentBase: './dist/extensions',
  },
  externals: [
    nodeExternals(),
  ],
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader?configFile=tsconfig.json',
        exclude: /node_modules|package.json/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'dist/extensions'),
    library: '',
    libraryTarget: 'commonjs',
  },
  target: 'node',
  mode: 'production',
  optimization: {
    // setting this to false can help with debugging but should use true for
    // building a production version of the server.
    minimize: true,
  },
  node: {
    __dirname: false,
  },
};
