import { accountingBootstrap, accountingCommand, accountingLinkedDefinition, accountingHistory, accountingChanges } from './own-payroll-accounting-model.js';
import { ownRunWorkspaceAccess } from './own-payroll-run-workspace-model.js';
export const ACCOUNTING_READ = Object.freeze(['workforce.employee.read', 'payroll.parameter.read']);
export const accountingAccess = ownRunWorkspaceAccess;
export function prepareAccounting(bootstrap, definition, reason) {
 const boot = accountingBootstrap(bootstrap);
 if (!boot.permissions.canPropose) throw Error('Tu cuenta no permite preparar asociaciones.');
 const next = accountingLinkedDefinition(definition, boot.sources, boot.configuration.definition);
 if (!accountingChanges(boot.configuration.definition, next).length) throw Error('El conjunto no contiene cambios.');
 return accountingCommand({ command: 'propose', scopeVersion: boot.scopeVersion, baseVersion: boot.configuration.version, sourceVersion: boot.sources.version, proposalId: null, proposalSha256: null, definition: next, reason, reviewConfirmed: false });
}
export function decideAccounting(bootstrap, detail, command, reason) {
 const boot = accountingBootstrap(bootstrap), p = detail?.proposal;
 if (!boot.permissions.canReview || !p?.canReview || p.status !== 'pending' || !boot.proposals.some(x => x.id === p.id && x.requestSha256 === p.requestSha256)) throw Error('Elegí una propuesta pendiente que pueda revisar otra persona habilitada.');
 if (command === 'approve' && (!detail.current || p.baseVersion !== boot.configuration.version || p.sourceVersion !== boot.sources.version)) throw Error('Cambió la configuración o su fuente. Esta propuesta no puede aprobarse.');
 return accountingCommand({ command, scopeVersion: boot.scopeVersion, baseVersion: p.baseVersion, sourceVersion: p.sourceVersion, proposalId: p.id, proposalSha256: p.requestSha256, definition: null, reason, reviewConfirmed: true });
}
