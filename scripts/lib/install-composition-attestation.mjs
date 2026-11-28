// Recolección de preimágenes reales para la atestación de la composición. Puro: no se conecta a ninguna base.
// attestationQuery arma UNA consulta de sólo lectura (BEGIN READ ONLY … ROLLBACK) que Codex ejecuta contra el destino
// autorizado; mergeAttestation vuelca su resultado en install-composition-attestation-v1.json sin marcar reviewed:true.
// La revisión humana/Codex del diff sigue siendo obligatoria antes de habilitar la instalación.
import assert from 'node:assert/strict';

export const ATTESTATION_OBSERVATION_VERSION = 'municontrol-install-composition-observation.v1';
const esc = s => "'" + String(s).replaceAll("'", "''") + "'";
const fnName = signature => signature.split('(')[0].split('.').pop();
const ident = /^[a-z_][a-z0-9_]*$/;
const hex = /^[a-f0-9]{64}$/;
const SIG_RE = /^public\.[a-z_][a-z0-9_]*\([a-z0-9_.\[\] ,]*\)$/;
const LANG_RE = /^[a-z_][a-z0-9_]{0,62}$/;
const BIN_RE = /^(?:\$libdir\/[a-z0-9_./-]{1,120})?$/;
const SAFE_TEXT = /^[^\x00-\x1f\x7f$]{0,2048}$/;
const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Nombres de función y disparadores que hay que observar, a partir de los manifiestos derivados. */
export function observationTargets(derivedManifests) {
  const names = new Set(), triggers = new Map();
  for (const manifest of derivedManifests) {
    for (const pin of manifest.preimages.functions) {
      const name = pin.function ?? fnName(pin.signature);
      assert.match(name, ident, 'ATTESTATION_FUNCTION_NAME_INVALID');
      names.add(name);
    }
    for (const t of manifest.preimages.triggers) {
      assert.match(t.relation, /^public\.[a-z_][a-z0-9_]*$/, 'ATTESTATION_TRIGGER_RELATION_INVALID');
      assert.match(t.name, ident, 'ATTESTATION_TRIGGER_NAME_INVALID');
      triggers.set(t.relation + ':' + t.name, t);
    }
  }
  return {names: [...names].sort(), triggers: [...triggers.values()].sort((a, b) => (a.relation + a.name).localeCompare(b.relation + b.name))};
}

/**
 * Consulta de sólo lectura. Con search_path=pg_catalog las firmas salen calificadas igual que en los manifiestos
 * (public.f(public.tabla,jsonb)). Dueño, ACL, hash del cuerpo y metadatos (secdef, config, lang, bin) usan exactamente
 * las mismas expresiones que el bloque de preimágenes de los SQL derivados. Devuelve todas las sobrecargas: elegir
 * una o varias es parte de la revisión.
 */
export function attestationQuery(derivedManifests) {
  const {names, triggers} = observationTargets(derivedManifests);
  assert.ok(names.length > 0 || triggers.length > 0, 'ATTESTATION_NOTHING_TO_OBSERVE');
  const nameList = names.length ? 'ARRAY[' + names.map(esc).join(',') + ']::text[]' : 'ARRAY[]::text[]';
  const triggerRows = triggers.length ? triggers.map(t => '(' + esc(t.relation) + ',' + esc(t.name) + ')').join(',') : "(NULL::text,NULL::text)";
  return `-- Preimágenes para install-composition-attestation-v1.json. Sólo lectura; no modifica nada.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path = pg_catalog;
SELECT pg_catalog.jsonb_build_object(
 'version', ${esc(ATTESTATION_OBSERVATION_VERSION)},
 'observedAt', pg_catalog.statement_timestamp(),
 'database', pg_catalog.current_database(),
 'functions', COALESCE((
  SELECT pg_catalog.jsonb_object_agg(p.oid::regprocedure::text, pg_catalog.jsonb_build_object(
    'owner', pg_catalog.pg_get_userbyid(p.proowner),
    'acl', COALESCE(p.proacl::text, '<NULL>'),
    'prosrcSha256', pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc, 'UTF8')), 'hex'),
    'secdef', p.prosecdef,
    'config', COALESCE(pg_catalog.to_jsonb(p.proconfig), '[]'::jsonb),
    'lang', (SELECT l.lanname FROM pg_catalog.pg_language l WHERE l.oid = p.prolang),
    'bin', COALESCE(p.probin, ''),
    'volatile', p.provolatile::text, 'strict', p.proisstrict, 'parallel', p.proparallel::text, 'leakproof', p.proleakproof))
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = ANY(${nameList})), '{}'::jsonb),
 'triggers', COALESCE((
  SELECT pg_catalog.jsonb_object_agg(wanted.relation || ':' || wanted.name, pg_catalog.jsonb_build_object(
    'enabled', t.tgenabled::text, 'type', t.tgtype::integer, 'function', t.tgfoid::regprocedure::text,
    'conditional', t.tgqual IS NOT NULL, 'arguments', t.tgnargs))
  FROM (VALUES ${triggerRows}) wanted(relation, name)
  JOIN pg_catalog.pg_trigger t ON t.tgrelid = pg_catalog.to_regclass(wanted.relation) AND t.tgname = wanted.name), '{}'::jsonb)
) AS observation;
ROLLBACK;
`;
}

function validObservedFunction(signature, seen) {
  return typeof signature === 'string' && signature.length <= 512 && SIG_RE.test(signature)
    && isPlainObject(seen)
    && typeof seen.owner === 'string' && seen.owner.length > 0 && SAFE_TEXT.test(seen.owner)
    && typeof seen.acl === 'string' && seen.acl.length > 0 && SAFE_TEXT.test(seen.acl)
    && typeof seen.prosrcSha256 === 'string' && hex.test(seen.prosrcSha256)
    && typeof seen.secdef === 'boolean'
    && Array.isArray(seen.config) && seen.config.length <= 32 && seen.config.every(c => typeof c === 'string' && SAFE_TEXT.test(c))
    && typeof seen.lang === 'string' && LANG_RE.test(seen.lang)
    && typeof seen.bin === 'string' && BIN_RE.test(seen.bin)
    && ['i', 's', 'v'].includes(seen.volatile) && typeof seen.strict === 'boolean'
    && ['s', 'r', 'u'].includes(seen.parallel) && typeof seen.leakproof === 'boolean';
}

/**
 * Vuelca la observación en la atestación de las fuentes pedidas. Sólo copia lo que cada fuente fija; una dependencia
 * sin firma declarada toma la única sobrecarga observada con su nombre (con varias, queda sin atestar y se informa).
 * Nunca pone reviewed:true. Nunca copia disparadores deshabilitados o cambiados ni sobrescribe fuentes ya revisadas
 * salvo que se indique explícitamente onlySources. Devuelve la atestación nueva y lo que quedó sin resolver.
 */
export function mergeAttestation(attestation, observation, derivedByName, {onlySources = null} = {}) {
  assert.equal(observation?.version, ATTESTATION_OBSERVATION_VERSION, 'ATTESTATION_OBSERVATION_VERSION');
  assert.ok(isPlainObject(observation.functions), 'ATTESTATION_OBSERVATION_FUNCTIONS');
  assert.ok(isPlainObject(observation.triggers), 'ATTESTATION_OBSERVATION_TRIGGERS');
  const targets = onlySources ? onlySources : Object.keys(derivedByName);
  for (const name of targets) assert.ok(Object.hasOwn(derivedByName, name), 'ATTESTATION_UNKNOWN_SOURCE: ' + name);
  const observedBy = name => Object.keys(observation.functions).filter(k => fnName(k) === name).sort();
  const sources = {}, unresolved = [];
  for (const name of targets) {
    // Sin --source explícito, preservar las fuentes ya revisadas para no borrar pasos previos de Fase 2.
    if (!onlySources && attestation.sources?.[name]?.reviewed === true) continue;
    const manifest = derivedByName[name];
    const functions = {}, triggers = {};
    for (const pin of manifest.preimages.functions) {
      const fname = pin.function ?? fnName(pin.signature);
      let signature = pin.signature;
      if (signature === null) {
        const candidates = observedBy(fname);
        if (candidates.length !== 1) { unresolved.push({source: name, function: fname, reason: candidates.length ? 'ambiguous' : 'missing', candidates}); continue; }
        [signature] = candidates;
      }
      const seen = observation.functions[signature];
      if (!seen) { unresolved.push({source: name, function: fname, signature, reason: 'missing'}); continue; }
      if (!validObservedFunction(signature, seen)) { unresolved.push({source: name, function: fname, signature, reason: 'invalid'}); continue; }
      // El cuerpo se copia tal como se observó también para reemplazos y guardas: si difiere del fijado por el
      // manifiesto, deriveSource lo rechaza (ATTESTATION_BODY_MISMATCH) en lugar de ocultar la diferencia.
      functions[signature] = {
        owner: seen.owner, acl: seen.acl, prosrcSha256: seen.prosrcSha256,
        secdef: seen.secdef, config: [...seen.config], lang: seen.lang, bin: seen.bin,
        volatile: seen.volatile, strict: seen.strict, parallel: seen.parallel, leakproof: seen.leakproof,
      };
    }
    for (const t of manifest.preimages.triggers) {
      const key = t.relation + ':' + t.name, seen = observation.triggers[key];
      if (!seen) { unresolved.push({source: name, trigger: key, reason: 'missing'}); continue; }
      if (!isPlainObject(seen) || !['O', 'A'].includes(seen.enabled)) {
        unresolved.push({source: name, trigger: key, reason: 'disabled', observed: seen}); continue;
      }
      if (seen.function !== t.function || seen.type !== t.type || seen.conditional !== false || seen.arguments !== 0) {
        unresolved.push({source: name, trigger: key, reason: 'changed', observed: seen}); continue;
      }
      triggers[key] = {enabled: seen.enabled};
    }
    sources[name] = {functions, triggers, reviewed: false};
  }
  return {attestation: {...attestation, sources: {...attestation.sources, ...sources}}, unresolved};
}
