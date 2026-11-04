// Typed approved source only. Does not prorate, transform rules or execute payroll.
import { createHash } from 'node:crypto';
import { salarySerialized, SalaryInputError } from '../assets/native-salary-catalog-model.js';
import { monthlyDayDeclarationCapture, MONTHLY_DAY_DECLARATION_FACTS_VERSION } from '../assets/own-monthly-day-declaration-model.js';

export function approvedMonthlyDayInputs(capture, employees, period) {
 const checked = monthlyDayDeclarationCapture(capture, employees, period);
 const expected = createHash('sha256').update(salarySerialized([MONTHLY_DAY_DECLARATION_FACTS_VERSION, period, checked.records])).digest('hex');
 if (checked.version !== expected) throw new SalaryInputError('MONTHLY_DAY_DECLARATION_CAPTURE_INVALID', 'La captura no coincide con sus hechos aprobados completos.');
 return checked.records.map(record => ({
  contractId: record.contractId, identityToken: record.identityToken,
  sourceVersion: record.sourceVersion, configurationVersion: record.configuration.version,
  proposalId: record.configuration.proposalId, approvalId: record.configuration.approvalId,
  ...record.configuration.definition,
 }));
}
