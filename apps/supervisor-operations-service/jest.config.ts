export default {
  displayName: 'supervisor-operations-service',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }] },
  coverageDirectory: '../../coverage/apps/supervisor-operations-service',
};
