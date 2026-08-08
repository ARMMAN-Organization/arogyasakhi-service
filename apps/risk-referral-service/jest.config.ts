export default {
  displayName: 'risk-referral-service',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }] },
  transformIgnorePatterns: ['/node_modules/(?!(jose)/)'],
  coverageDirectory: '../../coverage/apps/risk-referral-service',
};
