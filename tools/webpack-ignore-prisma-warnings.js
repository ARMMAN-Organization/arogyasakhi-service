/**
 * Prisma's generated client ships a runtime file that references a sourcemap
 * it doesn't actually include, so Nx's built-in source-map-loader rule warns
 * on every build of every service. NxAppWebpackPlugin overwrites
 * config.ignoreWarnings itself (rather than merging), so a top-level
 * `ignoreWarnings` in a service's webpack.config.js gets clobbered —
 * appending to it from a plugin that runs after NxAppWebpackPlugin (via
 * afterEnvironment, which fires once all plugins have applied) works because
 * it mutates the array NxAppWebpackPlugin already assigned.
 *
 * Shared across every service's webpack.config.js instead of duplicated
 * per-service.
 */
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

module.exports = { IgnorePrismaSourceMapWarnings };
