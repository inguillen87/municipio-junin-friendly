export const RRHH_REPORT_PACK_CONTRACT_VERSION = 'rrhh-report-pack.v1';

const SOURCE_SCHEMA_VERSION = 1;
const MAX_EXACT_INTEGER = 999999999999999;
const MAX_ROWS_PER_SERIES = 120;
const MAX_TEXT_LENGTH = 1000;
const SOURCE_SHA256 = /^(?:sha256:)?[a-f0-9]{64}$/i;
const DATE = /^(?:19|20)[0-9]{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])$/;
const LOCAL_SNAPSHOT = /^(?:19|20)[0-9]{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\.[0-9]{1,3})?$/;
const INSTANT = /^(?:19|20)[0-9]{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\.[0-9]{3})?Z$/;
const DOWNLOAD_NAME = /^municontrol_informe-rrhh_(?:19|20)[0-9]{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])_[a-f0-9]{12}\.(?:xlsx|pdf)$/;
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MIME_PDF = 'application/pdf';
const FORBIDDEN_KEYS = new Set([
  'apellido', 'address', 'batchid', 'canonicalid', 'comentario', 'comment',
  'companyid', 'contractid', 'coordinates', 'correo', 'cuil', 'cuit', 'diagnostico',
  'displayname', 'dni', 'documentnumber', 'documento', 'domicilio', 'email', 'employeeid',
  'employeerow', 'employeerows', 'employees', 'employmentcontractid', 'evidence',
  'familyid', 'filename', 'fullname', 'importid', 'ip', 'issueid', 'latitude',
  'legajo', 'legajos', 'longitude', 'medical', 'mobile', 'name', 'nombre',
  'observacion', 'observation', 'personid', 'personrow', 'personrows', 'persons',
  'phone', 'rawfields', 'records', 'row', 'rows', 'sessionid', 'sourceemployeekey',
  'sourcename', 'sourcepayload', 'telefono', 'useremail', 'whatsapp',
]);
const VALID_SNAPSHOTS = new WeakSet();
const ARTIFACT_CHECKSUMS = new WeakMap();

export class RrhhReportPackError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RrhhReportPackError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new RrhhReportPackError(code, message);
}

function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    fail('RRHH_SHAPE_INVALID', `${label} debe ser un objeto`);
  }
  return value;
}

function exactKeys(value, required, optional, label) {
  plainObject(value, label);
  const allowed = new Set([...required, ...optional]);
  const actual = Object.keys(value);
  if (required.some((key) => !Object.hasOwn(value, key)) || actual.some((key) => !allowed.has(key))) {
    fail('RRHH_SHAPE_INVALID', `${label} no cumple el contrato de campos esperado`);
  }
}

function scanForPii(value, state = { nodes: 0 }) {
  state.nodes += 1;
  if (state.nodes > 2000) fail('RRHH_SHAPE_INVALID', 'El snapshot agregado supera el tamaño estructural permitido');
  if (typeof value === 'string') {
    if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value)) {
      fail('RRHH_PII_REJECTED', 'El snapshot agregado contiene un correo electrónico');
    }
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (FORBIDDEN_KEYS.has(normalized)) {
      fail('RRHH_PII_REJECTED', `El campo ${key} no pertenece a un snapshot agregado`);
    }
    scanForPii(nested, state);
  }
}

function textValue(value, label, max = MAX_TEXT_LENGTH) {
  if (typeof value !== 'string') fail('RRHH_SHAPE_INVALID', `${label} debe ser texto`);
  const normalized = value.trim().replace(/\r\n?/g, '\n');
  if (!normalized || normalized.length > max
      || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)) {
    fail('RRHH_SHAPE_INVALID', `${label} no contiene texto válido`);
  }
  return normalized;
}

function exactInteger(value, label, minimum = 0, maximum = MAX_EXACT_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail('RRHH_NUMBER_INVALID', `${label} debe ser un entero exacto entre ${minimum} y ${maximum}`);
  }
  return value;
}

function validDate(value, label) {
  const text = String(value || '');
  if (!DATE.test(text)) fail('RRHH_DATE_INVALID', `${label} no tiene formato AAAA-MM-DD`);
  const [year, month, day] = text.split('-').map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    fail('RRHH_DATE_INVALID', `${label} no es una fecha de calendario válida`);
  }
  return text;
}

function dateOrdinal(value) {
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86400000;
}

function generatedInstant(value) {
  if (!INSTANT.test(String(value || '')) || Number.isNaN(new Date(value).getTime())) {
    fail('RRHH_GENERATED_AT_REQUIRED', 'generatedAt debe ser un instante UTC ISO explícito');
  }
  return new Date(value).toISOString();
}

function uniqueRows(rows, keyOf, label) {
  const seen = new Set();
  for (const row of rows) {
    const key = keyOf(row);
    if (seen.has(key)) fail('RRHH_SERIES_INCONSISTENT', `${label} contiene valores duplicados`);
    seen.add(key);
  }
}

function normalizedLabelRows(value, label, minimumGroupSize) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ROWS_PER_SERIES) {
    fail('RRHH_SERIES_INCONSISTENT', `${label} debe contener entre 1 y ${MAX_ROWS_PER_SERIES} filas`);
  }
  const rows = value.map((row, index) => {
    exactKeys(row, ['label', 'value'], [], `${label}[${index}]`);
    const count = exactInteger(row.value, `${label}[${index}].value`);
    if (count > 0 && count < minimumGroupSize) {
      fail('RRHH_PRIVACY_INVALID', `${label}[${index}] queda debajo del mínimo de publicación`);
    }
    return { label: textValue(row.label, `${label}[${index}].label`, 160), value: count };
  });
  uniqueRows(rows, (row) => row.label.toLocaleLowerCase('es'), label);
  return rows;
}

function normalizeManagementPeriod(value, label, requirePartial) {
  exactKeys(value, ['label', 'from', 'to', 'hires', 'exits', 'balance'], requirePartial ? ['partial'] : [], label);
  const from = validDate(value.from, `${label}.from`);
  const to = validDate(value.to, `${label}.to`);
  if (dateOrdinal(from) > dateOrdinal(to)) fail('RRHH_SERIES_INCONSISTENT', `${label} tiene un período invertido`);
  const hires = exactInteger(value.hires, `${label}.hires`);
  const exits = exactInteger(value.exits, `${label}.exits`);
  const balance = exactInteger(value.balance, `${label}.balance`, -MAX_EXACT_INTEGER);
  if (balance !== hires - exits) fail('RRHH_SERIES_INCONSISTENT', `${label}.balance no equivale a altas menos bajas`);
  if (requirePartial && value.partial !== true) fail('RRHH_SERIES_INCONSISTENT', `${label} debe declarar período parcial`);
  return {
    label: textValue(value.label, `${label}.label`, 120), from, to, hires, exits, balance,
    ...(requirePartial ? { partial: true } : {}),
  };
}

function normalizeMovementSeries(value) {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_ROWS_PER_SERIES) {
    fail('RRHH_SERIES_INCONSISTENT', 'management.yearly no tiene una serie válida');
  }
  const rows = value.map((row, index) => {
    exactKeys(row, ['year', 'hires', 'exits'], ['partial'], `management.yearly[${index}]`);
    const normalized = {
      year: exactInteger(row.year, `management.yearly[${index}].year`, 1900, 2100),
      hires: exactInteger(row.hires, `management.yearly[${index}].hires`),
      exits: exactInteger(row.exits, `management.yearly[${index}].exits`),
      balance: exactInteger(row.hires, `management.yearly[${index}].hires`) - exactInteger(row.exits, `management.yearly[${index}].exits`),
      partial: row.partial === true,
    };
    if (Object.hasOwn(row, 'partial') && typeof row.partial !== 'boolean') {
      fail('RRHH_SHAPE_INVALID', `management.yearly[${index}].partial debe ser booleano`);
    }
    return normalized;
  });
  uniqueRows(rows, (row) => row.year, 'management.yearly');
  rows.forEach((row, index) => {
    if (index > 0 && row.year !== rows[index - 1].year + 1) {
      fail('RRHH_SERIES_INCONSISTENT', 'management.yearly debe ser cronológica y contigua');
    }
  });
  return rows;
}

function normalizeAbsenceSeries(value, minimumGroupSize, historicalRecords) {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_ROWS_PER_SERIES) {
    fail('RRHH_SERIES_INCONSISTENT', 'absence.yearly no tiene una serie válida');
  }
  const rows = value.map((row, index) => {
    exactKeys(row, ['year', 'events', 'employeesAffected'], ['partial'], `absence.yearly[${index}]`);
    const events = exactInteger(row.events, `absence.yearly[${index}].events`);
    const employeesAffected = exactInteger(row.employeesAffected, `absence.yearly[${index}].employeesAffected`);
    if (employeesAffected > historicalRecords || employeesAffected > events) {
      fail('RRHH_SERIES_INCONSISTENT', `absence.yearly[${index}] contiene personas afectadas incompatibles`);
    }
    if (employeesAffected > 0 && employeesAffected < minimumGroupSize) {
      fail('RRHH_PRIVACY_INVALID', `absence.yearly[${index}] queda debajo del mínimo de publicación`);
    }
    if (Object.hasOwn(row, 'partial') && typeof row.partial !== 'boolean') {
      fail('RRHH_SHAPE_INVALID', `absence.yearly[${index}].partial debe ser booleano`);
    }
    return {
      year: exactInteger(row.year, `absence.yearly[${index}].year`, 1900, 2100),
      events,
      employeesAffected,
      partial: row.partial === true,
    };
  });
  uniqueRows(rows, (row) => row.year, 'absence.yearly');
  rows.forEach((row, index) => {
    if (index > 0 && row.year !== rows[index - 1].year + 1) {
      fail('RRHH_SERIES_INCONSISTENT', 'absence.yearly debe ser cronológica y contigua');
    }
  });
  return rows;
}

function normalizeCountObject(value, keys, label) {
  exactKeys(value, keys, [], label);
  return Object.fromEntries(keys.map((key) => [key, exactInteger(value[key], `${label}.${key}`)]));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + row[key], 0);
}

export function createRrhhReportSnapshot(input, options = {}) {
  scanForPii(input);
  exactKeys(input, [
    'schemaVersion', 'jurisdiction', 'source', 'privacy', 'workforce', 'management',
    'absence', 'quality', 'availability',
  ], [], 'snapshot');
  if (input.schemaVersion !== SOURCE_SCHEMA_VERSION) {
    fail('RRHH_SCHEMA_UNSUPPORTED', `Sólo se admite friendly-data schemaVersion ${SOURCE_SCHEMA_VERSION}`);
  }
  const generatedAt = generatedInstant(options.generatedAt);

  exactKeys(input.jurisdiction, ['municipality', 'province', 'country'], [], 'jurisdiction');
  const jurisdiction = {
    municipality: textValue(input.jurisdiction.municipality, 'jurisdiction.municipality', 120),
    province: textValue(input.jurisdiction.province, 'jurisdiction.province', 120),
    country: textValue(input.jurisdiction.country, 'jurisdiction.country', 120),
  };

  exactKeys(input.source, [
    'dataset', 'snapshotAt', 'timezone', 'sha256', 'method', 'scope', 'limitations',
  ], [], 'source');
  const snapshotAt = textValue(input.source.snapshotAt, 'source.snapshotAt', 40);
  const timezone = textValue(input.source.timezone, 'source.timezone', 80);
  if (!LOCAL_SNAPSHOT.test(snapshotAt) || timezone !== 'not_recorded_in_dump') {
    fail('RRHH_SOURCE_INVALID', 'El corte debe conservar la hora local del dump y declarar zona horaria no registrada');
  }
  const cutoffDate = validDate(snapshotAt.slice(0, 10), 'source.snapshotAt');
  if (!SOURCE_SHA256.test(String(input.source.sha256 || ''))) {
    fail('RRHH_SOURCE_INVALID', 'source.sha256 debe contener una huella SHA-256 completa');
  }
  if (!Array.isArray(input.source.limitations) || input.source.limitations.length === 0
      || input.source.limitations.length > 12) {
    fail('RRHH_SOURCE_INVALID', 'source.limitations debe explicitar entre 1 y 12 límites');
  }
  const limitations = input.source.limitations.map((value, index) => textValue(value, `source.limitations[${index}]`));
  if (new Set(limitations).size !== limitations.length) fail('RRHH_SOURCE_INVALID', 'source.limitations contiene duplicados');
  const source = {
    dataset: textValue(input.source.dataset, 'source.dataset', 180),
    snapshotAt,
    cutoffDate,
    timezone,
    sha256: `sha256:${String(input.source.sha256).replace(/^sha256:/i, '').toLowerCase()}`,
    method: textValue(input.source.method, 'source.method'),
    scope: textValue(input.source.scope, 'source.scope', 300),
    limitations,
  };

  exactKeys(input.privacy, ['grain', 'containsPersonRows', 'minimumPublishedGroupSize'], [], 'privacy');
  const privacy = {
    grain: textValue(input.privacy.grain, 'privacy.grain', 40),
    containsPersonRows: input.privacy.containsPersonRows,
    minimumPublishedGroupSize: exactInteger(input.privacy.minimumPublishedGroupSize, 'privacy.minimumPublishedGroupSize', 10, 100000),
  };
  if (privacy.grain !== 'aggregate' || privacy.containsPersonRows !== false) {
    fail('RRHH_PRIVACY_INVALID', 'El informe admite exclusivamente datos agregados sin filas personales');
  }

  exactKeys(input.workforce, [
    'historicalRecords', 'active', 'inactive', 'activeSharePct', 'genderActive', 'activeSectors',
  ], [], 'workforce');
  const historicalRecords = exactInteger(input.workforce.historicalRecords, 'workforce.historicalRecords');
  const active = exactInteger(input.workforce.active, 'workforce.active');
  const inactive = exactInteger(input.workforce.inactive, 'workforce.inactive');
  const activeSharePct = exactInteger(input.workforce.activeSharePct, 'workforce.activeSharePct', 0, 100);
  const genderActive = normalizedLabelRows(input.workforce.genderActive, 'workforce.genderActive', privacy.minimumPublishedGroupSize);
  const activeSectors = normalizedLabelRows(input.workforce.activeSectors, 'workforce.activeSectors', privacy.minimumPublishedGroupSize);
  if (active + inactive !== historicalRecords
      || (historicalRecords > 0 ? Math.round((active * 100) / historicalRecords) : 0) !== activeSharePct
      || sum(genderActive, 'value') !== active || sum(activeSectors, 'value') !== active) {
    fail('RRHH_WORKFORCE_INCONSISTENT', 'Los totales de dotación, género o sectores no reconcilian');
  }
  const workforce = { historicalRecords, active, inactive, activeSharePct, genderActive, activeSectors };

  exactKeys(input.management, ['previous', 'current', 'yearly'], [], 'management');
  const previous = normalizeManagementPeriod(input.management.previous, 'management.previous', false);
  const current = normalizeManagementPeriod(input.management.current, 'management.current', true);
  const movementRows = normalizeMovementSeries(input.management.yearly);
  if (dateOrdinal(previous.to) + 1 !== dateOrdinal(current.from)
      || current.to !== cutoffDate
      || movementRows.at(-1).year !== Number(cutoffDate.slice(0, 4))
      || movementRows.at(-1).partial !== true) {
    fail('RRHH_CUTOFF_INCONSISTENT', 'Gestiones y serie anual no cierran en la fecha del snapshot');
  }
  const management = {
    previous,
    current,
    yearly: movementRows,
    visibleTotals: {
      hires: sum(movementRows, 'hires'),
      exits: sum(movementRows, 'exits'),
      balance: sum(movementRows, 'balance'),
    },
  };
  if (management.visibleTotals.hires !== previous.hires + current.hires
      || management.visibleTotals.exits !== previous.exits + current.exits
      || management.visibleTotals.balance !== previous.balance + current.balance) {
    fail('RRHH_SERIES_INCONSISTENT', 'La serie anual no reconcilia con las dos ventanas de gestión');
  }

  exactKeys(input.absence, ['totalEvents', 'latestValidDate', 'yearly', 'unit', 'warning'], [], 'absence');
  const totalEvents = exactInteger(input.absence.totalEvents, 'absence.totalEvents');
  const latestValidDate = validDate(input.absence.latestValidDate, 'absence.latestValidDate');
  const absenceRows = normalizeAbsenceSeries(input.absence.yearly, privacy.minimumPublishedGroupSize, historicalRecords);
  const absenceVisibleEvents = sum(absenceRows, 'events');
  if (latestValidDate !== cutoffDate
      || absenceRows.at(-1).year !== movementRows.at(-1).year
      || absenceRows.at(-1).partial !== true
      || absenceRows.map((row) => row.year).join(',') !== movementRows.map((row) => row.year).join(',')
      || absenceVisibleEvents > totalEvents) {
    fail('RRHH_CUTOFF_INCONSISTENT', 'Ausentismo, movimientos y corte no comparten la misma cobertura temporal');
  }
  const absence = {
    totalEvents,
    latestValidDate,
    yearly: absenceRows,
    visibleTotals: {
      events: absenceVisibleEvents,
      employeesAffectedYearSum: sum(absenceRows, 'employeesAffected'),
    },
    unit: textValue(input.absence.unit, 'absence.unit', 120),
    warning: textValue(input.absence.warning, 'absence.warning'),
  };

  exactKeys(input.quality, [
    'employeeKeyDuplicates', 'activeGenderCoveragePct', 'activeWithoutMatchedSector',
    'missingHireDate', 'hireDatePlaceholders', 'absenceOrphans', 'absenceDatesBefore1900',
    'absenceDatesAfterSnapshot', 'catalogCounts', 'sourceCounts',
  ], [], 'quality');
  const quality = {
    employeeKeyDuplicates: exactInteger(input.quality.employeeKeyDuplicates, 'quality.employeeKeyDuplicates'),
    activeGenderCoveragePct: exactInteger(input.quality.activeGenderCoveragePct, 'quality.activeGenderCoveragePct', 0, 100),
    activeWithoutMatchedSector: exactInteger(input.quality.activeWithoutMatchedSector, 'quality.activeWithoutMatchedSector'),
    missingHireDate: exactInteger(input.quality.missingHireDate, 'quality.missingHireDate'),
    hireDatePlaceholders: exactInteger(input.quality.hireDatePlaceholders, 'quality.hireDatePlaceholders'),
    absenceOrphans: exactInteger(input.quality.absenceOrphans, 'quality.absenceOrphans'),
    absenceDatesBefore1900: exactInteger(input.quality.absenceDatesBefore1900, 'quality.absenceDatesBefore1900'),
    absenceDatesAfterSnapshot: exactInteger(input.quality.absenceDatesAfterSnapshot, 'quality.absenceDatesAfterSnapshot'),
    catalogCounts: normalizeCountObject(input.quality.catalogCounts, ['sectors', 'categories', 'unions', 'agreements'], 'quality.catalogCounts'),
    sourceCounts: normalizeCountObject(input.quality.sourceCounts, ['employeeRecords', 'personRecords', 'absenceEvents', 'leaveRecords'], 'quality.sourceCounts'),
  };
  const unmatchedSector = activeSectors.find((row) => row.label.toLocaleLowerCase('es') === 'sin sector homologado');
  if (quality.activeGenderCoveragePct !== 100
      || quality.sourceCounts.employeeRecords !== historicalRecords
      || quality.sourceCounts.personRecords > quality.sourceCounts.employeeRecords
      || quality.sourceCounts.absenceEvents !== totalEvents
      || quality.absenceOrphans > totalEvents
      || quality.absenceDatesBefore1900 > totalEvents
      || quality.absenceDatesAfterSnapshot > totalEvents
      || !unmatchedSector || unmatchedSector.value !== quality.activeWithoutMatchedSector) {
    fail('RRHH_QUALITY_INCONSISTENT', 'Los indicadores de calidad no reconcilian con el snapshot agregado');
  }

  exactKeys(input.availability, [
    'workforce', 'managementComparison', 'absenceEvents', 'payrollAmounts',
    'budgetExecution', 'currentLeaves',
  ], [], 'availability');
  const availability = Object.fromEntries(Object.entries(input.availability).map(([key, value]) => [
    key, textValue(value, `availability.${key}`, 80),
  ]));
  const expectedAvailability = {
    workforce: 'verified', managementComparison: 'derived', absenceEvents: 'verified',
    payrollAmounts: 'internal_closed_runs_only', budgetExecution: 'unavailable', currentLeaves: 'unavailable',
  };
  if (Object.entries(expectedAvailability).some(([key, value]) => availability[key] !== value)) {
    fail('RRHH_AVAILABILITY_INVALID', 'La disponibilidad no coincide con el contrato agregado publicado');
  }

  const snapshot = deepFreeze({
    contractVersion: RRHH_REPORT_PACK_CONTRACT_VERSION,
    snapshotId: `rrhh:${cutoffDate}:${source.sha256.slice(7)}`,
    generatedAt,
    temporalAuthority: 'caller_supplied_unverified',
    schemaVersion: SOURCE_SCHEMA_VERSION,
    jurisdiction,
    source,
    privacy,
    workforce,
    management,
    absence,
    quality,
    availability,
  });
  VALID_SNAPSHOTS.add(snapshot);
  return snapshot;
}

function requireSnapshot(snapshot) {
  if (!snapshot || !VALID_SNAPSHOTS.has(snapshot) || !Object.isFrozen(snapshot)
      || snapshot.contractVersion !== RRHH_REPORT_PACK_CONTRACT_VERSION) {
    fail('RRHH_SNAPSHOT_INVALID', 'Usá la instantánea inmutable emitida por createRrhhReportSnapshot');
  }
  return snapshot;
}

function xml(value) {
  return String(value)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function columnName(index) {
  let value = index;
  let name = '';
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

function cellXml(ref, cell) {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'string') return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(cell)}</t></is></c>`;
  const style = Number.isInteger(cell.style) ? ` s="${cell.style}"` : '';
  if (cell.kind === 'number') return `<c r="${ref}"${style} t="n"><v>${cell.value}</v></c>`;
  if (cell.kind === 'formula') return `<c r="${ref}"${style}><f>${xml(cell.formula)}</f><v>${cell.cached}</v></c>`;
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xml(cell.value)}</t></is></c>`;
}

const t = (value, style = 0) => ({ kind: 'text', value, style });
const n = (value, style = 0) => ({ kind: 'number', value, style });
const f = (formula, cached, style = 0) => ({ kind: 'formula', formula, cached, style });

function worksheet(rows, options = {}) {
  const columnCount = Math.max(...rows.map((row) => row.cells.length), 1);
  const lastRef = `${columnName(columnCount)}${rows.length}`;
  const rowXml = rows.map((row, rowIndex) => {
    const number = rowIndex + 1;
    const attrs = row.height ? ` ht="${row.height}" customHeight="1"` : '';
    const cells = row.cells.map((cell, columnIndex) => cellXml(`${columnName(columnIndex + 1)}${number}`, cell)).join('');
    return `<row r="${number}"${attrs}>${cells}</row>`;
  }).join('');
  const widths = (options.widths || Array(columnCount).fill(18)).map((width, index) => (
    `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`
  )).join('');
  const merges = options.merges?.length
    ? `<mergeCells count="${options.merges.length}">${options.merges.map((range) => `<mergeCell ref="${range}"/>`).join('')}</mergeCells>` : '';
  const filter = options.filter ? `<autoFilter ref="${options.filter}"/>` : '';
  const pane = options.freezeAt
    ? `<pane ySplit="${options.freezeAt - 1}" topLeftCell="A${options.freezeAt}" activePane="bottomLeft" state="frozen"/>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastRef}"/>
  <sheetViews><sheetView showGridLines="0" workbookViewId="0">${pane}</sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="17"/><cols>${widths}</cols><sheetData>${rowXml}</sheetData>
  ${merges}${filter}
  <pageMargins left="0.35" right="0.35" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
  <pageSetup orientation="${options.orientation || 'portrait'}" paperSize="9" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
}

function titleRows(snapshot, title, columns) {
  const empty = Array(columns - 1).fill(null);
  return [
    { height: 30, cells: [t(`MuniControl - ${title}`, 1), ...empty] },
    { height: 24, cells: [t(`Corte ${snapshot.source.cutoffDate} - datos agregados sin filas personales`, 2), ...empty] },
    { height: 8, cells: Array(columns).fill(null) },
  ];
}

function summarySheet(snapshot) {
  const rows = [
    ...titleRows(snapshot, 'Informe ejecutivo de RRHH', 4),
    { cells: [t('Jurisdicción', 3), t(`${snapshot.jurisdiction.municipality}, ${snapshot.jurisdiction.province}`, 4), t('Fuente', 3), t(snapshot.source.dataset, 4)] },
    { cells: [t('Corte', 3), t(snapshot.source.snapshotAt, 4), t('SHA-256', 3), t(snapshot.source.sha256, 13)] },
    { cells: [t('Indicador', 5), t('Valor', 5), t('Estado', 5), t('Límite de interpretación', 5)] },
    { cells: [t('Legajos activos', 4), n(snapshot.workforce.active, 6), t('Derivado', 11), t('Proxy por ausencia de fecha de egreso', 14)] },
    { cells: [t('Legajos inactivos', 4), n(snapshot.workforce.inactive, 6), t('Derivado', 11), t('Clasificación complementaria del histórico', 14)] },
    { cells: [t('Registros históricos', 8), f('SUM(B7:B8)', snapshot.workforce.historicalRecords, 9), t('Verificado', 11), t('Total exacto: activos + inactivos', 14)] },
    { cells: [t('Participación activa (%)', 4), n(snapshot.workforce.activeSharePct, 6), t('Derivado', 11), t('Porcentaje entero publicado por la fuente', 14)] },
    { cells: [t('Eventos históricos de ausencia', 4), n(snapshot.absence.totalEvents, 6), t('Verificado', 11), t('Eventos; no equivalen a días ni tasa', 14)] },
    { cells: [t('Altas gestión actual', 4), n(snapshot.management.current.hires, 6), t('Derivado', 11), t('Período parcial', 14)] },
    { cells: [t('Bajas gestión actual', 4), n(snapshot.management.current.exits, 6), t('Derivado', 11), t('Período parcial', 14)] },
    { cells: [t('Balance gestión actual', 8), f('B12-B13', snapshot.management.current.balance, 9), t('Derivado', 11), t('Altas menos bajas; no mide desempeño', 14)] },
    { height: 8, cells: [null, null, null, null] },
    { cells: [t('Control de calidad', 5), t('Valor', 5), t('Control de calidad', 5), t('Valor', 5)] },
    { cells: [t('Claves laborales duplicadas', 4), n(snapshot.quality.employeeKeyDuplicates, 6), t('Activos sin sector homologado', 4), n(snapshot.quality.activeWithoutMatchedSector, 6)] },
    { cells: [t('Fechas de alta faltantes', 4), n(snapshot.quality.missingHireDate, 6), t('Ausencias huérfanas', 4), n(snapshot.quality.absenceOrphans, 6)] },
    { cells: [t('Generado', 3), t(snapshot.generatedAt, 4), t('Contrato', 3), t(snapshot.contractVersion, 4)] },
    { cells: [t('Autoridad temporal', 3), t('Instante provisto por el cliente, no verificado por servidor', 14), null, null] },
  ];
  return worksheet(rows, { widths: [34, 25, 29, 58], merges: ['A1:D1', 'A2:D2', 'B20:D20'], freezeAt: 6, orientation: 'landscape' });
}

function movementsSheet(snapshot) {
  const rows = [
    ...titleRows(snapshot, 'Movimientos de dotación', 5),
    { cells: [t('Ventana', 5), t('Desde', 5), t('Hasta', 5), t('Altas', 5), t('Bajas / balance', 5)] },
    { cells: [t(snapshot.management.previous.label, 4), t(snapshot.management.previous.from, 4), t(snapshot.management.previous.to, 4), n(snapshot.management.previous.hires, 6), t(`${snapshot.management.previous.exits} / ${snapshot.management.previous.balance >= 0 ? '+' : ''}${snapshot.management.previous.balance}`, 4)] },
    { cells: [t(snapshot.management.current.label, 4), t(snapshot.management.current.from, 4), t(snapshot.management.current.to, 4), n(snapshot.management.current.hires, 6), t(`${snapshot.management.current.exits} / ${snapshot.management.current.balance >= 0 ? '+' : ''}${snapshot.management.current.balance} (parcial)`, 4)] },
    { height: 8, cells: [null, null, null, null, null] },
    { cells: [t('Año', 5), t('Altas', 5), t('Bajas', 5), t('Balance', 5), t('Cobertura', 5)] },
    ...snapshot.management.yearly.map((row, index) => ({ cells: [
      n(row.year, 4), n(row.hires, 6), n(row.exits, 6), f(`B${9 + index}-C${9 + index}`, row.balance, row.balance < 0 ? 10 : 6), t(row.partial ? 'Parcial' : 'Año completo', row.partial ? 12 : 11),
    ] })),
  ];
  const totalRow = rows.length + 1;
  const firstSeriesRow = 9;
  const lastSeriesRow = totalRow - 1;
  rows.push({ cells: [
    t('Total serie calendario visible', 8),
    f(`SUM(B${firstSeriesRow}:B${lastSeriesRow})`, snapshot.management.visibleTotals.hires, 9),
    f(`SUM(C${firstSeriesRow}:C${lastSeriesRow})`, snapshot.management.visibleTotals.exits, 9),
    f(`SUM(D${firstSeriesRow}:D${lastSeriesRow})`, snapshot.management.visibleTotals.balance, 9),
    t('No equivale a las ventanas de gestión', 14),
  ] });
  rows.push({ cells: [t('Límite', 3), t('2019 y el año del corte pueden ser parciales. Las ventanas de gestión no coinciden exactamente con años calendario.', 14), null, null, null] });
  return worksheet(rows, { widths: [31, 17, 17, 17, 36], merges: ['A1:E1', 'A2:E2', `B${rows.length}:E${rows.length}`], freezeAt: 9, filter: `A8:E${lastSeriesRow}`, orientation: 'landscape' });
}

function absencesSheet(snapshot) {
  const rows = [
    ...titleRows(snapshot, 'Ausentismo registrado', 4),
    { cells: [t('Total histórico de eventos', 3), n(snapshot.absence.totalEvents, 9), t('Última fecha válida', 3), t(snapshot.absence.latestValidDate, 4)] },
    { cells: [t('Unidad', 3), t(snapshot.absence.unit, 4), t('Cobertura', 3), t('La serie visible no cubre todo el histórico', 14)] },
    { cells: [t('Año', 5), t('Eventos', 5), t('Legajos/contratos alcanzados', 5), t('Cobertura', 5)] },
    ...snapshot.absence.yearly.map((row) => ({ cells: [
      n(row.year, 4), n(row.events, 6), n(row.employeesAffected, 6), t(row.partial ? 'Parcial' : 'Año completo', row.partial ? 12 : 11),
    ] })),
  ];
  const firstSeriesRow = 7;
  const lastSeriesRow = rows.length;
  rows.push({ cells: [
    t('Suma serie visible', 8), f(`SUM(B${firstSeriesRow}:B${lastSeriesRow})`, snapshot.absence.visibleTotals.events, 9),
    f(`SUM(C${firstSeriesRow}:C${lastSeriesRow})`, snapshot.absence.visibleTotals.employeesAffectedYearSum, 9), t('Contratos-año; no contratos únicos', 14),
  ] });
  rows.push({ cells: [t('Advertencia', 3), t(snapshot.absence.warning, 14), null, null] });
  return worksheet(rows, { widths: [24, 20, 31, 49], merges: ['A1:D1', 'A2:D2', `B${rows.length}:D${rows.length}`], freezeAt: 7, filter: `A6:D${lastSeriesRow}`, orientation: 'landscape' });
}

function sectorsSheet(snapshot) {
  const rows = [
    ...titleRows(snapshot, 'Composición de legajos activos por sector', 3),
    { cells: [t('Sector', 5), t('Legajos activos', 5), t('Alcance', 5)] },
    ...snapshot.workforce.activeSectors.map((row) => ({ cells: [t(row.label, 4), n(row.value, 6), t('Conteo agregado', 11)] })),
  ];
  const firstSeriesRow = 5;
  const lastSeriesRow = rows.length;
  rows.push({ cells: [t('Total sectores publicados', 8), f(`SUM(B${firstSeriesRow}:B${lastSeriesRow})`, snapshot.workforce.active, 9), t('Debe coincidir con legajos activos', 14)] });
  rows.push({ cells: [t('Privacidad', 3), t(`No se publican grupos menores a ${snapshot.privacy.minimumPublishedGroupSize} registros. No contiene filas personales.`, 14), null] });
  return worksheet(rows, { widths: [48, 22, 55], merges: ['A1:C1', 'A2:C2', `B${rows.length}:C${rows.length}`], freezeAt: 5, filter: `A4:C${lastSeriesRow}` });
}

function methodologySheet(snapshot) {
  const rows = [
    ...titleRows(snapshot, 'Metodología, disponibilidad y límites', 3),
    { cells: [t('Campo', 5), t('Valor', 5), t('Interpretación', 5)] },
    { cells: [t('Fuente', 3), t(snapshot.source.dataset, 4), t(snapshot.source.scope, 14)] },
    { cells: [t('Corte local', 3), t(snapshot.source.snapshotAt, 4), t('La zona horaria no fue registrada en el dump', 14)] },
    { cells: [t('SHA-256', 3), t(snapshot.source.sha256, 13), t('Identifica el archivo agregado; no constituye firma digital', 14)] },
    { cells: [t('Método', 3), t(snapshot.source.method, 14), t('Sin registros nominales', 11)] },
    { cells: [t('Grano', 3), t(snapshot.privacy.grain, 4), t(`Mínimo publicado: ${snapshot.privacy.minimumPublishedGroupSize}`, 14)] },
    { height: 8, cells: [null, null, null] },
    { cells: [t('Disponibilidad', 5), t('Estado contractual', 5), t('Alcance', 5)] },
    ...Object.entries(snapshot.availability).map(([key, value]) => ({ cells: [t(key, 4), t(value, value === 'unavailable' ? 12 : 11), t('Estado informado por friendly-data schema v1', 14)] })),
    { height: 8, cells: [null, null, null] },
    { cells: [t('Límites publicados', 5), t('Detalle', 5), t('Efecto', 5)] },
    ...snapshot.source.limitations.map((limitation, index) => ({ cells: [n(index + 1, 4), t(limitation, 14), t('Debe permanecer visible al interpretar el informe', 14)] })),
    { cells: [t('Advertencia de ausentismo', 3), t(snapshot.absence.warning, 14), t('No calcular días ni tasas', 12)] },
    { cells: [t('Generación', 3), t(snapshot.generatedAt, 4), t('Reloj del cliente no verificado por servidor', 14)] },
    { cells: [t('Contrato', 3), t(snapshot.contractVersion, 4), t(snapshot.snapshotId, 13)] },
  ];
  return worksheet(rows, { widths: [30, 72, 58], merges: ['A1:C1', 'A2:C2'], freezeAt: 4, orientation: 'landscape' });
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4"><font><sz val="11"/><name val="Aptos"/><family val="2"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="18"/><name val="Aptos Display"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FF123247"/><sz val="11"/><name val="Aptos"/></font></fonts>
  <fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF123247"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF137C72"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF5F1"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF2D8"/></patternFill></fill></fills>
  <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD7DFDC"/></left><right style="thin"><color rgb="FFD7DFDC"/></right><top style="thin"><color rgb="FFD7DFDC"/></top><bottom style="thin"><color rgb="FFD7DFDC"/></bottom><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="15">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="0" fontId="3" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
  </cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function workbookEntries(snapshot) {
  const sheets = [
    ['Resumen', summarySheet(snapshot)],
    ['Movimientos', movementsSheet(snapshot)],
    ['Ausentismo', absencesSheet(snapshot)],
    ['Sectores', sectorsSheet(snapshot)],
    ['Metodología', methodologySheet(snapshot)],
  ];
  const overrides = sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  const sheetTags = sheets.map(([name], index) => `<sheet name="${xml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('');
  const sheetRels = sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('');
  return [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>'],
    ['docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>MuniControl</Application><Company>${xml(snapshot.jurisdiction.municipality)}</Company><AppVersion>1.0</AppVersion></Properties>`],
    ['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Informe ejecutivo RRHH - corte ${xml(snapshot.source.cutoffDate)}</dc:title><dc:creator>MuniControl</dc:creator><dc:description>Datos agregados sin filas personales</dc:description><dcterms:created xsi:type="dcterms:W3CDTF">${xml(snapshot.generatedAt)}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${xml(snapshot.generatedAt)}</dcterms:modified></cp:coreProperties>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><fileVersion appName="xl"/><workbookPr/><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews><sheets>${sheetTags}</sheets><calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRels}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', stylesXml()],
    ...sheets.map(([, sheet], index) => [`xl/worksheets/sheet${index + 1}.xml`, sheet]),
  ];
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function set16(view, offset, value) { view.setUint16(offset, value, true); }
function set32(view, offset, value) { view.setUint32(offset, value >>> 0, true); }

function joinBytes(parts) {
  const size = parts.reduce((total, part) => total + part.byteLength, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.byteLength; }
  return output;
}

function storedZip(entries) {
  const encoder = new TextEncoder();
  const local = [];
  const central = [];
  let localOffset = 0;
  for (const [name, contents] of entries) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(contents);
    const checksum = crc32(data);
    const localHeader = new Uint8Array(30);
    const localView = new DataView(localHeader.buffer);
    set32(localView, 0, 0x04034b50); set16(localView, 4, 20); set16(localView, 6, 0x0800);
    set16(localView, 8, 0); set16(localView, 10, 0); set16(localView, 12, 0x0021);
    set32(localView, 14, checksum); set32(localView, 18, data.byteLength); set32(localView, 22, data.byteLength);
    set16(localView, 26, nameBytes.byteLength); set16(localView, 28, 0);
    local.push(localHeader, nameBytes, data);

    const centralHeader = new Uint8Array(46);
    const centralView = new DataView(centralHeader.buffer);
    set32(centralView, 0, 0x02014b50); set16(centralView, 4, 20); set16(centralView, 6, 20);
    set16(centralView, 8, 0x0800); set16(centralView, 10, 0); set16(centralView, 12, 0); set16(centralView, 14, 0x0021);
    set32(centralView, 16, checksum); set32(centralView, 20, data.byteLength); set32(centralView, 24, data.byteLength);
    set16(centralView, 28, nameBytes.byteLength); set16(centralView, 30, 0); set16(centralView, 32, 0);
    set16(centralView, 34, 0); set16(centralView, 36, 0); set32(centralView, 38, 0); set32(centralView, 42, localOffset);
    central.push(centralHeader, nameBytes);
    localOffset += localHeader.byteLength + nameBytes.byteLength + data.byteLength;
  }
  const centralBytes = joinBytes(central);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  set32(endView, 0, 0x06054b50); set16(endView, 4, 0); set16(endView, 6, 0);
  set16(endView, 8, entries.length); set16(endView, 10, entries.length);
  set32(endView, 12, centralBytes.byteLength); set32(endView, 16, localOffset); set16(endView, 20, 0);
  return joinBytes([...local, centralBytes, end]);
}

function pdfLatinBytes(value) {
  const normalized = String(value)
    .replaceAll('–', '-').replaceAll('—', '-').replaceAll('“', '"').replaceAll('”', '"')
    .replaceAll('’', "'").replaceAll('…', '...');
  const output = new Uint8Array(normalized.length);
  for (let index = 0; index < normalized.length; index += 1) {
    const code = normalized.charCodeAt(index);
    output[index] = code <= 255 ? code : 63;
  }
  return output;
}

function pdfLiteral(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)').replace(/[\r\n]+/g, ' ');
}

function wrapText(value, limit) {
  const words = String(value).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (!line) line = word;
    else if (`${line} ${word}`.length <= limit) line += ` ${word}`;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

function pdfDocument(snapshot) {
  const commands = [];
  const color = {
    navy: '0.071 0.196 0.278', green: '0.075 0.486 0.447', ink: '0.094 0.145 0.176',
    muted: '0.380 0.443 0.478', line: '0.843 0.875 0.863', soft: '0.969 0.976 0.973',
    amber: '0.984 0.953 0.875', white: '1 1 1', red: '0.584 0.275 0.239',
  };
  const rect = (x, y, width, height, fill, stroke = null) => {
    commands.push('q');
    if (fill) commands.push(`${fill} rg`);
    if (stroke) commands.push(`${stroke} RG 0.7 w`);
    commands.push(`${x} ${y} ${width} ${height} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'} Q`);
  };
  const text = (x, y, value, size = 9, font = 'F1', fill = color.ink) => {
    commands.push(`BT /${font} ${size} Tf ${fill} rg 1 0 0 1 ${x} ${y} Tm (${pdfLiteral(value)}) Tj ET`);
  };
  const rightText = (right, y, value, size = 9, font = 'F1', fill = color.ink) => {
    text(Math.max(20, right - String(value).length * size * 0.49), y, value, size, font, fill);
  };
  const number = (value) => {
    const negative = value < 0;
    const digits = String(Math.abs(value)).replace(/\B(?=([0-9]{3})+(?![0-9]))/g, '.');
    return `${negative ? '-' : ''}${digits}`;
  };

  rect(0, 750, 595, 92, color.navy);
  text(38, 806, 'MuniControl', 22, 'F2', color.white);
  text(38, 784, 'INFORME EJECUTIVO DE RECURSOS HUMANOS', 11, 'F2', color.white);
  text(38, 766, `${snapshot.jurisdiction.municipality}, ${snapshot.jurisdiction.province} - Corte ${snapshot.source.cutoffDate}`, 9, 'F1', color.white);

  text(38, 724, 'Panorama agregado', 14, 'F2', color.navy);
  const cards = [
    ['REGISTROS HISTÓRICOS', snapshot.workforce.historicalRecords],
    ['LEGAJOS ACTIVOS', snapshot.workforce.active],
    ['EVENTOS DE AUSENCIA', snapshot.absence.totalEvents],
    ['BALANCE GESTIÓN ACTUAL', snapshot.management.current.balance],
  ];
  cards.forEach(([label, value], index) => {
    const x = 38 + index * 132;
    rect(x, 666, 121, 45, index === 3 ? '0.918 0.961 0.945' : color.soft, color.line);
    text(x + 9, 695, label, 6, 'F2', color.muted);
    text(x + 9, 675, `${index === 3 && value >= 0 ? '+' : ''}${number(value)}`, 16, 'F2', index === 3 ? color.green : color.navy);
  });

  text(38, 637, 'Movimientos por año', 12, 'F2', color.navy);
  rect(38, 608, 250, 20, color.green);
  ['Año', 'Altas', 'Bajas', 'Balance'].forEach((label, index) => text(48 + index * 58, 615, label, 7, 'F2', color.white));
  snapshot.management.yearly.slice(-5).forEach((row, index) => {
    const y = 588 - index * 20;
    rect(38, y, 250, 20, index % 2 ? color.soft : color.white, color.line);
    text(48, y + 7, `${row.year}${row.partial ? '*' : ''}`, 7);
    rightText(148, y + 7, number(row.hires), 7);
    rightText(206, y + 7, number(row.exits), 7);
    rightText(276, y + 7, `${row.balance >= 0 ? '+' : ''}${number(row.balance)}`, 7, row.balance < 0 ? 'F2' : 'F1', row.balance < 0 ? color.red : color.ink);
  });

  text(307, 637, 'Ausentismo por año', 12, 'F2', color.navy);
  rect(307, 608, 250, 20, color.green);
  ['Año', 'Eventos', 'Contratos', 'Cobertura'].forEach((label, index) => text(317 + index * 58, 615, label, 7, 'F2', color.white));
  snapshot.absence.yearly.slice(-5).forEach((row, index) => {
    const y = 588 - index * 20;
    rect(307, y, 250, 20, index % 2 ? color.soft : color.white, color.line);
    text(317, y + 7, `${row.year}${row.partial ? '*' : ''}`, 7);
    rightText(417, y + 7, number(row.events), 7);
    rightText(475, y + 7, number(row.employeesAffected), 7);
    rightText(545, y + 7, row.partial ? 'Parcial' : 'Completo', 7);
  });

  text(38, 478, 'Principales sectores activos', 12, 'F2', color.navy);
  const topSectors = [...snapshot.workforce.activeSectors].sort((a, b) => b.value - a.value).slice(0, 6);
  const maxSector = Math.max(...topSectors.map((row) => row.value), 1);
  topSectors.forEach((row, index) => {
    const y = 452 - index * 22;
    text(38, y + 4, row.label.slice(0, 34), 7);
    rect(215, y, (row.value / maxSector) * 240, 10, color.green);
    rightText(557, y + 2, number(row.value), 8, 'F2', color.navy);
  });

  rect(38, 226, 519, 82, color.soft, color.line);
  text(50, 290, 'FUENTE Y TRAZABILIDAD', 7, 'F2', color.green);
  text(50, 272, `${snapshot.source.dataset} - ${snapshot.source.method}`, 7);
  text(50, 255, snapshot.source.sha256.slice(0, 47), 6, 'F1', color.muted);
  text(50, 243, snapshot.source.sha256.slice(47), 6, 'F1', color.muted);
  text(342, 243, 'Grano agregado - sin filas personales', 7, 'F2', color.navy);

  text(38, 198, 'Límites de interpretación', 12, 'F2', color.navy);
  let y = 181;
  snapshot.source.limitations.forEach((limitation, index) => {
    const lines = wrapText(`${index + 1}. ${limitation}`, 104);
    lines.slice(0, 2).forEach((line) => { text(44, y, line, 7); y -= 10; });
    y -= 3;
  });

  text(38, 66, `Generado: ${snapshot.generatedAt} - reloj del cliente no verificado`, 7, 'F1', color.muted);
  text(38, 51, `Contrato ${snapshot.contractVersion}`, 7, 'F1', color.muted);
  rightText(557, 51, 'Página 1 de 1 - A4', 7, 'F1', color.muted);

  const content = `${commands.join('\n')}\n`;
  const contentBytes = pdfLatinBytes(content);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    joinBytes([pdfLatinBytes(`<< /Length ${contentBytes.byteLength} >>\nstream\n`), contentBytes, pdfLatinBytes('endstream')]),
    `<< /Title (${pdfLiteral(`Informe ejecutivo RRHH - ${snapshot.source.cutoffDate}`)}) /Author (MuniControl) /Subject (Datos agregados sin filas personales) /Creator (MuniControl) /Producer (MuniControl) >>`,
  ];
  const header = pdfLatinBytes('%PDF-1.4\n%âãÏÓ\n');
  const parts = [header];
  const offsets = [0];
  let offset = header.byteLength;
  objects.forEach((object, index) => {
    offsets.push(offset);
    const body = object instanceof Uint8Array ? object : pdfLatinBytes(object);
    const wrapped = joinBytes([pdfLatinBytes(`${index + 1} 0 obj\n`), body, pdfLatinBytes('\nendobj\n')]);
    parts.push(wrapped);
    offset += wrapped.byteLength;
  });
  const xrefOffset = offset;
  const xref = [`xref\n0 ${objects.length + 1}\n`, '0000000000 65535 f \n'];
  for (const objectOffset of offsets.slice(1)) xref.push(`${String(objectOffset).padStart(10, '0')} 00000 n \n`);
  xref.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  parts.push(pdfLatinBytes(xref.join('')));
  return joinBytes(parts);
}

function fileStem(snapshot) {
  return `municontrol_informe-rrhh_${snapshot.source.cutoffDate}_${snapshot.source.sha256.slice(7, 19)}`;
}

function artifact(snapshot, extension, mimeType, bytes) {
  const value = Object.freeze({
    contractVersion: RRHH_REPORT_PACK_CONTRACT_VERSION,
    snapshotId: snapshot.snapshotId,
    sourceSha256: snapshot.source.sha256,
    cutoffDate: snapshot.source.cutoffDate,
    fileName: `${fileStem(snapshot)}.${extension}`,
    mimeType,
    bytes,
  });
  ARTIFACT_CHECKSUMS.set(value, crc32(bytes));
  return value;
}

export function createRrhhReportXlsxArtifact(snapshot) {
  const context = requireSnapshot(snapshot);
  return artifact(context, 'xlsx', MIME_XLSX, storedZip(workbookEntries(context)));
}

export function createRrhhReportPdfArtifact(snapshot) {
  const context = requireSnapshot(snapshot);
  return artifact(context, 'pdf', MIME_PDF, pdfDocument(context));
}

export function createRrhhReportPack(input, options = {}) {
  const snapshot = createRrhhReportSnapshot(input, options);
  const xlsx = createRrhhReportXlsxArtifact(snapshot);
  const pdf = createRrhhReportPdfArtifact(snapshot);
  return Object.freeze({ contractVersion: RRHH_REPORT_PACK_CONTRACT_VERSION, snapshot, xlsx, pdf });
}

export function downloadRrhhReportArtifact(value, dependencies = {}) {
  if (!value || typeof value !== 'object' || !ARTIFACT_CHECKSUMS.has(value)
      || !(value.bytes instanceof Uint8Array) || value.bytes.byteLength === 0
      || !DOWNLOAD_NAME.test(String(value.fileName || ''))
      || ![MIME_XLSX, MIME_PDF].includes(value.mimeType)
      || (value.mimeType === MIME_XLSX) !== value.fileName.endsWith('.xlsx')
      || ARTIFACT_CHECKSUMS.get(value) !== crc32(value.bytes)) {
    fail('RRHH_ARTIFACT_INVALID', 'El archivo no cumple el contrato de descarga o fue modificado');
  }
  const signatureIsXlsx = value.bytes[0] === 0x50 && value.bytes[1] === 0x4b && value.bytes[2] === 0x03 && value.bytes[3] === 0x04;
  const signatureIsPdf = new TextDecoder('latin1').decode(value.bytes.subarray(0, 8)).startsWith('%PDF-1.4');
  if ((value.mimeType === MIME_XLSX && !signatureIsXlsx) || (value.mimeType === MIME_PDF && !signatureIsPdf)) {
    fail('RRHH_ARTIFACT_INVALID', 'La firma del archivo no coincide con el formato declarado');
  }
  const documentImpl = dependencies.documentImpl ?? globalThis.document;
  const urlApi = dependencies.urlApi ?? globalThis.URL;
  const BlobImpl = dependencies.BlobImpl ?? globalThis.Blob;
  if (!documentImpl?.createElement || !documentImpl?.body?.appendChild
      || !urlApi?.createObjectURL || !urlApi?.revokeObjectURL || !BlobImpl) {
    fail('RRHH_DOWNLOAD_UNAVAILABLE', 'La descarga no está disponible en este navegador');
  }
  const blob = new BlobImpl([value.bytes], { type: value.mimeType });
  const href = urlApi.createObjectURL(blob);
  const anchor = documentImpl.createElement('a');
  anchor.href = href;
  anchor.download = value.fileName;
  anchor.hidden = true;
  documentImpl.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    urlApi.revokeObjectURL(href);
  }
  return value.fileName;
}
