const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('node:path');
module.exports = {
  output: { path: join(__dirname, '../../dist/apps/closure-reopen-service') },
  plugins: [ new NxAppWebpackPlugin({ target: 'node', compiler: 'tsc', main: './src/main.ts', tsConfig: './tsconfig.app.json', optimization: false, outputHashing: 'none', generatePackageJson: false }) ],
};
