import { mountCollectiveJobs } from './own-collective-jobs-panel.js';
import { collectiveSeniorityFile, COLLECTIVE_SENIORITY_MAX_BYTES } from './own-salary-seniority-collective.js';

export function mountCollectiveSeniority(container, options) {
 return mountCollectiveJobs(container, options, {
  family: 'seniority', prefix: 'seniority', className: 'seniority-collective', title: 'Antigüedad',
  validateFile: collectiveSeniorityFile, maxBytes: COLLECTIVE_SENIORITY_MAX_BYTES,
  fields: [['years', 'años'], ['months', 'meses']]
 });
}
