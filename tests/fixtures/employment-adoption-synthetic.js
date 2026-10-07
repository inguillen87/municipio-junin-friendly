// Synthetic wire values only. No municipal records or identity numbers.
import {ADOPTION_VERSION} from '../../assets/employment-adoption-contract.js';
export const adoptionContractId = index => `11111111-1111-ffff-0000-${index.toString(16).padStart(12, '0')}`;
export const adoptionProposal = (count = 2452) => ({sourceContextVersion: 'a'.repeat(64), selectionVersion: 'b'.repeat(64), catalogVersion: 'c'.repeat(64),
  rows: Array.from({length: count}, (_, i) => ({contractId: adoptionContractId(i + 1), contractVersion: 'd'.repeat(64), jurisdictionCode: i % 2 ? '55' : '42'})),
  legalReference: 'Acto municipal sintético QA', reason: 'Adopción sintética completa para pruebas de contrato'});
export const adoptionReview = decision => ({proposalId: adoptionContractId(90000), proposalVersion: 'e'.repeat(64), sourceContextVersion: 'a'.repeat(64),
  catalogVersion: 'c'.repeat(64), decision, reason: 'Decisión sintética independiente sobre la selección completa'});
export const adoptionWireReceipt = (status = 'pending') => ({version: ADOPTION_VERSION, operation: status === 'pending' ? 'propose' : 'review',
  proposalId: adoptionContractId(90000), proposalVersion: 'e'.repeat(64), sourceContextVersion: 'a'.repeat(64), catalogVersion: 'c'.repeat(64),
  status, total: 2452, replayed: false, decidedAt: status === 'pending' ? null : '2026-10-06T12:00:00Z',
  effects: {identitiesCreated: 0, contractsCreated: 0, contractsAdopted: status === 'approved' ? 2452 : 0,
    sourceHistoryRetained: true, payrollCalculated: false, payrollPosted: false, paymentsExecuted: false}});
