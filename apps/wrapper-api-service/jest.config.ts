export default {
  displayName: 'wrapper-api-service',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }] },
  coverageDirectory: '../../coverage/apps/wrapper-api-service',
};
