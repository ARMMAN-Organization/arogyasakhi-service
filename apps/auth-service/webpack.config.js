const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('node:path');

// Prisma's generated client ships a runtime file that references a sourcemap
// it doesn't actually include, so Nx's built-in source-map-loader rule warns
// on every build. NxAppWebpackPlugin overwrites config.ignoreWarnings itself
// (rather than merging), so a top-level `ignoreWarnings` in this file gets
// clobbered — appending to it from a plugin that runs after NxAppWebpackPlugin
// (via afterEnvironment, which fires once all plugins have applied) works
// because it mutates the array NxAppWebpackPlugin already assigned.
class IgnorePrismaSourceMapWarnings {
  apply(compiler) {
    compiler.hooks.afterEnvironment.tap('IgnorePrismaSourceMapWarnings', () => {
      compiler.options.ignoreWarnings = [
        ...(compiler.options.ignoreWarnings ?? []),
        (warning) => {
          const message = typeof warning === 'string' ? warning : warning.message;
          return (
            typeof message === 'string' &&
            message.includes('Failed to parse source map') &&
            /\.prisma[\\/]/.test(message)
          );
        },
      ];
    });
  }
}

module.exports = {
  output: { path: join(__dirname, '../../dist/apps/auth-service') },
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
