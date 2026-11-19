// Explicit consumer opt-in for the approved declaration already defined by SQL226.
// These are declared facts, not eligibility decisions or a family tariff table.
import {FAMILY_PAYROLL_FACTS_VERSION, FAMILY_PAYROLL_FACT_FIELD_UNITS} from './own-contract-family-payroll-facts-model.js';

export const OWN_PAYROLL_FAMILY_FACTS_VERSION = FAMILY_PAYROLL_FACTS_VERSION;
export const FAMILY_FACT_FIELD_UNITS = FAMILY_PAYROLL_FACT_FIELD_UNITS;
export const ownPayrollFamilyFacts = value => value?.familyPayrollFactsVersion === OWN_PAYROLL_FAMILY_FACTS_VERSION;
