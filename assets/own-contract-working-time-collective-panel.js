import { mountCollectiveJobs } from './own-collective-jobs-panel.js';
import { collectiveWorkingTimeFile, COLLECTIVE_WORKING_TIME_MAX_BYTES } from './own-contract-working-time-collective.js';

export function mountCollectiveWorkingTime(container, options) {
 return mountCollectiveJobs(container, options, {
  family: 'working-time', prefix: 'time', className: 'working-time-collective', title: 'Jornada',
  validateFile: collectiveWorkingTimeFile, maxBytes: COLLECTIVE_WORKING_TIME_MAX_BYTES,
  fields: [['dailyHours', 'h por día'], ['monthlyHours', 'h por mes']]
 });
}
