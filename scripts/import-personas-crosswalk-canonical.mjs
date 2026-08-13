import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { Client } from '@neondatabase/serverless';

import {
  directCanonicalDatabaseUrl,
  enforceLogicalSizeGate,
  forEachBatch,
  postgresJson,
  readVerifiedJson,
  requiredText,
  sha256Text,
  stableJson,
} from './lib/canonical-import.mjs';
import { isValidCuil } from './lib/identity-rules.mjs';

const DATA_DIR = new URL('../rrhh-data/personas-crosswalk/', import.meta.url);
const MANIFEST_URL = new URL('personas-crosswalk-manifest.json', DATA_DIR);
const LOCK_NAME = 'municipio-junin-friendly:canonical-personas-crosswalk:v2';
const IMPORT_CONTRACT_VERSION = 'personas-crosswalk-canonical-v2';
const PERSONAS_STAGING_ENTITY = 'crosswalk_persona_auxiliary';
const GRH_IDENTITY_STAGING_ENTITY = 'grh_persona_identity_master';
const EXPECTED_POLICY = 'junin-person-crosswalk-v1';
const EXPECTED_COUNTS = Object.freeze({
  grhPersons: 2_349,
  grhPersonsWithLegajo: 2_325,
  grhPersonsWithoutLegajo: 24,
  matched: 1_699,
  ambiguous: 157,
  unmatched: 493,
});
const MATCH_METHODS = new Set([
  'cuil_unique',
  'cuil_duplicate_resolved',
  'dni_unique',
  'dni_duplicate_resolved',
]);
const STATUS_METHOD = Object.freeze({ ambiguous: 'ambiguous', unmatched: 'unmatched' });

function assertManifest(manifest) {
  if (manifest?.schemaVersion !== 1) throw new Error('Version de manifiesto PERSONAS no soportada.');
  if (manifest?.policyVersion !== EXPECTED_POLICY) {
    throw new Error(`Politica de crosswalk inesperada: ${manifest?.policyVersion}`);
  }
  const authority = manifest.authority ?? {};
  if (
    authority.employmentSystemOfRecord !== 'grh_junin'
    || authority.personasRole !== 'auxiliary_identity_and_territory_only'
    || authority.personasCanOverrideEmployment !== false
    || authority.rawIdJoinAllowed !== false
  ) {
    throw new Error('El manifiesto no conserva GRH como autoridad laboral y PERSONAS como auxiliar.');
  }
  const acceptance = manifest.acceptance ?? {};
  for (const gate of [
    'oneDecisionPerGrhPerson',
    'allGrhPersonsExported',
    'grhPersonsWithoutLegajoRetained',
    'statusTotalsReconcile',
    'noRawIdJoin',
    'validCuilOnly',
    'referenceSnapshotReproduced',
  ]) {
    if (acceptance[gate] !== true) throw new Error(`Gate de aceptacion PERSONAS fallido: ${gate}`);
  }
  if (acceptance.employmentFieldsImportedFromPersonas !== false) {
    throw new Error('PERSONAS no puede importar campos laborales.');
  }
  const identityMaster = manifest.grhIdentityMaster ?? {};
  if (
    Number(identityMaster.personsExported) !== EXPECTED_COUNTS.grhPersons
    || Number(identityMaster.distinctPersonsLinkedToLegajo) !== EXPECTED_COUNTS.grhPersonsWithLegajo
    || Number(identityMaster.personsWithoutLegajo) !== EXPECTED_COUNTS.grhPersonsWithoutLegajo
    || Number(identityMaster.personsWithoutLegajoDecisionStatus?.unmatched)
      !== EXPECTED_COUNTS.grhPersonsWithoutLegajo
    || Number(identityMaster.employmentRowsCreatedForPersonsWithoutLegajo) !== 0
  ) {
    throw new Error('El maestro de identidad GRH no reconcilia 2.349 personas, 2.325 con legajo y 24 sin legajo.');
  }
}

function nullableSourceText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function validateGrhIdentitySeed(seed, validFrom) {
  const sourceId = requiredText(seed?.source?.sourceId, 'grhIdentitySeed.source.sourceId');
  if (
    seed?.source?.system !== 'grh_junin'
    || seed?.source?.entity !== 'persona'
    || seed?.scope !== 'grh_identity_master_independent_of_employment'
  ) {
    throw new Error(`Semilla de identidad GRH fuera de contrato: ${sourceId}`);
  }
  for (const forbidden of ['employment', 'payroll', 'absence', 'position', 'organization']) {
    if (Object.hasOwn(seed, forbidden)) {
      throw new Error(`La semilla GRH ${sourceId} contiene el dominio prohibido ${forbidden}.`);
    }
  }
  if (typeof seed?.employmentLink?.hasLegajo !== 'boolean') {
    throw new Error(`La semilla GRH ${sourceId} no declara hasLegajo.`);
  }
  const identity = seed.identity ?? {};
  const quality = seed.quality ?? {};
  const cuil = nullableSourceText(identity.cuil);
  const sourceCuil = nullableSourceText(identity.sourceCuil);
  if (cuil !== null && (!/^\d{11}$/.test(cuil) || !isValidCuil(cuil))) {
    throw new Error(`CUIL GRH normalizado invalido: ${sourceId}`);
  }
  const dni = nullableSourceText(identity.documentNumber);
  const sourceDni = nullableSourceText(identity.sourceDocumentNumber);
  if (dni !== null && !/^\d{6,8}$/.test(dni)) {
    throw new Error(`DNI GRH normalizado invalido: ${sourceId}`);
  }
  const birthDate = nullableSourceText(identity.birthDate);
  if (birthDate !== null) {
    const cutoff = String(validFrom).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || birthDate < '1900-01-01' || birthDate > cutoff) {
      throw new Error(`Fecha de nacimiento GRH normalizada invalida: ${sourceId}`);
    }
  }
  if (
    quality.validCuil !== (cuil !== null)
    || quality.validDni !== (dni !== null)
    || quality.validBirthDate !== (birthDate !== null)
    || quality.invalidSourceCuilRetained !== (sourceCuil !== null && cuil === null)
    || quality.invalidSourceDniRetained !== (sourceDni !== null && dni === null)
    || quality.invalidSourceBirthDateRetained
      !== (nullableSourceText(identity.sourceBirthDate) !== null && birthDate === null)
  ) {
    throw new Error(`Flags de calidad GRH incoherentes: ${sourceId}`);
  }
  const qualityScore = Number(quality.score);
  if (!Number.isFinite(qualityScore) || qualityScore < 0 || qualityScore > 100) {
    throw new Error(`Score de identidad GRH invalido: ${sourceId}`);
  }
  return sourceId;
}

function grhAssertionsFor(seed) {
  const identity = seed.identity ?? {};
  const address = seed.address ?? {};
  const digits = (value) => nullableSourceText(value)?.replace(/\D/g, '') || null;
  const attributes = [
    ['cuil', identity.sourceCuil, identity.cuil, identity.cuil !== null, 1],
    ['dni', identity.sourceDocumentNumber, identity.documentNumber, identity.documentNumber !== null, 0.95],
    ['full_name', identity.fullName, identity.fullName, identity.fullName !== null, 0.9],
    ['birth_date', identity.sourceBirthDate, identity.birthDate, identity.birthDate !== null, 0.9],
    ['sex_code', identity.sexCode, identity.sexCode, identity.sexCode !== null, 0.85],
    ['email', identity.email, nullableSourceText(identity.email)?.toLowerCase() ?? null, identity.email !== null, 0.7],
    ['phone', identity.phone, digits(identity.phone), digits(identity.phone) !== null, 0.7],
    ['address', address.raw, nullableSourceText(address.raw), address.raw !== null, 0.65],
    ['locality', address.locality, nullableSourceText(address.locality)?.toUpperCase() ?? null, address.locality !== null, 0.65],
  ];
  return attributes
    .filter(([_attributeName, rawValue]) => nullableSourceText(rawValue) !== null)
    .map(([attributeName, rawValue, normalizedValue, eligibleForPromotion, confidence]) => ({
      grhSourceId: seed.source.sourceId,
      attributeName,
      rawValue,
      normalizedValue: eligibleForPromotion ? normalizedValue : null,
      confidence,
      eligibleForPromotion,
      evidence: {
        sourcePriority: 'labor_identity_master',
        identityMasterIndependentOfEmployment: true,
        hasLegajo: seed.employmentLink.hasLegajo,
      },
    }));
}

function validateDecision(record, validFrom) {
  const sourceId = requiredText(record?.source?.sourceId, 'crosswalk.source.sourceId');
  if (record?.source?.system !== 'grh_junin' || record?.source?.entity !== 'persona') {
    throw new Error(`Origen invalido para decision GRH ${sourceId}`);
  }
  if (record.validFrom !== validFrom || record.validTo !== null) {
    throw new Error(`Vigencia invalida para decision GRH ${sourceId}`);
  }
  if (record?.evidence?.rawIdJoinUsed !== false) {
    throw new Error(`Decision GRH ${sourceId} intento usar igualdad de IDPERSONA.`);
  }
  if (!['matched', 'ambiguous', 'unmatched'].includes(record.status)) {
    throw new Error(`Estado invalido para decision GRH ${sourceId}: ${record.status}`);
  }
  if (record.status === 'matched') {
    if (!MATCH_METHODS.has(record.matchMethod)) {
      throw new Error(`Metodo invalido para decision GRH ${sourceId}: ${record.matchMethod}`);
    }
    if (record?.target?.system !== 'personas_junin' || record?.target?.entity !== 'persona') {
      throw new Error(`Destino PERSONAS invalido para decision GRH ${sourceId}`);
    }
    requiredText(record.target.sourceId, `crosswalk.${sourceId}.target.sourceId`);
    const confidence = Number(record.confidence);
    if (!(confidence > 0 && confidence <= 1)) {
      throw new Error(`Confianza invalida para decision GRH ${sourceId}`);
    }
  } else {
    if (record.target !== null || record.matchMethod !== null || record.confidence !== null) {
      throw new Error(`Decision ${record.status} ${sourceId} contiene un match promovible.`);
    }
  }
  return sourceId;
}

function assertionsFor(decision, auxiliary) {
  if (!auxiliary) return [];
  const identity = auxiliary.identity ?? {};
  const attributes = [
    ['cuil', identity.cuil, identity.cuil],
    ['dni', identity.documentNumber, identity.documentNumber],
    ['full_name', identity.name, identity.normalizedName],
    ['birth_date', identity.birthDate, identity.birthDate],
    ['sex_code', identity.sex, identity.sex],
    ['territory', auxiliary.territory, null],
    ['address', auxiliary.domiciles?.length ? auxiliary.domiciles : null, null],
  ];
  return attributes
    .filter(([_attribute, rawValue]) => rawValue !== null && rawValue !== undefined && rawValue !== '')
    .map(([attributeName, rawValue, normalizedValue]) => ({
      personasSourceId: auxiliary.source.sourceId,
      attributeName,
      rawValue,
      normalizedValue,
      confidence: Number(decision.confidence),
      eligibleForPromotion: Number(decision.confidence) >= 0.9,
      evidence: {
        scope: 'auxiliary_identity_and_territory_only',
        automaticallyPromoted: false,
        grhEmploymentAuthority: true,
        crosswalkMethod: decision.matchMethod,
      },
    }));
}

async function preflight() {
  const manifest = JSON.parse(await readFile(MANIFEST_URL, 'utf8'));
  assertManifest(manifest);
  const grhIdentityDescriptor = manifest.outputs?.grhIdentitySeeds;
  const crosswalkDescriptor = manifest.outputs?.crosswalk;
  const auxiliaryDescriptor = manifest.outputs?.matchedAuxiliary;
  const grhIdentityUrl = new URL(
    requiredText(grhIdentityDescriptor?.fileName, 'outputs.grhIdentitySeeds.fileName'),
    DATA_DIR,
  );
  const crosswalkUrl = new URL(requiredText(crosswalkDescriptor?.fileName, 'outputs.crosswalk.fileName'), DATA_DIR);
  const auxiliaryUrl = new URL(requiredText(auxiliaryDescriptor?.fileName, 'outputs.matchedAuxiliary.fileName'), DATA_DIR);
  const [grhIdentityArtifact, crosswalkArtifact, auxiliaryArtifact] = await Promise.all([
    readVerifiedJson(grhIdentityUrl, grhIdentityDescriptor, 'maestro de identidad GRH'),
    readVerifiedJson(crosswalkUrl, crosswalkDescriptor, 'crosswalk PERSONAS'),
    readVerifiedJson(auxiliaryUrl, auxiliaryDescriptor, 'auxiliar PERSONAS'),
  ]);
  enforceLogicalSizeGate([grhIdentityArtifact, crosswalkArtifact, auxiliaryArtifact]);
  const grhIdentitySeeds = grhIdentityArtifact.value;
  const decisions = crosswalkArtifact.value;
  const auxiliaries = auxiliaryArtifact.value;
  if (!Array.isArray(grhIdentitySeeds) || !Array.isArray(decisions) || !Array.isArray(auxiliaries)) {
    throw new Error('Los outputs PERSONAS deben ser arrays JSON.');
  }
  const validFrom = requiredText(manifest.generatedFromSourceCutoff, 'generatedFromSourceCutoff');
  const grhIdentityById = new Map();
  const normalizedCuils = new Set();
  const normalizedDnis = new Set();
  for (const seed of grhIdentitySeeds) {
    const sourceId = validateGrhIdentitySeed(seed, validFrom);
    if (grhIdentityById.has(sourceId)) throw new Error(`Semilla de identidad GRH duplicada: ${sourceId}`);
    grhIdentityById.set(sourceId, seed);
    const cuil = nullableSourceText(seed.identity.cuil);
    const dni = nullableSourceText(seed.identity.documentNumber);
    if (cuil !== null && normalizedCuils.has(cuil)) throw new Error(`CUIL GRH duplicado en maestro: ${cuil}`);
    if (dni !== null && normalizedDnis.has(dni)) throw new Error(`DNI GRH duplicado en maestro: ${dni}`);
    if (cuil !== null) normalizedCuils.add(cuil);
    if (dni !== null) normalizedDnis.add(dni);
  }
  const decisionIds = new Set();
  const matchedTargetIds = new Set();
  for (const decision of decisions) {
    const sourceId = validateDecision(decision, validFrom);
    if (decisionIds.has(sourceId)) throw new Error(`Decision GRH duplicada: ${sourceId}`);
    decisionIds.add(sourceId);
    if (decision.status === 'matched') {
      const targetId = decision.target.sourceId;
      if (matchedTargetIds.has(targetId)) throw new Error(`Destino PERSONAS duplicado: ${targetId}`);
      matchedTargetIds.add(targetId);
    }
  }
  const auxiliaryById = new Map();
  for (const auxiliary of auxiliaries) {
    const sourceId = requiredText(auxiliary?.source?.sourceId, 'auxiliary.source.sourceId');
    if (
      auxiliary?.source?.system !== 'personas_junin'
      || auxiliary?.source?.entity !== 'persona'
      || auxiliary?.scope !== 'auxiliary_identity_and_territory_only'
    ) {
      throw new Error(`Registro auxiliar PERSONAS fuera de alcance: ${sourceId}`);
    }
    for (const forbidden of ['employment', 'payroll', 'absence', 'position', 'organization']) {
      if (Object.hasOwn(auxiliary, forbidden)) {
        throw new Error(`PERSONAS intento aportar el campo laboral prohibido ${forbidden}: ${sourceId}`);
      }
    }
    if (auxiliary.identity?.cuil !== null && auxiliary.identity?.cuil !== undefined) {
      if (!isValidCuil(auxiliary.identity.cuil)) {
        throw new Error(`CUIL PERSONAS invalido marcado como enriquecimiento: ${sourceId}`);
      }
    }
    const documentNumber = auxiliary.identity?.documentNumber;
    if (documentNumber !== null && documentNumber !== undefined && !/^\d{5,12}$/.test(String(documentNumber))) {
      throw new Error(`DNI PERSONAS invalido marcado como enriquecimiento: ${sourceId}`);
    }
    if (auxiliaryById.has(sourceId)) throw new Error(`Auxiliar PERSONAS duplicado: ${sourceId}`);
    auxiliaryById.set(sourceId, auxiliary);
  }
  if (auxiliaryById.size !== matchedTargetIds.size) {
    throw new Error(`Cobertura auxiliar invalida: ${auxiliaryById.size} != ${matchedTargetIds.size}`);
  }
  for (const sourceId of matchedTargetIds) {
    if (!auxiliaryById.has(sourceId)) throw new Error(`Falta auxiliar PERSONAS para ${sourceId}`);
  }
  const matching = manifest.matching ?? {};
  const statusCounts = decisions.reduce((counts, row) => {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
    return counts;
  }, {});
  if (
    statusCounts.matched !== Number(matching.matched)
    || statusCounts.ambiguous !== Number(matching.ambiguous)
    || statusCounts.unmatched !== Number(matching.unmatched)
    || decisions.length !== Number(matching.grhPersons)
  ) {
    throw new Error('Los conteos PERSONAS no reconcilian con el manifiesto.');
  }
  if (
    grhIdentityById.size !== EXPECTED_COUNTS.grhPersons
    || decisionIds.size !== EXPECTED_COUNTS.grhPersons
    || statusCounts.matched !== EXPECTED_COUNTS.matched
    || statusCounts.ambiguous !== EXPECTED_COUNTS.ambiguous
    || statusCounts.unmatched !== EXPECTED_COUNTS.unmatched
  ) {
    throw new Error('El artefacto no reproduce los conteos auditados 2.349/1.699/157/493.');
  }
  for (const sourceId of decisionIds) {
    if (!grhIdentityById.has(sourceId)) throw new Error(`Falta identidad GRH para decision ${sourceId}`);
  }
  for (const sourceId of grhIdentityById.keys()) {
    if (!decisionIds.has(sourceId)) throw new Error(`Falta decision de crosswalk para identidad GRH ${sourceId}`);
  }
  const grhPersonsWithoutLegajo = grhIdentitySeeds.filter((seed) => !seed.employmentLink.hasLegajo);
  const grhPersonsWithLegajo = grhIdentitySeeds.length - grhPersonsWithoutLegajo.length;
  if (
    grhPersonsWithLegajo !== EXPECTED_COUNTS.grhPersonsWithLegajo
    || grhPersonsWithoutLegajo.length !== EXPECTED_COUNTS.grhPersonsWithoutLegajo
    || grhPersonsWithoutLegajo.some((seed) => {
      const decision = decisions.find((candidate) => candidate.source.sourceId === seed.source.sourceId);
      return decision?.status !== 'unmatched';
    })
  ) {
    throw new Error('La anti-union persona/legajo GRH no conserva los 24 casos unmatched auditados.');
  }
  const grhIdentityStagedRows = grhIdentitySeeds.map((seed, index) => {
    const payload = { importerContractVersion: IMPORT_CONTRACT_VERSION, seed };
    return {
      sourceId: seed.source.sourceId,
      rowNumber: index + 1,
      rowSha256: sha256Text(stableJson(payload)),
      payload,
    };
  });
  const personasStagedRows = decisions.map((decision, index) => {
    const auxiliary = decision.target ? auxiliaryById.get(decision.target.sourceId) : null;
    const payload = { importerContractVersion: IMPORT_CONTRACT_VERSION, decision, auxiliary };
    return {
      sourceId: decision.source.sourceId,
      rowNumber: index + 1,
      rowSha256: sha256Text(stableJson(payload)),
      payload,
    };
  });
  const assertions = decisions.flatMap((decision) =>
    assertionsFor(decision, decision.target ? auxiliaryById.get(decision.target.sourceId) : null),
  );
  const grhAssertions = grhIdentitySeeds.flatMap(grhAssertionsFor);
  return {
    manifest,
    grhIdentitySeeds,
    grhIdentityStagedRows,
    grhAssertions,
    grhPersonsWithoutLegajo,
    decisions,
    personasStagedRows,
    assertions,
    validFrom,
    logicalBytes: grhIdentityArtifact.bytes + crosswalkArtifact.bytes + auxiliaryArtifact.bytes,
  };
}

async function requireCanonicalContracts(client) {
  const result = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY($1::text[])
  `, [[
    'source_import_batch', 'source_staging_row', 'person_identity', 'source_xref',
    'person_identity_assertion', 'crosswalk_persona', 'employment_contract',
  ]]);
  if (result.rowCount !== 7) throw new Error(`Esquema canonico PERSONAS incompleto: ${result.rowCount}/7 tablas.`);
}

async function resolveBatches(client, manifest) {
  const grhSha = requiredText(manifest.sources?.grh_junin?.contentSha256, 'sources.grh_junin.contentSha256').toUpperCase();
  const personasSha = requiredText(
    manifest.sources?.personas_junin?.contentSha256,
    'sources.personas_junin.contentSha256',
  ).toUpperCase();
  const grhResult = await client.query(
    `SELECT id, source_cutoff
       FROM source_import_batch
      WHERE source_system = 'GRH' AND source_sha256 = $1`,
    [grhSha],
  );
  if (grhResult.rowCount !== 1) {
    throw new Error('Falta el batch GRH canonico del mismo dump; ejecute primero la promocion GRH validada.');
  }
  const personasSource = manifest.sources.personas_junin;
  await client.query(
    `INSERT INTO source_import_batch (
       id, source_system, source_database, source_file_name, source_sha256,
       source_cutoff, source_row_count, validation_state, manifest
     ) VALUES (
       md5('source_import_batch|PERSONAS|' || $1)::uuid,
       'PERSONAS', 'personas_junin', $2, $1, $3::timestamptz, $4, 'published', $5::jsonb
     ) ON CONFLICT DO NOTHING`,
    [
      personasSha,
      requiredText(personasSource.fileName, 'sources.personas_junin.fileName'),
      requiredText(manifest.generatedFromSourceCutoff, 'generatedFromSourceCutoff'),
      Number(personasSource.tablesRead?.persona),
      postgresJson(manifest),
    ],
  );
  const personasResult = await client.query(
    `SELECT id, source_database, source_cutoff, manifest
       FROM source_import_batch
      WHERE source_system = 'PERSONAS' AND source_sha256 = $1`,
    [personasSha],
  );
  if (personasResult.rowCount !== 1) throw new Error('No se pudo resolver el batch PERSONAS.');
  const stored = personasResult.rows[0];
  if (
    stored.source_database !== 'personas_junin'
    || stored.manifest?.policyVersion !== manifest.policyVersion
    || stored.manifest?.outputs?.grhIdentitySeeds?.sha256 !== manifest.outputs.grhIdentitySeeds.sha256
    || stored.manifest?.outputs?.crosswalk?.sha256 !== manifest.outputs.crosswalk.sha256
    || stored.manifest?.outputs?.matchedAuxiliary?.sha256 !== manifest.outputs.matchedAuxiliary.sha256
  ) {
    throw new Error('El batch PERSONAS existente no coincide con el manifiesto verificado.');
  }
  return {
    grhBatchId: grhResult.rows[0].id,
    grhValidFrom: grhResult.rows[0].source_cutoff,
    personasBatchId: stored.id,
  };
}

async function insertStaging(client, {
  batchId,
  sourceSchema,
  sourceEntity,
  stagedRows,
  label,
}) {
  await forEachBatch(stagedRows, 100, async (rows) => {
    const databaseRows = rows.map((row) => ({
      source_id: row.sourceId,
      row_number: row.rowNumber,
      row_sha256: row.rowSha256,
      source_payload: row.payload,
    }));
    await client.query(
      `INSERT INTO source_staging_row (
         batch_id, source_schema, source_entity, source_id,
         source_row_number, source_row_sha256, source_payload
       )
       SELECT $1::uuid, $2, $3, row.source_id,
               row.row_number, row.row_sha256, row.source_payload
        FROM jsonb_to_recordset($4::jsonb) AS row(
         source_id text, row_number bigint, row_sha256 char(64), source_payload jsonb
       )
       ON CONFLICT DO NOTHING`,
      [batchId, sourceSchema, sourceEntity, postgresJson(databaseRows)],
    );
    const verified = await client.query(
      `WITH expected AS (
         SELECT * FROM jsonb_to_recordset($3::jsonb) AS row(
           source_id text, row_number bigint, row_sha256 char(64), source_payload jsonb
         )
       )
       SELECT count(*)::int AS matching
       FROM expected
       JOIN source_staging_row staged
         ON staged.batch_id = $1::uuid
        AND staged.source_entity = $2
        AND staged.source_id = expected.source_id
        AND staged.source_row_number = expected.row_number
        AND staged.source_row_sha256 = expected.row_sha256
        AND staged.source_payload ->> 'importerContractVersion' = $4`,
      [batchId, sourceEntity, postgresJson(databaseRows), IMPORT_CONTRACT_VERSION],
    );
    if (verified.rows[0].matching !== rows.length) {
      throw new Error(`Staging ${label} incompatible o incompleto: ${verified.rows[0].matching}/${rows.length}.`);
    }
  });
}

async function upsertGrhIdentityMaster(client, batches, seeds, assertions) {
  await forEachBatch(seeds, 200, async (rows) => {
    const databaseRows = rows.map((seed) => ({
      source_id: seed.source.sourceId,
      cuil: seed.identity.cuil,
      dni: seed.identity.documentNumber,
      full_name: seed.identity.fullName,
      birth_date: seed.identity.birthDate,
      sex_code: seed.identity.sexCode,
      quality_score: seed.quality.score,
      has_legajo: seed.employmentLink.hasLegajo,
    }));
    await client.query(
      `INSERT INTO person_identity (
         id, cuil, dni, full_name, birth_date, sex_code,
         data_quality_score, identity_state
       )
       SELECT md5('person_identity|GRH|persona|' || input.source_id)::uuid,
              input.cuil, input.dni, input.full_name, input.birth_date,
              input.sex_code, input.quality_score, 'active'
       FROM jsonb_to_recordset($1::jsonb) AS input(
         source_id text, cuil text, dni text, full_name text,
         birth_date date, sex_code text, quality_score numeric, has_legajo boolean
       )
       ON CONFLICT (id) DO UPDATE
       SET cuil = EXCLUDED.cuil,
           dni = EXCLUDED.dni,
           full_name = EXCLUDED.full_name,
           birth_date = EXCLUDED.birth_date,
           sex_code = EXCLUDED.sex_code,
           data_quality_score = EXCLUDED.data_quality_score,
           identity_state = EXCLUDED.identity_state,
           updated_at = now()
       WHERE (person_identity.cuil, person_identity.dni, person_identity.full_name,
              person_identity.birth_date, person_identity.sex_code,
              person_identity.data_quality_score, person_identity.identity_state)
         IS DISTINCT FROM
             (EXCLUDED.cuil, EXCLUDED.dni, EXCLUDED.full_name,
              EXCLUDED.birth_date, EXCLUDED.sex_code,
              EXCLUDED.data_quality_score, EXCLUDED.identity_state)`,
      [postgresJson(databaseRows)],
    );
    await client.query(
      `INSERT INTO source_xref (
         source_system, source_entity, source_id, source_batch_id,
         canonical_entity, canonical_id, match_method, confidence,
         evidence, valid_from
       )
       SELECT 'GRH', 'persona', input.source_id, $1::uuid,
              'person_identity', md5('person_identity|GRH|persona|' || input.source_id)::uuid,
              'grh_person_seed', 1.0000,
              jsonb_build_object(
                'authority', 'GRH identity master',
                'identityMasterIndependentOfEmployment', true,
                'hasLegajo', input.has_legajo,
                'crossSourceIdMatchUsed', false
              ),
              $3::timestamptz
       FROM jsonb_to_recordset($2::jsonb) AS input(source_id text, has_legajo boolean)
       WHERE NOT EXISTS (
         SELECT 1 FROM source_xref existing
         WHERE existing.source_system = 'GRH'
           AND existing.source_entity = 'persona'
           AND existing.source_id = input.source_id
           AND existing.valid_to IS NULL
       )
       ON CONFLICT DO NOTHING`,
      [
        batches.grhBatchId,
        postgresJson(databaseRows.map((row) => ({
          source_id: row.source_id,
          has_legajo: row.has_legajo,
        }))),
        batches.grhValidFrom,
      ],
    );
  });

  await forEachBatch(assertions, 200, async (rows) => {
    const databaseRows = rows.map((row) => ({
      grh_source_id: row.grhSourceId,
      attribute_name: row.attributeName,
      raw_value: row.rawValue,
      normalized_value: row.normalizedValue,
      confidence: row.confidence,
      eligible_for_promotion: row.eligibleForPromotion,
      evidence: row.evidence,
    }));
    await client.query(
      `INSERT INTO person_identity_assertion (
         id, person_id, attribute_name, raw_value, normalized_value,
         source_system, source_entity, source_id, source_batch_id,
         confidence, evidence, eligible_for_promotion, preferred, valid_from
       )
       SELECT md5(
                'person_identity_assertion|GRH|persona|' || input.grh_source_id
                || '|' || input.attribute_name || '|' || $1::text
              )::uuid,
              md5('person_identity|GRH|persona|' || input.grh_source_id)::uuid,
              input.attribute_name, input.raw_value, input.normalized_value,
              'GRH', 'persona', input.grh_source_id, $1::uuid,
              input.confidence, input.evidence, input.eligible_for_promotion,
              input.eligible_for_promotion, $3::timestamptz
       FROM jsonb_to_recordset($2::jsonb) AS input(
         grh_source_id text, attribute_name text, raw_value jsonb,
         normalized_value text, confidence numeric,
         eligible_for_promotion boolean, evidence jsonb
       )
       ON CONFLICT (id) DO UPDATE
       SET raw_value = EXCLUDED.raw_value,
           normalized_value = EXCLUDED.normalized_value,
           confidence = EXCLUDED.confidence,
           evidence = EXCLUDED.evidence,
           eligible_for_promotion = EXCLUDED.eligible_for_promotion,
           preferred = EXCLUDED.preferred,
           valid_from = EXCLUDED.valid_from,
           valid_to = NULL
       WHERE (person_identity_assertion.raw_value,
              person_identity_assertion.normalized_value,
              person_identity_assertion.confidence,
              person_identity_assertion.evidence,
              person_identity_assertion.eligible_for_promotion,
              person_identity_assertion.preferred,
              person_identity_assertion.valid_from,
              person_identity_assertion.valid_to)
         IS DISTINCT FROM
             (EXCLUDED.raw_value,
              EXCLUDED.normalized_value,
              EXCLUDED.confidence,
              EXCLUDED.evidence,
              EXCLUDED.eligible_for_promotion,
              EXCLUDED.preferred,
              EXCLUDED.valid_from,
              NULL)`,
      [batches.grhBatchId, postgresJson(databaseRows), batches.grhValidFrom],
    );
  });
}

async function insertCrosswalk(client, batches, decisions, validFrom) {
  const databaseRows = decisions.map((decision) => ({
    grh_source_id: decision.source.sourceId,
    personas_source_id: decision.target?.sourceId ?? null,
    match_status: decision.status,
    match_method: decision.matchMethod ?? STATUS_METHOD[decision.status],
    confidence: decision.confidence ?? 0,
    evidence: decision.evidence,
  }));
  const latest = await client.query(`SELECT max(valid_from) AS valid_from FROM crosswalk_persona WHERE valid_to IS NULL`);
  if (latest.rows[0]?.valid_from && new Date(latest.rows[0].valid_from) > new Date(validFrom)) {
    throw new Error('El crosswalk a importar es anterior a la version activa.');
  }
  await client.query(
    `UPDATE crosswalk_persona
        SET valid_to = $1::timestamptz
      WHERE valid_to IS NULL AND valid_from < $1::timestamptz`,
    [validFrom],
  );
  await forEachBatch(databaseRows, 200, async (rows) => {
    await client.query(
      `INSERT INTO crosswalk_persona (
         id, person_id, grh_batch_id, grh_source_entity, grh_source_id,
         personas_batch_id, personas_source_entity, personas_source_id,
         match_status, match_method, confidence, evidence, valid_from
       )
       SELECT md5('crosswalk_persona|' || input.grh_source_id || '|' || $4::text)::uuid,
              grh_xref.canonical_id, $1::uuid, 'persona', input.grh_source_id,
              $2::uuid,
              CASE WHEN input.match_status = 'matched' THEN 'persona' ELSE NULL END,
              input.personas_source_id, input.match_status, input.match_method,
              input.confidence, input.evidence, $4::timestamptz
       FROM jsonb_to_recordset($3::jsonb) AS input(
         grh_source_id text, personas_source_id text, match_status text,
         match_method text, confidence numeric, evidence jsonb
       )
       JOIN source_xref grh_xref
         ON grh_xref.source_system = 'GRH'
        AND grh_xref.source_entity = 'persona'
        AND grh_xref.source_id = input.grh_source_id
        AND grh_xref.canonical_entity = 'person_identity'
        AND grh_xref.valid_to IS NULL
       ON CONFLICT DO NOTHING`,
      [batches.grhBatchId, batches.personasBatchId, postgresJson(rows), validFrom],
    );
  });
}

async function insertPersonasXrefs(client, batchId, decisions, validFrom) {
  const matched = decisions.filter((decision) => decision.status === 'matched').map((decision) => ({
    grh_source_id: decision.source.sourceId,
    personas_source_id: decision.target.sourceId,
    match_method: decision.matchMethod,
    confidence: decision.confidence,
    evidence: { ...decision.evidence, extractorMatchMethod: decision.matchMethod },
  }));
  await client.query(
    `UPDATE source_xref
        SET valid_to = $1::timestamptz
      WHERE source_system = 'PERSONAS' AND source_entity = 'persona'
        AND valid_to IS NULL AND valid_from < $1::timestamptz`,
    [validFrom],
  );
  await forEachBatch(matched, 200, async (rows) => {
    await client.query(
      `INSERT INTO source_xref (
         source_system, source_entity, source_id, source_batch_id,
         canonical_entity, canonical_id, match_method, confidence, evidence, valid_from
       )
       SELECT 'PERSONAS', 'persona', input.personas_source_id, $1::uuid,
              'person_identity', grh_xref.canonical_id, input.match_method,
              input.confidence, input.evidence, $3::timestamptz
       FROM jsonb_to_recordset($2::jsonb) AS input(
         grh_source_id text, personas_source_id text, match_method text,
         confidence numeric, evidence jsonb
       )
       JOIN source_xref grh_xref
         ON grh_xref.source_system = 'GRH'
        AND grh_xref.source_entity = 'persona'
        AND grh_xref.source_id = input.grh_source_id
        AND grh_xref.canonical_entity = 'person_identity'
        AND grh_xref.valid_to IS NULL
       ON CONFLICT DO NOTHING`,
      [batchId, postgresJson(rows), validFrom],
    );
  });
}

async function insertAssertions(client, batchId, assertions, validFrom) {
  await client.query(
    `UPDATE person_identity_assertion
        SET valid_to = $1::timestamptz, preferred = false
      WHERE source_system = 'PERSONAS' AND valid_to IS NULL AND valid_from < $1::timestamptz`,
    [validFrom],
  );
  await forEachBatch(assertions, 200, async (rows) => {
    await client.query(
      `INSERT INTO person_identity_assertion (
         id, person_id, attribute_name, raw_value, normalized_value,
         source_system, source_entity, source_id, source_batch_id,
         confidence, evidence, eligible_for_promotion, preferred, valid_from
       )
       SELECT md5(
                'person_identity_assertion|PERSONAS|persona|' || input.personas_source_id
                || '|' || input.attribute_name || '|' || $1::text
              )::uuid,
              xref.canonical_id, input.attribute_name, input.raw_value,
              input.normalized_value, 'PERSONAS', 'persona', input.personas_source_id,
              $1::uuid, input.confidence, input.evidence,
              input.eligible_for_promotion, false, $3::timestamptz
       FROM jsonb_to_recordset($2::jsonb) AS input(
         personas_source_id text, attribute_name text, raw_value jsonb,
         normalized_value text, confidence numeric,
         eligible_for_promotion boolean, evidence jsonb
       )
       JOIN source_xref xref
         ON xref.source_system = 'PERSONAS'
        AND xref.source_entity = 'persona'
        AND xref.source_id = input.personas_source_id
        AND xref.canonical_entity = 'person_identity'
        AND xref.valid_to IS NULL
       ON CONFLICT DO NOTHING`,
      [batchId, postgresJson(rows.map((row) => ({
        personas_source_id: row.personasSourceId,
        attribute_name: row.attributeName,
        raw_value: row.rawValue,
        normalized_value: row.normalizedValue,
        confidence: row.confidence,
        eligible_for_promotion: row.eligibleForPromotion,
        evidence: row.evidence,
      }))), validFrom],
    );
  });
}

async function verifyDatabase(client, batches, expected) {
  const result = await client.query(
    `WITH expected_grh AS (
       SELECT source_id
       FROM jsonb_to_recordset($6::jsonb) AS row(source_id text)
     ), no_legajo AS (
       SELECT source_id
       FROM jsonb_to_recordset($7::jsonb) AS row(source_id text)
     )
     SELECT
       (SELECT count(*)::int FROM source_staging_row
         WHERE batch_id = $1 AND source_entity = $2) AS staging,
       (SELECT count(*)::int FROM source_staging_row
         WHERE batch_id = $3 AND source_entity = $5) AS grh_identity_staging,
       (SELECT count(*)::int
          FROM expected_grh expected
          JOIN person_identity person
            ON person.id = md5('person_identity|GRH|persona|' || expected.source_id)::uuid
           AND person.identity_state = 'active') AS grh_identities,
       (SELECT count(*)::int
          FROM expected_grh expected
          JOIN source_xref xref
            ON xref.source_batch_id = $3
           AND xref.source_system = 'GRH'
           AND xref.source_entity = 'persona'
           AND xref.source_id = expected.source_id
           AND xref.canonical_entity = 'person_identity'
           AND xref.canonical_id = md5('person_identity|GRH|persona|' || expected.source_id)::uuid
           AND xref.valid_to IS NULL) AS grh_xrefs,
       (SELECT count(*)::int FROM source_xref
         WHERE source_batch_id = $3 AND source_system = 'GRH'
           AND source_entity = 'persona' AND canonical_entity = 'person_identity'
           AND valid_to IS NULL) AS grh_xref_total,
       (SELECT count(*)::int FROM person_identity_assertion
         WHERE source_batch_id = $3 AND source_system = 'GRH'
           AND source_entity = 'persona') AS grh_assertions,
       (SELECT count(*)::int FROM crosswalk_persona
         WHERE grh_batch_id = $3 AND personas_batch_id = $1
            AND valid_from = $4::timestamptz) AS decisions,
       (SELECT count(*)::int FROM crosswalk_persona
         WHERE grh_batch_id = $3 AND personas_batch_id = $1
           AND valid_from = $4::timestamptz AND match_status = 'matched') AS matched,
       (SELECT count(*)::int FROM crosswalk_persona
         WHERE grh_batch_id = $3 AND personas_batch_id = $1
           AND valid_from = $4::timestamptz AND match_status = 'ambiguous') AS ambiguous,
       (SELECT count(*)::int FROM crosswalk_persona
         WHERE grh_batch_id = $3 AND personas_batch_id = $1
           AND valid_from = $4::timestamptz AND match_status = 'unmatched') AS unmatched,
       (SELECT count(*)::int FROM source_xref
         WHERE source_batch_id = $1 AND source_system = 'PERSONAS'
            AND source_entity = 'persona' AND valid_from = $4::timestamptz) AS matched_xrefs,
       (SELECT count(*)::int FROM person_identity_assertion
         WHERE source_batch_id = $1 AND source_system = 'PERSONAS'
           AND valid_from = $4::timestamptz) AS assertions,
       (SELECT count(DISTINCT contract.id)::int
          FROM no_legajo missing
          JOIN source_xref xref
            ON xref.source_system = 'GRH'
           AND xref.source_entity = 'persona'
           AND xref.source_id = missing.source_id
           AND xref.valid_to IS NULL
          JOIN employment_contract contract ON contract.person_id = xref.canonical_id
       ) AS no_legajo_employment_contracts`,
    [
      batches.personasBatchId,
      PERSONAS_STAGING_ENTITY,
      batches.grhBatchId,
      expected.validFrom,
      GRH_IDENTITY_STAGING_ENTITY,
      postgresJson(expected.grhSourceIds.map((sourceId) => ({ source_id: sourceId }))),
      postgresJson(expected.noLegajoSourceIds.map((sourceId) => ({ source_id: sourceId }))),
    ],
  );
  const actual = result.rows[0];
  for (const key of [
    'staging',
    'grh_identity_staging',
    'grh_identities',
    'grh_xrefs',
    'grh_xref_total',
    'grh_assertions',
    'decisions',
    'matched',
    'ambiguous',
    'unmatched',
    'matched_xrefs',
    'assertions',
    'no_legajo_employment_contracts',
  ]) {
    if (actual[key] !== expected[key]) throw new Error(`Verificacion PERSONAS fallo: ${key} ${actual[key]} != ${expected[key]}`);
  }
  return actual;
}

async function main() {
  const preflightOnly = process.argv.includes('--preflight-only');
  const databaseUrl = preflightOnly ? null : directCanonicalDatabaseUrl();
  const source = await preflight();
  if (preflightOnly) {
    console.log(JSON.stringify({
      status: 'preflight-ok',
      source: 'PERSONAS auxiliary crosswalk',
      logicalBytes: source.logicalBytes,
      grhIdentities: source.grhIdentitySeeds.length,
      grhPersonsWithoutLegajo: source.grhPersonsWithoutLegajo.length,
      decisions: source.decisions.length,
      statusCounts: EXPECTED_COUNTS,
      grhAssertions: source.grhAssertions.length,
      assertions: source.assertions.length,
    }, null, 2));
    return;
  }
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [LOCK_NAME]);
    await requireCanonicalContracts(client);
    const batches = await resolveBatches(client, source.manifest);
    await insertStaging(client, {
      batchId: batches.grhBatchId,
      sourceSchema: 'grh_junin',
      sourceEntity: GRH_IDENTITY_STAGING_ENTITY,
      stagedRows: source.grhIdentityStagedRows,
      label: 'maestro de identidad GRH',
    });
    await upsertGrhIdentityMaster(client, batches, source.grhIdentitySeeds, source.grhAssertions);
    await insertStaging(client, {
      batchId: batches.personasBatchId,
      sourceSchema: 'personas_junin',
      sourceEntity: PERSONAS_STAGING_ENTITY,
      stagedRows: source.personasStagedRows,
      label: 'PERSONAS',
    });
    await insertCrosswalk(client, batches, source.decisions, source.validFrom);
    await insertPersonasXrefs(client, batches.personasBatchId, source.decisions, source.validFrom);
    await insertAssertions(client, batches.personasBatchId, source.assertions, source.validFrom);
    const matched = source.decisions.filter((row) => row.status === 'matched').length;
    const counts = await verifyDatabase(client, batches, {
      staging: source.personasStagedRows.length,
      grh_identity_staging: source.grhIdentityStagedRows.length,
      grh_identities: source.grhIdentitySeeds.length,
      grh_xrefs: source.grhIdentitySeeds.length,
      grh_xref_total: source.grhIdentitySeeds.length,
      grh_assertions: source.grhAssertions.length,
      decisions: source.decisions.length,
      matched,
      ambiguous: EXPECTED_COUNTS.ambiguous,
      unmatched: EXPECTED_COUNTS.unmatched,
      matched_xrefs: matched,
      assertions: source.assertions.length,
      no_legajo_employment_contracts: 0,
      grhSourceIds: source.grhIdentitySeeds.map((seed) => seed.source.sourceId),
      noLegajoSourceIds: source.grhPersonsWithoutLegajo.map((seed) => seed.source.sourceId),
      validFrom: source.validFrom,
    });
    await client.query('COMMIT');
    console.log(JSON.stringify({
      status: 'completed',
      source: 'PERSONAS auxiliary crosswalk',
      personasBatchId: batches.personasBatchId,
      grhBatchId: batches.grhBatchId,
      logicalBytes: source.logicalBytes,
      counts,
    }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

await main();
