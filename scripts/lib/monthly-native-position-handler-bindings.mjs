// Handler factory only. Importing/calling it does not certify an installation.
// The enclosing runner may mount these handlers only after its separately
// reviewed same-schema native admission hook has actually succeeded.
import assert from 'node:assert/strict';
import {createAnnualBudgetHandler} from '../../api/internal-annual-position-budget.js';
import {createPositionAssignmentHandler} from '../../api/internal-position-assignment.js';
import {createPositionComparisonHandler} from '../../api/internal-position-comparison.js';

export const MONTHLY_NATIVE_POSITION_ROUTES=Object.freeze({
 annualBudget:'/api/internal-annual-position-budget',
 positionAssignment:'/api/internal-position-assignment',
 positionComparison:'/api/internal-position-comparison'
});

export function monthlyNativePositionHandlers(deps){
 assert.ok(deps&&typeof deps==='object');
 for(const key of ['requireAccess','sessionFor','getSql'])assert.equal(typeof deps[key],'function','JOINT_POSITION_SHARED_'+key.toUpperCase()+'_REQUIRED');
 assert.ok(deps.env&&typeof deps.env==='object','JOINT_POSITION_SHARED_ENV_REQUIRED');
 return{
  annualBudget:createAnnualBudgetHandler(deps),
  positionAssignment:createPositionAssignmentHandler(deps),
  positionComparison:createPositionComparisonHandler(deps)
 };
}
