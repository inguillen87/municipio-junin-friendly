/**
 * Split a PostgreSQL migration without breaking quoted strings, comments or
 * dollar-quoted function bodies. This intentionally does not try to parse SQL;
 * it only identifies statement terminators that are outside those constructs.
 */
export function splitPostgresStatements(sqlText) {
  const source = String(sqlText ?? '');
  const statements = [];
  let statement = '';
  let singleQuoted = false;
  let doubleQuoted = false;
  let lineComment = false;
  let blockCommentDepth = 0;
  let dollarTag = null;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1] ?? '';

    if (lineComment) {
      statement += character;
      if (character === '\n') lineComment = false;
      continue;
    }

    if (blockCommentDepth > 0) {
      if (character === '/' && next === '*') {
        statement += '/*';
        blockCommentDepth += 1;
        index += 1;
      } else if (character === '*' && next === '/') {
        statement += '*/';
        blockCommentDepth -= 1;
        index += 1;
      } else {
        statement += character;
      }
      continue;
    }

    if (dollarTag) {
      if (source.startsWith(dollarTag, index)) {
        statement += dollarTag;
        index += dollarTag.length - 1;
        dollarTag = null;
      } else {
        statement += character;
      }
      continue;
    }

    if (singleQuoted) {
      statement += character;
      if (character === "'" && next === "'") {
        statement += next;
        index += 1;
      } else if (character === "'") {
        singleQuoted = false;
      }
      continue;
    }

    if (doubleQuoted) {
      statement += character;
      if (character === '"' && next === '"') {
        statement += next;
        index += 1;
      } else if (character === '"') {
        doubleQuoted = false;
      }
      continue;
    }

    if (character === '-' && next === '-') {
      statement += '--';
      lineComment = true;
      index += 1;
      continue;
    }

    if (character === '/' && next === '*') {
      statement += '/*';
      blockCommentDepth = 1;
      index += 1;
      continue;
    }

    if (character === "'") {
      statement += character;
      singleQuoted = true;
      continue;
    }

    if (character === '"') {
      statement += character;
      doubleQuoted = true;
      continue;
    }

    if (character === '$') {
      const tagMatch = source.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (tagMatch) {
        dollarTag = tagMatch[0];
        statement += dollarTag;
        index += dollarTag.length - 1;
        continue;
      }
    }

    if (character === ';') {
      const trimmed = statement.trim();
      if (trimmed) statements.push(trimmed);
      statement = '';
      continue;
    }

    statement += character;
  }

  if (singleQuoted || doubleQuoted || blockCommentDepth > 0 || dollarTag) {
    throw new Error('Migración SQL incompleta: comillas o comentario sin cerrar');
  }

  const trailing = statement.trim();
  if (trailing) statements.push(trailing);
  return statements;
}
