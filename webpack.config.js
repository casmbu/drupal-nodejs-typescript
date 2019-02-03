const path = require('path');
const nodeExternals = require('webpack-node-externals');

module.exports = {
  entry: {
    app: './src/app.ts',
  },
  devtool: 'none',
  devServer: {
    contentBase: './dist',
  },
  externals: [
    nodeExternals(),
    function(context, request, callback) {
      if (/\bextensions\b/.test(context)){
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
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
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
