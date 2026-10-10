// Source-pinned extension of the published own catalog/program contracts.
// This generates a technical batch. It never connects or imports GRH formulas.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { splitPostgresStatements } from './sql-statements.mjs';
import { ownInstallationFunctionPin } from './own-payroll-installation.mjs';
import { buildOwnReferenceScaleSql } from './own-payroll-reference-scale-sql.mjs';
import { buildOwnCloseSql } from './own-payroll-close-sql.mjs';
import { buildSalaryAdministrativeIdentityInstallation } from './salary-administrative-identity-installation.mjs';
import { buildOwnJurisdictionInstallation } from './own-payroll-jurisdiction-installation.mjs';
import { buildRegistryOriginalFactsInstallation } from './registry-original-facts-installation.mjs';
import { pinsCheck, preservationSnapshot } from './native-leave-installation.mjs';
const q = v => "'" + String(v).replaceAll("'", "''") + "'";
const hash = v => createHash('sha256').update(v).digest('hex');
const once = (s, a, b) => { assert.equal(s.split(a).length, 2, 'AUXILIARY_NAMESPACE_SOURCE_ANCHOR_CHANGED'); return s.replace(a, () => b); };
const get = (s, name) => { const found = splitPostgresStatements(s).filter(x => new RegExp('^CREATE (?:OR REPLACE )?FUNCTION public\\.' + name + '\\(').test(x)); assert.equal(found.length, 1, name); return found[0]; };
const identity = variable => `(CASE WHEN ${variable}->>'nature'='auxiliary' THEN 'auxiliary:' ELSE 'concept:' END)||(${variable}->>'code')`;

export function buildSalaryAuxiliaryNamespaceSql({ read, sourceCommit }) {
  assert.match(sourceCommit, /^[a-f0-9]{40}$/);
  const salary = read('scripts/migrations/112-native-salary-definitions.sql').replace(/\r\n?/g, '\n');
  const program = read('scripts/migrations/122-own-payroll-programs.sql').replace(/\r\n?/g, '\n');
  assert.equal(hash(salary), 'da72986b8eb8b834f8f11f0cdfd793708eba90c96de59c399ff063fe31a95cd3');
  assert.equal(hash(program), 'edaf70ef87f9ac3de170e079c460d38c4188b36de349b5c58808f5a09a9f9785');
  const salaryBefore = get(salary, 'native_salary_items_v1');
  let salaryAfter = once(salaryBefore, "NOT IN('concept','scale')", "NOT IN('concept','auxiliary','scale')");
  salaryAfter = once(salaryAfter, "   OR(item->>'kind'='scale'", "   OR(item->>'kind'='auxiliary' AND(item->'categoryCode' IS DISTINCT FROM 'null'::jsonb OR item->>'nature' IS DISTINCT FROM 'auxiliary'))\n   OR(item->>'kind'='scale'");

  const nodeBefore = get(program, 'own_program_node_v1'), unitBefore = get(program, 'own_program_unit_v1');
  let node = nodeBefore.replaceAll('own_program_node_v1', 'own_program_node_v2');
  node = once(node, "WHEN 'concept' THEN keys:=ARRAY['op','code','stage'];", "WHEN 'concept' THEN keys:=ARRAY['op','code','stage'];WHEN 'auxiliary' THEN keys:=ARRAY['op','code','stage'];");
  assert.equal(node.split("IF op='concept'").length, 3); node = node.replaceAll("IF op='concept'", "IF op IN('concept','auxiliary')");
  node = once(node, "refs:=jsonb_build_array(n->>'code')", "refs:=jsonb_build_array(op||':'||(n->>'code'))");
  let unit = unitBefore.replaceAll('own_program_unit_v1', 'own_program_unit_v2');
  unit = once(unit, "IF op='concept' THEN", "IF op IN('concept','auxiliary') THEN");
  unit = once(unit, "n->>'code'=ANY(path_codes)", "(op||':'||(n->>'code'))=ANY(path_codes)");
  unit = once(unit, "r->>'code'=n->>'code' AND", "r->>'code'=n->>'code' AND (r->>'nature'='auxiliary')=(op='auxiliary') AND");

  const definitionBefore = buildOwnReferenceScaleSql(read).adapted;
  let definition = once(definitionBefore, 'checked integer:=0;work integer:=0;', "checked integer:=0;work integer:=0;ns boolean:=coalesce(p->>'namespaceVersion'='own-payroll-namespaces.v2',false);");
  definition = once(definition, "public.own_program_exact_v1(p,ARRAY['rules','bindings','totalsPrecision'])", "public.own_program_exact_v1(p,CASE WHEN ns THEN ARRAY['namespaceVersion','rules','bindings','totalsPrecision'] ELSE ARRAY['rules','bindings','totalsPrecision'] END)");
  definition = once(definition, "IN('parameter','scale','scale_reference','monthly_quantity','monthly_amount','fixed_quantity','fixed_amount')", "IN('parameter','auxiliary_parameter','scale','scale_reference','monthly_quantity','monthly_amount','fixed_quantity','fixed_amount') AND (b->>'sourceKind'<>'auxiliary_parameter' OR ns)");
  definition = once(definition, "IN('parameter','scale','scale_reference')", "IN('parameter','auxiliary_parameter','scale','scale_reference')");
  assert.equal(definition.split("node:=public.own_program_node_v1(r->'expression');").length, 3);
  definition = definition.replaceAll("node:=public.own_program_node_v1(r->'expression');", "node:=CASE WHEN ns THEN public.own_program_node_v2(r->'expression') ELSE public.own_program_node_v1(r->'expression') END;");
  definition = once(definition, "d->>'kind'='concept'", "d->>'kind'=CASE WHEN ns AND r->>'nature'='auxiliary' THEN 'auxiliary' ELSE 'concept' END");
  definition = once(definition, "CASE WHEN b->>'sourceKind' IN('scale','scale_reference') THEN 'scale' ELSE 'concept' END", "CASE WHEN b->>'sourceKind' IN('scale','scale_reference') THEN 'scale' WHEN b->>'sourceKind'='auxiliary_parameter' THEN 'auxiliary' ELSE 'concept' END AND(NOT ns OR d->>'kind'<>'concept' OR d->>'nature'<>'auxiliary')");
  definition = once(definition, "b->>'sourceKind'<>'parameter' OR d->'value'<>'null'", "b->>'sourceKind' NOT IN('parameter','auxiliary_parameter') OR d->'value'<>'null'");
  definition = once(definition, "a.value->>'code'=other.value->>'code' AND", "a.value->>'code'=other.value->>'code' AND(NOT ns OR(a.value->>'nature'='auxiliary')=(other.value->>'nature'='auxiliary')) AND");
  definition = once(definition, "NOT(x->>'code'=ANY(done_codes))", `NOT((CASE WHEN ns THEN ${identity('x')} ELSE x->>'code' END)=ANY(done_codes))`);
  definition = once(definition, "target->>'code'=c", `(CASE WHEN ns THEN ${identity('target')} ELSE target->>'code' END)=c`);
  definition = once(definition, "public.own_program_unit_v1(r->'expression',active_rules,group_row.agreement,period,kind_type,ARRAY[r->>'code'])", `(CASE WHEN ns THEN public.own_program_unit_v2(r->'expression',active_rules,group_row.agreement,period,kind_type,ARRAY[${identity('r')}]) ELSE public.own_program_unit_v1(r->'expression',active_rules,group_row.agreement,period,kind_type,ARRAY[r->>'code']) END)`);
  definition = once(definition, "ready_codes:=ready_codes||(r->>'code')", `ready_codes:=ready_codes||(CASE WHEN ns THEN ${identity('r')} ELSE r->>'code' END)`);
  definition = once(definition, "(x->>'code') COLLATE \"C\",x->>'validFrom'", `(x->>'code') COLLATE "C",(CASE WHEN ns THEN ${identity('x')} ELSE '' END) COLLATE "C",x->>'validFrom'`);
  definition = once(definition, "THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;RETURN normalized;", "THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;IF ns THEN normalized:=normalized||jsonb_build_object('namespaceVersion','own-payroll-namespaces.v2');END IF;RETURN normalized;");

  const administrative = buildSalaryAdministrativeIdentityInstallation({ read, sourceCommit });
  const commandBefore = administrative.changed.find(s => s.startsWith('CREATE OR REPLACE FUNCTION public.own_program_command_v1(')); assert.ok(commandBefore);
  let command = once(commandBefore, '  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce', "  IF current_program#>>'{definition,namespaceVersion}'='own-payroll-namespaces.v2' AND definition->>'namespaceVersion' IS DISTINCT FROM 'own-payroll-namespaces.v2' THEN RAISE EXCEPTION 'OWN_PROGRAM_HISTORY_REQUIRED';END IF;\n  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce");
  command = once(command, "n->'liquidationTypes')=jsonb_build_array(old->>'agreementCode',old->>'code',old->>'validFrom',old->'liquidationTypes')", "n->'liquidationTypes')=jsonb_build_array(old->>'agreementCode',old->>'code',old->>'validFrom',old->'liquidationTypes') AND(definition->>'namespaceVersion' IS DISTINCT FROM 'own-payroll-namespaces.v2' OR(n->>'nature'='auxiliary')=(old->>'nature'='auxiliary'))");
  command = once(command, '@.op == "concept" && @.stage != "exact"', '(@.op == "concept" || @.op == "auxiliary") && @.stage != "exact"');
  const completeBefore = buildOwnCloseSql(read).adapted.find(s => s.startsWith('CREATE OR REPLACE FUNCTION public.own_run_complete_v1(')); assert.ok(completeBefore);
  const complete = once(completeBefore, "input_value->>'version'<>'own-payroll-input.v1' OR result_value->>'version'<>'own-payroll-result.v1'", "input_value->>'version' IS DISTINCT FROM (CASE WHEN c.payload#>>'{programState,program,definition,namespaceVersion}'='own-payroll-namespaces.v2' THEN 'own-payroll-input.v2' ELSE 'own-payroll-input.v1' END) OR result_value->>'version' IS DISTINCT FROM (CASE WHEN input_value->>'version'='own-payroll-input.v2' THEN 'own-payroll-result.v2' ELSE 'own-payroll-result.v1' END)");
  const options={read,sourceCommit},jurisdiction=buildOwnJurisdictionInstallation(options);
  const receiptBefore=jurisdiction.migration.find(s=>s.startsWith('CREATE OR REPLACE FUNCTION public.own_receipt_snapshot_v1('));assert.ok(receiptBefore);
  let receipt=once(receiptBefore,'has_adopted boolean:=false;BEGIN','has_adopted boolean:=false;ns boolean;has_namespaced boolean:=false;BEGIN');
  receipt=once(receipt,"concepts:='[]';", "concepts:='[]';ns:=coalesce(c.payload#>>'{programState,program,definition,namespaceVersion}'='own-payroll-namespaces.v2',false);has_namespaced:=has_namespaced OR ns;");
  assert.equal(receipt.split("x.value->>'kind'='concept'").length,3);
  receipt=receipt.replaceAll("x.value->>'kind'='concept'", "x.value->>'kind'=CASE WHEN ns AND line->>'nature'='auxiliary' THEN 'auxiliary' ELSE 'concept' END");
  receipt=once(receipt,"NOT IN('own-close-snapshot.v1','own-close-snapshot.v2')","NOT IN('own-close-snapshot.v1','own-close-snapshot.v2','own-close-snapshot.v3')");
  receipt=once(receipt,'   records:=records||jsonb_build_array(record_value);',"   IF ns THEN record_value:=record_value||jsonb_build_object('namespaceVersion','own-payroll-namespaces.v2');END IF;\n   records:=records||jsonb_build_array(record_value);");
  receipt=once(receipt,"CASE WHEN has_adopted OR params ? 'contracts' THEN 'own-receipt-snapshot.v2' ELSE 'own-receipt-snapshot.v1' END", "CASE WHEN has_namespaced THEN 'own-receipt-snapshot.v3' WHEN has_adopted OR params ? 'contracts' THEN 'own-receipt-snapshot.v2' ELSE 'own-receipt-snapshot.v1' END");
  receipt=once(receipt,"CASE WHEN has_adopted OR params ? 'contracts' THEN 'owned_registration_verified_at_capture'", "CASE WHEN has_namespaced OR has_adopted OR params ? 'contracts' THEN 'owned_registration_verified_at_capture'");
  const closeBefore=jurisdiction.migration.find(s=>s.startsWith('CREATE OR REPLACE FUNCTION public.own_close_snapshot_v1('));assert.ok(closeBefore);
  let close=once(closeBefore,"jurisdiction_cache jsonb:='{}';BEGIN","jurisdiction_cache jsonb:='{}';has_namespaced boolean:=false;BEGIN");
  close=once(close,"saved:=capture->'saved';","saved:=capture->'saved';has_namespaced:=has_namespaced OR(saved#>>'{input,version}'='own-payroll-input.v2');");
  close=once(close,'"sourceSha256":null}\'::jsonb)));','"sourceSha256":null}\'::jsonb))||CASE WHEN saved#>>\'{input,version}\'=\'own-payroll-input.v2\' THEN jsonb_build_object(\'namespaceVersion\',\'own-payroll-namespaces.v2\') ELSE \'{}\'::jsonb END);');
  close=once(close,"'version','own-close-snapshot.v2'","'version',CASE WHEN has_namespaced THEN 'own-close-snapshot.v3' ELSE 'own-close-snapshot.v2' END");
  const readyBefore=buildRegistryOriginalFactsInstallation(options).afterDefinitions.at(-1);assert.ok(readyBefore.startsWith('CREATE FUNCTION public.municipal_adoption_ready_v1('));
  const oldReceiptPin=ownInstallationFunctionPin(receiptBefore),newReceiptPin=ownInstallationFunctionPin(receipt);
  assert.ok(readyBefore.includes(oldReceiptPin.sha256));const ready=readyBefore.replaceAll(oldReceiptPin.sha256,newReceiptPin.sha256);
  const originals = [salaryBefore, definitionBefore, commandBefore, completeBefore,receiptBefore,closeBefore,readyBefore];
  const changed = [salaryAfter, definition, command, complete,receipt,close,ready].map(s => s.replace(/^CREATE FUNCTION /, 'CREATE OR REPLACE FUNCTION '));
  const helpers = [node, unit], beforePins = originals.map(ownInstallationFunctionPin), afterPins = [...changed, ...helpers].map(ownInstallationFunctionPin);
  return { sourceCommit, originals, changed, helpers, beforePins, afterPins, prerequisitePins: [nodeBefore, unitBefore, administrative.context, administrative.mutations[0]].map(ownInstallationFunctionPin), mutations: [...helpers, ...helpers.map(s => 'REVOKE ALL ON FUNCTION ' + ownInstallationFunctionPin(s).signature + ' FROM PUBLIC,municontrol_actions_runtime_app'), ...changed] };
}

export function buildSalaryAuxiliaryNamespaceInstallation(options) {
  const sql = buildSalaryAuxiliaryNamespaceSql(options);
  const beforeCheck = pinsCheck([...sql.prerequisitePins, ...sql.beforePins], 'AUXILIARY_NAMESPACE_PREREQUISITE_CHANGED');
  const afterCheck = pinsCheck([...sql.prerequisitePins, ...sql.afterPins], 'AUXILIARY_NAMESPACE_FUNCTION_CHANGED');
  const snapshot = slot => {
    let s = preservationSnapshot(slot).replaceAll("p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')", 'true');
    s = once(s, "AND NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')", "AND NOT(s.nspname='public' AND p.proname IN('own_program_node_v2','own_program_unit_v2'))");
    s = once(s, "public.digest(to_jsonb(p)::text,'sha256')", `public.digest((CASE WHEN p.oid IN(${sql.beforePins.map(p => q(p.signature) + '::regprocedure').join(',')}) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text,'sha256')`);
    return s.replaceAll('municontrol_sql111.', 'municontrol_auxiliary_namespace.');
  };
  const before = snapshot('before'), after = snapshot('after');
  const mode = "DO $mode$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'AUXILIARY_NAMESPACE_ISOLATION_REQUIRED';END IF;PERFORM pg_advisory_xact_lock(132142);PERFORM pg_advisory_xact_lock(132143);PERFORM pg_advisory_xact_lock(143);PERFORM pg_advisory_xact_lock(132149);PERFORM pg_advisory_xact_lock(132150);PERFORM pg_advisory_xact_lock(145);PERFORM pg_advisory_xact_lock(132164);PERFORM set_config('municontrol_auxiliary_namespace.mode',CASE WHEN to_regprocedure('public.own_program_node_v2(jsonb,integer)') IS NULL AND to_regprocedure('public.own_program_unit_v2(jsonb,jsonb,text,text,text,text[],integer)') IS NULL THEN 'install' ELSE 'verify' END,true);END $mode$";
  const choose = `DO $check$ BEGIN IF current_setting('municontrol_auxiliary_namespace.mode')='install' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $check$`;
  const apply = `DO $install$ BEGIN IF current_setting('municontrol_auxiliary_namespace.mode')='install' THEN ${sql.mutations.map(s => 'EXECUTE ' + q(s) + ';').join('\n')} END IF;END $install$`;
  const conservation = "DO $conservation$ BEGIN IF current_setting('municontrol_auxiliary_namespace.before')::jsonb IS DISTINCT FROM current_setting('municontrol_auxiliary_namespace.after')::jsonb THEN RAISE EXCEPTION 'AUXILIARY_NAMESPACE_CONSERVATION_FAILED';END IF;END $conservation$";
  const proof = `SELECT jsonb_build_object('version','salary-auxiliary-namespace-installation.v1','sourceCommit',${q(sql.sourceCommit)},'mode',current_setting('municontrol_auxiliary_namespace.mode'),'newTables',0,'newPrivateFunctions',2,'adaptedFunctions',7,'associationWrites',0,'businessWrites',0,'nominalRowsReturned',0,'preservationSha256',encode(public.digest(current_setting('municontrol_auxiliary_namespace.after')::jsonb::text,'sha256'),'hex')) AS proof`;
  return { ...sql, beforeCheck, afterCheck, before, after, conservation, proof, statements: [mode, choose, before, apply, afterCheck, after, conservation, proof], verification: [afterCheck, after, proof.replace("current_setting('municontrol_auxiliary_namespace.mode')", "'verify'")], connects: false, executesSql: false };
}
