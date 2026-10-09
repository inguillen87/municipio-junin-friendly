import { bankAccountsBootstrap, bankAccountsCommand, bankAccountsLinkedDefinition, bankAccountsHistory, bankAccountsChanges } from './own-bank-accounts-model.js';
import { ownRunWorkspaceAccess } from './own-payroll-run-workspace-model.js';
export const BANK_ACCOUNTS_READ = Object.freeze(['workforce.employee.read', 'payroll.parameter.read']);
export const bankAccountsAccess = ownRunWorkspaceAccess;
export function prepareBankAccounts(bootstrap, definition, reason) {
 const boot = bankAccountsBootstrap(bootstrap);
 if (!boot.permissions.canPropose) throw Error('Tu cuenta no permite preparar cuentas.');
 const next = bankAccountsLinkedDefinition(definition, boot.sources, boot.configuration.definition);
 if (!bankAccountsChanges(boot.configuration.definition, next).length) throw Error('El conjunto no contiene cambios.');
 return bankAccountsCommand({ command: 'propose', scopeVersion: boot.scopeVersion, baseVersion: boot.configuration.version, sourceVersion: boot.sources.version, proposalId: null, proposalSha256: null, definition: next, reason, reviewConfirmed: false });
}
export function decideBankAccounts(bootstrap, detail, command, reason) {
 const boot = bankAccountsBootstrap(bootstrap), p = detail?.proposal;
 if (!boot.permissions.canReview || !p?.canReview || p.status !== 'pending' || !boot.proposals.some(x => x.id === p.id && x.requestSha256 === p.requestSha256)) throw Error('Elegí una propuesta pendiente que pueda revisar otra persona habilitada.');
 if (command === 'approve' && (!detail.current || p.baseVersion !== boot.configuration.version || p.sourceVersion !== boot.sources.version)) throw Error('Cambió la configuración o su fuente. Esta propuesta no puede aprobarse.');
 return bankAccountsCommand({ command, scopeVersion: boot.scopeVersion, baseVersion: p.baseVersion, sourceVersion: p.sourceVersion, proposalId: p.id, proposalSha256: p.requestSha256, definition: null, reason, reviewConfirmed: true });
}
