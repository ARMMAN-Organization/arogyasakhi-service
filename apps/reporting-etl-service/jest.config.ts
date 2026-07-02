export default {
  displayName: 'reporting-etl-service',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }] },
  coverageDirectory: '../../coverage/apps/reporting-etl-service',
};
