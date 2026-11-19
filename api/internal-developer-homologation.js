import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {actionMutationSession,getActionCenterSql} from './internal-actions.js';
import {schoolCertificateHttp} from './internal-family-certificates.js';
import {readPrivateJsonBody} from './internal-employment-catalog.js';
import {assertOwnerAdoptionAccess,OWNER_ADOPTION_TENANT_CAPABILITIES} from '../lib/internal-municipal-owner-decision-authority.js';
import {HOMOLOGATION_CASES,runHomologationTrial} from '../lib/developer-homologation-trials.js';
import {developerHomologationPractice} from '../lib/developer-homologation-practice.js';
import {createDeveloperHomologationHandler} from '../lib/developer-homologation-session.js';
export const config={api:{bodyParser:false}};
export default createDeveloperHomologationHandler({
  requireAccess:requireCompatibleInternalAccess,requiredCapabilities:OWNER_ADOPTION_TENANT_CAPABILITIES,
  sessionFor:actionMutationSession,assertOwner:assertOwnerAdoptionAccess,http:schoolCertificateHttp,
  practice:developerHomologationPractice,readBody:readPrivateJsonBody,getSql:getActionCenterSql,cases:HOMOLOGATION_CASES,runTrial:runHomologationTrial,
});
