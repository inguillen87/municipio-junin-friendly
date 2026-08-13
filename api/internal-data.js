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

async function employees(sql, req) {
  const page = positiveInteger(queryValue(req, 'page', '1'), 1, 100000);
  const limit = positiveInteger(queryValue(req, 'limit', '25'), 25, 100);
  const search = queryValue(req, 'search').trim();
  const sector = queryValue(req, 'sector').trim();
  const status = queryValue(req, 'status', 'all').toLowerCase();
  const conditions = [];
  const values = [];
  const add = (builder, ...params) => {
    const placeholders = params.map((value) => {
      values.push(value);
      return `$${values.length}`;
    });
    conditions.push(builder(placeholders));
  };

  if (search) {
    const term = `%${search}%`;
    add(
      ([name, legajo, dni, cuil]) => `(nombre ILIKE ${name} OR legajo ILIKE ${legajo} OR dni ILIKE ${dni} OR cuil ILIKE ${cuil})`,
      term,
      term,
      term,
      term
    );
  }
  if (sector) {
    add(
      ([value]) => `COALESCE(NULLIF(btrim(sector), ''), 'Sin sector homologado') = ${value}`,
      sector
    );
  }
  if (status === 'active') conditions.push('activo IS TRUE');
  if (status === 'inactive') conditions.push('activo IS FALSE');
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [{ total }] = await sql.query(`SELECT count(*)::int AS total FROM grh_employees ${where}`, values);
  const dataValues = [...values, limit, (page - 1) * limit];
  const data = await sql.query(`
    SELECT company_id AS "companyId", legajo, nombre, sexo, dni, cuil,
           fecha_ingreso AS "fechaIngreso", fecha_egreso AS "fechaEgreso", activo,
           sector, categoria, convenio, cargo, gremio, lugar_trabajo AS "lugarTrabajo"
    FROM grh_employees
    ${where}
    ORDER BY activo DESC, nombre NULLS LAST, legajo
    LIMIT $${dataValues.length - 1} OFFSET $${dataValues.length}
  `, dataValues);

  return {
    ok: true,
    data,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
  };
}

async function employee(sql, req) {
  const legajo = queryValue(req, 'legajo').trim();
  const companyId = queryValue(req, 'companyId').trim();
  if (!legajo) return { status: 400, payload: { ok: false, code: 'LEGAJO_REQUIRED', error: 'Legajo requerido' } };
  if (companyId && !/^-?\d+$/.test(companyId)) {
    return { status: 400, payload: { ok: false, code: 'COMPANY_ID_INVALID', error: 'Identificador de empresa invalido' } };
  }
  const companyIdNumber = companyId ? Number(companyId) : null;
  if (companyId && !Number.isSafeInteger(companyIdNumber)) {
    return { status: 400, payload: { ok: false, code: 'COMPANY_ID_INVALID', error: 'Identificador de empresa invalido' } };
  }
  const params = companyId ? [legajo, companyIdNumber] : [legajo];
  const [row] = await sql.query(`
    SELECT company_id AS "companyId", legajo, person_id AS "personId", nombre, sexo,
           fecha_nacimiento AS "fechaNacimiento", dni, cuil, telefono, email, domicilio, localidad,
           fecha_ingreso AS "fechaIngreso", fecha_egreso AS "fechaEgreso", activo,
           sector_code AS "sectorCode", sector, categoria_code AS "categoriaCode", categoria,
           convenio_code AS "convenioCode", convenio, cargo_code AS "cargoCode", cargo, gremio,
           lugar_trabajo AS "lugarTrabajo", profesion, source_payload AS "rawFields"
    FROM grh_employees
    WHERE legajo = $1 ${companyId ? 'AND company_id = $2' : ''}
    ORDER BY company_id
    LIMIT 1
  `, params);
  if (!row) return { status: 404, payload: { ok: false, code: 'EMPLOYEE_NOT_FOUND', error: 'Legajo no encontrado' } };

  const relationParams = [row.companyId, row.legajo];
  const [counts] = await sql.query(`
    SELECT
      (SELECT count(*)::int FROM grh_absences WHERE company_id = $1 AND legajo = $2) AS absence_total,
      (SELECT count(*)::int FROM grh_leaves WHERE company_id = $1 AND legajo = $2) AS leave_total,
      (SELECT count(*)::int FROM grh_family WHERE company_id = $1 AND legajo = $2) AS family_total
  `, relationParams);
  const [absences, leaves, family] = await Promise.all([
    sql.query(`
      SELECT a.fecha, a.motivo_code AS "motivoCode", c.label AS motivo,
             a.cantidad, a.dias, a.fecha_hasta AS "fechaHasta", a.fecha_hasta AS "fechaFin",
             a.comentario, a.comentario AS observaciones, a.source_payload AS "rawFields"
      FROM grh_absences a
      LEFT JOIN grh_catalog_rows c
        ON c.catalog = 'absence_reasons'
       AND c.source_payload #>> '{sourceKey,reasonCode}' = a.motivo_code
      WHERE a.company_id = $1 AND a.legajo = $2
      ORDER BY a.fecha DESC
    `, relationParams),
    sql.query(`
      SELECT periodo, tipo, fecha_inicio AS "fechaInicio", fecha_fin AS "fechaFin",
             dias, observaciones, source_payload AS "rawFields"
      FROM grh_leaves
      WHERE company_id = $1 AND legajo = $2
      ORDER BY fecha_inicio DESC
    `, relationParams),
    sql.query(`
      SELECT f.family_id AS "familyId", f.nombre, f.sexo,
             f.fecha_nacimiento AS "fechaNacimiento", f.dni, f.cuil,
             f.vinculo_code AS "vinculoCode", c.label AS vinculo,
             f.fecha_baja AS "fechaBaja", f.source_payload AS "rawFields"
      FROM grh_family f
      LEFT JOIN grh_catalog_rows c
        ON c.catalog = 'family_relationships'
       AND c.source_payload #>> '{sourceKey,relationshipId}' = f.vinculo_code
      WHERE f.company_id = $1 AND f.legajo = $2
      ORDER BY f.nombre
    `, relationParams)
  ]);

  return {
    status: 200,
    payload: {
      ok: true,
      data: { ...row, ausencias: absences, licencias: leaves, familiares: family },
      meta: {
        absenceTotal: counts.absence_total,
        leaveTotal: counts.leave_total,
        familyTotal: counts.family_total,
        relationRowsComplete: true
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
    if (resource === 'employees') return send(res, 200, await employees(sql, req));
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
