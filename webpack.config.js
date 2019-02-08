const path = require('path');
const nodeExternals = require('webpack-node-externals');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const additionalAssets = new CopyWebpackPlugin([
  { from: './src/nodejs.config.js.example', to: 'nodejs.config.js.example' },
  { from: './src/server.package.json', to: 'package.json' },
]);

module.exports = {
  entry: {
    app: './src/app.ts',
  },
  devtool: 'inline-source-map',
  devServer: {
    contentBase: './dist',
  },
  externals: [
    nodeExternals(),
    // exclude any extensions from being packaged into this app
    function (context, request, callback) {
      if (/\bextensions\b/.test(context)) {
        return callback(null, 'commonjs ' + request);
      }
      callback();
    },
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
    path: path.resolve(__dirname, 'dist'),
    library: '',
    libraryTarget: 'commonjs',
  },
  target: 'node',
  mode: 'development',
  optimization: {
    // setting this to false can help with debugging but should use true for
    // building a production version of the server.
    minimize: false,
  },
  node: {
    __dirname: false,
  },
  plugins: [
    additionalAssets,
  ],
};
