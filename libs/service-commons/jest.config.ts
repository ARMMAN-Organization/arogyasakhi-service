export default {
  displayName: 'service-commons',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
  coverageDirectory: '../../coverage/libs/service-commons',
};
