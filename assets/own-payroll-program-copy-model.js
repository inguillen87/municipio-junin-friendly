import { ownProgramBootstrap, ownProgramDefinition, ownProgramHistory, ownProgramRuleKey } from './own-payroll-program-model.js';
import { salaryExact, salarySerialized } from './native-salary-catalog-model.js';
import { expressionChildren } from './own-payroll-program-workspace-model.js';

const fail = message => { throw Error(message); };
const month = value => typeof value === 'string' && /^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(value);
const reference = value => typeof value === 'string' && value === value.trim() && value === value.normalize('NFC') && value.length >= 3 && value.length <= 180 && !/[<>\u0000-\u001f\u007f]/.test(value);
const previousMonth = value => { const [y, m] = value.split('-').map(Number); return `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}`; };
const freeze = value => { if(value && typeof value === 'object'){Object.values(value).forEach(freeze);Object.freeze(value);} return value; };

// Copies an explicitly selected native rule, never interprets a GRH expression.
// The full resulting program still passes the ordinary catalog/history checks.
export function prepareProgramCopy(bootstrap, draft, intent) {
  const boot = ownProgramBootstrap(bootstrap);
  if(!boot.permissions.canPropose) fail('Tu cuenta no permite preparar reglas.');
  const base = ownProgramDefinition(draft, boot.salaryCatalog.items);
  ownProgramHistory(boot.program.definition, base);
  if(!salaryExact(intent, ['sourceKey', 'targets', 'validFrom', 'validUntil', 'ruleReference', 'mode'])
    || typeof intent.sourceKey !== 'string' || !Array.isArray(intent.targets) || !intent.targets.length || intent.targets.length > 1000
    || Reflect.ownKeys(intent.targets).length !== intent.targets.length + 1 || !Array.from({length:intent.targets.length},(_,i)=>Object.hasOwn(intent.targets,i)).every(Boolean)
    || !intent.targets.every(v => typeof v === 'string' && /^[0-9]{1,9}$/.test(v)) || new Set(intent.targets).size !== intent.targets.length
    || !month(intent.validFrom) || !(intent.validUntil === null || month(intent.validUntil) && intent.validUntil >= intent.validFrom)
    || !reference(intent.ruleReference) || !['add', 'replace'].includes(intent.mode)) fail('Elegí una regla, convenios distintos, vigencia, respaldo y tratamiento del historial explícitos.');
  const source = base.rules.find(r => ownProgramRuleKey(r) === intent.sourceKey);
  if(!source) fail('La regla de origen cambió. Revisá de nuevo el programa completo.');
  if(intent.targets.includes(source.agreementCode)) fail('El convenio de origen no puede ser también un destino.');
  const keys = new Set();
  const walk = n => { if(n.op === 'input') keys.add(n.key); for(const key of expressionChildren(n)) walk(n[key]); };
  walk(source.expression);
  const sources = base.bindings.filter(b => b.agreementCode === source.agreementCode && keys.has(b.key));
  const candidate = structuredClone(base);
  for(const target of [...intent.targets].sort()) {
    try {
      const overlapping = candidate.rules.filter(r => r.agreementCode === target && r.code === source.code
        && r.validFrom <= (intent.validUntil ?? '9999-12') && (r.validUntil ?? '9999-12') >= intent.validFrom
        && r.liquidationTypes.some(t => source.liquidationTypes.includes(t)));
      if(intent.mode === 'add' && overlapping.length) fail('Ya existe una regla en esa vigencia y tipo. Elegí cerrar la anterior o revisá las fechas.');
      if(intent.mode === 'replace') {
        if(overlapping.length !== 1 || overlapping[0].validFrom >= intent.validFrom
          || salarySerialized(overlapping[0].liquidationTypes) !== salarySerialized(source.liquidationTypes))
          fail('Cerrar la anterior exige una única regla previa, los mismos tipos y un inicio posterior. No se divide ni retira el historial.');
        overlapping[0].validUntil = previousMonth(intent.validFrom);
      }
      for(const binding of sources) {
        const copied = { ...binding, agreementCode: target };
        const prior = candidate.bindings.find(b => b.agreementCode === target && b.key === binding.key);
        if(prior && salarySerialized(prior) !== salarySerialized(copied)) fail(`La entrada ${binding.key} es diferente. Revisá sus fuentes antes de copiar; no se sobrescribe.`);
        if(!prior) candidate.bindings.push(copied);
      }
      candidate.rules.push({ ...structuredClone(source), agreementCode: target, validFrom: intent.validFrom, validUntil: intent.validUntil, ruleReference: intent.ruleReference });
    } catch(error) { throw Object.assign(Error(`Convenio ${target}: ${error.message}`), { code: error.code }); }
  }
  const program = ownProgramDefinition(candidate, boot.salaryCatalog.items);
  ownProgramHistory(boot.program.definition, program);
  return freeze({ scopeVersion: boot.scopeVersion, programVersion: boot.program.version, salaryVersion: boot.salaryCatalog.version,
    approvedDefinition: salarySerialized(boot.program.definition), catalog: salarySerialized(boot.salaryCatalog.items),
    base: salarySerialized(base), intent: structuredClone(intent), program });
}

export function applyProgramCopy(bootstrap, draft, plan) {
  if(!plan) fail('Revisá primero la copia completa.');
  const checked = prepareProgramCopy(bootstrap, draft, plan.intent);
  if(salarySerialized(checked) !== salarySerialized(plan)) fail('Cambió la preparación, el programa o el catálogo. Revisá de nuevo todos los destinos.');
  return structuredClone(checked.program);
}
