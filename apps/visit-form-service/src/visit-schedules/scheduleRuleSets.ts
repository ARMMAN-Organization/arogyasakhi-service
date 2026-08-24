import { appConfig } from '../config/app-config';
import type { GeneratableScheduleKind } from './dto/generate-visit-schedule.dto';

/** Maps a generatable schedule kind to its configured rules-service ruleSetId. */
export function ruleSetIdFor(kind: GeneratableScheduleKind): string | undefined {
  switch (kind) {
    case 'ANC':
      return appConfig.ANC_SCHEDULE_RULE_SET_ID;
    case 'PP':
      return appConfig.PP_SCHEDULE_RULE_SET_ID;
    case 'NN':
      return appConfig.NN_SCHEDULE_RULE_SET_ID;
    case 'INC':
      return appConfig.INC_SCHEDULE_RULE_SET_ID;
    case 'HR':
      return appConfig.HR_SCHEDULE_RULE_SET_ID;
    case 'DELIVERY':
      return appConfig.DELIVERY_SCHEDULE_RULE_SET_ID;
  }
}
