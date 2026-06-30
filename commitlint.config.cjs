/**
 * Conventional Commits enforced on every commit message.
 * Format: <type>(<scope>): <subject>   e.g. feat(beneficiary): add duplicate check
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-empty': [2, 'never'],
    'subject-case': [2, 'always', ['sentence-case', 'lower-case']],
  },
};
