export default {
  displayName: 'notification-escalation-service',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }] },
  transformIgnorePatterns: ['/node_modules/(?!(jose)/)'],
  coverageDirectory: '../../coverage/apps/notification-escalation-service',
};
