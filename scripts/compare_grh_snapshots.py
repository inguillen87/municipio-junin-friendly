#!/usr/bin/env python3
"""Compare seven GRH source tables offline; write only aggregate review evidence.

This is not an importer or a promotion authorization. Values and source keys
never leave memory. NULL, empty strings and decoded source values stay distinct.
Classification is raw and may overlap; it does not reproduce canonical identity
normalization, certificate tokens, employment eligibility or payroll facts.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from extract_rrhh_curated import parse_insert_rows

TOOL_VERSION = "1.0.0"
MAPPING_VERSION = "grh-key-review.v1"
MAX_SOURCE_BYTES = 2 * 1024 ** 3
MAX_LOGICAL_BYTES = 2 * 1024 ** 3
MAX_LINE_BYTES = 2 * 1024 ** 2
MAX_COMPRESSION_RATIO = 200
MAX_ROWS = 100_000
MAX_REPORT_BYTES = 256 * 1024
MAX_TRIGGER_BYTES = 16 * 1024 * 1024
TABLES = ("persona", "legajo", "familia", "vinculo", "histocal", "histolegajo", "organiza")
PRIMARY_KEYS = {
    "persona": ("IDPERSONA",), "legajo": ("CODI_01", "LEGA_12"),
    "familia": ("CODI_14",), "vinculo": ("IDVINCULO",),
    "histocal": ("CODI_01", "PERI_31", "MES_31", "FECA_31", "TIPO_31"),
    "histolegajo": ("ID",), "organiza": ("IDORGANIZA",),
}
# Labels identify fields to review, not municipal interpretations of their values.
IDENTITY_FIELDS = {
    "persona": ("CODI_01", "NOMB_12", "SEXO_12", "FENA_12", "CODI_47", "NUDO_12", "CUIL_12"),
    "legajo": ("IDPERSONA",),
    "familia": ("CODI_01", "LEGA_12", "NOMB_14", "SEXO_14", "FENA_14", "CODI_47", "NUDO_14", "CUIL_14"),
    "vinculo": ("CODI_46", "DETA_46", "VINC_46"), "histocal": (),
    "histolegajo": ("CODI_01", "LEGA_12", "NOMBEMP"),
    "organiza": ("CODI_01", "codigoOrganiza", "ID_PADRE", "idOrganizaDestino"),
}
STATUS_FIELDS = {
    "persona": (), "vinculo": (),
    "legajo": ("FEGR_12", "CODI_29", "IDREVISTA", "susp_12", "arcpp_12"),
    "familia": ("IDVINCULO", "FBAJ_14", "INCA_14", "ESCO_14", "CURS_14"),
    "histocal": ("CIER_31",),
    "histolegajo": (),
    "organiza": ("activo",),
}
DATE_FIELDS = {
    "persona": ("FENA_12",),
    "legajo": ("FING_12", "FEGR_12", "FVCA_12", "FEUL_12", "TIVE_12", "BEFN_12", "FAUM_12", "FINC_12", "BFN1_12", "FFIC_12", "FCCA_12", "BFN2_12", "ARTI_12", "ARTF_12", "FTIT_12", "FCLA_12", "VTOS_12", "FITU_12", "PING_12", "FPIN_12", "FIIN_12", "FFIN_12", "FCAR_12", "fechaDdInterino", "fechaHhInterino", "FECHA_AGRUPAMIENTO_DESDE", "FECHA_AGRUPAMIENTO_HASTA"),
    "familia": ("FENA_14", "FBAJ_14", "FALT_14", "FDGI_14", "BDGI_14", "PRES_14", "VENC_14", "VTOS_14"),
    "vinculo": (), "histocal": ("FECA_31", "fechaIG"),
    "histolegajo": ("FECA_31",), "organiza": ("N1_VIGD", "N1_VIGH", "N1_FVAC"),
}
ISSUE_FIELDS = (
    ("IDENTITY_CHANGED", "identityChanged"), ("REMOVED_ROWS", "removed"),
    ("STATUS_CHANGED", "statusChanged"), ("DATE_CHANGED", "dateChanged"),
    ("ADDED_ROWS", "added"), ("CHANGED_ROWS", "changed"),
)


class ReviewError(RuntimeError):
    """Only fixed, non-nominal codes may reach the CLI."""


def fail(code):
    raise ReviewError(code)


def civil_time(value):
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}", value):
        fail("SOURCE_CUTOFF_INVALID")
    try:
        parsed = datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        fail("SOURCE_CUTOFF_INVALID")
    if not 1900 <= parsed.year <= 2100:
        fail("SOURCE_CUTOFF_INVALID")
    return parsed


def generated_time(value=None):
    value = value or datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z", value):
        fail("GENERATED_AT_INVALID")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        fail("GENERATED_AT_INVALID")
    if not 1900 <= parsed.year <= 2100:
        fail("GENERATED_AT_INVALID")
    return value


def signature(values):
    return hashlib.sha256(json.dumps(values, ensure_ascii=False, separators=(",", ":")).encode("utf-8")).digest()


def strict_rows(line, table):
    """Validate complete single-line INSERT grammar before reusing the decoder.

    The existing decoder is deliberately permissive. This boundary accepts only
    quoted strings, numeric literals and SQL NULL, with no suffix or expressions.
    """
    prefix = f"INSERT INTO `{table}` VALUES "
    if not line.startswith(prefix):
        fail("SOURCE_INSERT_UNSUPPORTED")
    values = line[len(prefix):].rstrip("\r\n")
    # Token regex is linear: neither quoted branch contains overlapping repeats.
    token = r"(?:'(?:[^'\\]|\\[^\r\n]|'')*'|NULL|[-+]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][-+]?[0-9]+)?)"
    field = re.compile(r"[ \t]*(" + token + r")[ \t]*")
    i = 0
    count = 0
    while True:
        if i >= len(values) or values[i] != "(":
            fail("SOURCE_INSERT_UNSUPPORTED")
        i += 1
        while True:
            match = field.match(values, i)
            if not match:
                fail("SOURCE_INSERT_UNSUPPORTED")
            i = match.end()
            if i < len(values) and values[i] == ",":
                i += 1
                continue
            if i < len(values) and values[i] == ")":
                i += 1
                break
            fail("SOURCE_INSERT_UNSUPPORTED")
        count += 1
        if values[i:] == ";":
            break
        if i < len(values) and values[i] == ",":
            i += 1
            continue
        fail("SOURCE_INSERT_UNSUPPORTED")
    decoded_count = 0
    try:
        for row in parse_insert_rows(line):
            decoded_count += 1
            yield row
    except Exception:
        fail("SOURCE_INSERT_UNSUPPORTED")
    if decoded_count != count:
        fail("SOURCE_INSERT_UNSUPPORTED")


class HashedReader:
    def __init__(self, handle):
        self.handle = handle
        self.hasher = hashlib.sha256()
        self.count = 0

    def read(self, size=-1):
        data = self.handle.read(min(size, MAX_LINE_BYTES) if size >= 0 else MAX_LINE_BYTES)
        self.count += len(data)
        if self.count > MAX_SOURCE_BYTES:
            fail("SOURCE_TOO_LARGE")
        self.hasher.update(data)
        return data

    def readline(self, size):
        data = self.handle.readline(size)
        self.count += len(data)
        if self.count > MAX_SOURCE_BYTES:
            fail("SOURCE_TOO_LARGE")
        self.hasher.update(data)
        return data


@dataclass
class Snapshot:
    metadata: dict
    schemas: dict
    rows: dict


def _stat_token(stat):
    return (stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns)


def _path_stat_token(stat):
    # Windows can report birth/ctime with different precision through fstat and
    # stat. Keep ctime for descriptor-before/after; path replacement is checked
    # using file identity, size and mtime, alongside the mandatory content hash.
    return (stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns)


def _schema(table, lines):
    columns, definitions, pk = [], {}, None
    for line in lines:
        match = re.fullmatch(r"\s*`([A-Za-z_][A-Za-z_0-9]*)`\s+(.+?)(?:,)?\s*", line)
        if match:
            column, definition = match.groups()
            if column in definitions:
                fail("SOURCE_SCHEMA_INVALID")
            columns.append(column)
            definitions[column] = definition.rstrip(",")
        elif line.strip().startswith("PRIMARY KEY "):
            match = re.fullmatch(r"\s*PRIMARY KEY \((`[A-Za-z_][A-Za-z_0-9]*`(?:,`[A-Za-z_][A-Za-z_0-9]*`)*)\),?\s*", line)
            if not match or pk is not None:
                fail("SOURCE_SCHEMA_INVALID")
            pk = tuple(re.findall(r"`([^`]+)`", match[1]))
        elif not re.match(r"\s*(?:UNIQUE KEY|KEY|CONSTRAINT) ", line):
            fail("SOURCE_SCHEMA_UNSUPPORTED")
    required = set(PRIMARY_KEYS[table] + IDENTITY_FIELDS[table] + STATUS_FIELDS[table] + DATE_FIELDS[table])
    if pk != PRIMARY_KEYS[table] or not required.issubset(definitions):
        fail("SOURCE_SCHEMA_REQUIRED")
    dates = {name for name, definition in definitions.items() if re.match(r"(?:date|datetime)\b", definition)}
    if dates != set(DATE_FIELDS[table]):
        fail("SOURCE_SCHEMA_DATE_DRIFT")
    return {"columns": columns, "definitions": definitions, "pk": pk, "ddl": tuple(lines)}


def _key(row, schema):
    result = []
    for column in schema["pk"]:
        value = row[column]
        if value is None or not value.strip():
            fail("SOURCE_NULL_KEY")
        if re.match(r"(?:tinyint|smallint|mediumint|int|bigint|decimal)\b", schema["definitions"][column]):
            if not re.fullmatch(r"-?\d+(?:\.0+)?", value):
                fail("SOURCE_KEY_INVALID")
            value = str(int(value.split(".")[0]))
        result.append(value)
    return tuple(result)


def read_snapshot(path, expected_sha256):
    path = Path(path)
    if not path.is_absolute() or not (path.name.endswith(".sql") or path.name.endswith(".sql.gz")):
        fail("SOURCE_PATH_INVALID")
    if not re.fullmatch(r"[0-9a-fA-F]{64}", expected_sha256):
        fail("SOURCE_HASH_INVALID")
    schemas, rows = {}, {table: {} for table in TABLES}
    current, ddl, database, cutoff = None, [], None, None
    trigger_state, trigger_bytes = None, 0
    logical_bytes = 0
    try:
        with path.open("rb") as source:
            before = os.fstat(source.fileno())
            if not 1 <= before.st_size <= MAX_SOURCE_BYTES:
                fail("SOURCE_TOO_LARGE")
            reader = HashedReader(source)
            stream = gzip.GzipFile(fileobj=reader, mode="rb") if path.name.endswith(".gz") else reader
            while True:
                raw = stream.readline(MAX_LINE_BYTES + 1)
                if not raw:
                    break
                logical_bytes += len(raw)
                if len(raw) > MAX_LINE_BYTES:
                    fail("SOURCE_LINE_TOO_LARGE")
                if logical_bytes > MAX_LOGICAL_BYTES or logical_bytes > before.st_size * MAX_COMPRESSION_RATIO:
                    fail("SOURCE_EXPANSION_LIMIT")
                line = raw.decode("utf-8", errors="strict").rstrip("\r\n")
                if cutoff is not None and line.strip():
                    fail("SOURCE_AFTER_FOOTER")
                # mysqldump interleaves trigger definitions with table data.
                # Their body INSERTs are program text, never snapshot rows.
                if trigger_state is not None:
                    trigger_bytes += len(raw)
                    if trigger_bytes > MAX_TRIGGER_BYTES:
                        fail("SOURCE_TRIGGER_LIMIT")
                    if trigger_state == "header":
                        component = r"(?:`[^`]+`|[A-Za-z_][A-Za-z_0-9]*)"
                        # A trigger's program may retain a legacy schema name;
                        # no reference in that excluded program is followed.
                        identifier = rf"(?:{component}\.)?{component}"
                        if not re.fullmatch(r"/\*!\d+ CREATE\*/ /\*!\d+ DEFINER=.*?\*/ /\*!\d+ TRIGGER " + identifier + r" (?:BEFORE|AFTER) (?:INSERT|UPDATE|DELETE) ON " + identifier + r"[ \t]*", line):
                            fail("SOURCE_TRIGGER_UNSUPPORTED")
                        trigger_state = "body"
                    elif trigger_state == "body":
                        if re.fullmatch(r"\s*END\s*\*/;;", line):
                            trigger_state = "delimiter"
                        elif "*/;;" in line or line.startswith("DELIMITER"):
                            fail("SOURCE_TRIGGER_UNSUPPORTED")
                    elif line == "DELIMITER ;":
                        trigger_state = None
                    else:
                        fail("SOURCE_TRIGGER_UNSUPPORTED")
                    continue
                if line.startswith("DELIMITER"):
                    if current is not None or line != "DELIMITER ;;":
                        fail("SOURCE_TRIGGER_UNSUPPORTED")
                    trigger_state, trigger_bytes = "header", 0
                    continue
                if line.startswith("-- Host:"):
                    match = re.fullmatch(r"-- Host: .*?\s+Database: ([A-Za-z_][A-Za-z_0-9]*)", line)
                    if not match or match[1] != "grh_junin" or database is not None:
                        fail("SOURCE_DATABASE_INVALID")
                    database = match[1]
                if line.startswith("USE ") and line != "USE `grh_junin`;":
                    fail("SOURCE_DATABASE_INVALID")
                if line.startswith("-- Dump completed on "):
                    cutoff = line.removeprefix("-- Dump completed on ").strip()
                    civil_time(cutoff)
                create = re.fullmatch(r"CREATE TABLE `([A-Za-z_][A-Za-z_0-9]*)` \(", line)
                if create:
                    if current is not None:
                        fail("SOURCE_SCHEMA_INVALID")
                    current, ddl = create[1], []
                    if current in schemas:
                        fail("SOURCE_SCHEMA_INVALID")
                    continue
                if current is not None:
                    if line.startswith(") ENGINE=") and line.endswith(";"):
                        if current in TABLES:
                            schemas[current] = _schema(current, ddl)
                            # AUTO_INCREMENT is a row counter, not a schema change.
                            schemas[current]["tableOptions"] = re.sub(r" AUTO_INCREMENT=\d+", "", line)
                        current = None
                    elif current in TABLES:
                        ddl.append(line)
                    continue
                if re.match(r"\s*(?:REPLACE|LOAD|UPDATE|DELETE|TRUNCATE)\b", line, re.I):
                    fail("SOURCE_STATEMENT_UNSUPPORTED")
                if re.match(r"/\*!\d*\s*(?:INSERT|REPLACE|LOAD|UPDATE|DELETE|TRUNCATE)\b", line, re.I):
                    fail("SOURCE_STATEMENT_UNSUPPORTED")
                if re.match(r"\s*INSERT\b", line, re.I):
                    insert = re.match(r"INSERT INTO `([A-Za-z_][A-Za-z_0-9]*)` VALUES ", line)
                    if not insert or not line.endswith(";"):
                        fail("SOURCE_INSERT_UNSUPPORTED")
                    table = insert[1]
                    if table not in TABLES:
                        continue
                    if table not in schemas:
                        fail("SOURCE_SCHEMA_REQUIRED")
                    schema = schemas[table]
                    for values in strict_rows(line, table):
                        if len(values) != len(schema["columns"]):
                            fail("SOURCE_ROW_WIDTH")
                        row = dict(zip(schema["columns"], values))
                        key = _key(row, schema)
                        if key in rows[table]:
                            fail("SOURCE_DUPLICATE_KEY")
                        if len(rows[table]) >= MAX_ROWS:
                            fail("SOURCE_ROW_LIMIT")
                        rows[table][key] = tuple(signature([row[name] for name in group]) for group in
                            (schema["columns"], IDENTITY_FIELDS[table], STATUS_FIELDS[table], DATE_FIELDS[table]))
            if hasattr(stream, "close"):
                stream.close()
            after = os.fstat(source.fileno())
            final_path = path.stat()
            if _stat_token(before) != _stat_token(after) or _path_stat_token(before) != _path_stat_token(final_path):
                fail("SOURCE_CHANGED")
            if reader.count != before.st_size:
                fail("SOURCE_CHANGED")
            sha256 = reader.hasher.hexdigest()
            if sha256 != expected_sha256.lower():
                fail("SOURCE_HASH_MISMATCH")
    except ReviewError:
        raise
    except UnicodeError:
        fail("SOURCE_ENCODING_INVALID")
    except (OSError, EOFError):
        fail("SOURCE_READ_FAILED")
    if database != "grh_junin" or cutoff is None or current is not None or trigger_state is not None or set(schemas) != set(TABLES):
        fail("SOURCE_INCOMPLETE")
    return Snapshot({"sha256": sha256, "bytes": before.st_size, "cutoffAt": cutoff, "database": database}, schemas, rows)


def compare_snapshots(baseline, candidate, generated_at=None):
    if baseline.metadata["sha256"] == candidate.metadata["sha256"]:
        fail("SOURCE_SAME_HASH")
    if civil_time(baseline.metadata["cutoffAt"]) >= civil_time(candidate.metadata["cutoffAt"]):
        fail("SOURCE_ORDER_INVALID")
    if baseline.schemas != candidate.schemas:
        fail("SOURCE_SCHEMA_INCOMPATIBLE")
    domains, issues = [], []
    for table in TABLES:
        old, new = baseline.rows[table], candidate.rows[table]
        common = old.keys() & new.keys()
        changed = [key for key in common if old[key][0] != new[key][0]]
        domain = {"table": table, "baselineRows": len(old), "candidateRows": len(new),
            "unchanged": len(common) - len(changed), "added": len(new.keys() - old.keys()),
            "removed": len(old.keys() - new.keys()), "changed": len(changed),
            "identityChanged": sum(old[key][1] != new[key][1] for key in changed),
            "statusChanged": sum(old[key][2] != new[key][2] for key in changed),
            "dateChanged": sum(old[key][3] != new[key][3] for key in changed)}
        domains.append(domain)
        issues.extend({"code": code, "table": table, "count": domain[field]} for code, field in ISSUE_FIELDS if domain[field])
    return {"version": "grh-backup-review.v1", "toolVersion": TOOL_VERSION, "mappingVersion": MAPPING_VERSION,
        "generatedAt": generated_time(generated_at), "baseline": baseline.metadata, "candidate": candidate.metadata,
        "domains": domains, "issues": issues,
        "scope": {"comparisonOnly": True, "readyForPromotion": False, "databaseWrites": False,
            "canonicalCompared": False, "payrollFactsCompared": False, "operationalEvidenceCompared": False}}


def output_path(value):
    path = Path(value)
    if not path.is_absolute() or path.suffix != ".json":
        fail("OUTPUT_PATH_INVALID")
    resolved = path.resolve()
    if not resolved.parent.is_dir():
        fail("OUTPUT_PATH_INVALID")
    # Refuse every Git repository, including linked worktrees and symlink paths.
    for parent in (resolved.parent, *resolved.parent.parents):
        if (parent / ".git").exists():
            fail("OUTPUT_REPOSITORY_FORBIDDEN")
    return resolved


def write_report(path, report):
    path = output_path(path)
    data = (json.dumps(report, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    if len(data) > MAX_REPORT_BYTES:
        fail("REPORT_TOO_LARGE")
    try:
        with path.open("xb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
    except FileExistsError:
        with path.open("rb") as handle:
            if handle.read(MAX_REPORT_BYTES + 1) != data:
                fail("OUTPUT_EXISTS_DIFFERENT")
    except OSError:
        fail("OUTPUT_WRITE_FAILED")
    return hashlib.sha256(data).hexdigest()


class SafeArgumentParser(argparse.ArgumentParser):
    def error(self, message):
        fail("ARGUMENTS_INVALID")


def main(argv=None):
    parser = SafeArgumentParser(description=__doc__)
    for name in ("baseline", "candidate", "output", "baseline-sha256", "candidate-sha256"):
        parser.add_argument("--" + name, required=True)
    parser.add_argument("--generated-at")
    args = parser.parse_args(argv)
    destination = output_path(args.output)
    stamp = generated_time(args.generated_at)
    if args.baseline_sha256.lower() == args.candidate_sha256.lower():
        fail("SOURCE_SAME_HASH")
    baseline = read_snapshot(args.baseline, args.baseline_sha256)
    candidate = read_snapshot(args.candidate, args.candidate_sha256)
    report = compare_snapshots(baseline, candidate, stamp)
    digest = write_report(destination, report)
    print(json.dumps({"ok": True, "reportSha256": digest, "domains": len(TABLES), "issues": len(report["issues"])}))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ReviewError as error:
        print(json.dumps({"ok": False, "code": str(error)}), file=sys.stderr)
        raise SystemExit(1)
    except Exception:
        print(json.dumps({"ok": False, "code": "REVIEW_FAILED"}), file=sys.stderr)
        raise SystemExit(1)
