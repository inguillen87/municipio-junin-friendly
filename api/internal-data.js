import { getInternalSql } from '../lib/internal-neon.js';
import { requireInternalSession } from '../lib/internal-session.js';

function send(res, status, payload) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Cookie');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(payload);
}

function queryValue(req, name, fallback = '') {
  const value = req.query?.[name];
  return Array.isArray(value) ? String(value[0] ?? fallback) : String(value ?? fallback);
}

function positiveInteger(value, fallback, maximum) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number) || number < 1) return fallback;
  return Math.min(number, maximum);
}

async function summary(sql) {
  const [totals] = await sql.query(`
    SELECT
      (SELECT count(*)::int FROM grh_employees) AS historical_records,
      (SELECT count(*)::int FROM grh_employees WHERE activo) AS active,
      (SELECT count(*)::int FROM grh_employees WHERE NOT activo) AS inactive,
      (SELECT count(*)::int FROM grh_absences) AS absence_events,
      (SELECT count(*)::int FROM grh_leaves) AS leave_records,
      (SELECT count(*)::int FROM grh_family) AS family_records,
      (SELECT count(*)::int FROM grh_catalog_rows WHERE catalog = 'sectors') AS sectors,
      (SELECT count(*)::int FROM grh_catalog_rows WHERE catalog = 'categories') AS categories,
      (SELECT count(*)::int FROM grh_catalog_rows WHERE catalog = 'unions') AS unions,
      (SELECT count(*)::int FROM grh_catalog_rows WHERE catalog = 'agreements') AS agreements,
      (SELECT count(*)::int FROM grh_employees WHERE activo AND (sector IS NULL OR btrim(sector) = '')) AS active_without_sector,
      (SELECT count(*)::int FROM grh_absences a LEFT JOIN grh_employees e USING (company_id, legajo) WHERE e.legajo IS NULL) AS absence_orphans,
      (SELECT count(*)::int FROM grh_leaves l LEFT JOIN grh_employees e USING (company_id, legajo) WHERE e.legajo IS NULL) AS leave_orphans,
      (SELECT count(*)::int FROM grh_absences WHERE fecha < DATE '1990-01-01') AS suspicious_early_absences,
      (SELECT count(*)::int FROM grh_leaves WHERE fecha_inicio < DATE '1990-01-01') AS suspicious_early_leaves,
      (SELECT count(*)::int
         FROM grh_absences
        WHERE fecha > COALESCE(
          (SELECT source_cutoff::date
             FROM data_import_runs
            WHERE status = 'completed'
            ORDER BY completed_at DESC NULLS LAST, id DESC
            LIMIT 1),
          DATE '9999-12-31'
        )) AS absences_after_source_cutoff
  `);
  const [latestImport = null] = await sql.query(`
    SELECT id, source_name, source_sha256, source_cutoff, completed_at, status, table_counts, quality_flags
    FROM data_import_runs
    WHERE status = 'completed'
    ORDER BY completed_at DESC NULLS LAST, id DESC
    LIMIT 1
  `);
  const sectors = await sql.query(`
    SELECT COALESCE(NULLIF(btrim(sector), ''), 'Sin sector homologado') AS label,
           count(*)::int AS value
    FROM grh_employees
    GROUP BY COALESCE(NULLIF(btrim(sector), ''), 'Sin sector homologado')
    ORDER BY value DESC, label
  `);
  const absenceYearly = await sql.query(`
    SELECT extract(year FROM fecha)::int AS year,
           count(*)::int AS events,
           count(DISTINCT (company_id, legajo))::int AS employees_affected
    FROM grh_absences
    WHERE fecha >= DATE '1990-01-01'
      AND fecha <= COALESCE($1::date, DATE '9999-12-31')
    GROUP BY extract(year FROM fecha)
    ORDER BY year
  `, [latestImport?.source_cutoff ?? null]);

  return {
    ok: true,
    source: latestImport ? {
      importId: latestImport.id,
      name: latestImport.source_name,
      sha256: latestImport.source_sha256,
      cutoff: latestImport.source_cutoff,
      importedAt: latestImport.completed_at,
      status: latestImport.status
    } : { status: 'not_imported' },
    workforce: {
      historicalRecords: totals.historical_records,
      active: totals.active,
      inactive: totals.inactive,
      sectors
    },
    absence: { totalEvents: totals.absence_events, yearly: absenceYearly },
    related: { leaveRecords: totals.leave_records, familyRecords: totals.family_records },
    catalogs: {
      sectors: totals.sectors,
      sectorOptions: sectors.map(({ label }) => label),
      categories: totals.categories,
      unions: totals.unions,
      agreements: totals.agreements
    },
    quality: {
      activeWithoutSector: totals.active_without_sector,
      absenceOrphans: totals.absence_orphans,
      leaveOrphans: totals.leave_orphans,
      suspiciousEarlyAbsences: totals.suspicious_early_absences,
      suspiciousEarlyLeaves: totals.suspicious_early_leaves,
      absencesAfterSourceCutoff: totals.absences_after_source_cutoff,
      flags: latestImport?.quality_flags || {},
      importedCounts: latestImport?.table_counts || {}
    }
  };
}

/**
 * Builds the aggregate structure contract used by estructura.html.
 *
 * The response deliberately stays at organizational/catalogue grain. It never
 * returns names, documents, contact details or individual employment rows.
 * "Organization" is the literal GRH employment.organizationName assignment;
 * it is not promoted to an inferred municipal reporting hierarchy.
 */
export async function structure(sql) {
  const [latestImport = null] = await sql.query(`
    SELECT id,
           source_name AS "sourceName",
           source_sha256 AS "sourceSha256",
           source_cutoff AS "sourceCutoff",
           completed_at AS "completedAt",
           status
    FROM data_import_runs
    WHERE status = 'completed'
    ORDER BY completed_at DESC NULLS LAST, id DESC
    LIMIT 1
  `);

  const [
    [coverage],
    organizations,
    sectors,
    roles,
    catalogSummary,
    organizationCatalog,
    sectorCatalog,
    jobRoleCatalog,
    [hierarchyStats]
  ] = await Promise.all([
    sql.query(`
      SELECT count(*)::int AS "historicalRecords",
             (count(*) FILTER (WHERE activo))::int AS "activeRecords",
             (count(*) FILTER (WHERE NOT activo))::int AS "inactiveRecords",
             (count(*) FILTER (
               WHERE NULLIF(btrim(source_payload #>> '{employment,organizationName}'), '') IS NOT NULL
             ))::int AS "withOrganization",
             (count(*) FILTER (WHERE NULLIF(btrim(sector), '') IS NOT NULL))::int AS "withSector",
             (count(*) FILTER (
               WHERE NULLIF(btrim(source_payload #>> '{employment,cargoName}'), '') IS NOT NULL
             ))::int AS "withRole",
             count(DISTINCT NULLIF(btrim(source_payload #>> '{employment,organizationName}'), ''))::int
               AS "organizationsObserved",
             count(DISTINCT NULLIF(btrim(sector), ''))::int AS "sectorsObserved",
             count(DISTINCT NULLIF(btrim(source_payload #>> '{employment,cargoName}'), ''))::int
               AS "rolesObserved"
      FROM grh_employees
    `),
    sql.query(`
      SELECT COALESCE(
               NULLIF(btrim(source_payload #>> '{employment,organizationName}'), ''),
               'Sin organización asignada'
             ) AS label,
             NULLIF(btrim(source_payload #>> '{employment,organizationName}'), '') IS NOT NULL AS assigned,
             COALESCE(
               array_agg(DISTINCT NULLIF(btrim(source_payload #>> '{employment,organizationId}'), ''))
                 FILTER (WHERE NULLIF(btrim(source_payload #>> '{employment,organizationId}'), '') IS NOT NULL),
               ARRAY[]::text[]
             ) AS "organizationIds",
             count(*)::int AS historical,
             (count(*) FILTER (WHERE activo))::int AS active,
             (count(*) FILTER (WHERE NOT activo))::int AS inactive,
             count(DISTINCT NULLIF(btrim(sector), ''))::int AS "sectorCount"
      FROM grh_employees
      GROUP BY 1, 2
      ORDER BY active DESC, historical DESC, label
    `),
    sql.query(`
      SELECT COALESCE(NULLIF(btrim(sector), ''), 'Sin sector asignado') AS label,
             NULLIF(btrim(sector), '') IS NOT NULL AS assigned,
             COALESCE(
               array_agg(DISTINCT NULLIF(btrim(sector_code), ''))
                 FILTER (WHERE NULLIF(btrim(sector_code), '') IS NOT NULL),
               ARRAY[]::text[]
             ) AS "sectorCodes",
             count(*)::int AS historical,
             (count(*) FILTER (WHERE activo))::int AS active,
             (count(*) FILTER (WHERE NOT activo))::int AS inactive,
             count(DISTINCT NULLIF(btrim(source_payload #>> '{employment,organizationName}'), ''))::int
               AS "organizationCount"
      FROM grh_employees
      GROUP BY 1, 2
      ORDER BY active DESC, historical DESC, label
    `),
    sql.query(`
      SELECT COALESCE(
               NULLIF(btrim(source_payload #>> '{employment,cargoName}'), ''),
               'Sin cargo asignado'
             ) AS label,
             NULLIF(btrim(source_payload #>> '{employment,cargoName}'), '') IS NOT NULL AS assigned,
             COALESCE(
               array_agg(DISTINCT NULLIF(btrim(source_payload #>> '{employment,cargoId}'), ''))
                 FILTER (WHERE NULLIF(btrim(source_payload #>> '{employment,cargoId}'), '') IS NOT NULL),
               ARRAY[]::text[]
             ) AS "roleIds",
             count(*)::int AS historical,
             (count(*) FILTER (WHERE activo))::int AS active,
             (count(*) FILTER (WHERE NOT activo))::int AS inactive
      FROM grh_employees
      GROUP BY 1, 2
      ORDER BY active DESC, historical DESC, label
    `),
    sql.query(`
      SELECT catalog,
             count(*)::int AS rows,
             (count(*) FILTER (WHERE NULLIF(btrim(source_payload->>'parentId'), '') IS NOT NULL))::int
               AS "parentLinks"
      FROM grh_catalog_rows
      WHERE catalog IN (
        'organizations', 'sectors', 'job_roles', 'categories',
        'agreements', 'employment_statuses'
      )
      GROUP BY catalog
      ORDER BY catalog
    `),
    sql.query(`
      SELECT source_payload #>> '{sourceKey,organizationId}' AS id,
             label,
             NULLIF(btrim(source_payload->>'code'), '') AS code,
             NULLIF(btrim(source_payload->>'abbreviation'), '') AS abbreviation,
             NULLIF(btrim(source_payload->>'parentId'), '') AS "parentId",
             NULLIF(btrim(source_payload->>'activeSourceValue'), '') AS "activeSourceValue"
      FROM grh_catalog_rows
      WHERE catalog = 'organizations'
      ORDER BY label NULLS LAST, id
    `),
    sql.query(`
      SELECT source_payload #>> '{sourceKey,companyCode}' AS "companyCode",
             source_payload #>> '{sourceKey,sectorCode}' AS "sectorCode",
             label,
             NULLIF(btrim(source_payload->>'abbreviation'), '') AS abbreviation,
             NULLIF(btrim(source_payload->>'budgetActivityId'), '') AS "budgetActivityId",
             NULLIF(btrim(source_payload->>'contracted'), '') AS contracted
      FROM grh_catalog_rows
      WHERE catalog = 'sectors'
      ORDER BY label NULLS LAST, "companyCode", "sectorCode"
    `),
    sql.query(`
      SELECT source_payload #>> '{sourceKey,cargoId}' AS id,
             label,
             NULLIF(btrim(source_payload->>'parentId'), '') AS "parentId",
             NULLIF(btrim(source_payload->>'reportsTo'), '') AS "reportsTo"
      FROM grh_catalog_rows
      WHERE catalog = 'job_roles'
      ORDER BY label NULLS LAST, id
    `),
    sql.query(`
      WITH organizations AS (
        SELECT source_payload #>> '{sourceKey,organizationId}' AS id,
               NULLIF(btrim(source_payload->>'parentId'), '') AS parent_id
        FROM grh_catalog_rows
        WHERE catalog = 'organizations'
      )
      SELECT count(*)::int AS "catalogRows",
             (count(*) FILTER (WHERE parent_id IS NULL))::int AS roots,
             (count(*) FILTER (WHERE parent_id IS NOT NULL))::int AS "parentLinks",
             (count(*) FILTER (
               WHERE parent_id IS NOT NULL
                 AND NOT EXISTS (SELECT 1 FROM organizations parent WHERE parent.id = organizations.parent_id)
             ))::int AS "unresolvedParentLinks"
      FROM organizations
    `)
  ]);

  const organizationParentLinks = Number(hierarchyStats?.parentLinks || 0);
  const catalogRows = Number(hierarchyStats?.catalogRows || 0);
  const hierarchyAvailable = organizationParentLinks > 0;

  return {
    ok: true,
    source: latestImport ? {
      importId: latestImport.id,
      name: latestImport.sourceName,
      sha256: latestImport.sourceSha256,
      cutoff: latestImport.sourceCutoff,
      importedAt: latestImport.completedAt,
      status: latestImport.status
    } : { status: 'not_imported' },
    definitions: {
      grain: 'Un registro por legajo y empresa cargado desde GRH.',
      active: 'Activo es un proxy de la fuente: fecha de egreso vacía.',
      organization: 'Nombre literal de employment.organizationName en el legajo GRH.',
      sector: 'Sector curado del legajo, conservando su código de origen.',
      role: 'Nombre literal de employment.cargoName; no se completa desde el catálogo si el legajo no lo informa.'
    },
    coverage: {
      historicalRecords: Number(coverage?.historicalRecords || 0),
      activeRecords: Number(coverage?.activeRecords || 0),
      inactiveRecords: Number(coverage?.inactiveRecords || 0),
      withOrganization: Number(coverage?.withOrganization || 0),
      withSector: Number(coverage?.withSector || 0),
      withRole: Number(coverage?.withRole || 0),
      organizationsObserved: Number(coverage?.organizationsObserved || 0),
      sectorsObserved: Number(coverage?.sectorsObserved || 0),
      rolesObserved: Number(coverage?.rolesObserved || 0)
    },
    hierarchy: {
      available: hierarchyAvailable,
      catalogRows,
      roots: Number(hierarchyStats?.roots || 0),
      parentLinks: organizationParentLinks,
      unresolvedParentLinks: Number(hierarchyStats?.unresolvedParentLinks || 0),
      reason: hierarchyAvailable
        ? 'La fuente contiene relaciones parentId; se exponen sin completar vínculos faltantes.'
        : 'El catálogo GRH de organizaciones no contiene relaciones parentId. No se infiere un organigrama.'
    },
    organizations,
    sectors,
    roles,
    catalogs: {
      summary: catalogSummary,
      organizations: organizationCatalog,
      sectors: sectorCatalog,
      jobRoles: jobRoleCatalog
    }
  };
}

const INTEGRATION_RELATIONS = Object.freeze({
  workforce: {
    name: 'vw_empleado_actual',
    requiredColumns: Object.freeze([
      'activo_administrativo',
      'activo_liquidable',
      'payroll_closure_status',
      'estado_control'
    ])
  },
  crosswalk: {
    name: 'vw_crosswalk_persona',
    requiredColumns: Object.freeze(['match_status'])
  },
  canonicalIdentity: { name: 'person_identity', requiredColumns: Object.freeze([]) },
  canonicalEmployment: { name: 'employment_contract', requiredColumns: Object.freeze([]) },
  sourceReferences: { name: 'source_xref', requiredColumns: Object.freeze([]) }
});

function relationState(columnsByRelation, definition) {
  const observedColumns = columnsByRelation.get(definition.name) || new Set();
  if (observedColumns.size === 0) {
    return {
      relation: definition.name,
      status: 'not_loaded',
      available: false,
      missingColumns: [...definition.requiredColumns],
      reason: `La relación ${definition.name} todavía no está cargada.`
    };
  }

  const missingColumns = definition.requiredColumns.filter((column) => !observedColumns.has(column));
  if (missingColumns.length > 0) {
    return {
      relation: definition.name,
      status: 'incompatible',
      available: false,
      missingColumns,
      reason: `La relación ${definition.name} existe, pero no cumple el contrato de columnas.`
    };
  }

  return {
    relation: definition.name,
    status: 'available',
    available: true,
    missingColumns: [],
    reason: null
  };
}

function metric(status, value, source, definition, reason = null) {
  return {
    status,
    value: status === 'available' ? Number(value || 0) : null,
    source,
    definition,
    reason
  };
}

/**
 * Read-only integration control for the future canonical/data-mart layer.
 *
 * GRH remains authoritative for employment. PERSONAS is only an auxiliary
 * identity/territory source. Missing future relations are reported as
 * not_loaded or incompatible; their values are never inferred or backfilled.
 */
export async function integrationQuality(sql) {
  const relationNames = Object.values(INTEGRATION_RELATIONS).map(({ name }) => name);
  const [[grh], [latestImport = null], relationColumns] = await Promise.all([
    sql.query(`
      SELECT (count(*) FILTER (WHERE activo))::int AS "administrativeActive",
             (count(DISTINCT person_id) FILTER (WHERE activo AND person_id IS NOT NULL))::int
               AS "administrativePeople"
      FROM grh_employees
    `),
    sql.query(`
      SELECT id,
             source_name AS "sourceName",
             source_sha256 AS "sourceSha256",
             source_cutoff AS "sourceCutoff",
             completed_at AS "completedAt",
             status
      FROM data_import_runs
      WHERE status = 'completed'
      ORDER BY completed_at DESC NULLS LAST, id DESC
      LIMIT 1
    `),
    sql.query(`
      SELECT table_name AS "relationName", column_name AS "columnName"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
      ORDER BY table_name, ordinal_position
    `, [relationNames])
  ]);

  const columnsByRelation = new Map();
  relationColumns.forEach(({ relationName, columnName }) => {
    if (!columnsByRelation.has(relationName)) columnsByRelation.set(relationName, new Set());
    columnsByRelation.get(relationName).add(columnName);
  });
  const relations = Object.fromEntries(
    Object.entries(INTEGRATION_RELATIONS).map(([key, definition]) => [key, relationState(columnsByRelation, definition)])
  );

  const administrativeActive = Number(grh?.administrativeActive || 0);
  const administrativePeople = Number(grh?.administrativePeople || 0);
  let liquidable = metric(
    relations.workforce.status,
    null,
    relations.workforce.relation,
    'Legajos incluidos en la última corrida operativa observada; no implica que esté cerrada.',
    relations.workforce.reason
  );
  let difference = metric(
    relations.workforce.status,
    null,
    'control derivado',
    'Activo administrativo menos activo liquidable.',
    relations.workforce.reason
  );
  let stateBreakdown = {
    status: relations.workforce.status,
    rows: [],
    total: null,
    reason: relations.workforce.reason
  };
  let workforceChecks = {
    viewAdministrativeMatchesGrh: null,
    stateBreakdownReconcilesDifference: null
  };
  let workforceClosureStatus = null;

  if (relations.workforce.available) {
    const [[control], stateRows] = await Promise.all([
      sql.query(`
        SELECT (count(*) FILTER (WHERE activo_administrativo IS TRUE))::int AS "viewAdministrative",
               (count(*) FILTER (WHERE activo_liquidable IS TRUE))::int AS liquidable,
               max(payroll_closure_status) FILTER (
                 WHERE activo_liquidable IS TRUE
               ) AS "closureStatus"
        FROM vw_empleado_actual
      `),
      sql.query(`
        SELECT COALESCE(NULLIF(btrim(estado_control), ''), 'sin_clasificar') AS state,
               count(*)::int AS records
        FROM vw_empleado_actual
        WHERE activo_administrativo IS TRUE
          AND activo_liquidable IS NOT TRUE
        GROUP BY 1
        ORDER BY records DESC, state
      `)
    ]);
    const liquidableValue = Number(control?.liquidable || 0);
    workforceClosureStatus = control?.closureStatus ?? null;
    const differenceValue = administrativeActive - liquidableValue;
    const breakdownTotal = stateRows.reduce((sum, row) => sum + Number(row.records || 0), 0);

    liquidable = metric(
      'available',
      liquidableValue,
      relations.workforce.relation,
      'Legajos incluidos en la última corrida operativa observada; no implica que esté cerrada.'
    );
    difference = metric(
      'available',
      differenceValue,
      'grh_employees + vw_empleado_actual',
      'Activo administrativo menos activo liquidable.'
    );
    stateBreakdown = {
      status: 'available',
      rows: stateRows.map((row) => ({ state: row.state, records: Number(row.records || 0) })),
      total: breakdownTotal,
      reason: null
    };
    workforceChecks = {
      viewAdministrativeMatchesGrh: Number(control?.viewAdministrative || 0) === administrativeActive,
      stateBreakdownReconcilesDifference: breakdownTotal === differenceValue
    };
  }

  let crosswalk = {
    status: relations.crosswalk.status,
    relation: relations.crosswalk.relation,
    matched: null,
    unmatched: null,
    ambiguous: null,
    total: null,
    coveragePct: null,
    reconciled: null,
    reason: relations.crosswalk.reason
  };
  if (relations.crosswalk.available) {
    const [counts] = await sql.query(`
      SELECT (count(*) FILTER (WHERE lower(match_status) = 'matched'))::int AS matched,
             (count(*) FILTER (WHERE lower(match_status) = 'unmatched'))::int AS unmatched,
             (count(*) FILTER (WHERE lower(match_status) = 'ambiguous'))::int AS ambiguous,
             count(*)::int AS total
      FROM vw_crosswalk_persona
    `);
    const matched = Number(counts?.matched || 0);
    const unmatched = Number(counts?.unmatched || 0);
    const ambiguous = Number(counts?.ambiguous || 0);
    const total = Number(counts?.total || 0);
    crosswalk = {
      status: 'available',
      relation: relations.crosswalk.relation,
      matched,
      unmatched,
      ambiguous,
      total,
      coveragePct: total > 0 ? Number(((matched / total) * 100).toFixed(1)) : 0,
      reconciled: matched + unmatched + ambiguous === total,
      reason: null
    };
  }

  const workforceReady = relations.workforce.available
    && workforceChecks.viewAdministrativeMatchesGrh === true
    && workforceChecks.stateBreakdownReconcilesDifference === true;
  const crosswalkReady = relations.crosswalk.available && crosswalk.reconciled === true;
  const hasFutureData = relations.workforce.available || relations.crosswalk.available;

  return {
    ok: true,
    status: workforceReady && crosswalkReady
      ? 'ready'
      : (hasFutureData ? 'needs_review' : 'partial'),
    source: latestImport ? {
      importId: latestImport.id,
      name: latestImport.sourceName,
      sha256: latestImport.sourceSha256,
      cutoff: latestImport.sourceCutoff,
      importedAt: latestImport.completedAt,
      status: latestImport.status
    } : { status: 'not_imported' },
    sourcePolicy: {
      laborCore: 'GRH',
      auxiliaryRegistry: 'PERSONAS',
      rule: 'GRH define el estado laboral. PERSONAS sólo enriquece identidad, domicilios y territorio.',
      forbiddenJoin: 'No unir GRH y PERSONAS por IDPERSONA; conservar siempre los identificadores originales.'
    },
    workforceControl: {
      status: workforceReady ? 'reconciled' : (relations.workforce.available ? 'needs_review' : 'partial'),
      administrative: metric(
        'available',
        administrativeActive,
        'grh_employees.activo',
        'Legajos GRH sin fecha de egreso; proxy administrativo pendiente de homologación.'
      ),
      administrativePeople,
      liquidable,
      difference,
      stateBreakdown,
      checks: workforceChecks,
      payrollClosureStatus: workforceClosureStatus
    },
    identityEnrichment: {
      role: 'quality_and_enrichment_only',
      crosswalk,
      rules: [
        'CUIL normalizado y con dígito verificador válido como primera evidencia.',
        'DNI sólo como respaldo y con evidencia adicional.',
        'Nombre normalizado y fecha de nacimiento para validar duplicados o ambigüedades.',
        'El crosswalk no modifica el estado laboral definido por GRH.'
      ]
    },
    relations,
    limitations: [
      'Activo administrativo es un proxy derivado de fecha de egreso vacía hasta la homologación de Personal.',
      'La inclusión y la brecha operativa sólo se publican cuando vw_empleado_actual expone también el estado de cierre.',
      'Una corrida abierta o preliquidación no se usa como cifra financiera ejecutiva.',
      'Las coincidencias con PERSONAS no crean, eliminan ni cambian legajos GRH.',
      'No se infieren valores para relaciones no cargadas o incompatibles.'
    ]
  };
}

const PAYROLL_CONTROL_RELATIONS = Object.freeze({
  payrollRuns: {
    name: 'payroll_run',
    requiredColumns: ['payroll_date', 'closure_status', 'source_closed_flag']
  },
  monthlyFacts: {
    name: 'payroll_monthly_fact',
    requiredColumns: ['payroll_run_id', 'net_payable', 'employer_contributions']
  },
  monthlyControl: {
    name: 'vw_liquidacion_mensual',
    requiredColumns: [
      'month', 'closure_status', 'liquidated_contracts', 'gross_payable',
      'employee_withholdings', 'net_payable', 'employer_contributions',
      'employer_cost_proxy', 'arithmetic_difference', 'rounding_tolerance',
      'arithmetic_reconciled', 'executive_publishable'
    ]
  },
  runControl: {
    name: 'vw_nomina_totales',
    requiredColumns: ['closure_status', 'arithmetic_reconciled', 'executive_publishable']
  }
});

function payrollMetricRow(row) {
  if (!row) return null;
  const numericFields = [
    'contracts', 'grossPayable', 'employeeWithholdings', 'netPayable',
    'employerContributions', 'employerCostProxy', 'arithmeticDifference',
    'roundingTolerance'
  ];
  const result = { ...row };
  numericFields.forEach((field) => {
    result[field] = row[field] === null || row[field] === undefined ? null : Number(row[field]);
  });
  result.arithmeticReconciled = row.arithmeticReconciled === true;
  result.executivePublishable = row.executivePublishable === true;
  return result;
}

/**
 * Executive payroll controls sourced only from canonical GRH runs.
 * Open/preliquidation runs remain visible for operations, but can never be
 * returned as publishable financial KPIs.
 */
export async function payrollControl(sql) {
  const definitions = Object.values(PAYROLL_CONTROL_RELATIONS);
  const relationColumns = await sql.query(`
    SELECT table_name AS "relationName", column_name AS "columnName"
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ANY($1::text[])
    ORDER BY table_name, ordinal_position
  `, [definitions.map(({ name }) => name)]);
  const columnsByRelation = new Map();
  relationColumns.forEach(({ relationName, columnName }) => {
    if (!columnsByRelation.has(relationName)) columnsByRelation.set(relationName, new Set());
    columnsByRelation.get(relationName).add(columnName);
  });
  const relations = Object.fromEntries(
    Object.entries(PAYROLL_CONTROL_RELATIONS).map(([key, definition]) => [
      key,
      relationState(columnsByRelation, definition)
    ])
  );
  const unavailable = Object.values(relations).filter(({ available }) => !available);
  if (unavailable.length > 0) {
    return {
      ok: true,
      status: unavailable.some(({ status }) => status === 'incompatible')
        ? 'incompatible'
        : 'not_loaded',
      sourcePolicy: {
        authority: 'GRH',
        openRunRule: 'Una corrida abierta o sin marca de cierre nunca se publica como KPI financiero.',
        monetaryBasis: 'ARS nominal; sin IPC ni ajuste paritario.'
      },
      latestClosed: null,
      currentOpen: null,
      runs: [],
      quality: { ready: false, relations },
      limitations: unavailable.map(({ reason }) => reason)
    };
  }

  const [monthlyRows, runRows, [quality = {}], [source = null]] = await Promise.all([
    sql.query(`
      SELECT month,
             closure_status AS "closureStatus",
             liquidated_contracts AS contracts,
             gross_payable AS "grossPayable",
             employee_withholdings AS "employeeWithholdings",
             net_payable AS "netPayable",
             employer_contributions AS "employerContributions",
             employer_cost_proxy AS "employerCostProxy",
             arithmetic_difference AS "arithmeticDifference",
             rounding_tolerance AS "roundingTolerance",
             arithmetic_reconciled AS "arithmeticReconciled",
             executive_publishable AS "executivePublishable"
      FROM vw_liquidacion_mensual
      ORDER BY month DESC, closure_status
      LIMIT 36
    `),
    sql.query(`
      SELECT payroll_date AS month,
             payroll_type AS "payrollType",
             closure_status AS "closureStatus",
             contracts,
             gross_payable AS "grossPayable",
             employee_withholdings AS "employeeWithholdings",
             net_payable AS "netPayable",
             employer_contributions AS "employerContributions",
             employer_cost_proxy AS "employerCostProxy",
             arithmetic_difference AS "arithmeticDifference",
             rounding_tolerance AS "roundingTolerance",
             arithmetic_reconciled AS "arithmeticReconciled",
             executive_publishable AS "executivePublishable"
      FROM vw_nomina_totales
      ORDER BY payroll_date DESC, payroll_type
      LIMIT 24
    `),
    sql.query(`
      SELECT count(*)::int AS "totalRuns",
             (count(*) FILTER (WHERE closure_status = 'closed'))::int AS "closedRuns",
             (count(*) FILTER (WHERE closure_status = 'open'))::int AS "openRuns",
             (count(*) FILTER (WHERE closure_status = 'unknown'))::int AS "unknownRuns",
             (count(*) FILTER (
               WHERE closure_status = 'closed' AND NOT executive_publishable
             ))::int AS "closedRunsBlocked",
             (count(*) FILTER (
               WHERE closure_status <> 'closed' AND executive_publishable
             ))::int AS "openRunsPublished"
      FROM vw_nomina_totales
    `),
    sql.query(`
      SELECT source_file_name AS "fileName",
             source_sha256 AS sha256,
             source_cutoff AS cutoff,
             recorded_at AS "recordedAt"
      FROM source_import_batch
      WHERE source_system = 'GRH'
      ORDER BY source_cutoff DESC, recorded_at DESC
      LIMIT 1
    `)
  ]);

  const monthly = monthlyRows.map(payrollMetricRow);
  const latestClosed = monthly.find((row) => row.closureStatus === 'closed') || null;
  const currentOpen = monthly.find((row) => row.closureStatus === 'open') || null;
  const runs = runRows.map(payrollMetricRow);
  const openRunsPublished = Number(quality.openRunsPublished || 0);
  const ready = Boolean(latestClosed)
    && latestClosed.executivePublishable
    && Boolean(currentOpen)
    && !currentOpen.executivePublishable
    && openRunsPublished === 0;

  return {
    ok: true,
    status: ready ? 'ready' : 'needs_review',
    sourcePolicy: {
      authority: 'GRH',
      closeEvidence: 'histocal.CIER_31 = 1',
      arithmeticControl: '993 + 994 + 995 - 996 = 999, con tolerancia de un centavo por legajo.',
      employerCostProxy: '993 + 994 + 995 + 990; medida analítica, no devengado contable.',
      openRunRule: 'Una corrida abierta o sin marca de cierre nunca se publica como KPI financiero.',
      monetaryBasis: 'ARS nominal; sin IPC ni ajuste paritario.'
    },
    latestClosed,
    currentOpen,
    runs,
    quality: {
      ready,
      totalRuns: Number(quality.totalRuns || 0),
      closedRuns: Number(quality.closedRuns || 0),
      openRuns: Number(quality.openRuns || 0),
      unknownRuns: Number(quality.unknownRuns || 0),
      closedRunsBlocked: Number(quality.closedRunsBlocked || 0),
      openRunsPublished,
      relations
    },
    source,
    limitations: [
      'Los importes son nominales y no expresan variación real sin IPC, paritarias y composición de dotación.',
      'El costo empleador es un proxy analítico; Contaduría debe conciliarlo antes de tratarlo como gasto devengado.',
      'GRH no contiene el archivo bancario, extracto, asiento ni ejecución presupuestaria necesarios para conciliación financiera completa.',
      'Agosto 2026 permanece abierto/preliquidado y sólo se muestra como control operativo.'
    ]
  };
}

const ABSENCE_MIN_DATE = '1990-01-01';
const ABSENCE_BUCKETS = new Set(['month', 'year']);
const ABSENCE_UNIT_SEMANTICS = 'Días declarados por GRH (DIAS_24); no equivalen a jornadas perdidas, duración ni tasa de ausentismo.';
const ABSENCE_SECTOR_SEMANTICS = 'Sector actual observado en el legajo al corte de importación; no reconstruye la asignación histórica al momento del evento.';

function validIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isoDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value ?? '').slice(0, 10);
  return validIsoDate(text) ? text : null;
}

function previousYearDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  const candidate = `${String(year - 1).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return validIsoDate(candidate) ? candidate : null;
}

function absenceNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function absenceBoolean(value) {
  if (value === null || value === undefined) return null;
  return value === true || value === 'true' || value === 1 || value === '1';
}

function absenceSummaryRow(row = {}) {
  return {
    events: absenceNumber(row.events),
    affectedContracts: absenceNumber(row.affectedContracts),
    sourceDeclaredDays: absenceNumber(row.sourceDeclaredDays)
  };
}

function absenceReasonFlags(row = {}) {
  return {
    isLeave: absenceBoolean(row.isLeave),
    affectsAttendanceBonus: absenceBoolean(row.affectsAttendanceBonus),
    generatesDiscountedDays: absenceBoolean(row.generatesDiscountedDays),
    calendarDays: absenceBoolean(row.calendarDays)
  };
}

function absenceFilter({ from, to, sector = '', reasonCode = '' }) {
  const values = [from, to];
  const conditions = ['absence.fecha >= $1::date', 'absence.fecha <= $2::date'];
  const parameter = (value) => {
    values.push(value);
    return `$${values.length}`;
  };
  if (sector) {
    conditions.push(`COALESCE(NULLIF(btrim(employee.sector), ''), 'Sin sector informado') = ${parameter(sector)}`);
  }
  if (reasonCode) conditions.push(`absence.motivo_code = ${parameter(reasonCode)}`);
  return { where: conditions.join(' AND '), values };
}

function absenceFromSql(includeIdentity = false) {
  return `
    FROM grh_absences absence
    LEFT JOIN grh_employees employee
      ON employee.company_id = absence.company_id AND employee.legajo = absence.legajo
    LEFT JOIN employment_contract contract
      ON contract.source_system = 'GRH'
     AND contract.legacy_company_id = absence.company_id
     AND contract.legacy_legajo = absence.legajo
    ${includeIdentity ? 'LEFT JOIN person_identity identity ON identity.id = contract.person_id' : ''}
    LEFT JOIN grh_catalog_rows reason
      ON reason.catalog = 'absence_reasons'
     AND reason.source_payload #>> '{sourceKey,reasonCode}' = absence.motivo_code
  `;
}

async function absenceSourceContext(sql) {
  const [source = null] = await sql.query(`
    /* absence:source */
    SELECT id AS "importId", source_name AS name, source_sha256 AS sha256,
           source_cutoff AS "sourceCutoff", completed_at AS "importedAt", status
    FROM data_import_runs
    WHERE status = 'completed'
    ORDER BY completed_at DESC NULLS LAST, id DESC
    LIMIT 1
  `);
  const cutoff = isoDate(source?.sourceCutoff);
  if (!source || !cutoff || cutoff < ABSENCE_MIN_DATE) return null;
  return { ...source, cutoff };
}

function absenceRequest(req, source, { allowBucket = false } = {}) {
  const bucket = boundedQueryValue(req, 'bucket', 16).toLowerCase() || 'month';
  if (allowBucket && !ABSENCE_BUCKETS.has(bucket)) {
    return { error: { status: 400, payload: { ok: false, code: 'ABSENCE_BUCKET_INVALID', error: 'Agrupación de ausentismo inválida' } } };
  }
  const sourceYear = Number(source.cutoff.slice(0, 4));
  const defaultFrom = `${String(Math.max(1990, sourceYear)).padStart(4, '0')}-01-01`;
  const requestedFrom = boundedQueryValue(req, 'from', 10) || defaultFrom;
  const requestedTo = boundedQueryValue(req, 'to', 10) || source.cutoff;
  if (!validIsoDate(requestedFrom) || !validIsoDate(requestedTo)) {
    return { error: { status: 400, payload: { ok: false, code: 'ABSENCE_DATE_INVALID', error: 'Fecha de ausentismo inválida; usá YYYY-MM-DD' } } };
  }
  if (requestedFrom > requestedTo) {
    return { error: { status: 400, payload: { ok: false, code: 'ABSENCE_RANGE_INVALID', error: 'El inicio no puede ser posterior al fin' } } };
  }
  const effectiveFrom = requestedFrom < ABSENCE_MIN_DATE
    ? ABSENCE_MIN_DATE
    : requestedFrom > source.cutoff ? source.cutoff : requestedFrom;
  const effectiveTo = requestedTo > source.cutoff
    ? source.cutoff
    : requestedTo < ABSENCE_MIN_DATE ? ABSENCE_MIN_DATE : requestedTo;
  const sector = boundedQueryValue(req, 'sector', 160);
  const reasonCode = boundedQueryValue(req, 'reasonCode', 64);
  return {
    bucket,
    sector,
    reasonCode,
    range: {
      requested: { from: requestedFrom, to: requestedTo },
      effective: { from: effectiveFrom, to: effectiveTo },
      clamped: { from: effectiveFrom !== requestedFrom, to: effectiveTo !== requestedTo }
    }
  };
}

async function queryAbsenceSummary(sql, filters, marker = 'summary') {
  const scope = absenceFilter(filters);
  const [row = {}] = await sql.query(`
    /* absence:${marker} */
    SELECT count(*)::int AS events,
           count(DISTINCT contract.id)::int AS "affectedContracts",
           COALESCE(sum(absence.dias), 0)::numeric AS "sourceDeclaredDays"
    ${absenceFromSql()}
    WHERE ${scope.where}
  `, scope.values);
  return absenceSummaryRow(row);
}

function percentChange(current, previous) {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function comparisonFor(range) {
  if (range.effective.from.slice(0, 4) !== range.effective.to.slice(0, 4)) return null;
  const from = previousYearDate(range.effective.from);
  const to = previousYearDate(range.effective.to);
  return from && to && from >= ABSENCE_MIN_DATE ? { from, to } : null;
}

export async function absenceAnalytics(sql, req) {
  const requestedBucket = boundedQueryValue(req, 'bucket', 16).toLowerCase() || 'month';
  if (!ABSENCE_BUCKETS.has(requestedBucket)) {
    return { status: 400, payload: { ok: false, code: 'ABSENCE_BUCKET_INVALID', error: 'Agrupación de ausentismo inválida' } };
  }
  const source = await absenceSourceContext(sql);
  if (!source) {
    return { status: 503, payload: { ok: false, code: 'ABSENCE_SOURCE_NOT_LOADED', error: 'La fuente de ausentismo no está disponible' } };
  }
  const request = absenceRequest(req, source, { allowBucket: true });
  if (request.error) return request.error;
  const { from, to } = request.range.effective;
  const filters = { from, to, sector: request.sector, reasonCode: request.reasonCode };
  const scope = absenceFilter(filters);
  const validScope = absenceFilter({ from: ABSENCE_MIN_DATE, to: source.cutoff });
  const interval = request.bucket === 'month' ? '1 month - 1 day' : '1 year - 1 day';
  const priorRange = comparisonFor(request.range);
  const comparisonPromise = priorRange
    ? queryAbsenceSummary(sql, { ...priorRange, sector: request.sector, reasonCode: request.reasonCode }, 'comparison')
    : Promise.resolve(null);

  const [
    summary,
    seriesRows,
    reasonRows,
    sectorRows,
    facetReasonRows,
    facetSectorRows,
    [qualityRow = {}],
    previous
  ] = await Promise.all([
    queryAbsenceSummary(sql, filters, 'analytics-summary'),
    sql.query(`
      /* absence:series */
      SELECT to_char(date_trunc('${request.bucket}', absence.fecha), 'YYYY-MM-DD') AS period,
             count(*)::int AS events,
             count(DISTINCT contract.id)::int AS "affectedContracts",
             COALESCE(sum(absence.dias), 0)::numeric AS "sourceDeclaredDays",
             (date_trunc('${request.bucket}', absence.fecha)::date < $1::date
               OR (date_trunc('${request.bucket}', absence.fecha) + interval '${interval}')::date > $2::date) AS partial
      ${absenceFromSql()}
      WHERE ${scope.where}
      GROUP BY 1, 5 ORDER BY 1
    `, scope.values),
    sql.query(`
      /* absence:reasons */
      SELECT absence.motivo_code AS code,
             COALESCE(NULLIF(btrim(reason.label), ''), 'Sin motivo homologado') AS label,
             (reason.source_payload ->> 'isLeave')::boolean AS "isLeave",
             (reason.source_payload ->> 'affectsAttendanceBonus')::boolean AS "affectsAttendanceBonus",
             (reason.source_payload ->> 'generatesDiscountedDays')::boolean AS "generatesDiscountedDays",
             (reason.source_payload ->> 'calendarDays')::boolean AS "calendarDays",
             count(*)::int AS events,
             count(DISTINCT contract.id)::int AS "affectedContracts",
             COALESCE(sum(absence.dias), 0)::numeric AS "sourceDeclaredDays"
      ${absenceFromSql()}
      WHERE ${scope.where}
      GROUP BY 1, 2, 3, 4, 5, 6 ORDER BY events DESC, label
    `, scope.values),
    sql.query(`
      /* absence:sectors */
      SELECT COALESCE(NULLIF(btrim(employee.sector), ''), 'Sin sector informado') AS label,
             count(*)::int AS events,
             count(DISTINCT contract.id)::int AS "affectedContracts",
             COALESCE(sum(absence.dias), 0)::numeric AS "sourceDeclaredDays"
      ${absenceFromSql()}
      WHERE ${scope.where}
      GROUP BY 1 ORDER BY events DESC, label
    `, scope.values),
    sql.query(`
      /* absence:facet-reasons */
      SELECT DISTINCT absence.motivo_code AS code,
             COALESCE(NULLIF(btrim(reason.label), ''), 'Sin motivo homologado') AS label
      ${absenceFromSql()}
      WHERE ${validScope.where}
      ORDER BY label
    `, validScope.values),
    sql.query(`
      /* absence:facet-sectors */
      SELECT DISTINCT COALESCE(NULLIF(btrim(employee.sector), ''), 'Sin sector informado') AS value
      ${absenceFromSql()}
      WHERE ${validScope.where}
      ORDER BY value
    `, validScope.values),
    sql.query(`
      /* absence:quality */
      SELECT count(*)::int AS "sourceRows",
             count(*) FILTER (WHERE absence.fecha < $1::date)::int AS "excludedBeforeMinimum",
             count(*) FILTER (WHERE absence.fecha > $2::date)::int AS "excludedAfterCutoff",
             count(*) FILTER (WHERE absence.fecha BETWEEN $1::date AND $2::date
                               AND (absence.motivo_code IS NULL OR btrim(absence.motivo_code) = ''))::int AS "missingReasonCode",
             count(*) FILTER (WHERE absence.fecha BETWEEN $1::date AND $2::date
                               AND absence.fecha_hasta < absence.fecha)::int AS "invertedDateRanges",
             count(*) FILTER (WHERE absence.fecha BETWEEN $1::date AND $2::date
                               AND absence.dias IS NULL)::int AS "missingSourceDeclaredDays",
             count(*) FILTER (WHERE absence.fecha BETWEEN $1::date AND $2::date
                               AND contract.id IS NULL)::int AS "unlinkedEvents"
      ${absenceFromSql()}
    `, [ABSENCE_MIN_DATE, source.cutoff]),
    comparisonPromise
  ]);

  const comparison = previous ? {
    available: true,
    basis: 'previous_year_same_calendar_window',
    current: { range: request.range.effective, ...summary },
    previous: { range: priorRange, ...previous },
    changePercent: {
      events: percentChange(summary.events, previous.events),
      affectedContracts: percentChange(summary.affectedContracts, previous.affectedContracts),
      sourceDeclaredDays: percentChange(summary.sourceDeclaredDays, previous.sourceDeclaredDays)
    }
  } : {
    available: false,
    basis: 'previous_year_same_calendar_window',
    reason: 'La comparación exige un rango efectivo dentro de un mismo año calendario.'
  };

  return {
    status: 200,
    payload: {
      ok: true,
      data: {
        summary,
        series: seriesRows.map((row) => ({ ...absenceSummaryRow(row), period: isoDate(row.period), partial: row.partial === true })),
        reasons: reasonRows.map((row) => ({
          code: row.code ?? null,
          label: row.label,
          ...absenceSummaryRow(row),
          flags: absenceReasonFlags(row)
        })),
        sectors: sectorRows.map((row) => ({ label: row.label, ...absenceSummaryRow(row) })),
        comparison
      },
      facets: {
        minDate: ABSENCE_MIN_DATE,
        maxDate: source.cutoff,
        reasons: facetReasonRows.map((row) => ({ code: row.code ?? null, label: row.label })),
        sectors: facetSectorRows.map((row) => ({ value: row.value, label: row.value }))
      },
      range: request.range,
      quality: {
        scope: 'complete_import_snapshot',
        sourceCutoff: source.cutoff,
        sourceRows: absenceNumber(qualityRow.sourceRows),
        excludedBeforeMinimum: absenceNumber(qualityRow.excludedBeforeMinimum),
        excludedAfterCutoff: absenceNumber(qualityRow.excludedAfterCutoff),
        missingReasonCode: absenceNumber(qualityRow.missingReasonCode),
        invertedDateRanges: absenceNumber(qualityRow.invertedDateRanges),
        missingSourceDeclaredDays: absenceNumber(qualityRow.missingSourceDeclaredDays),
        unlinkedEvents: absenceNumber(qualityRow.unlinkedEvents),
        unitSemantics: ABSENCE_UNIT_SEMANTICS,
        sectorSemantics: ABSENCE_SECTOR_SEMANTICS
      },
      meta: {
        authority: 'GRH',
        grain: 'absence_event',
        bucket: request.bucket,
        filters: { sector: request.sector || null, reasonCode: request.reasonCode || null },
        ratesAvailable: false,
        comparisonPolicy: 'same_calendar_window_previous_year_only',
        sectorSemantics: ABSENCE_SECTOR_SEMANTICS,
        source: {
          importId: source.importId,
          name: source.name,
          sha256: source.sha256,
          cutoff: source.cutoff,
          importedAt: source.importedAt,
          status: source.status
        }
      }
    }
  };
}

export async function absenceEvents(sql, req) {
  const source = await absenceSourceContext(sql);
  if (!source) {
    return { status: 503, payload: { ok: false, code: 'ABSENCE_SOURCE_NOT_LOADED', error: 'La fuente de ausentismo no está disponible' } };
  }
  const request = absenceRequest(req, source);
  if (request.error) return request.error;
  const page = positiveInteger(queryValue(req, 'page', '1'), 1, 100000);
  const limit = positiveInteger(queryValue(req, 'limit', '25'), 25, 50);
  const filters = {
    from: request.range.effective.from,
    to: request.range.effective.to,
    sector: request.sector,
    reasonCode: request.reasonCode
  };
  const scope = absenceFilter(filters);
  const dataValues = [...scope.values, limit, (page - 1) * limit];
  const [summary, rows] = await Promise.all([
    queryAbsenceSummary(sql, filters, 'events-summary'),
    sql.query(`
      /* absence:events */
      SELECT contract.id AS "contractId", absence.company_id AS "companyId",
             absence.legajo,
             COALESCE(identity.full_name, employee.nombre) AS name,
             COALESCE(NULLIF(btrim(employee.sector), ''), 'Sin sector informado') AS sector,
             absence.fecha AS "eventDate", absence.fecha_hasta AS "untilDate",
             absence.motivo_code AS "reasonCode",
             COALESCE(NULLIF(btrim(reason.label), ''), 'Sin motivo homologado') AS reason,
             absence.dias AS "sourceDeclaredDays", absence.cantidad AS "sourceQuantity",
             (reason.source_payload ->> 'isLeave')::boolean AS "isLeave",
             (reason.source_payload ->> 'affectsAttendanceBonus')::boolean AS "affectsAttendanceBonus",
             (reason.source_payload ->> 'generatesDiscountedDays')::boolean AS "generatesDiscountedDays",
             (reason.source_payload ->> 'calendarDays')::boolean AS "calendarDays"
      ${absenceFromSql(true)}
      WHERE ${scope.where}
      ORDER BY absence.fecha DESC, absence.company_id, absence.legajo
      LIMIT $${dataValues.length - 1} OFFSET $${dataValues.length}
    `, dataValues)
  ]);
  return {
    status: 200,
    payload: {
      ok: true,
      data: rows.map((row) => ({
        contractId: row.contractId ?? null,
        companyId: row.companyId ?? null,
        legajo: row.legajo ?? null,
        name: row.name ?? null,
        sector: row.sector,
        eventDate: isoDate(row.eventDate),
        untilDate: row.untilDate ? isoDate(row.untilDate) : null,
        reasonCode: row.reasonCode ?? null,
        reason: row.reason,
        sourceDeclaredDays: row.sourceDeclaredDays === null ? null : absenceNumber(row.sourceDeclaredDays),
        sourceQuantity: row.sourceQuantity === null ? null : absenceNumber(row.sourceQuantity),
        flags: absenceReasonFlags(row),
        rangeIntegrity: !row.untilDate
          ? 'until_date_not_reported'
          : row.eventDate && isoDate(row.untilDate) < isoDate(row.eventDate)
            ? 'inverted_source_range'
            : 'valid_source_range'
      })),
      pagination: {
        page,
        limit,
        total: summary.events,
        pages: Math.max(1, Math.ceil(summary.events / limit))
      },
      range: request.range,
      quality: {
        sourceCutoff: source.cutoff,
        unitSemantics: ABSENCE_UNIT_SEMANTICS,
        sectorSemantics: ABSENCE_SECTOR_SEMANTICS
      },
      meta: {
        authority: 'GRH',
        grain: 'absence_event',
        sectorSemantics: ABSENCE_SECTOR_SEMANTICS,
        filters: {
          sector: request.sector || null,
          reasonCode: request.reasonCode || null
        },
        containsPersonalIdentifiers: true,
        externalSharingAllowed: false,
        excludedFields: [
          'dni', 'cuil', 'telefono', 'email', 'domicilio', 'comentario', 'rawFields'
        ]
      }
    }
  };
}

const QUALITY_SOURCES = new Set(['all', 'GRH', 'PERSONAS']);
const QUALITY_SEVERITIES = new Set(['all', 'info', 'warning', 'error', 'critical']);
const QUALITY_ENTITIES = new Set([
  'all', 'persona', 'legajo', 'artifact:calculo', 'artifact:histocal',
  'artifact:legamov', 'calculo_monthly'
]);
const QUALITY_CODES = new Set([
  'all', 'CUIL_INVALID', 'CUIL_MISSING', 'DATE_ORDER_INVALID',
  'DATE_OUT_OF_RANGE', 'SOURCE_MONTH_MISMATCH', 'SOURCE_PERIOD_MISMATCH'
]);
const QUALITY_RESOLUTIONS = new Set(['all', 'open', 'accepted', 'corrected', 'rejected']);

function qualityNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function qualityTimestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function qualityFilterError(field, allowed) {
  return {
    status: 400,
    payload: {
      ok: false,
      code: `QUALITY_${field.toUpperCase()}_INVALID`,
      error: `Filtro ${field} no permitido`,
      field,
      allowed: [...allowed]
    }
  };
}

function qualityIssueRequest(req) {
  const normalized = {
    source: boundedQueryValue(req, 'source', 32).toUpperCase() || 'all',
    severity: boundedQueryValue(req, 'severity', 16).toLowerCase() || 'all',
    entity: boundedQueryValue(req, 'entity', 128).toLowerCase() || 'all',
    code: boundedQueryValue(req, 'code', 64).toUpperCase() || 'all',
    resolution: boundedQueryValue(req, 'resolution', 24).toLowerCase() || 'all'
  };
  if (normalized.source === 'ALL') normalized.source = 'all';
  if (normalized.code === 'ALL') normalized.code = 'all';

  const definitions = [
    ['source', QUALITY_SOURCES],
    ['severity', QUALITY_SEVERITIES],
    ['entity', QUALITY_ENTITIES],
    ['code', QUALITY_CODES],
    ['resolution', QUALITY_RESOLUTIONS]
  ];
  for (const [field, allowed] of definitions) {
    if (!allowed.has(normalized[field])) return { error: qualityFilterError(field, allowed) };
  }
  return normalized;
}

function qualityIssueScope(filters) {
  const clauses = [];
  const values = [];
  const columns = {
    source: 'issue.source_system',
    severity: 'issue.severity',
    entity: 'issue.source_entity',
    code: 'issue.issue_code',
    resolution: 'issue.resolution_status'
  };
  for (const [field, column] of Object.entries(columns)) {
    if (filters[field] === 'all') continue;
    values.push(filters[field]);
    clauses.push(`${column} = $${values.length}`);
  }
  return { where: clauses.length ? clauses.join(' AND ') : 'true', values };
}

/**
 * Aggregate, non-nominal view of materialized canonical quality controls.
 * Counts are descriptive registered issues; they are intentionally not a
 * quality score and the PERSONAS crosswalk is reported as a separate process.
 */
export async function qualityOverview(sql) {
  const [
    [summaryRow = {}],
    codeRows,
    entityRows,
    sourceRows,
    [crosswalkRow = {}]
  ] = await Promise.all([
    sql.query(`
      /* quality:overview-summary */
      SELECT count(*)::int AS total,
             (count(*) FILTER (WHERE issue.resolution_status = 'open'))::int AS open,
             (count(*) FILTER (WHERE issue.resolution_status = 'accepted'))::int AS accepted,
             (count(*) FILTER (WHERE issue.resolution_status = 'corrected'))::int AS corrected,
             (count(*) FILTER (WHERE issue.resolution_status = 'rejected'))::int AS rejected,
             (count(*) FILTER (WHERE issue.severity = 'info'))::int AS info,
             (count(*) FILTER (WHERE issue.severity = 'warning'))::int AS warning,
             (count(*) FILTER (WHERE issue.severity = 'error'))::int AS error,
             (count(*) FILTER (WHERE issue.severity = 'critical'))::int AS critical,
             count(DISTINCT issue_code)::int AS "distinctCodes",
             count(DISTINCT (issue.source_system, issue.source_entity))::int AS "distinctEntities",
             (count(*) FILTER (WHERE issue.issue_code IN (
               'SOURCE_MONTH_MISMATCH', 'SOURCE_PERIOD_MISMATCH'
             )))::int AS "payrollCoherence",
             (count(*) FILTER (WHERE issue.resolution_status = 'open' AND issue.issue_code IN (
               'SOURCE_MONTH_MISMATCH', 'SOURCE_PERIOD_MISMATCH'
             )))::int AS "payrollCoherenceOpen",
             (count(*) FILTER (WHERE issue.issue_code IN (
               'CUIL_INVALID', 'CUIL_MISSING'
             )))::int AS "identityCuil",
             (count(*) FILTER (WHERE issue.resolution_status = 'open' AND issue.issue_code IN (
               'CUIL_INVALID', 'CUIL_MISSING'
             )))::int AS "identityCuilOpen",
             (count(*) FILTER (WHERE issue.issue_code IN (
               'DATE_ORDER_INVALID', 'DATE_OUT_OF_RANGE'
             )))::int AS dates,
             (count(*) FILTER (WHERE issue.resolution_status = 'open' AND issue.issue_code IN (
               'DATE_ORDER_INVALID', 'DATE_OUT_OF_RANGE'
             )))::int AS "datesOpen"
      FROM data_quality_issue issue
      JOIN source_import_batch batch
        ON batch.id = issue.source_batch_id
       AND batch.validation_state = 'published'
    `),
    sql.query(`
      /* quality:overview-codes */
      SELECT issue.source_system AS source, issue.source_entity AS entity,
             issue.issue_code AS code, issue.severity,
             issue.resolution_status AS resolution, count(*)::int AS issues
      FROM data_quality_issue issue
      JOIN source_import_batch batch
        ON batch.id = issue.source_batch_id
       AND batch.validation_state = 'published'
      GROUP BY issue.source_system, issue.source_entity, issue.issue_code,
               issue.severity, issue.resolution_status
      ORDER BY issues DESC, source, entity, code, severity, resolution
    `),
    sql.query(`
      /* quality:overview-entities */
      SELECT issue.source_system AS source, issue.source_entity AS entity,
             count(*)::int AS "registeredIssues",
             (count(*) FILTER (WHERE issue.resolution_status = 'open'))::int AS "openIssues"
      FROM data_quality_issue issue
      JOIN source_import_batch batch
        ON batch.id = issue.source_batch_id
       AND batch.validation_state = 'published'
      GROUP BY issue.source_system, issue.source_entity
      ORDER BY "registeredIssues" DESC, source, entity
    `),
    sql.query(`
      /* quality:overview-sources */
      WITH published_sources AS (
        SELECT DISTINCT source_system
        FROM source_import_batch
        WHERE validation_state = 'published'
      ), published_issues AS (
        SELECT issue.*
        FROM data_quality_issue issue
        JOIN source_import_batch batch
          ON batch.id = issue.source_batch_id
         AND batch.validation_state = 'published'
      )
      SELECT source.source_system AS source,
             count(issue.id)::int AS "registeredIssues",
             (count(issue.id) FILTER (WHERE issue.resolution_status = 'open'))::int AS "openIssues"
      FROM published_sources source
      LEFT JOIN published_issues issue ON issue.source_system = source.source_system
      GROUP BY source.source_system
      ORDER BY source.source_system
    `),
    sql.query(`
      /* quality:overview-crosswalk */
      SELECT count(*)::int AS total,
             (count(*) FILTER (WHERE match_status = 'matched'))::int AS matched,
             (count(*) FILTER (WHERE match_status = 'ambiguous'))::int AS ambiguous,
             (count(*) FILTER (WHERE match_status = 'unmatched'))::int AS unmatched,
             (count(*) FILTER (WHERE match_status = 'rejected'))::int AS rejected
      FROM vw_crosswalk_persona
      WHERE valid_to IS NULL
    `)
  ]);

  const issues = {
    total: qualityNumber(summaryRow.total),
    open: qualityNumber(summaryRow.open),
    byResolution: {
      open: qualityNumber(summaryRow.open),
      accepted: qualityNumber(summaryRow.accepted),
      corrected: qualityNumber(summaryRow.corrected),
      rejected: qualityNumber(summaryRow.rejected)
    },
    bySeverity: {
      info: qualityNumber(summaryRow.info),
      warning: qualityNumber(summaryRow.warning),
      error: qualityNumber(summaryRow.error),
      critical: qualityNumber(summaryRow.critical)
    },
    distinctCodes: qualityNumber(summaryRow.distinctCodes),
    distinctEntities: qualityNumber(summaryRow.distinctEntities)
  };
  const domains = {
    payrollCoherence: {
      registeredIssues: qualityNumber(summaryRow.payrollCoherence),
      openIssues: qualityNumber(summaryRow.payrollCoherenceOpen),
      codes: ['SOURCE_MONTH_MISMATCH', 'SOURCE_PERIOD_MISMATCH']
    },
    identityCuil: {
      registeredIssues: qualityNumber(summaryRow.identityCuil),
      openIssues: qualityNumber(summaryRow.identityCuilOpen),
      codes: ['CUIL_INVALID', 'CUIL_MISSING']
    },
    dates: {
      registeredIssues: qualityNumber(summaryRow.dates),
      openIssues: qualityNumber(summaryRow.datesOpen),
      codes: ['DATE_ORDER_INVALID', 'DATE_OUT_OF_RANGE']
    }
  };
  const crosswalk = {
    total: qualityNumber(crosswalkRow.total),
    matched: qualityNumber(crosswalkRow.matched),
    ambiguous: qualityNumber(crosswalkRow.ambiguous),
    unmatched: qualityNumber(crosswalkRow.unmatched),
    rejected: qualityNumber(crosswalkRow.rejected)
  };
  crosswalk.reconciled = crosswalk.total === (
    crosswalk.matched + crosswalk.ambiguous + crosswalk.unmatched + crosswalk.rejected
  );
  const severityTotal = Object.values(issues.bySeverity).reduce((sum, value) => sum + value, 0);
  const domainTotal = Object.values(domains).reduce((sum, domain) => sum + domain.registeredIssues, 0);

  return {
    status: 200,
    payload: {
      ok: true,
      data: {
        issues,
        domains,
        crosswalk,
        reconciliation: {
          severityTotal,
          domainTotal,
          totalMatchesSeverity: issues.total === severityTotal,
          totalMatchesDomains: issues.total === domainTotal,
          openEqualsTotal: issues.open === issues.total
        },
        breakdowns: {
          codes: codeRows.map((row) => ({
            source: row.source,
            entity: row.entity,
            code: row.code,
            severity: row.severity,
            resolution: row.resolution,
            issues: qualityNumber(row.issues)
          })),
          entities: entityRows.map((row) => ({
            source: row.source,
            entity: row.entity,
            registeredIssues: qualityNumber(row.registeredIssues),
            openIssues: qualityNumber(row.openIssues)
          })),
          sources: sourceRows.map((row) => {
            const registeredIssues = qualityNumber(row.registeredIssues);
            return {
              source: row.source,
              registeredIssues,
              openIssues: qualityNumber(row.openIssues),
              trackingStatus: row.source === 'PERSONAS' && registeredIssues === 0
                ? 'controls_not_materialized'
                : 'materialized'
            };
          })
        }
      },
      meta: {
        authority: { labor: 'GRH', identityAuxiliary: 'PERSONAS' },
        metric: 'registered_data_quality_issues',
        crosswalkMetric: 'active_crosswalk_records',
        containsPersonalData: false,
        mutationAllowed: false,
        zeroTrackedIssuesDoesNotMeanClean: true
      }
    }
  };
}

/** Paginated internal queue with a deliberately narrow, non-PII projection. */
export async function qualityIssues(sql, req) {
  const filters = qualityIssueRequest(req);
  if (filters.error) return filters.error;
  const page = positiveInteger(queryValue(req, 'page', '1'), 1, 100000);
  const limit = positiveInteger(queryValue(req, 'limit', '25'), 25, 50);
  const scope = qualityIssueScope(filters);
  const listValues = [...scope.values, limit, (page - 1) * limit];
  const [countRows, rows] = await Promise.all([
    sql.query(`
      /* quality:issues-count */
      SELECT count(*)::int AS total
      FROM data_quality_issue issue
      JOIN source_import_batch batch
        ON batch.id = issue.source_batch_id
       AND batch.validation_state = 'published'
      WHERE ${scope.where}
    `, scope.values),
    sql.query(`
      /* quality:issues-list */
      SELECT issue.id::text AS "issueId", issue.source_system AS source,
             issue.source_entity AS entity, issue.issue_code AS code,
             issue.severity, issue.field_name AS field,
             issue.resolution_status AS resolution,
             issue.detected_at AS "detectedAt", issue.resolved_at AS "resolvedAt"
      FROM data_quality_issue issue
      JOIN source_import_batch batch
        ON batch.id = issue.source_batch_id
       AND batch.validation_state = 'published'
      WHERE ${scope.where}
      ORDER BY CASE issue.severity
                 WHEN 'critical' THEN 1 WHEN 'error' THEN 2
                 WHEN 'warning' THEN 3 ELSE 4
               END,
               issue.detected_at DESC, issue.id DESC
      LIMIT $${listValues.length - 1} OFFSET $${listValues.length}
    `, listValues)
  ]);
  const total = qualityNumber(countRows[0]?.total);
  return {
    status: 200,
    payload: {
      ok: true,
      data: rows.map((row) => ({
        issueId: row.issueId,
        source: row.source,
        entity: row.entity,
        code: row.code,
        severity: row.severity,
        field: row.field ?? null,
        resolution: row.resolution,
        detectedAt: qualityTimestamp(row.detectedAt),
        resolvedAt: qualityTimestamp(row.resolvedAt)
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit))
      },
      filters: {
        source: filters.source === 'all' ? null : filters.source,
        severity: filters.severity === 'all' ? null : filters.severity,
        entity: filters.entity === 'all' ? null : filters.entity,
        code: filters.code === 'all' ? null : filters.code,
        resolution: filters.resolution === 'all' ? null : filters.resolution
      },
      meta: {
        grain: 'data_quality_issue',
        containsPersonalData: false,
        containsSourceRecordIdentifiers: false,
        externalSharingAllowed: false,
        mutationAllowed: false,
        excludedFields: [
          'sourceBatchId', 'sourceId', 'canonicalId', 'observedValue',
          'details', 'resolutionNote', 'rawPayload'
        ]
      }
    }
  };
}

/** Published snapshot lineage; hashes are abbreviated and no manifest is exposed. */
export async function importLineage(sql) {
  const rows = await sql.query(`
    /* quality:lineage */
    SELECT batch.source_system AS source,
           batch.source_cutoff AS cutoff,
           batch.recorded_at AS "loadedAt",
           batch.validation_state AS validation,
           batch.source_row_count AS "sourceRowCount",
           batch.source_sha256 AS sha256,
           count(issue.id)::int AS "trackedIssues"
    FROM source_import_batch batch
    LEFT JOIN data_quality_issue issue ON issue.source_batch_id = batch.id
    WHERE batch.validation_state = 'published'
    GROUP BY batch.id, batch.source_system, batch.source_cutoff,
             batch.recorded_at, batch.validation_state,
             batch.source_row_count, batch.source_sha256
    ORDER BY batch.source_system, batch.source_cutoff DESC
  `);
  const batches = rows.map((row) => {
    const sourceRowCount = row.sourceRowCount === null || row.sourceRowCount === undefined
      ? null
      : qualityNumber(row.sourceRowCount);
    const trackedIssues = qualityNumber(row.trackedIssues);
    return {
      source: row.source,
      cutoff: qualityTimestamp(row.cutoff),
      loadedAt: qualityTimestamp(row.loadedAt),
      validation: row.validation,
      sourceRowCount,
      sourceRowCountStatus: sourceRowCount === null ? 'not_reported' : 'reported',
      sha256Prefix: String(row.sha256 ?? '').trim().slice(0, 12) || null,
      trackedIssues,
      trackedIssuesStatus: row.source === 'PERSONAS' && trackedIssues === 0
        ? 'controls_not_materialized'
        : 'materialized'
    };
  });
  return {
    status: 200,
    payload: {
      ok: true,
      data: batches,
      summary: {
        publishedBatches: batches.length,
        reportedRowCounts: batches.filter((row) => row.sourceRowCountStatus === 'reported').length,
        notReportedRowCounts: batches.filter((row) => row.sourceRowCountStatus === 'not_reported').length
      },
      meta: {
        grain: 'source_import_batch',
        snapshotMode: true,
        liveSynchronization: false,
        zeroTrackedIssuesDoesNotMeanClean: true,
        hashRepresentation: 'sha256_first_12_hex_characters',
        excludedFields: ['batchId', 'sourceFileName', 'manifest', 'fullSha256']
      }
    }
  };
}

const DIRECTORY_STATUS = new Set([
  'all', 'active', 'administrative_active', 'liquidable', 'gap',
  'inactive', 'state_error', 'unknown'
]);
const DIRECTORY_CROSSWALK = new Set(['all', 'matched', 'ambiguous', 'unmatched', 'rejected']);
const DETAIL_EVENT_LIMIT = 25;
const DETAIL_MOVEMENT_LIMIT = 20;

function boundedQueryValue(req, name, maximum = 160) {
  return queryValue(req, name).trim().slice(0, maximum);
}

function directoryBaseSql() {
  return `
    WITH directory AS (
      SELECT contract.id AS "contractId",
             contract.person_id AS "canonicalPersonId",
             contract.legacy_company_id AS "companyId",
             contract.legacy_legajo AS legajo,
             COALESCE(identity.full_name, employee.nombre) AS nombre,
             identity.dni,
             identity.cuil,
             identity.sex_code AS sexo,
             identity.data_quality_score AS "identityQualityScore",
             identity.identity_state AS "identityState",
             contract.start_date AS "fechaIngreso",
             contract.end_date AS "fechaEgreso",
             contract.status AS "contractStatus",
             latest_status.administrative_status AS "administrativeStatus",
             latest_status.payroll_status AS "payrollStatus",
             latest_status.snapshot_date AS "statusSnapshotDate",
             COALESCE(
               control.estado_control,
               CASE WHEN latest_status.administrative_status = 'inactive'
                    THEN 'inactivo_administrativo' ELSE 'sin_clasificar' END
             ) AS "controlState",
             COALESCE(latest_status.administrative_status IN (
               'active', 'suspended', 'leave_without_pay', 'pending_termination', 'state_error'
             ), false) AS activo,
             COALESCE(latest_status.payroll_status IN ('liquidated', 'preliquidated'), false)
               AS liquidable,
             COALESCE(
               NULLIF(btrim(contract.source_payload #>> '{employment,organizationName}'), ''),
               latest_assignment.department_name
             ) AS organizacion,
             COALESCE(
               NULLIF(btrim(contract.source_payload #>> '{employment,sectorName}'), ''),
               employee.sector,
               latest_assignment.area_name
             ) AS sector,
             COALESCE(
               NULLIF(btrim(contract.source_payload #>> '{employment,categoryName}'), ''),
               employee.categoria,
               latest_assignment.category_name
             ) AS categoria,
             COALESCE(
               NULLIF(btrim(contract.source_payload #>> '{employment,agreementName}'), ''),
               employee.convenio,
               latest_assignment.agreement_name
             ) AS convenio,
             COALESCE(
               NULLIF(btrim(contract.source_payload #>> '{employment,cargoName}'), ''),
               employee.cargo,
               latest_assignment.role_name
             ) AS cargo,
             COALESCE(crosswalk.match_status, 'not_loaded') AS "crosswalkStatus",
             crosswalk.match_method AS "crosswalkMethod",
             crosswalk.confidence AS "crosswalkConfidence"
      FROM employment_contract contract
      JOIN person_identity identity ON identity.id = contract.person_id
      LEFT JOIN grh_employees employee
        ON employee.company_id = contract.legacy_company_id
       AND employee.legajo = contract.legacy_legajo
      LEFT JOIN vw_empleado_actual control ON control.employment_contract_id = contract.id
      LEFT JOIN crosswalk_persona crosswalk
        ON crosswalk.person_id = identity.id
       AND crosswalk.valid_to IS NULL
      LEFT JOIN LATERAL (
        SELECT snapshot.snapshot_date,
               snapshot.administrative_status,
               snapshot.payroll_status
        FROM employment_status_snapshot snapshot
        WHERE snapshot.employment_contract_id = contract.id
        ORDER BY snapshot.snapshot_date DESC
        LIMIT 1
      ) latest_status ON true
      LEFT JOIN LATERAL (
        SELECT assignment.department_name,
               assignment.area_name,
               assignment.category_name,
               assignment.agreement_name,
               assignment.role_name
        FROM payroll_snapshot_assignment assignment
        WHERE assignment.employment_contract_id = contract.id
        ORDER BY assignment.snapshot_date DESC
        LIMIT 1
      ) latest_assignment ON true
    )
  `;
}

export async function employees(sql, req) {
  const page = positiveInteger(queryValue(req, 'page', '1'), 1, 100000);
  const limit = positiveInteger(queryValue(req, 'limit', '25'), 25, 100);
  const search = boundedQueryValue(req, 'search', 100);
  const sector = boundedQueryValue(req, 'sector');
  const organization = boundedQueryValue(req, 'organization');
  const agreement = boundedQueryValue(req, 'agreement');
  const includeFacets = queryValue(req, 'includeFacets', '1') !== '0';
  const requestedStatus = boundedQueryValue(req, 'status', 32).toLowerCase() || 'all';
  const status = requestedStatus === 'active' ? 'administrative_active' : requestedStatus;
  const crosswalk = boundedQueryValue(req, 'crosswalk', 32).toLowerCase() || 'all';
  if (!DIRECTORY_STATUS.has(requestedStatus)) {
    return { status: 400, payload: { ok: false, code: 'DIRECTORY_STATUS_INVALID', error: 'Filtro de estado inválido' } };
  }
  if (!DIRECTORY_CROSSWALK.has(crosswalk)) {
    return { status: 400, payload: { ok: false, code: 'DIRECTORY_CROSSWALK_INVALID', error: 'Filtro de integración inválido' } };
  }

  const conditions = [];
  const values = [];
  const parameter = (value) => {
    values.push(value);
    return `$${values.length}`;
  };
  if (search) {
    const term = parameter(`%${search}%`);
    conditions.push(`(
      directory.nombre ILIKE ${term}
      OR directory.legajo ILIKE ${term}
      OR directory.dni ILIKE ${term}
      OR directory.cuil ILIKE ${term}
    )`);
  }
  if (sector) conditions.push(`COALESCE(directory.sector, 'Sin sector informado') = ${parameter(sector)}`);
  if (organization) conditions.push(`COALESCE(directory.organizacion, 'Sin organización informada') = ${parameter(organization)}`);
  if (agreement) conditions.push(`COALESCE(directory.convenio, 'Sin convenio informado') = ${parameter(agreement)}`);
  if (status === 'administrative_active') conditions.push('directory.activo IS TRUE');
  if (status === 'liquidable') conditions.push('directory.liquidable IS TRUE');
  if (status === 'gap') conditions.push('directory.activo IS TRUE AND directory.liquidable IS NOT TRUE');
  if (status === 'inactive') conditions.push("directory.\"administrativeStatus\" = 'inactive'");
  if (status === 'state_error') conditions.push("directory.\"administrativeStatus\" = 'state_error'");
  if (status === 'unknown') conditions.push("directory.\"administrativeStatus\" IS NULL OR directory.\"administrativeStatus\" = 'unknown'");
  if (crosswalk !== 'all') conditions.push(`directory."crosswalkStatus" = ${parameter(crosswalk)}`);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const baseSql = directoryBaseSql();
  const dataValues = [...values, limit, (page - 1) * limit];

  const [[countRow], data, [scope], sectors, organizations, agreements] = await Promise.all([
    sql.query(`${baseSql} SELECT count(*)::int AS total FROM directory ${where}`, values),
    sql.query(`
      ${baseSql}
      SELECT * FROM directory
      ${where}
      ORDER BY CASE
                 WHEN activo AND liquidable THEN 0
                 WHEN activo THEN 1
                 WHEN "administrativeStatus" = 'inactive' THEN 2
                 ELSE 3
               END,
               nombre NULLS LAST,
               "companyId",
               legajo
      LIMIT $${dataValues.length - 1} OFFSET $${dataValues.length}
    `, dataValues),
    sql.query(`
      SELECT (SELECT count(*)::int FROM employment_contract) AS "totalContracts",
             (SELECT count(*)::int FROM person_identity) AS "totalPeople",
             (SELECT count(*)::int FROM crosswalk_persona
               WHERE valid_to IS NULL AND match_status = 'matched') AS matched,
             (SELECT count(*)::int FROM crosswalk_persona
               WHERE valid_to IS NULL AND match_status = 'ambiguous') AS ambiguous,
             (SELECT count(*)::int FROM crosswalk_persona
               WHERE valid_to IS NULL AND match_status = 'unmatched') AS unmatched
    `),
    includeFacets ? sql.query(`
      SELECT COALESCE(NULLIF(btrim(source_payload #>> '{employment,sectorName}'), ''), 'Sin sector informado') AS value,
             count(*)::int AS count
      FROM employment_contract
      GROUP BY 1 ORDER BY value
    `) : Promise.resolve([]),
    includeFacets ? sql.query(`
      SELECT COALESCE(NULLIF(btrim(source_payload #>> '{employment,organizationName}'), ''), 'Sin organización informada') AS value,
             count(*)::int AS count
      FROM employment_contract
      GROUP BY 1 ORDER BY value
    `) : Promise.resolve([]),
    includeFacets ? sql.query(`
      SELECT COALESCE(NULLIF(btrim(source_payload #>> '{employment,agreementName}'), ''), 'Sin convenio informado') AS value,
             count(*)::int AS count
      FROM employment_contract
      GROUP BY 1 ORDER BY value
    `) : Promise.resolve([])
  ]);
  const total = Number(countRow?.total || 0);
  return {
    status: 200,
    payload: {
      ok: true,
      data,
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
      scope: {
        grain: 'employment_contract',
        authority: 'GRH',
        personasRole: 'auxiliary_identity_and_territory_only',
        totalContracts: Number(scope?.totalContracts || 0),
        totalPeople: Number(scope?.totalPeople || 0),
        matched: Number(scope?.matched || 0),
        ambiguous: Number(scope?.ambiguous || 0),
        unmatched: Number(scope?.unmatched || 0)
      },
      facets: { sectors, organizations, agreements }
    }
  };
}

function safeJsonObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function assertionValue(assertions, sourceSystem, attributeName) {
  return assertions.find((row) => row.sourceSystem === sourceSystem && row.attributeName === attributeName)?.rawValue ?? null;
}

export async function employee(sql, req) {
  const contractId = boundedQueryValue(req, 'contractId', 64);
  const legajo = boundedQueryValue(req, 'legajo', 64);
  const companyId = boundedQueryValue(req, 'companyId', 32);
  if (!contractId && !legajo) {
    return { status: 400, payload: { ok: false, code: 'EMPLOYEE_IDENTIFIER_REQUIRED', error: 'Identificador de ficha requerido' } };
  }
  if (contractId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(contractId)) {
    return { status: 400, payload: { ok: false, code: 'CONTRACT_ID_INVALID', error: 'Identificador de contrato inválido' } };
  }
  if (companyId && !/^-?\d+$/.test(companyId)) {
    return { status: 400, payload: { ok: false, code: 'COMPANY_ID_INVALID', error: 'Identificador de empresa inválido' } };
  }
  const companyIdNumber = companyId ? Number(companyId) : null;
  if (companyId && !Number.isSafeInteger(companyIdNumber)) {
    return { status: 400, payload: { ok: false, code: 'COMPANY_ID_INVALID', error: 'Identificador de empresa inválido' } };
  }
  const identifierSql = contractId
    ? { clause: 'contract.id = $1::uuid', values: [contractId] }
    : {
        clause: `contract.legacy_legajo = $1 ${companyId ? 'AND contract.legacy_company_id = $2' : ''}`,
        values: companyId ? [legajo, companyIdNumber] : [legajo]
      };
  const rows = await sql.query(`
    SELECT contract.id AS "contractId",
           contract.person_id AS "canonicalPersonId",
           contract.legacy_company_id AS "companyId",
           contract.legacy_legajo AS legajo,
           contract.source_batch_id AS "contractSourceBatchId",
           contract.start_date AS "fechaIngreso",
           contract.end_date AS "fechaEgreso",
           contract.status AS "contractStatus",
           contract.status_explanation AS "contractStatusExplanation",
           contract.agreement_code AS "convenioCode",
           contract.category_code AS "categoriaCode",
           contract.organization_unit_source_id AS "organizationSourceId",
           contract.position_source_id AS "cargoCode",
           contract.sector_source_id AS "sectorCode",
           contract.source_payload AS "rawFields",
           identity.full_name AS nombre,
           identity.sex_code AS sexo,
           identity.birth_date AS "fechaNacimiento",
           identity.dni,
           identity.cuil,
           identity.data_quality_score AS "identityQualityScore",
           identity.identity_state AS "identityState",
           employee.person_id AS "grhPersonId",
           employee.telefono,
           employee.email,
           employee.domicilio,
           employee.localidad,
           employee.sector,
           employee.categoria,
           employee.convenio,
           employee.cargo,
           employee.gremio,
           employee.lugar_trabajo AS "lugarTrabajo",
           employee.profesion,
           employee.source_payload AS "legacyRawFields",
           latest_status.snapshot_date AS "statusSnapshotDate",
           latest_status.administrative_status AS "administrativeStatus",
           latest_status.payroll_status AS "payrollStatus",
           latest_status.discrepancy_reason_code AS "discrepancyReasonCode",
           latest_status.discrepancy_explanation AS "discrepancyExplanation",
           payroll_run.closure_status AS "payrollClosureStatus",
           control.estado_control AS "controlState",
           COALESCE(latest_status.administrative_status IN (
             'active', 'suspended', 'leave_without_pay', 'pending_termination', 'state_error'
           ), false) AS activo,
           COALESCE(latest_status.payroll_status IN ('liquidated', 'preliquidated'), false) AS liquidable,
           latest_assignment.snapshot_date AS "assignmentSnapshotDate",
           latest_assignment.agreement_source_id AS "assignmentAgreementCode",
           latest_assignment.agreement_name AS "assignmentAgreementName",
           latest_assignment.category_name AS "assignmentCategoryName",
           latest_assignment.role_name AS "assignmentRoleName",
           latest_assignment.department_source_id AS "departmentSourceId",
           latest_assignment.department_name AS "departmentName",
           latest_assignment.area_name AS "areaName",
           latest_assignment.budget_structure AS "budgetStructure",
           latest_assignment.budget_detail AS "budgetDetail",
           crosswalk.match_status AS "crosswalkStatus",
           crosswalk.match_method AS "crosswalkMethod",
           crosswalk.confidence AS "crosswalkConfidence",
           crosswalk.evidence AS "crosswalkEvidence",
           crosswalk.grh_source_id AS "crosswalkGrhSourceId",
           crosswalk.personas_source_id AS "personasSourceId",
           crosswalk.valid_from AS "crosswalkValidFrom",
           crosswalk.reviewed_by AS "crosswalkReviewedBy",
           crosswalk.reviewed_at AS "crosswalkReviewedAt"
    FROM employment_contract contract
    JOIN person_identity identity ON identity.id = contract.person_id
    LEFT JOIN grh_employees employee
      ON employee.company_id = contract.legacy_company_id
     AND employee.legajo = contract.legacy_legajo
    LEFT JOIN crosswalk_persona crosswalk
      ON crosswalk.person_id = identity.id
     AND crosswalk.valid_to IS NULL
    LEFT JOIN vw_empleado_actual control ON control.employment_contract_id = contract.id
    LEFT JOIN LATERAL (
      SELECT snapshot.*
      FROM employment_status_snapshot snapshot
      WHERE snapshot.employment_contract_id = contract.id
      ORDER BY snapshot.snapshot_date DESC
      LIMIT 1
    ) latest_status ON true
    LEFT JOIN payroll_run ON payroll_run.id = latest_status.payroll_run_id
    LEFT JOIN LATERAL (
      SELECT assignment.*
      FROM payroll_snapshot_assignment assignment
      WHERE assignment.employment_contract_id = contract.id
      ORDER BY assignment.snapshot_date DESC
      LIMIT 1
    ) latest_assignment ON true
    WHERE ${identifierSql.clause}
    ORDER BY contract.legacy_company_id, contract.legacy_legajo
    LIMIT 2
  `, identifierSql.values);
  if (!rows.length) return { status: 404, payload: { ok: false, code: 'EMPLOYEE_NOT_FOUND', error: 'Legajo no encontrado' } };
  if (rows.length > 1) {
    return {
      status: 409,
      payload: {
        ok: false,
        code: 'EMPLOYEE_IDENTIFIER_AMBIGUOUS',
        error: 'El legajo existe en más de una compañía; seleccioná la ficha desde el directorio.'
      }
    };
  }
  const row = rows[0];
  const relationParams = [row.companyId, row.legajo];
  const [
    [counts],
    absences,
    leaves,
    family,
    movements,
    assertions,
    sourceReferences,
    employmentHistory
  ] = await Promise.all([
    sql.query(`
      SELECT
        (SELECT count(*)::int FROM grh_absences WHERE company_id = $1 AND legajo = $2) AS "absenceTotal",
        (SELECT count(*)::int FROM grh_leaves WHERE company_id = $1 AND legajo = $2) AS "leaveTotal",
        (SELECT count(*)::int FROM grh_family WHERE company_id = $1 AND legajo = $2) AS "familyTotal",
        (SELECT count(*)::int FROM employment_movement WHERE employment_contract_id = $3::uuid) AS "movementTotal"
    `, [...relationParams, row.contractId]),
    sql.query(`
      SELECT absence.fecha, absence.motivo_code AS "motivoCode", catalog.label AS motivo,
             absence.cantidad, absence.dias, absence.fecha_hasta AS "fechaHasta",
             absence.comentario, absence.source_payload AS "rawFields"
      FROM grh_absences absence
      LEFT JOIN grh_catalog_rows catalog
        ON catalog.catalog = 'absence_reasons'
       AND catalog.source_payload #>> '{sourceKey,reasonCode}' = absence.motivo_code
      WHERE absence.company_id = $1 AND absence.legajo = $2
      ORDER BY absence.fecha DESC
      LIMIT ${DETAIL_EVENT_LIMIT}
    `, relationParams),
    sql.query(`
      SELECT periodo, tipo, fecha_inicio AS "fechaInicio", fecha_fin AS "fechaFin",
             dias, observaciones, source_payload AS "rawFields"
      FROM grh_leaves
      WHERE company_id = $1 AND legajo = $2
      ORDER BY fecha_inicio DESC
      LIMIT ${DETAIL_EVENT_LIMIT}
    `, relationParams),
    sql.query(`
      SELECT family.family_id AS "familyId", family.nombre, family.sexo,
             family.fecha_nacimiento AS "fechaNacimiento", family.dni, family.cuil,
             family.vinculo_code AS "vinculoCode", catalog.label AS vinculo,
             family.fecha_baja AS "fechaBaja", family.source_payload AS "rawFields"
      FROM grh_family family
      LEFT JOIN grh_catalog_rows catalog
        ON catalog.catalog = 'family_relationships'
       AND catalog.source_payload #>> '{sourceKey,relationshipId}' = family.vinculo_code
      WHERE family.company_id = $1 AND family.legajo = $2
      ORDER BY family.fecha_baja NULLS FIRST, family.nombre
      LIMIT ${DETAIL_EVENT_LIMIT}
    `, relationParams),
    sql.query(`
      SELECT movement_period AS "movementPeriod", payroll_type AS "payrollType",
             movement_type AS "movementType", concept_source_id AS "conceptSourceId",
             cost_center_source_id AS "costCenterSourceId", quantity,
             installment, legal_instrument AS "legalInstrument",
             movement_status AS "movementStatus", source_id AS "sourceId",
             source_payload AS "rawFields"
      FROM employment_movement
      WHERE employment_contract_id = $1::uuid
      ORDER BY movement_period DESC, id DESC
      LIMIT ${DETAIL_MOVEMENT_LIMIT}
    `, [row.contractId]),
    sql.query(`
      SELECT attribute_name AS "attributeName", raw_value AS "rawValue",
             normalized_value AS "normalizedValue", source_system AS "sourceSystem",
             source_entity AS "sourceEntity", source_id AS "sourceId",
             confidence, evidence, eligible_for_promotion AS "eligibleForPromotion",
             preferred, valid_from AS "validFrom"
      FROM person_identity_assertion
      WHERE person_id = $1::uuid AND valid_to IS NULL
      ORDER BY source_system, attribute_name, valid_from DESC
    `, [row.canonicalPersonId]),
    sql.query(`
      SELECT source_system AS "sourceSystem", source_entity AS "sourceEntity",
             source_id AS "sourceId", source_batch_id AS "sourceBatchId",
             canonical_entity AS "canonicalEntity", canonical_id AS "canonicalId",
             match_method AS "matchMethod", confidence, evidence,
             valid_from AS "validFrom"
      FROM source_xref
      WHERE canonical_id = ANY($1::uuid[]) AND valid_to IS NULL
      ORDER BY source_system, canonical_entity, source_entity, source_id
    `, [[row.canonicalPersonId, row.contractId]]),
    sql.query(`
      SELECT contract.id AS "contractId", contract.legacy_company_id AS "companyId",
             contract.legacy_legajo AS legajo, contract.start_date AS "startDate",
             contract.end_date AS "endDate", contract.status,
             contract.source_payload #>> '{employment,organizationName}' AS organization,
             contract.source_payload #>> '{employment,sectorName}' AS sector,
             contract.source_payload #>> '{employment,cargoName}' AS role
      FROM employment_contract contract
      WHERE contract.person_id = $1::uuid
      ORDER BY contract.start_date DESC NULLS LAST, contract.legacy_company_id, contract.legacy_legajo
    `, [row.canonicalPersonId])
  ]);

  const rawFields = safeJsonObject(row.rawFields);
  const memberships = Array.isArray(rawFields.unionMemberships) ? rawFields.unionMemberships : [];
  const matched = row.crosswalkStatus === 'matched';
  const personasAssertions = matched
    ? assertions.filter((assertion) => assertion.sourceSystem === 'PERSONAS')
    : [];
  const visibleAssertions = matched
    ? assertions
    : assertions.filter((assertion) => assertion.sourceSystem !== 'PERSONAS');
  const visibleSourceReferences = matched
    ? sourceReferences
    : sourceReferences.filter((reference) => reference.sourceSystem !== 'PERSONAS');
  const personasAddresses = assertionValue(personasAssertions, 'PERSONAS', 'address');
  const personasTerritory = assertionValue(personasAssertions, 'PERSONAS', 'territory');
  const personasPhone = assertionValue(personasAssertions, 'PERSONAS', 'phone');
  const personasEmail = assertionValue(personasAssertions, 'PERSONAS', 'email');
  const controlState = row.controlState
    || (row.administrativeStatus === 'inactive' ? 'inactivo_administrativo' : 'sin_clasificar');
  const contactAvailable = personasPhone !== null || personasEmail !== null;
  const personasReason = matched
    ? null
    : row.crosswalkStatus === 'ambiguous'
      ? 'Existen candidatos, pero la identidad no fue vinculada automáticamente.'
      : row.crosswalkStatus === 'unmatched'
        ? 'No se encontró una identidad PERSONAS con evidencia suficiente.'
        : 'El crosswalk PERSONAS todavía no está disponible para esta identidad.';

  return {
    status: 200,
    payload: {
      ok: true,
      data: {
        ...row,
        controlState,
        organizacion: rawFields.employment?.organizationName ?? row.departmentName ?? null,
        sector: rawFields.employment?.sectorName ?? row.sector ?? row.areaName ?? null,
        categoria: rawFields.employment?.categoryName ?? row.categoria ?? row.assignmentCategoryName ?? null,
        convenio: rawFields.employment?.agreementName ?? row.convenio ?? row.assignmentAgreementName ?? null,
        cargo: rawFields.employment?.cargoName ?? row.cargo ?? row.assignmentRoleName ?? null,
        unionMemberships: memberships,
        identityAssertions: visibleAssertions,
        sourceReferences: visibleSourceReferences,
        employmentHistory,
        movements,
        ausencias: absences,
        licencias: leaves,
        familiares: family,
        personas: {
          available: matched,
          status: row.crosswalkStatus || 'not_loaded',
          sourceId: matched ? row.personasSourceId : null,
          matchMethod: row.crosswalkMethod,
          confidence: row.crosswalkConfidence === null ? null : Number(row.crosswalkConfidence),
          evidence: safeJsonObject(row.crosswalkEvidence),
          validFrom: row.crosswalkValidFrom,
          reason: personasReason,
          contact: {
            available: contactAvailable,
            phone: personasPhone,
            email: personasEmail,
            reason: contactAvailable ? null : 'PERSONAS no aportó teléfono ni email para esta identidad vinculada.'
          },
          domiciles: matched && Array.isArray(personasAddresses) ? personasAddresses : [],
          territory: matched ? safeJsonObject(personasTerritory) : {},
          assertions: personasAssertions
        }
      },
      meta: {
        absenceTotal: Number(counts?.absenceTotal || 0),
        leaveTotal: Number(counts?.leaveTotal || 0),
        familyTotal: Number(counts?.familyTotal || 0),
        movementTotal: Number(counts?.movementTotal || 0),
        relationRowsCappedAt: DETAIL_EVENT_LIMIT,
        movementRowsCappedAt: DETAIL_MOVEMENT_LIMIT,
        relationRowsComplete:
          Number(counts?.absenceTotal || 0) <= DETAIL_EVENT_LIMIT
          && Number(counts?.leaveTotal || 0) <= DETAIL_EVENT_LIMIT
          && Number(counts?.familyTotal || 0) <= DETAIL_EVENT_LIMIT
      }
    }
  };
}

export default async function handler(req, res) {
  if (String(req.method || 'GET').toUpperCase() !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Método no permitido' });
  }
  const session = requireInternalSession(req, res);
  if (!session) return;

  try {
    const sql = await getInternalSql();
    const resource = queryValue(req, 'resource', 'summary').toLowerCase();
    if (resource === 'summary') return send(res, 200, await summary(sql));
    if (resource === 'structure') return send(res, 200, await structure(sql));
    if (resource === 'integrationquality') return send(res, 200, await integrationQuality(sql));
    if (resource === 'payrollcontrol') return send(res, 200, await payrollControl(sql));
    if (resource === 'absenceanalytics') {
      const result = await absenceAnalytics(sql, req);
      return send(res, result.status, result.payload);
    }
    if (resource === 'absenceevents') {
      const result = await absenceEvents(sql, req);
      return send(res, result.status, result.payload);
    }
    if (resource === 'qualityoverview') {
      const result = await qualityOverview(sql);
      return send(res, result.status, result.payload);
    }
    if (resource === 'qualityissues') {
      const result = await qualityIssues(sql, req);
      return send(res, result.status, result.payload);
    }
    if (resource === 'importlineage') {
      const result = await importLineage(sql);
      return send(res, result.status, result.payload);
    }
    if (resource === 'employees') {
      const result = await employees(sql, req);
      return send(res, result.status, result.payload);
    }
    if (resource === 'employee') {
      const result = await employee(sql, req);
      return send(res, result.status, result.payload);
    }
    return send(res, 400, { ok: false, code: 'UNKNOWN_RESOURCE', error: 'Recurso desconocido' });
  } catch (error) {
    console.error('[internal-data]', error instanceof Error ? error.message : 'error desconocido');
    return send(res, 503, { ok: false, code: 'INTERNAL_DATA_UNAVAILABLE', error: 'La base interna no está disponible.' });
  }
}
