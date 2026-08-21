#!/usr/bin/env node

/**
 * Privacy-safe structural profiler for MariaDB/MySQL SQL dumps.
 *
 * The profiler streams compressed or plain SQL, counts extended INSERT rows
 * without retaining their values, and emits schema metadata only. It never
 * connects to a database and never writes or copies the source dump.
 */

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, open, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Transform } from 'node:stream';
import { createGunzip } from 'node:zlib';

const TOOL_VERSION = '1.0.0';
const MAX_SCHEMA_STATEMENT_CHARS = 16 * 1024 * 1024;
const MAX_INSERT_HEADER_CHARS = 2 * 1024 * 1024;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_LOGICAL_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 200;
const COMPRESSION_RATIO_CHECK_AFTER_BYTES = 8 * 1024 * 1024;
const MAX_STATEMENT_COUNT = 250_000;
const UNSUPPORTED_DATA_STATEMENT = /^(?:REPLACE|LOAD|UPDATE|DELETE|TRUNCATE)\b/i;
const MYSQL_IDENTIFIER = String.raw`(?:\x60(?:\x60\x60|[^\x60])+\x60|[A-Za-z_$][A-Za-z0-9_$]*)`;

export class BackupProfileError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'BackupProfileError';
  }
}

function safeIncrement(value, label) {
  if (value >= Number.MAX_SAFE_INTEGER) {
    throw new BackupProfileError(`${label} excede el limite entero seguro`);
  }
  return value + 1;
}

function unquoteIdentifier(identifier) {
  const value = identifier.trim();
  if (value.startsWith('`') && value.endsWith('`')) {
    return value.slice(1, -1).replaceAll('``', '`');
  }
  return value;
}

function parseIdentifierAt(text, start = 0) {
  let index = start;
  while (index < text.length && /\s/.test(text[index])) index += 1;
  if (text[index] === '`') {
    const begin = index;
    index += 1;
    while (index < text.length) {
      if (text[index] !== '`') {
        index += 1;
        continue;
      }
      if (text[index + 1] === '`') {
        index += 2;
        continue;
      }
      index += 1;
      return { name: unquoteIdentifier(text.slice(begin, index)), end: index };
    }
    throw new BackupProfileError('identificador MySQL sin cierre');
  }
  const match = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(text.slice(index));
  if (!match) return null;
  return { name: match[0], end: index + match[0].length };
}

function parseQualifiedIdentifierAt(text, start = 0) {
  const first = parseIdentifierAt(text, start);
  if (!first) return null;
  const parts = [first.name];
  let end = first.end;
  while (true) {
    let cursor = end;
    while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
    if (text[cursor] !== '.') break;
    const next = parseIdentifierAt(text, cursor + 1);
    if (!next) throw new BackupProfileError('identificador calificado invalido');
    parts.push(next.name);
    end = next.end;
  }
  return { name: parts.join('.'), end };
}

function canonicalTableName(name) {
  return name.split('.').at(-1);
}

function findMatchingParen(text, openIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = openIndex; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        if (text[index + 1] === quote) index += 1;
        else quote = null;
      }
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
    } else if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
      if (depth === 0) return index;
      if (depth < 0) break;
    }
  }
  throw new BackupProfileError('parentesis de definicion SQL sin cierre');
}

function splitTopLevel(text) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        if (text[index + 1] === quote) index += 1;
        else quote = null;
      }
      continue;
    }
    if (character === "'" || character === '"' || character === '`') quote = character;
    else if (character === '(') depth += 1;
    else if (character === ')') depth -= 1;
    else if (character === ',' && depth === 0) {
      parts.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  if (quote || depth !== 0) throw new BackupProfileError('definicion SQL estructuralmente invalida');
  const tail = text.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function identifierList(text, openIndex = text.indexOf('(')) {
  if (openIndex < 0) throw new BackupProfileError('lista de identificadores ausente');
  const closeIndex = findMatchingParen(text, openIndex);
  return splitTopLevel(text.slice(openIndex + 1, closeIndex)).map((item) => {
    const direct = parseIdentifierAt(item);
    if (direct) return direct.name;
    const quoted = new RegExp(MYSQL_IDENTIFIER).exec(item);
    return quoted ? unquoteIdentifier(quoted[0]) : '<expression>';
  });
}

function normalizedColumnType(definition) {
  const base = /^\s*([A-Za-z]+)/.exec(definition)?.[1]?.toLowerCase();
  if (!base) throw new BackupProfileError('tipo de columna ausente');
  if (base === 'enum' || base === 'set') return base;

  const stopWords = new Set([
    'not', 'null', 'default', 'auto_increment', 'unique', 'primary', 'comment',
    'collate', 'character', 'references', 'check', 'generated', 'virtual',
    'stored', 'column_format', 'storage', 'on',
  ]);
  let depth = 0;
  let quote = null;
  let escaped = false;
  let end = definition.length;
  for (let index = 0; index < definition.length;) {
    const character = definition[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) {
        if (definition[index + 1] === quote) index += 1;
        else quote = null;
      }
      index += 1;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      index += 1;
      continue;
    }
    if (character === '(') {
      depth += 1;
      index += 1;
      continue;
    }
    if (character === ')') {
      depth -= 1;
      index += 1;
      continue;
    }
    if (depth === 0 && /[A-Za-z_]/.test(character)) {
      const match = /^[A-Za-z_]+/.exec(definition.slice(index));
      const word = match[0].toLowerCase();
      if (index > 0 && stopWords.has(word)) {
        end = index;
        break;
      }
      index += match[0].length;
      continue;
    }
    index += 1;
  }
  return definition.slice(0, end).trim().replace(/\s+/g, ' ').toLowerCase();
}

function parseColumn(definition) {
  const identifier = parseIdentifierAt(definition);
  if (!identifier) return null;
  const remainder = definition.slice(identifier.end).trim();
  if (!remainder) throw new BackupProfileError(`columna ${identifier.name} sin tipo`);
  return {
    name: identifier.name,
    type: normalizedColumnType(remainder),
    nullable: !/\bNOT\s+NULL\b/i.test(remainder),
    hasDefault: /\bDEFAULT\b/i.test(remainder),
    autoIncrement: /\bAUTO_INCREMENT\b/i.test(remainder),
    inlinePrimaryKey: /\bPRIMARY\s+KEY\b/i.test(remainder),
  };
}

function parseConstraintName(definition) {
  const match = /^\s*CONSTRAINT\s+/i.exec(definition);
  if (!match) return { name: null, offset: 0 };
  const identifier = parseIdentifierAt(definition, match[0].length);
  if (!identifier) throw new BackupProfileError('CONSTRAINT sin identificador');
  return { name: identifier.name, offset: identifier.end };
}

function parseForeignKey(definition) {
  const constraint = parseConstraintName(definition);
  const foreignMatch = /\bFOREIGN\s+KEY\s*/i.exec(definition.slice(constraint.offset));
  if (!foreignMatch) return null;
  const foreignStart = constraint.offset + foreignMatch.index + foreignMatch[0].length;
  const foreignOpen = definition.indexOf('(', foreignStart);
  const columns = identifierList(definition, foreignOpen);
  const foreignClose = findMatchingParen(definition, foreignOpen);
  const referenceMatch = /\bREFERENCES\s+/i.exec(definition.slice(foreignClose + 1));
  if (!referenceMatch) throw new BackupProfileError('FOREIGN KEY sin REFERENCES');
  const referenceStart = foreignClose + 1 + referenceMatch.index + referenceMatch[0].length;
  const referenced = parseQualifiedIdentifierAt(definition, referenceStart);
  if (!referenced) throw new BackupProfileError('REFERENCES sin tabla');
  const referenceOpen = definition.indexOf('(', referenced.end);
  const referencedColumns = identifierList(definition, referenceOpen);
  return {
    ...(constraint.name ? { name: constraint.name } : {}),
    columns,
    referencedTable: canonicalTableName(referenced.name),
    referencedColumns,
  };
}

function parsePrimaryKey(definition) {
  const match = /^\s*PRIMARY\s+KEY\s*/i.exec(definition);
  if (!match) return null;
  return identifierList(definition, definition.indexOf('(', match.index + match[0].length));
}

function parseIndex(definition) {
  const match = /^\s*(?:(UNIQUE|FULLTEXT|SPATIAL)\s+)?(?:KEY|INDEX)\b/i.exec(definition);
  if (!match) return null;
  let cursor = match[0].length;
  while (cursor < definition.length && /\s/.test(definition[cursor])) cursor += 1;
  let name = null;
  if (definition[cursor] !== '(') {
    const identifier = parseIdentifierAt(definition, cursor);
    if (!identifier) throw new BackupProfileError('indice sin identificador ni columnas');
    name = identifier.name;
    cursor = identifier.end;
  }
  const openIndex = definition.indexOf('(', cursor);
  const kind = match[1]?.toLowerCase() ?? 'index';
  return {
    ...(name ? { name } : {}),
    unique: kind === 'unique',
    kind,
    columns: identifierList(definition, openIndex),
  };
}

function emptyTable(name) {
  return {
    name: canonicalTableName(name),
    rowCount: 0,
    columns: [],
    primaryKey: [],
    indexes: [],
    foreignKeys: [],
  };
}

function addUnique(collection, item) {
  const signature = JSON.stringify(item);
  if (!collection.some((current) => JSON.stringify(current) === signature)) collection.push(item);
}

function applyTableElement(table, definition) {
  const value = definition.trim().replace(/^ADD\s+(?:COLUMN\s+)?/i, '');
  const foreignKey = parseForeignKey(value);
  if (foreignKey) {
    addUnique(table.foreignKeys, foreignKey);
    return;
  }
  const primaryKey = parsePrimaryKey(value);
  if (primaryKey) {
    table.primaryKey = [...new Set([...table.primaryKey, ...primaryKey])];
    return;
  }
  const index = parseIndex(value);
  if (index) {
    addUnique(table.indexes, index);
    return;
  }
  if (/^(?:CONSTRAINT|CHECK)\b/i.test(value)) return;
  const column = parseColumn(value);
  if (column) {
    const existing = table.columns.find((candidate) => candidate.name === column.name);
    if (existing) Object.assign(existing, column);
    else table.columns.push(column);
    if (column.inlinePrimaryKey && !table.primaryKey.includes(column.name)) {
      table.primaryKey.push(column.name);
    }
  }
}

export function parseCreateTableStatement(statement) {
  const prefix = /^\s*CREATE\s+(?:TEMPORARY\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?/i.exec(statement);
  if (!prefix) return null;
  const identifier = parseQualifiedIdentifierAt(statement, prefix[0].length);
  if (!identifier) throw new BackupProfileError('CREATE TABLE sin identificador');
  const openIndex = statement.indexOf('(', identifier.end);
  if (openIndex < 0) throw new BackupProfileError(`CREATE TABLE ${identifier.name} sin columnas`);
  const closeIndex = findMatchingParen(statement, openIndex);
  const table = emptyTable(identifier.name);
  for (const definition of splitTopLevel(statement.slice(openIndex + 1, closeIndex))) {
    applyTableElement(table, definition);
  }
  if (!table.columns.length) throw new BackupProfileError(`CREATE TABLE ${table.name} sin columnas`);
  for (const column of table.columns) delete column.inlinePrimaryKey;
  return table;
}

function parseAlterTableStatement(statement) {
  const prefix = /^\s*ALTER\s+TABLE\s+/i.exec(statement);
  if (!prefix) return null;
  const identifier = parseQualifiedIdentifierAt(statement, prefix[0].length);
  if (!identifier) throw new BackupProfileError('ALTER TABLE sin identificador');
  return {
    tableName: canonicalTableName(identifier.name),
    definitions: splitTopLevel(statement.slice(identifier.end)),
  };
}

function parseInsertTable(header) {
  const prefix = /^\s*INSERT\s+(?:IGNORE\s+)?INTO\s+/i.exec(header);
  if (!prefix) throw new BackupProfileError('encabezado INSERT invalido');
  const identifier = parseQualifiedIdentifierAt(header, prefix[0].length);
  if (!identifier) throw new BackupProfileError('INSERT INTO sin tabla');
  return canonicalTableName(identifier.name);
}

function metadataText(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

const DOMAIN_SIGNALS = {
  personas_legajos: ['persona', 'legajo', 'agente', 'empleado', 'personal', 'familiar', 'documento'],
  liquidacion_haberes: ['calculo', 'liquid', 'sueldo', 'haber', 'concepto', 'recibo', 'acumula', 'nomina'],
  control_horario: ['turno', 'legaturn', 'horario', 'esperanza', 'prenove', 'locales', 'fich', 'marca', 'reloj', 'asistencia', 'jornada', 'guardia'],
  novedades_licencias: ['novedad', 'prenove', 'motause', 'reglic', 'licencia', 'vacacion', 'ausencia', 'justificacion', 'permiso'],
  organizacion: ['reparticion', 'dependencia', 'sector', 'area', 'cargo', 'organigrama', 'estructura'],
  presupuesto_costos: ['presu', 'partida', 'cuenta', 'centrocosto', 'imputacion', 'costo'],
  identidad_acceso: ['usuario', 'rol', 'permiso', 'auditoria', 'sesion', 'acceso'],
};

const CANDIDATE_SIGNALS = {
  turnos: {
    table: ['turno', 'legaturn', 'horario', 'esperanza', 'jornada', 'guardia', 'cuadrante', 'franja'],
    columns: ['turno', 'hora', 'inicio', 'entrada', 'fin', 'salida', 'tolerancia', 'jornada', 'dia'],
  },
  fichadas: {
    table: ['fich', 'marca', 'reloj', 'asistencia', 'biometr', 'prenove', 'locales'],
    columns: ['marca', 'fich', 'reloj', 'fecha', 'hora', 'ingreso', 'egreso', 'dispositivo', 'terminal'],
  },
  calendarios: {
    table: ['calendario', 'feriado', 'asueto', 'laborable', 'vacacion', 'licencia', 'motause', 'reglic'],
    columns: ['fecha', 'feriado', 'asueto', 'laborable', 'dia', 'vigencia', 'desde', 'hasta'],
  },
  reglas: {
    table: ['regla', 'formula', 'tolerancia', 'convenio', 'categoria', 'parametro', 'politica', 'concepto', 'motause', 'reglic', 'prenove'],
    columns: ['regla', 'formula', 'tolerancia', 'convenio', 'categoria', 'porcentaje', 'valor', 'vigencia', 'desde', 'hasta'],
  },
};

function keywordMatches(value, keywords) {
  const normalized = metadataText(value);
  return keywords.filter((keyword) => normalized.includes(keyword));
}

function classifyTable(table) {
  const metadata = [table.name, ...table.columns.map((column) => column.name)];
  return Object.entries(DOMAIN_SIGNALS)
    .filter(([, keywords]) => metadata.some((value) => keywordMatches(value, keywords).length))
    .map(([domain]) => domain)
    .sort();
}

function candidateEvidence(table, type, signals) {
  const matchedTableKeywords = keywordMatches(table.name, signals.table);
  const matchedColumns = table.columns
    .filter((column) => keywordMatches(column.name, signals.columns).length)
    .map((column) => column.name)
    .sort();
  const score = (matchedTableKeywords.length * 5) + Math.min(matchedColumns.length, 5);
  if (score < 5) return null;
  return {
    table: table.name,
    score,
    confidence: score >= 10 ? 'high' : score >= 6 ? 'medium' : 'exploratory',
    matchedTableKeywords,
    matchedColumns,
    candidateType: type,
  };
}

class SqlStructureScanner {
  constructor() {
    this.tables = new Map();
    this.insertedTables = new Set();
    this.statementCount = 0;
    this.createTableStatements = 0;
    this.alterTableStatements = 0;
    this.insertStatements = 0;
    this.statementBuffer = '';
    this.statementMode = 'unknown';
    this.insertTable = null;
    this.insertRows = 0;
    this.insertDepth = 0;
    this.insertGrammar = 'expect-row';
    this.quote = null;
    this.escaped = false;
    this.lineComment = false;
    this.blockComment = false;
    this.pendingInput = '';
  }

  table(name) {
    const key = canonicalTableName(name);
    if (!this.tables.has(key)) this.tables.set(key, emptyTable(key));
    return this.tables.get(key);
  }

  feed(text) {
    this.pendingInput += text;
    this.#process(false);
  }

  finish() {
    this.#process(true);
    if (this.blockComment) throw new BackupProfileError('comentario SQL de bloque sin cierre');
    if (this.quote) throw new BackupProfileError('literal o identificador SQL sin cierre');
    if (this.statementMode === 'insert-values') {
      throw new BackupProfileError('INSERT VALUES sin terminador o con fila incompleta');
    }
    if (this.statementBuffer.trim()) throw new BackupProfileError('sentencia SQL sin terminador');
    if (!this.createTableStatements) throw new BackupProfileError('el archivo no contiene CREATE TABLE validos');
    const missingDefinitions = [...this.insertedTables].filter((name) => !this.tables.get(name)?.columns.length);
    if (missingDefinitions.length) {
      throw new BackupProfileError(`INSERT referencia tablas sin definicion: ${missingDefinitions.sort().join(', ')}`);
    }
  }

  #append(character) {
    this.statementBuffer += character;
    const limit = this.statementMode === 'insert-header'
      ? MAX_INSERT_HEADER_CHARS
      : MAX_SCHEMA_STATEMENT_CHARS;
    if (this.statementBuffer.length > limit) {
      throw new BackupProfileError('sentencia SQL estructural excede el limite seguro');
    }
    if (this.statementMode === 'unknown') {
      const firstWord = /^\s*([A-Za-z]+)/.exec(this.statementBuffer)?.[1]?.toUpperCase();
      if (firstWord && (!'INSERT'.startsWith(firstWord) || firstWord === 'INSERT')) {
        this.statementMode = firstWord === 'INSERT' ? 'insert-header' : 'schema';
      }
    }
  }

  #startInsertValues() {
    this.insertTable = parseInsertTable(this.statementBuffer);
    this.statementBuffer = '';
    this.statementMode = 'insert-values';
    this.insertRows = 0;
    this.insertDepth = 0;
    this.insertGrammar = 'expect-row';
  }

  #recordStatement() {
    this.statementCount = safeIncrement(this.statementCount, 'cantidad de sentencias');
    if (this.statementCount > MAX_STATEMENT_COUNT) {
      throw new BackupProfileError('cantidad de sentencias excede el limite seguro');
    }
  }

  #finishStatement() {
    if (this.statementMode === 'insert-values') {
      if (this.insertDepth !== 0 || this.insertGrammar !== 'after-row' || this.insertRows === 0) {
        throw new BackupProfileError('INSERT VALUES estructuralmente invalido');
      }
      const table = this.table(this.insertTable);
      if (table.rowCount > Number.MAX_SAFE_INTEGER - this.insertRows) {
        throw new BackupProfileError('conteo de filas excede el limite entero seguro');
      }
      table.rowCount += this.insertRows;
      this.insertedTables.add(table.name);
      this.insertStatements = safeIncrement(this.insertStatements, 'cantidad de INSERT');
      this.#recordStatement();
      this.#resetStatement();
      return;
    }

    const statement = this.statementBuffer.trim();
    if (!statement) {
      this.#resetStatement();
      return;
    }
    if (this.statementMode === 'insert-header') {
      throw new BackupProfileError('solo se admite INSERT ... VALUES para contar filas sin ambiguedad');
    }
    if (UNSUPPORTED_DATA_STATEMENT.test(statement)) {
      throw new BackupProfileError('sentencia de datos no soportada; el conteo de filas seria ambiguo');
    }
    this.#recordStatement();
    const created = parseCreateTableStatement(statement);
    if (created) {
      if (this.tables.get(created.name)?.columns.length) {
        throw new BackupProfileError(`CREATE TABLE duplicado: ${created.name}`);
      }
      const priorRows = this.tables.get(created.name)?.rowCount ?? 0;
      created.rowCount = priorRows;
      this.tables.set(created.name, created);
      this.createTableStatements = safeIncrement(this.createTableStatements, 'cantidad de CREATE TABLE');
      this.#resetStatement();
      return;
    }
    const altered = parseAlterTableStatement(statement);
    if (altered) {
      const table = this.table(altered.tableName);
      for (const definition of altered.definitions) applyTableElement(table, definition);
      for (const column of table.columns) delete column.inlinePrimaryKey;
      this.alterTableStatements = safeIncrement(this.alterTableStatements, 'cantidad de ALTER TABLE');
    }
    this.#resetStatement();
  }

  #resetStatement() {
    this.statementBuffer = '';
    this.statementMode = 'unknown';
    this.insertTable = null;
    this.insertRows = 0;
    this.insertDepth = 0;
    this.insertGrammar = 'expect-row';
  }

  #insertCharacter(character) {
    if (/\s/.test(character)) return;
    if (character === '(') {
      if (this.insertDepth === 0) {
        if (this.insertGrammar !== 'expect-row') throw new BackupProfileError('separador INSERT ausente');
        this.insertRows = safeIncrement(this.insertRows, 'cantidad de filas');
        this.insertGrammar = 'in-row';
      }
      this.insertDepth += 1;
      return;
    }
    if (character === ')') {
      if (this.insertDepth === 0) throw new BackupProfileError('parentesis INSERT inesperado');
      this.insertDepth -= 1;
      if (this.insertDepth === 0) this.insertGrammar = 'after-row';
      return;
    }
    if (this.insertDepth === 0) {
      if (character === ',' && this.insertGrammar === 'after-row') {
        this.insertGrammar = 'expect-row';
        return;
      }
      throw new BackupProfileError('contenido no soportado fuera de filas INSERT');
    }
  }

  #process(final) {
    let index = 0;
    const safeEnd = final ? this.pendingInput.length : Math.max(0, this.pendingInput.length - 2);
    while (index < safeEnd) {
      const character = this.pendingInput[index];
      const next = this.pendingInput[index + 1];
      const afterNext = this.pendingInput[index + 2];

      if (this.lineComment) {
        if (character === '\n' || character === '\r') this.lineComment = false;
        index += 1;
        continue;
      }
      if (this.blockComment) {
        if (character === '*' && next === '/') {
          this.blockComment = false;
          index += 2;
        } else index += 1;
        continue;
      }
      if (this.quote) {
        if (this.statementMode !== 'insert-values') this.#append(character);
        if (this.escaped) {
          this.escaped = false;
        } else if (character === '\\') {
          this.escaped = true;
        } else if (character === this.quote) {
          if (next === this.quote) {
            if (this.statementMode !== 'insert-values') this.#append(next);
            index += 2;
            continue;
          }
          this.quote = null;
        }
        index += 1;
        continue;
      }

      if (character === '-' && next === '-' && (afterNext === undefined || /\s/.test(afterNext))) {
        this.lineComment = true;
        index += 2;
        continue;
      }
      if (character === '#') {
        this.lineComment = true;
        index += 1;
        continue;
      }
      if (character === '/' && next === '*') {
        this.blockComment = true;
        index += 2;
        continue;
      }

      if (character === "'" || character === '"' || character === '`') {
        if (this.statementMode === 'insert-values' && this.insertDepth === 0) {
          throw new BackupProfileError('literal fuera de una fila INSERT');
        }
        this.quote = character;
        this.escaped = false;
        if (this.statementMode !== 'insert-values') this.#append(character);
        index += 1;
        continue;
      }

      if (character === ';') {
        if (this.statementMode === 'insert-values' && this.insertDepth !== 0) {
          throw new BackupProfileError('terminador dentro de una fila INSERT');
        }
        this.#finishStatement();
        index += 1;
        continue;
      }

      if (this.statementMode === 'insert-values') {
        this.#insertCharacter(character);
      } else {
        this.#append(character);
        if (this.statementMode === 'insert-header' && /\bVALUES\s*$/i.test(this.statementBuffer)) {
          this.#startInsertValues();
        }
      }
      index += 1;
    }
    this.pendingInput = this.pendingInput.slice(index);
  }
}

function finalizedTables(scanner) {
  return [...scanner.tables.values()]
    .map((table) => {
      table.primaryKey = [...new Set(table.primaryKey)].sort();
      table.indexes.sort((left, right) => (left.name ?? '').localeCompare(right.name ?? ''));
      table.foreignKeys.sort((left, right) => (left.name ?? '').localeCompare(right.name ?? ''));
      const functionalDomains = classifyTable(table);
      const candidateTypes = Object.entries(CANDIDATE_SIGNALS)
        .map(([type, signals]) => candidateEvidence(table, type, signals))
        .filter(Boolean)
        .map((candidate) => candidate.candidateType)
        .sort();
      return { ...table, functionalDomains, candidateTypes };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function fileMagic(inputPath) {
  const handle = await open(inputPath, 'r');
  try {
    const buffer = Buffer.alloc(2);
    const { bytesRead } = await handle.read(buffer, 0, 2, 0);
    return bytesRead === 2 ? buffer : buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export async function profileSqlFile(inputPath) {
  const absolutePath = path.resolve(inputPath);
  await access(absolutePath);
  const sourceStat = await stat(absolutePath);
  if (!sourceStat.isFile() || sourceStat.size === 0) {
    throw new BackupProfileError('la fuente debe ser un archivo SQL no vacio');
  }
  if (sourceStat.size > MAX_SOURCE_BYTES) {
    throw new BackupProfileError('tamano fisico excede el limite seguro');
  }
  const magic = await fileMagic(absolutePath);
  const isGzip = magic[0] === 0x1f && magic[1] === 0x8b;
  if (absolutePath.toLowerCase().endsWith('.gz') && !isGzip) {
    throw new BackupProfileError('archivo .gz con cabecera gzip invalida');
  }

  const sourceHash = createHash('sha256');
  const hashTap = new Transform({
    transform(chunk, _encoding, callback) {
      sourceHash.update(chunk);
      callback(null, chunk);
    },
  });
  const scanner = new SqlStructureScanner();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let logicalBytes = 0;
  let stream = createReadStream(absolutePath).pipe(hashTap);
  if (isGzip) stream = stream.pipe(createGunzip());

  try {
    for await (const chunk of stream) {
      if (logicalBytes > MAX_LOGICAL_BYTES - chunk.length) {
        throw new BackupProfileError('tamano logico excede el limite seguro');
      }
      logicalBytes += chunk.length;
      if (isGzip && logicalBytes > COMPRESSION_RATIO_CHECK_AFTER_BYTES
          && logicalBytes > sourceStat.size * MAX_COMPRESSION_RATIO) {
        throw new BackupProfileError('expansion gzip excede el limite seguro');
      }
      scanner.feed(decoder.decode(chunk, { stream: true }));
    }
    scanner.feed(decoder.decode());
    scanner.finish();
  } catch (error) {
    if (error instanceof BackupProfileError) throw error;
    throw new BackupProfileError(
      isGzip ? 'gzip o SQL invalido; perfil abortado' : 'SQL invalido; perfil abortado',
      { cause: error },
    );
  }

  const tables = finalizedTables(scanner);
  const candidates = Object.fromEntries(Object.entries(CANDIDATE_SIGNALS).map(([type, signals]) => [
    type,
    tables.map((table) => candidateEvidence(table, type, signals)).filter(Boolean)
      .sort((left, right) => right.score - left.score || left.table.localeCompare(right.table))
      .map(({ candidateType: _candidateType, ...candidate }) => candidate),
  ]));
  const safeSum = (values, label) => values.reduce((sum, value) => {
    if (sum > Number.MAX_SAFE_INTEGER - value) {
      throw new BackupProfileError(`${label} excede el limite entero seguro`);
    }
    return sum + value;
  }, 0);
  const totalRows = safeSum(tables.map((table) => table.rowCount), 'conteo total de filas');
  const columnCount = tables.reduce((sum, table) => sum + table.columns.length, 0);
  const indexCount = tables.reduce((sum, table) => sum + table.indexes.length, 0);
  const foreignKeyCount = tables.reduce((sum, table) => sum + table.foreignKeys.length, 0);

  return {
    schemaVersion: 1,
    toolVersion: TOOL_VERSION,
    privacy: {
      rawRowsRetained: false,
      dataLiteralsEmitted: false,
      samplesEmitted: false,
      outputScope: 'schema_metadata_and_aggregate_counts_only',
    },
    source: {
      fileName: path.basename(absolutePath),
      container: isGzip ? 'gzip' : 'plain-sql',
      bytes: sourceStat.size,
      logicalBytes,
      sha256: sourceHash.digest('hex'),
    },
    sql: {
      dialect: 'MariaDB/MySQL',
      statementCount: scanner.statementCount,
      createTableStatements: scanner.createTableStatements,
      alterTableStatements: scanner.alterTableStatements,
      insertStatements: scanner.insertStatements,
    },
    summary: {
      tableCount: tables.length,
      columnCount,
      rowCount: totalRows,
      indexCount,
      foreignKeyCount,
      candidateCounts: Object.fromEntries(
        Object.entries(candidates).map(([type, entries]) => [type, entries.length]),
      ),
    },
    candidates,
    tables,
  };
}

function markdownCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

export function renderMarkdown(profile) {
  const lines = [
    '# Perfil estructural seguro del backup GRH',
    '',
    '> No contiene muestras, valores de filas ni datos personales. Solo metadatos de esquema y conteos agregados.',
    '',
    '## Fuente',
    '',
    `- Archivo: \`${markdownCell(profile.source.fileName)}\``,
    `- Contenedor: ${profile.source.container}`,
    `- SHA-256: \`${profile.source.sha256}\``,
    `- Tamano comprimido/fisico: ${profile.source.bytes} bytes`,
    `- Tamano SQL logico: ${profile.source.logicalBytes} bytes`,
    '',
    '## Resumen',
    '',
    `- Tablas: ${profile.summary.tableCount}`,
    `- Columnas: ${profile.summary.columnCount}`,
    `- Filas contadas: ${profile.summary.rowCount}`,
    `- Indices secundarios: ${profile.summary.indexCount}`,
    `- Claves foraneas: ${profile.summary.foreignKeyCount}`,
    '',
    '## Inventario de tablas',
    '',
    '| Tabla | Filas | Columnas | PK | FK | Dominios | Candidata |',
    '|---|---:|---:|---|---:|---|---|',
  ];
  for (const table of profile.tables) {
    lines.push(`| ${markdownCell(table.name)} | ${table.rowCount} | ${table.columns.length} | ${markdownCell(table.primaryKey.join(', ') || '-')} | ${table.foreignKeys.length} | ${markdownCell(table.functionalDomains.join(', ') || '-')} | ${markdownCell(table.candidateTypes.join(', ') || '-')} |`);
  }
  lines.push('', '## Candidatas para control horario', '');
  for (const [type, entries] of Object.entries(profile.candidates)) {
    lines.push(`### ${type}`, '');
    if (!entries.length) {
      lines.push('- Sin candidatas estructurales con el umbral actual.', '');
      continue;
    }
    lines.push('| Tabla | Puntaje | Confianza | Senales de tabla | Columnas coincidentes |', '|---|---:|---|---|---|');
    for (const entry of entries) {
      lines.push(`| ${markdownCell(entry.table)} | ${entry.score} | ${entry.confidence} | ${markdownCell(entry.matchedTableKeywords.join(', ') || '-')} | ${markdownCell(entry.matchedColumns.join(', ') || '-')} |`);
    }
    lines.push('');
  }
  lines.push('## Diccionario de columnas y relaciones', '');
  for (const table of profile.tables) {
    lines.push(`### ${table.name}`, '', '| Columna | Tipo | Nula | Default declarado | Autoincremental |', '|---|---|---|---|---|');
    for (const column of table.columns) {
      lines.push(`| ${markdownCell(column.name)} | ${markdownCell(column.type)} | ${column.nullable ? 'si' : 'no'} | ${column.hasDefault ? 'si' : 'no'} | ${column.autoIncrement ? 'si' : 'no'} |`);
    }
    if (table.indexes.length) {
      lines.push('', '**Indices**', '', '| Nombre | Tipo | Unico | Columnas |', '|---|---|---|---|');
      for (const index of table.indexes) {
        lines.push(`| ${markdownCell(index.name ?? '(sin nombre)')} | ${index.kind} | ${index.unique ? 'si' : 'no'} | ${markdownCell(index.columns.join(', '))} |`);
      }
    }
    if (table.foreignKeys.length) {
      lines.push('', '**Claves foraneas**', '', '| Nombre | Columnas | Referencia |', '|---|---|---|');
      for (const foreignKey of table.foreignKeys) {
        lines.push(`| ${markdownCell(foreignKey.name ?? '(sin nombre)')} | ${markdownCell(foreignKey.columns.join(', '))} | ${markdownCell(`${foreignKey.referencedTable} (${foreignKey.referencedColumns.join(', ')})`)} |`);
      }
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

export function parseArgs(argv) {
  const options = { input: null, json: null, markdown: null, pretty: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--pretty') {
      options.pretty = true;
      continue;
    }
    const match = /^--(input|json|markdown)=(.+)$/.exec(argument);
    if (match) {
      options[match[1]] = match[2];
      continue;
    }
    if (argument === '--input' || argument === '--json' || argument === '--markdown') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new BackupProfileError(`${argument} requiere una ruta`);
      options[argument.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new BackupProfileError(`argumento no reconocido: ${argument}`);
  }
  if (!options.input) throw new BackupProfileError('falta --input <backup.sql[.gz]>');
  return options;
}

async function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv);
    const profile = await profileSqlFile(options.input);
    const json = `${JSON.stringify(profile, null, options.pretty || options.json ? 2 : 0)}\n`;
    if (options.json) await writeFile(path.resolve(options.json), json, 'utf8');
    if (options.markdown) await writeFile(path.resolve(options.markdown), renderMarkdown(profile), 'utf8');
    if (!options.json && !options.markdown) process.stdout.write(json);
    else process.stdout.write(`${JSON.stringify({ status: 'completed', tables: profile.summary.tableCount, rows: profile.summary.rowCount })}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof BackupProfileError ? error.message : 'error inesperado del perfilador';
    process.stderr.write(`Perfil GRH abortado: ${message}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await main();
}
