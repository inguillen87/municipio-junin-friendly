// Relocation only to a fresh synthetic schema in an EXISTING loopback QA database.
import assert from 'node:assert/strict';import {buildAdoptedOwnReceiptQa} from './adopted-own-payroll-receipt-qa.mjs';
import {adoptedConsumersConditional as conditional} from './adopted-consumers-installation.mjs';import {firstAdoptionInstallationStatement} from './employment-adoption-installation.mjs';
const q=v=>"'"+v.replaceAll("'","''")+"'";
export function buildAdoptedConsumersInstallationQa(major){
 assert.ok([17,18].includes(major));const qa=buildAdoptedOwnReceiptQa(major),{schema}=qa;
 const normalized=s=>qa.relocate(s).replaceAll("s.nspname='public'","s.nspname="+q(schema))
 .replaceAll('"search_path=pg_catalog, public, pg_temp"','"search_path=pg_catalog, '+schema+', public, pg_temp"')
 .replaceAll('"search_path=public, pg_temp"','"search_path=pg_catalog, '+schema+', public, pg_temp"')
 .replace("(shapes->(item->>'name'))::text",()=>`replace((shapes->(item->>'name'))::text,${q(schema)},'public')`);
 const anchor='    END $seed$; COMMIT;';assert.equal(qa.sql.split(anchor).length,2);
 return {...qa,sql:qa.sql.replace(anchor,()=>qa.metadata+'\n'+anchor),normalized};
}
export function relocateAdoptedConsumersInstallation(batch,qa){
 const {normalized:n}=qa,initial=`current_setting('municontrol_adopted_consumers_install.mode') IN('first','upgrade')`;
 const baseStatement=s=>s===batch.base.first?n(firstAdoptionInstallationStatement(batch.base.migration.map(n),n(batch.base.guardBeforeCheck))):n(s);
 const replacements=new Map([
  [batch.initialChecks,conditional(batch.initialCheckStatements.map(n),initial)],
  [batch.baseFirst,conditional(batch.base.statements.slice(0,-1).map(baseStatement),"current_setting('municontrol_adopted_consumers_install.mode')='first'")],
  [batch.baseUpgrade,conditional(batch.base.verification.slice(0,4).map(n),"current_setting('municontrol_adopted_consumers_install.mode')='upgrade'")],
  [batch.first,conditional(batch.migration.map(n),initial)],
 ]);
 return {statements:batch.statements.map(s=>replacements.get(s)??n(s)),verification:batch.verification.map(n),baseStatements:batch.base.statements.map(baseStatement)};
}
