jest.mock('../config/app-config', () => ({
  appConfig: {
    ANC_SCHEDULE_RULE_SET_ID: 'anc-rule-set-1',
    PP_SCHEDULE_RULE_SET_ID: undefined,
  },
}));

import { ruleSetIdFor } from './scheduleRuleSets';

describe('ruleSetIdFor', () => {
  it('returns the configured ruleSetId for a journey that has one', () => {
    expect(ruleSetIdFor('ANC')).toBe('anc-rule-set-1');
  });

  it('returns undefined for a journey with no configured ruleSetId', () => {
    expect(ruleSetIdFor('PP')).toBeUndefined();
  });

  it('returns undefined for a journey never present in config at all', () => {
    expect(ruleSetIdFor('NN')).toBeUndefined();
  });
});
