export default {
  displayName: 'rules-service',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
    // `jose` ships ESM-only (no CJS build) — transpile it too instead of
    // letting Jest's default node_modules ignore rule reject its `export`
    // syntax. Needed because ruleVersion.service.ts imports from
    // @armman/service-commons, which transitively pulls in jose via
    // token-signer. See https://jestjs.io/docs/ecmascript-modules.
    '^.+\\.js$': [
      'babel-jest',
      { presets: [['@babel/preset-env', { targets: { node: 'current' } }]] },
    ],
  },
  transformIgnorePatterns: ['/node_modules/(?!(jose)/)'],
  coverageDirectory: '../../coverage/apps/rules-service',
};
