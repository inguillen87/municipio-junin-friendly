/**
 * Exact arithmetic laboratory for the canonical AST emitted by the private audit.
 * No GRH execution semantics, tax treatment, formula activation or payroll posting
 * are implied. Decimal literals and explicit synthetic inputs become rationals.
 */
export const SHADOW_SEMANTICS = 'exact-rational-strict-boolean-short-circuit.v1';
const LIMIT = Object.freeze({nodes:512, depth:32, digits:96, fraction:48, inputs:256});
const REF = /^[RNIALU]\[[A-Za-z0-9_.-]{1,32}\]$/;
const BINARY = new Set(['+','-','*','/','==','!=','<','<=','>','>=','&&','||']);
const fail = code => { throw new Error(`FORMULA_SHADOW_${code}`); };
const plain = value => value !== null && typeof value === 'object' &&
  [Object.prototype,null].includes(Object.getPrototypeOf(value));
const abs = x => x < 0n ? -x : x;
const bounded = x => { if(abs(x).toString().length>LIMIT.digits)fail('ARITHMETIC_LIMIT'); return x; };
function rational(n,d=1n) {
  if(d===0n)fail('ZERO_DENOMINATOR');
  bounded(n);bounded(d);
  if(d<0n){n=-n;d=-d;}
  let a=abs(n),b=d;while(b!==0n){const r=a%b;a=b;b=r;}
  return {n:n/a,d:d/a};
}
function decimal(value) {
  if(typeof value!=='string'||value.length>LIMIT.digits+2||
    !/^[+-]?\d+(?:\.\d+)?$/.test(value))fail('DECIMAL_INPUT');
  const negative=value.startsWith('-'),[head,tail='']=value.replace(/^[+-]/,'').split('.');
  if(tail.length>LIMIT.fraction||head.length+tail.length>LIMIT.digits)fail('DECIMAL_LIMIT');
  return rational((negative?-1n:1n)*BigInt(head+tail),10n**BigInt(tail.length));
}
function number(value){if(typeof value==='boolean')fail('NUMBER_REQUIRED');return value;}
function boolean(value){if(typeof value!=='boolean')fail('BOOLEAN_REQUIRED');return value;}
function binary(operator,a,b) {
  number(a);number(b);
  const left=bounded(a.n*b.d),right=bounded(b.n*a.d);
  if(operator==='==')return left===right;
  if(operator==='!=')return left!==right;
  if(operator==='<')return left<right;
  if(operator==='<=')return left<=right;
  if(operator==='>')return left>right;
  if(operator==='>=')return left>=right;
  if(operator==='+')return rational(bounded(left+right),bounded(a.d*b.d));
  if(operator==='-')return rational(bounded(left-right),bounded(a.d*b.d));
  if(operator==='*')return rational(bounded(a.n*b.n),bounded(a.d*b.d));
  return rational(bounded(a.n*b.d),bounded(a.d*b.n));
}
/** Validate even unvisited branches: a hidden unsupported operator is never accepted. */
function checkedTree(root) {
  let count=0;const refs=new Set();
  function visit(node,depth){
    if(++count>LIMIT.nodes||depth>LIMIT.depth)fail('AST_LIMIT');
    if(!Array.isArray(node))fail('AST_INVALID');
    if(node[0]==='number'&&node.length===2){decimal(node[1]);return;}
    if(node[0]==='reference'&&node.length===3&&typeof node[1]==='string'&&typeof node[2]==='string'){
      const key=`${node[1]}[${node[2]}]`;if(!REF.test(key))fail('REFERENCE_INVALID');refs.add(key);return;
    }
    if(node[0]==='unary'&&node.length===3&&['+','-','!'].includes(node[1])){visit(node[2],depth+1);return;}
    if(node[0]==='binary'&&node.length===4){
      if(!BINARY.has(node[1]))fail('UNSUPPORTED_OPERATOR');
      visit(node[2],depth+1);visit(node[3],depth+1);return;
    }
    fail('AST_INVALID');
  }
  visit(root,1);return refs;
}
function run(ast,inputs,refs) {
  if(!plain(inputs)||Reflect.ownKeys(inputs).length>LIMIT.inputs)fail('INPUTS_INVALID');
  const values=new Map();
  for(const key of Reflect.ownKeys(inputs)){
    if(typeof key!=='string'||!REF.test(key)||!refs.has(key))fail('UNEXPECTED_INPUT');
    const descriptor=Object.getOwnPropertyDescriptor(inputs,key);
    if(!descriptor||!Object.hasOwn(descriptor,'value'))fail('INPUTS_INVALID');
    values.set(key,decimal(descriptor.value));
  }
  const used=new Set();
  function visit(node){
    if(node[0]==='number')return decimal(node[1]);
    if(node[0]==='reference'){
      const key=`${node[1]}[${node[2]}]`;
      if(!values.has(key))fail('MISSING_INPUT');used.add(key);return values.get(key);
    }
    if(node[0]==='unary'){
      const x=visit(node[2]);if(node[1]==='!')return !boolean(x);
      number(x);return node[1]==='-'?rational(-x.n,x.d):x;
    }
    const a=visit(node[2]);
    if(node[1]==='&&')return boolean(a)&&boolean(visit(node[3]));
    if(node[1]==='||')return boolean(a)||boolean(visit(node[3]));
    return binary(node[1],a,visit(node[3]));
  }
  const value=visit(ast);
  return {value:typeof value==='boolean'?{kind:'boolean',value}:{kind:'rational',numerator:String(value.n),denominator:String(value.d)},readReferences:[...used].sort()};
}
function envelope(data){return Object.freeze({semantics:SHADOW_SEMANTICS,payrollExecutionAllowed:false,grhEquivalenceVerified:false,...data});}
export function evaluateShadow(ast,inputs={}) {
  const refs=checkedTree(ast),result=run(ast,inputs,refs);
  return envelope({result:Object.freeze(result.value),readReferences:Object.freeze(result.readReferences)});
}
/** Explicit rounding at an explicit boundary, never rounding every intermediate result. */
export function roundShadow(ast,inputs,{places,mode}={}) {
  if(!Number.isInteger(places)||places<0||places>6||!['half_away_from_zero','half_even','toward_zero'].includes(mode))fail('ROUNDING_REQUIRED');
  const evaluated=evaluateShadow(ast,inputs),value=evaluated.result;
  if(value.kind!=='rational')fail('NUMBER_REQUIRED');
  const n=BigInt(value.numerator),d=BigInt(value.denominator),scaled=bounded(abs(n)*10n**BigInt(places));
  let q=scaled/d;const r=scaled%d;
  if(mode==='half_away_from_zero'&&r*2n>=d)q++;
  if(mode==='half_even'&&(r*2n>d||(r*2n===d&&q%2n===1n)))q++;
  const digits=q.toString().padStart(places+1,'0');
  const text=(n<0n&&q!==0n?'-':'')+(places?`${digits.slice(0,-places)}.${digits.slice(-places)}`:digits);
  return envelope({value:text,places,rounding:mode});
}
/** One counterexample disproves equivalence under THIS laboratory's semantics.
 * Matching finite probes never establish equivalence or authorize activation. */
export function compareShadow(left,right,probes) {
  const a=checkedTree(left),b=checkedTree(right),refs=new Set([...a,...b]);
  if(!Array.isArray(probes)||probes.length===0||probes.length>128)fail('PROBES_INVALID');
  let differs=0,indeterminate=0;
  const cases=probes.map((inputs,index)=>{
    function side(ast){try{return {result:run(ast,inputs,refs).value};}
      catch(error){if(!/^FORMULA_SHADOW_[A-Z_]+$/.test(error.message))fail('EVALUATION_FAILED');return {error:error.message};}}
    const lhs=side(left),rhs=side(right);
    const status=lhs.error||rhs.error?'indeterminate':JSON.stringify(lhs.result)===JSON.stringify(rhs.result)?'same_probe_result':'different_probe_result';
    if(status==='indeterminate')indeterminate++;if(status==='different_probe_result')differs++;
    return Object.freeze({index,status,left:Object.freeze(lhs),right:Object.freeze(rhs)});
  });
  return envelope({status:differs?'counterexample_found':indeterminate?'inconclusive':'no_counterexample_in_probes',cases:Object.freeze(cases)});
}
