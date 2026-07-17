const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('node:path');
const { IgnorePrismaSourceMapWarnings } = require('../../tools/webpack-ignore-prisma-warnings');

module.exports = {
  output: { path: join(__dirname, '../../dist/apps/beneficiary-service') },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: false,
    }),
    new IgnorePrismaSourceMapWarnings(),
  ],
};
