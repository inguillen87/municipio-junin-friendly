#!/usr/bin/env node
/** Offline structural audit of GRH configuration. Never evaluates or approves payroll. */
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { analyzeFormula } from '../assets/payroll-formula-linter.js';
import { validatePrivatePaths } from './inventory-payroll-formulas.mjs';

const MAX = Object.freeze({ bytes: 64 * 1024 * 1024, rows: 50000, expression: 4096, tokens: 512, depth: 32 });
const FIELDS = Object.freeze({
  codliq: ['FOVM_27','UNIM_27','CONM_27','FOVJ_27','UNIJ_27','CONJ_27','FOFM_27','FOFJ_27','FORMULA_PRE','FORMULA_POST'],
  auxical: ['ALGV_77','ALGF_77','COND_77','NPIV_77','NPIF_77','CNPI_77'],
  concepto: [], calauxi: [],
});
const PAIRS = Object.freeze([['ALGV_77','NPIV_77'],['ALGF_77','NPIF_77'],['COND_77','CNPI_77']]);
const POSTFIX = new Set(['NPIV_77','NPIF_77','CNPI_77']);
const HOOK = new Set(['FORMULA_PRE','FORMULA_POST']);
const OPS = new Map([['=','=='],['==','=='],['<>','!='],['!=','!='],['y','&&'],['and','&&'],['&&','&&'],['o','||'],['or','||'],['||','||'],...['+','-','*','/','%','^','<','<=','>','>='].map(x=>[x,x])]);
const own = (o,k) => Object.hasOwn(o,k);
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = code => { throw new Error(`FORMULA_AUDIT_${code}`); };
const plain = v => v && typeof v === 'object' && !Array.isArray(v);
const integerCode = v => typeof v === 'string' && /^(0|[1-9]\d{0,19})$/.test(v);
const order = (a,b) => a < b ? -1 : a > b ? 1 : 0;

export function canonicalNumber(raw) {
  if (typeof raw !== 'string' || !/^[+-]?\d+(?:\.\d+)?$/.test(raw)) fail('NUMBER_INVALID');
  const negative = raw.startsWith('-');
  const [integer,fraction=''] = raw.replace(/^[+-]/,'').split('.');
  const head = integer.replace(/^0+(?=\d)/,''), tail = fraction.replace(/0+$/,'');
  const value = head + (tail ? `.${tail}` : '');
  return negative && value !== '0' ? `-${value}` : value;
}

/** Canonicalizes representation, not algebra: order/associativity are intentionally preserved. */
export function canonicalAst(node) {
  if (!node || typeof node !== 'object') fail('AST_INVALID');
  if (node.type === 'NumericLiteral') return ['number',canonicalNumber(node.raw)];
  if (node.type === 'Reference') return ['reference',node.family.toUpperCase(),node.code];
  if (node.type === 'BinaryExpression') {
    const operator = OPS.get(node.operator.toLowerCase());
    if (!operator) fail('OPERATOR_INVALID');
    return ['binary',operator,canonicalAst(node.left),canonicalAst(node.right)];
  }
  if (node.type === 'UnaryExpression') {
    const operator = ['NOT','!'].includes(node.operator.toUpperCase()) ? '!' : node.operator;
    const arg = canonicalAst(node.argument);
    if (arg[0] === 'number' && ['+','-'].includes(operator)) return ['number',canonicalNumber(operator === '+' ? arg[1] : arg[1].startsWith('-') ? arg[1].slice(1) : `-${arg[1]}`)];
    return ['unary',operator,arg];
  }
  fail('AST_INVALID');
}

/** A bounded postfix parser. No eval, generated functions, SQL or dynamic module loading. */
export function parsePostfix(source) {
  if (typeof source !== 'string' || !source.trim() || source.length > MAX.expression) fail('POSTFIX_INPUT');
  const tokens = source.trim().split(/\s+/);
  if (tokens.length > MAX.tokens) fail('POSTFIX_LIMIT');
  const stack=[];
  for (const token of tokens) {
    let node;
    const ref=/^([RNIALU])\[([A-Za-z0-9_.-]{1,32})\]$/i.exec(token);
    if (ref) node={type:'Reference',family:ref[1].toUpperCase(),code:ref[2],depth:1};
    else if (/^[+-]?\d+(?:\.\d+)?$/.test(token)) node={type:'NumericLiteral',raw:token,depth:1};
    else if (['not','!'].includes(token.toLowerCase())) {
      if (!stack.length) fail('POSTFIX_UNDERFLOW');
      const argument=stack.pop(); node={type:'UnaryExpression',operator:'!',argument,depth:argument.depth+1};
    } else {
      const operator=OPS.get(token.toLowerCase());
      if (!operator) fail('POSTFIX_TOKEN');
      if (stack.length<2) fail('POSTFIX_UNDERFLOW');
      const right=stack.pop(),left=stack.pop();node={type:'BinaryExpression',operator,left,right,depth:Math.max(left.depth,right.depth)+1};
    }
    if (node.depth>MAX.depth) fail('POSTFIX_DEPTH');
    stack.push(node);
  }
  if (stack.length!==1) fail('POSTFIX_SURPLUS');
  return stack[0];
}

function classify(source,field) {
  if (source===null) return {kind:'source_null',ast:null,codes:[]};
  if (source==='') return {kind:'source_empty',ast:null,codes:[]};
  if (HOOK.has(field)) return {kind:'special_routine_requires_implementation',ast:null,codes:[]};
  if (POSTFIX.has(field)) {
    try {return {kind:'postfix_structurally_supported',ast:canonicalAst(parsePostfix(source)),codes:[]};}
    catch(error) {return {kind:'postfix_unresolved',ast:null,codes:[/^FORMULA_AUDIT_[A-Z_]+$/.test(error.message)?error.message:'FORMULA_AUDIT_POSTFIX_INVALID']};}
  }
  const result=analyzeFormula(source);
  return {kind:result.ast?'infix_structurally_supported':'infix_unresolved',ast:result.ast?canonicalAst(result.ast):null,codes:result.diagnostics.filter(x=>x.severity==='error').map(x=>x.code)};
}

function astEvidence(ast) {
  const references=new Set(),divisors=[];
  const visit=node=>{
    if (!node) return;
    if (node[0]==='reference') references.add(`${node[1]}[${node[2]}]`);
    if (node[0]==='binary') {
      if (node[1]==='/') divisors.push(node[3][0]==='number' ? node[3][1]==='0'?'literal_zero':'literal_nonzero':'runtime_denominator');
      visit(node[2]);visit(node[3]);
    }
    if (node[0]==='unary') visit(node[2]);
  };
  visit(ast);
  return {references:[...references].sort(order),divisors};
}

/** Iterative Kosaraju, avoiding recursion on long dependency chains. Conditional edges are potential. */
export function potentialCycles(graph) {
  const visited=new Set(),finished=[],reverse=new Map([...graph.keys()].map(k=>[k,[]]));
  for (const [from,to] of graph) for (const target of to) {if(!reverse.has(target))fail('GRAPH_TARGET');reverse.get(target).push(from);}
  for (const root of [...graph.keys()].sort(order)) {
    if (visited.has(root)) continue;
    const stack=[[root,0]];visited.add(root);
    while(stack.length) {
      const current=stack.at(-1),neighbors=graph.get(current[0]);
      if(current[1]<neighbors.length) {const n=neighbors[current[1]++];if(!visited.has(n)){visited.add(n);stack.push([n,0]);}}
      else {finished.push(current[0]);stack.pop();}
    }
  }
  const found=[];visited.clear();
  for(const root of finished.reverse()) {
    if(visited.has(root))continue;
    const component=[],stack=[root];visited.add(root);
    while(stack.length){const n=stack.pop();component.push(n);for(const prev of reverse.get(n))if(!visited.has(prev)){visited.add(prev);stack.push(prev);}}
    if(component.length>1||graph.get(root).includes(root))found.push(component.sort(order));
  }
  return found.sort((a,b)=>order(a[0],b[0]));
}

function validateInventory(inventory) {
  if(!plain(inventory)||inventory.version!=='payroll-formula-inventory.v1'||inventory.payrollExecutionAllowed!==false||!plain(inventory.source)||!(/^[a-f0-9]{64}$/.test(inventory.source.sha256||''))||!Array.isArray(inventory.rows)||inventory.rows.length>MAX.rows)fail('INVENTORY_INVALID');
  const ids=new Set();
  for(const row of inventory.rows) {
    if(!plain(row)||!own(FIELDS,row.table)||!plain(row.key)||!plain(row.metadata)||!plain(row.expressions))fail('ROW_INVALID');
    const keys=row.table==='codliq'?['CODI_02','CODI_27']:row.table==='auxical'?['CODI_01','CODI_02','ITEM_77']:row.table==='concepto'?['CODI_27']:['CODI_01','ITEM_77'];
    if(Object.keys(row.key).length!==keys.length||keys.some(k=>!integerCode(row.key[k]))||row.id!==`${row.table}:${keys.map(k=>row.key[k]).join(':')}`||row.agreement!==(row.key.CODI_02??null))fail('KEY_INVALID');
    if(ids.has(row.id))fail('DUPLICATE_ROW');ids.add(row.id);
    const expressionFields=Object.keys(row.expressions);
    if(expressionFields.some(f=>!FIELDS[row.table].includes(f)))fail('EXPRESSION_FIELD');
    // A missing source column must remain explicitly missing, never be treated as an empty formula.
    if(!Array.isArray(row.missingSourceColumns)||!Array.isArray(row.unprovidedSourceColumns))fail('COLUMN_EVIDENCE');
    for(const f of FIELDS[row.table]) if(!own(row.expressions,f)&&!row.missingSourceColumns.includes(f)&&!row.unprovidedSourceColumns.includes(f))fail('COLUMN_EVIDENCE');
    for(const e of Object.values(row.expressions))if(!plain(e)||!own(e,'original')||(e.original!==null&&(typeof e.original!=='string'||e.original.length>MAX.expression)))fail('EXPRESSION_INVALID');
  }
}

export function auditInventory(inventory,{companyId}={}) {
  validateInventory(inventory);
  if(!integerCode(companyId)||companyId==='0')fail('EXPLICIT_COMPANY_REQUIRED');
  if(!inventory.rows.some(r=>r.table==='auxical'&&r.key.CODI_01===companyId))fail('COMPANY_ABSENT');
  const rows=[...inventory.rows].sort((a,b)=>order(a.id,b.id));
  const graph=new Map(rows.filter(r=>r.table==='codliq'||r.table==='auxical'&&r.key.CODI_01===companyId).map(r=>[r.id,[]]));
  const diagnostics=[],pairs=[],expressions=[],bindings=[],specialRoutines=new Map(),divisorCounts={literal_zero:0,literal_nonzero:0,runtime_denominator:0};
  const kinds={};
  for(const row of rows) {
    const classified={};
    for(const [field,evidence] of Object.entries(row.expressions)) {
      // Reparse source: do not trust cached analysis/dependencies from the inventory JSON.
      const result=classify(evidence.original,field);classified[field]=result;
      kinds[result.kind]=(kinds[result.kind]||0)+1;
      const parsed=astEvidence(result.ast);
      parsed.divisors.forEach(d=>divisorCounts[d]++);
      if(result.kind==='special_routine_requires_implementation')specialRoutines.set(evidence.original,(specialRoutines.get(evidence.original)||0)+1);
      expressions.push({rowId:row.id,field,kind:result.kind,codes:result.codes,sourceSha256:hash(evidence.original===null?'null':JSON.stringify(evidence.original)),...parsed});
      if(result.kind.endsWith('_unresolved')||result.codes.length)diagnostics.push({rowId:row.id,field,codes:result.codes});
      // Only primary infix definitions enter the graph. Cached NPI and hooks are separate evidence.
      if(!graph.has(row.id)||POSTFIX.has(field)||HOOK.has(field))continue;
      for(const reference of parsed.references) {
        const [,family,code]=/^([RNIALU])\[(.+)\]$/.exec(reference);
        const target=family==='R'?`codliq:${row.agreement}:${code}`:family==='A'?`auxical:${row.key.CODI_01??companyId}:${row.agreement}:${code}`:null;
        const status=target?(graph.has(target)?'definition_found_not_execution_authorized':'definition_absent_in_this_context'):family==='U'?'quantity_phase_contract_required':'external_input_contract_required';
        bindings.push({rowId:row.id,field,reference,status,...(target?{target}:{})});
        if(target&&graph.has(target))graph.get(row.id).push(target);
      }
    }
    if(row.table==='auxical')for(const [infix,postfix] of PAIRS) {
      const a=classified[infix],b=classified[postfix];
      if(!a||!b||['source_null','source_empty'].includes(a.kind)||['source_null','source_empty'].includes(b.kind))continue;
      pairs.push({rowId:row.id,infix,postfix,status:!a.ast||!b.ast?'unresolved_representation':JSON.stringify(a.ast)===JSON.stringify(b.ast)?'same_normalized_tree':'different_tree_requires_review'});
    }
  }
  for(const [key,to] of graph)graph.set(key,[...new Set(to)].sort(order));
  const cycles=potentialCycles(graph);
  const coverage=[...new Set(rows.map(r=>r.agreement).filter(Boolean))].sort((a,b)=>Number(a)-Number(b)).map(agreement=>({agreement,conceptDefinitions:rows.filter(r=>r.table==='codliq'&&r.agreement===agreement).length,auxiliaryDefinitions:rows.filter(r=>r.table==='auxical'&&r.agreement===agreement&&r.key.CODI_01===companyId).length}));
  const missing=bindings.filter(b=>b.status==='definition_absent_in_this_context');
  const specialClasses=rows.reduce((n,r)=>n+['CLASS_M','CLASS_J','CLASS_A'].filter(k=>typeof r.metadata[k]==='string'&&r.metadata[k].trim()).length,0);
  return {
    version:'payroll-formula-audit.v1',classification:'private_payroll_rule_evidence',sourceSha256:inventory.source.sha256,companyId,
    payrollExecutionAllowed:false,municipalAcceptance:null,sourceHashStatus:'carried_from_inventory_not_revalidated_against_backup',
    limitations:['Static audit only; the active GRH implementation and legal effective dates are not established by a backup.','Different ASTs require review, not automatic repair or a claim of different monetary results.','Dependency cycles are potential: conditional branches and execution phases require runtime contracts.','Postfix and infix are inspected independently; no preference or activation is inferred.','No source employees, payroll amounts, credentials or backups are published by this tool.'],
    summary:{rows:rows.length,conceptDefinitions:rows.filter(r=>r.table==='codliq').length,auxiliaryDefinitions:rows.filter(r=>r.table==='auxical').length,nonemptyExpressions:expressions.filter(e=>!['source_null','source_empty'].includes(e.kind)).length,kinds,representationPairs:pairs.length,differentRepresentationPairs:pairs.filter(p=>p.status==='different_tree_requires_review').length,unresolvedExpressions:diagnostics.length,potentialCycleGroups:cycles.length,missingDefinitionReferences:missing.length,uniqueMissingTargets:new Set(missing.map(b=>b.target)).size,externalInputReferences:bindings.filter(b=>b.status==='external_input_contract_required').length,quantityReferences:bindings.filter(b=>b.status==='quantity_phase_contract_required').length,specialClassReferences:specialClasses,divisorCounts,coverage},
    specialRoutines:[...specialRoutines].sort(([a],[b])=>order(a,b)).map(([name,count])=>({name,count})),
    representationPairs:pairs,diagnostics,potentialCycles:cycles,bindings,expressions,
  };
}

export async function main(argv=process.argv.slice(2)) {
  try {
    const args={};
    for(let i=0;i<argv.length;i+=2){const k=argv[i];if(!['--input','--output','--company'].includes(k)||own(args,k)||!argv[i+1]||argv[i+1].startsWith('--'))fail('ARGUMENTS');args[k]=argv[i+1];}
    if(Object.keys(args).length!==3)fail('ARGUMENTS');
    const targets=await validatePrivatePaths(args['--input'],args['--output']);
    const info=await stat(targets.input);if(!info.isFile()||info.size<1||info.size>MAX.bytes)fail('INPUT_SIZE');
    const raw=await readFile(targets.input);if(raw.length>MAX.bytes)fail('INPUT_SIZE');
    const report=auditInventory(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)),{companyId:args['--company']});
    report.inventorySha256=hash(raw);
    await writeFile(targets.output,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log(JSON.stringify({version:report.version,payrollExecutionAllowed:false,summary:report.summary}));return 0;
  } catch(error) {console.error(/^FORMULA_AUDIT_[A-Z_]+$/.test(error.message)?error.message:'FORMULA_AUDIT_FAILED');return 1;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)process.exitCode=await main();
