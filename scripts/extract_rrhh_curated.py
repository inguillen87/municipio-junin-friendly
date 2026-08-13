#!/usr/bin/env python3
"""Build complete, deterministic RRHH artifacts from the Junin MariaDB dump.

The extractor reads the SQL dump line by line and only keeps small lookup
tables in memory. Large fact tables are parsed again during the output pass and
written incrementally as JSON arrays. No SQL dump is copied into the repository.

Default PowerShell command:

    python .\scripts\extract_rrhh_curated.py

Explicit command:

    python .\scripts\extract_rrhh_curated.py `
      --grh-sql "$env:USERPROFILE\Downloads\grh_junin_extracted.sql" `
      --output-dir ".\rrhh-data"

The default output directory is already ignored by this repository for JSON
files. The generated manifest records the source hash, expected counts, output
hashes, mappings and integrity results without including person-level data.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Iterator, Mapping, Sequence


SCRIPT_VERSION = "1.0.0"
PROFILE_NAME = "grh-junin-2026-08-06"
EXPECTED_SOURCE_SHA256 = (
    "CB5C60A0E5DD2462AB7D5E89BA4FE9B7F57B9283AEEB0F89F7C8918730359E92"
)

# These are source-table counts, not estimates. Strict mode (the default)
# rejects a different snapshot instead of silently publishing partial data.
EXPECTED_COUNTS: dict[str, int] = {
    "ausencia": 31_572,
    "cargo": 5,
    "catego": 156,
    "convenio": 14,
    "familia": 3_647,
    "gremio": 6,
    "legagremio": 844,
    "legajo": 2_450,
    "licencia": 3_448,
    "motause": 27,
    "motibaja": 19,
    "organiza": 83,
    "persona": 2_349,
    "revista": 3,
    "sectores": 36,
    "vinculo": 9,
}

PRIMARY_KEYS: dict[str, tuple[str, ...]] = {
    "ausencia": ("CODI_01", "LEGA_12", "FAUS_20"),
    "cargo": ("CARGOID",),
    "catego": ("CODI_02", "CODI_10"),
    "convenio": ("CODI_02",),
    "familia": ("CODI_14",),
    "gremio": ("CODI_33",),
    "legagremio": ("CODI_01", "LEGA_12", "CODI_33", "FECHA_ALTA"),
    "legajo": ("CODI_01", "LEGA_12"),
    "licencia": ("CODI_01", "PERI_24", "LEGA_12", "FINI_24"),
    "motause": ("CODI_21",),
    "motibaja": ("CODI_29",),
    "organiza": ("IDORGANIZA",),
    "persona": ("IDPERSONA",),
    "revista": ("IDREVISTA",),
    "sectores": ("CODI_01", "CODI_07"),
    "vinculo": ("IDVINCULO",),
}

OUTPUT_FILES: dict[str, str] = {
    "employees": "curated-employees.json",
    "absences": "curated-absences.json",
    "leaves": "curated-leaves.json",
    "familyMembers": "curated-family-members.json",
    "sectors": "curated-sectors.json",
    "categories": "curated-categories.json",
    "unions": "curated-unions.json",
    "unionMemberships": "curated-union-memberships.json",
    "agreements": "curated-agreements.json",
    "absenceReasons": "curated-absence-reasons.json",
    "familyRelationships": "curated-family-relationships.json",
    "jobRoles": "curated-job-roles.json",
    "organizations": "curated-organizations.json",
    "exitReasons": "curated-exit-reasons.json",
    "employmentStatuses": "curated-employment-statuses.json",
}

LOOKUP_TABLES = {
    "cargo",
    "catego",
    "convenio",
    "gremio",
    "legagremio",
    "motause",
    "motibaja",
    "organiza",
    "persona",
    "revista",
    "sectores",
    "vinculo",
}
BUFFERED_TABLES = LOOKUP_TABLES | {"legajo"}

REQUIRED_COLUMNS: dict[str, set[str]] = {
    "legajo": {
        "CODI_01", "LEGA_12", "FING_12", "FEGR_12", "CODI_02",
        "CODI_03", "CODI_07", "CODI_10", "SUEL_12", "ANTA_12",
        "ANTM_12", "HDIA_12", "HMES_12", "IDPERSONA", "IDORGANIZA",
        "IDORGANIZA_INTERINO", "CARGOID", "PROF_12", "lugarDeTrabajo",
        "concursado", "CODI_29", "IDREVISTA",
    },
    "persona": {
        "IDPERSONA", "NOMB_12", "SEXO_12", "FENA_12", "CODI_47",
        "NUDO_12", "CUIL_12", "TELE_12", "EMIA_12", "GSAN_12",
        "CODI_08", "IDLOCALIDAD", "idcalle", "calle", "numero",
        "piso", "dpto", "localidad", "DOMI_12", "CPOS_12", "LUGNAC_12",
    },
    "ausencia": set(PRIMARY_KEYS["ausencia"]) | {
        "CODI_21", "CANT_20", "FREG_20", "NINS_20", "FINS_20",
        "COME_20", "peri_24", "DIAS_24", "FDES_24",
        "FECHAPRESENTACION", "FECHAHASTA",
    },
    "licencia": set(PRIMARY_KEYS["licencia"]) | {
        "TIPO_24", "FFIN_24", "OBS1_24", "DESC_24", "FDES_24",
        "INST_24", "FEIN_24", "EXPE_24", "FEXP_24", "DIAS_24",
    },
    "familia": set(PRIMARY_KEYS["familia"]) | {
        "CODI_01", "LEGA_12", "NOMB_14", "SEXO_14", "FENA_14",
        "CODI_47", "NUDO_14", "FBAJ_14", "INCA_14", "ESCO_14",
        "CURS_14", "IDVINCULO", "CUIL_14", "COBS_14",
        "PORCDEDUCCION",
    },
    "sectores": set(PRIMARY_KEYS["sectores"]) | {
        "DETA_07", "ABRE_07", "IDACTIVIDADPRES", "contratado",
    },
    "catego": set(PRIMARY_KEYS["catego"]) | {
        "CODI_01", "DETA_10", "SUEL_10", "ESCA_10", "GARA_10",
        "ADIC_10", "ABRE_10", "MAXCATEGO", "CANTPUESTO", "INICIAL",
    },
    "gremio": set(PRIMARY_KEYS["gremio"]) | {
        "DETA_33", "RETE_33", "APOR_33", "EMIS_33", "COD1_33",
        "COD2_33", "CONCEPTO",
    },
    "convenio": set(PRIMARY_KEYS["convenio"]) | {"DETA_02"},
    "legagremio": set(PRIMARY_KEYS["legagremio"]) | {
        "FECHA_BAJA", "SAFI_12", "fechaNotificacion", "fechaMandato",
        "mesMandato", "periMandato", "comision", "expediente",
        "resolucion", "lugarTrabajo",
    },
    "motause": set(PRIMARY_KEYS["motause"]) | {
        "DETA_21", "ABRE_21", "TIPO_21", "LICE_21", "XMES_21",
        "XANO_21", "AFECTAPRESENTISMO", "GENDIASDESCONTADOS",
        "tipolicencia", "metodocalculo", "diascorridos", "APLICAASEXO",
    },
    "vinculo": set(PRIMARY_KEYS["vinculo"]) | {"CODI_46", "DETA_46", "VINC_46"},
    "cargo": set(PRIMARY_KEYS["cargo"]) | {
        "DENOCARGO", "MISIONCARGO", "PADREID", "REPORTA_A", "CODI_01",
    },
    "organiza": set(PRIMARY_KEYS["organiza"]) | {
        "N1_DESC", "N1_ABRE", "CODI_01", "codigoOrganiza", "ID_PADRE",
        "activo",
    },
    "motibaja": set(PRIMARY_KEYS["motibaja"]) | {"DETA_29", "TIPO_29", "BAJA_29"},
    "revista": set(PRIMARY_KEYS["revista"]) | {"REVISTA"},
}


class ExtractionError(RuntimeError):
    """Raised when a source or output invariant is not satisfied."""


def _sql_lines(path: Path, hasher: hashlib._Hash | None = None) -> Iterator[str]:
    """Yield decoded physical lines without loading the dump into memory."""
    with path.open("rb") as handle:
        for raw_line in handle:
            if hasher is not None:
                hasher.update(raw_line)
            yield raw_line.decode("utf-8", errors="replace")


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def _insert_table(line: str) -> str | None:
    if not line.startswith("INSERT INTO `"):
        return None
    end = line.find("`", len("INSERT INTO `"))
    if end < 0:
        return None
    return line[len("INSERT INTO `"):end]


def parse_insert_rows(line: str) -> Iterator[list[str | None]]:
    """Parse one mysqldump extended-INSERT line.

    Values are returned as decoded strings and SQL NULL as ``None``. Type
    coercion happens later, per curated field, so identifiers keep leading
    zeros and source precision is not silently lost.
    """
    marker = " VALUES "
    start = line.find(marker)
    if start < 0:
        return

    text = line[start + len(marker):]
    length = len(text)
    index = 0
    mysql_escapes = {
        "0": "\x00",
        "b": "\b",
        "n": "\n",
        "r": "\r",
        "t": "\t",
        "Z": "\x1a",
    }

    while index < length:
        while index < length and text[index] in " \t\r\n,;":
            index += 1
        if index >= length:
            break
        if text[index] != "(":
            index += 1
            continue

        index += 1
        row: list[str | None] = []
        token: list[str] = []
        quoted = False
        token_was_quoted = False

        while index < length:
            char = text[index]
            if quoted:
                if char == "\\" and index + 1 < length:
                    escaped = text[index + 1]
                    token.append(mysql_escapes.get(escaped, escaped))
                    index += 2
                    continue
                if char == "'":
                    if index + 1 < length and text[index + 1] == "'":
                        token.append("'")
                        index += 2
                        continue
                    quoted = False
                    index += 1
                    continue
                token.append(char)
                index += 1
                continue

            if char == "'":
                quoted = True
                token_was_quoted = True
                index += 1
                continue
            if char in ",)":
                raw_value = "".join(token).strip()
                value: str | None
                if not token_was_quoted and raw_value.upper() == "NULL":
                    value = None
                else:
                    value = raw_value
                row.append(value)
                token.clear()
                token_was_quoted = False
                index += 1
                if char == ")":
                    yield row
                    break
                continue
            token.append(char)
            index += 1

        if quoted:
            raise ExtractionError("Unterminated quoted value in INSERT statement")


def _as_code(value: Any) -> str | None:
    if value is None:
        return None
    result = str(value).strip()
    return result or None


def _as_text(value: Any, *, collapse: bool = False) -> str | None:
    if value is None:
        return None
    result = str(value).strip()
    if collapse:
        result = " ".join(result.split())
    return result or None


def _as_int(value: Any) -> int | None:
    code = _as_code(value)
    if code is None:
        return None
    try:
        return int(code)
    except ValueError as error:
        raise ExtractionError(f"Expected integer, found {code!r}") from error


def _as_float(value: Any) -> float | None:
    code = _as_code(value)
    if code is None:
        return None
    try:
        return float(code)
    except ValueError as error:
        raise ExtractionError(f"Expected decimal, found {code!r}") from error


def _as_bool(value: Any) -> bool | None:
    if value is None:
        return None
    code = str(value).strip().lower()
    if code in {"", "0", "false", "f", "n", "no", "\x00"}:
        return False
    if code in {"1", "true", "t", "s", "si", "sí", "\x01"}:
        return True
    return None


def _date(value: Any) -> str | None:
    code = _as_code(value)
    if code in {None, "0000-00-00", "0000-00-00 00:00:00"}:
        return None
    return code[:10]


def _employee_key(company_code: Any, employee_number: Any) -> tuple[str | None, str | None]:
    return (_as_code(company_code), _as_code(employee_number))


def _employee_external_id(company_code: Any, employee_number: Any) -> str:
    company, employee = _employee_key(company_code, employee_number)
    return f"grh:{company}:{employee}"


def _source_key(row: Mapping[str, Any], fields: Sequence[str]) -> tuple[str | None, ...]:
    return tuple(_as_code(row.get(field)) for field in fields)


def _table_row(columns: Sequence[str], values: Sequence[str | None], table: str) -> dict[str, str | None]:
    if len(columns) != len(values):
        raise ExtractionError(
            f"Arity mismatch in {table}: expected {len(columns)} values, found {len(values)}"
        )
    return dict(zip(columns, values))


@dataclass
class ScanResult:
    source_sha256: str
    source_size_bytes: int
    dump_completed_at: str | None
    schemas: dict[str, list[str]]
    counts: Counter[str]
    duplicate_primary_keys: Counter[str]
    lookups: dict[str, list[dict[str, str | None]]]
    employee_keys: set[tuple[str | None, str | None]]
    absence_counts: Counter[tuple[str | None, str | None]]
    leave_counts: Counter[tuple[str | None, str | None]]
    family_counts: Counter[tuple[str | None, str | None]]
    primary_keys_seen: dict[str, set[tuple[str | None, ...]]]


def scan_source(source: Path) -> ScanResult:
    hasher = hashlib.sha256()
    schemas: dict[str, list[str]] = {}
    counts: Counter[str] = Counter()
    duplicate_primary_keys: Counter[str] = Counter()
    primary_keys_seen = {table: set() for table in EXPECTED_COUNTS}
    lookups = {table: [] for table in BUFFERED_TABLES}
    employee_keys: set[tuple[str | None, str | None]] = set()
    absence_counts: Counter[tuple[str | None, str | None]] = Counter()
    leave_counts: Counter[tuple[str | None, str | None]] = Counter()
    family_counts: Counter[tuple[str | None, str | None]] = Counter()
    current_table: str | None = None
    current_columns: list[str] = []
    dump_completed_at: str | None = None

    for line in _sql_lines(source, hasher):
        if current_table is None:
            create_match = re.match(r"CREATE TABLE `([^`]+)`", line)
            if create_match:
                current_table = create_match.group(1)
                current_columns = []
        else:
            if line.startswith(") ENGINE="):
                schemas.setdefault(current_table, list(current_columns))
                current_table = None
                current_columns = []
            else:
                column_match = re.match(r"\s*`([^`]+)`\s+", line)
                if column_match:
                    current_columns.append(column_match.group(1))

        if line.startswith("-- Dump completed on "):
            dump_completed_at = line.removeprefix("-- Dump completed on ").strip()

        table = _insert_table(line)
        if table not in EXPECTED_COUNTS:
            continue
        if table not in schemas:
            raise ExtractionError(f"INSERT for {table} appeared before its schema")

        columns = schemas[table]
        missing_columns = REQUIRED_COLUMNS[table] - set(columns)
        if missing_columns:
            missing = ", ".join(sorted(missing_columns))
            raise ExtractionError(f"Source table {table} is missing required columns: {missing}")

        for values in parse_insert_rows(line):
            row = _table_row(columns, values, table)
            counts[table] += 1
            primary_key = _source_key(row, PRIMARY_KEYS[table])
            if primary_key in primary_keys_seen[table]:
                duplicate_primary_keys[table] += 1
            else:
                primary_keys_seen[table].add(primary_key)

            employee_key = _employee_key(row.get("CODI_01"), row.get("LEGA_12"))
            if table == "legajo":
                employee_keys.add(employee_key)
            elif table == "ausencia":
                absence_counts[employee_key] += 1
            elif table == "licencia":
                leave_counts[employee_key] += 1
            elif table == "familia":
                family_counts[employee_key] += 1

            if table in BUFFERED_TABLES:
                lookups[table].append(row)

    return ScanResult(
        source_sha256=hasher.hexdigest().upper(),
        source_size_bytes=source.stat().st_size,
        dump_completed_at=dump_completed_at,
        schemas=schemas,
        counts=counts,
        duplicate_primary_keys=duplicate_primary_keys,
        lookups=lookups,
        employee_keys=employee_keys,
        absence_counts=absence_counts,
        leave_counts=leave_counts,
        family_counts=family_counts,
        primary_keys_seen=primary_keys_seen,
    )


def validate_scan(scan: ScanResult, *, allow_source_drift: bool) -> None:
    missing_tables = sorted(set(EXPECTED_COUNTS) - set(scan.schemas))
    if missing_tables:
        raise ExtractionError(f"Required source tables not found: {', '.join(missing_tables)}")

    if scan.duplicate_primary_keys:
        detail = ", ".join(
            f"{table}={count}" for table, count in sorted(scan.duplicate_primary_keys.items())
        )
        raise ExtractionError(f"Duplicate source primary keys found: {detail}")

    if allow_source_drift:
        return

    if scan.source_sha256 != EXPECTED_SOURCE_SHA256:
        raise ExtractionError(
            "Unexpected GRH dump SHA-256. Use --allow-source-drift only after reviewing "
            f"the new snapshot. Expected {EXPECTED_SOURCE_SHA256}, found {scan.source_sha256}."
        )

    mismatches = {
        table: {"expected": expected, "actual": scan.counts[table]}
        for table, expected in EXPECTED_COUNTS.items()
        if scan.counts[table] != expected
    }
    if mismatches:
        raise ExtractionError(f"Source count mismatch: {json.dumps(mismatches, sort_keys=True)}")


class JsonArrayWriter:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.handle = path.open("w", encoding="utf-8", newline="\n")
        self.handle.write("[\n")
        self.count = 0
        self.closed = False

    def write(self, record: Mapping[str, Any]) -> None:
        if self.count:
            self.handle.write(",\n")
        json.dump(record, self.handle, ensure_ascii=False, separators=(",", ":"))
        self.count += 1

    def close(self) -> None:
        if self.closed:
            return
        self.handle.write("\n]\n")
        self.handle.close()
        self.closed = True

    def abort(self) -> None:
        try:
            if not self.closed:
                self.handle.close()
        finally:
            self.path.unlink(missing_ok=True)
            self.closed = True


def _index(rows: Iterable[Mapping[str, Any]], fields: Sequence[str]) -> dict[tuple[str | None, ...], Mapping[str, Any]]:
    result: dict[tuple[str | None, ...], Mapping[str, Any]] = {}
    for row in rows:
        key = _source_key(row, fields)
        if key in result:
            raise ExtractionError(f"Duplicate lookup key {key!r} for fields {fields!r}")
        result[key] = row
    return result


def _lookup_name(
    index: Mapping[tuple[str | None, ...], Mapping[str, Any]],
    key: tuple[str | None, ...],
    name_field: str,
) -> str | None:
    row = index.get(key)
    return _as_text(row.get(name_field), collapse=True) if row else None


def _employee_record(
    row: Mapping[str, Any],
    scan: ScanResult,
    indexes: Mapping[str, Mapping[tuple[str | None, ...], Mapping[str, Any]]],
    memberships: Mapping[tuple[str | None, str | None], list[Mapping[str, Any]]],
) -> dict[str, Any]:
    company = _as_code(row["CODI_01"])
    employee = _as_code(row["LEGA_12"])
    employee_key = (company, employee)
    person_id = _as_code(row["IDPERSONA"])
    person = indexes["persona"].get((person_id,))
    if person is None:
        raise ExtractionError(f"Employee {employee_key!r} has no matching GRH persona")

    agreement_code = _as_code(row["CODI_02"])
    category_code = _as_code(row["CODI_10"])
    sector_code = _as_code(row["CODI_07"])
    cargo_id = _as_code(row["CARGOID"])
    organization_id = _as_code(row["IDORGANIZA"])
    exit_reason_code = _as_code(row["CODI_29"])
    status_id = _as_code(row["IDREVISTA"])
    exit_date = _date(row["FEGR_12"])

    employee_memberships: list[dict[str, Any]] = []
    for membership in memberships.get(employee_key, []):
        union_code = _as_code(membership["CODI_33"])
        employee_memberships.append(
            {
                "unionCode": union_code,
                "unionName": _lookup_name(indexes["gremio"], (union_code,), "DETA_33"),
                "startDate": _date(membership["FECHA_ALTA"]),
                "endDate": _date(membership["FECHA_BAJA"]),
                "workplace": _as_text(membership["lugarTrabajo"], collapse=True),
            }
        )

    sex_code = _as_code(person["SEXO_12"])
    sex_label = {"M": "Masculino", "F": "Femenino"}.get((sex_code or "").upper())

    return {
        "externalId": _employee_external_id(company, employee),
        "sourceKey": {"companyCode": company, "employeeNumber": employee},
        "personId": person_id,
        "identity": {
            "fullName": _as_text(person["NOMB_12"], collapse=True),
            "sexCode": sex_code,
            "sexLabel": sex_label,
            "birthDate": _date(person["FENA_12"]),
            "documentTypeCode": _as_code(person["CODI_47"]),
            "documentNumber": _as_code(person["NUDO_12"]),
            "cuil": _as_code(person["CUIL_12"]),
            "bloodType": _as_text(person["GSAN_12"], collapse=True),
            "phone": _as_text(person["TELE_12"]),
            "email": _as_text(person["EMIA_12"]),
            "birthplace": _as_text(person["LUGNAC_12"], collapse=True),
        },
        "address": {
            "raw": _as_text(person["DOMI_12"], collapse=True),
            "streetId": _as_code(person["idcalle"]),
            "street": _as_text(person["calle"], collapse=True),
            "number": _as_code(person["numero"]),
            "floor": _as_code(person["piso"]),
            "unit": _as_code(person["dpto"]),
            "localityId": _as_code(person["IDLOCALIDAD"]),
            "locality": _as_text(person["localidad"], collapse=True),
            "postalCode": _as_code(person["CPOS_12"]),
            "provinceCode": _as_code(person["CODI_08"]),
        },
        "employment": {
            "hireDate": _date(row["FING_12"]),
            "exitDate": exit_date,
            "activeProxy": exit_date is None,
            "sectorCode": sector_code,
            "sectorName": _lookup_name(indexes["sectores"], (company, sector_code), "DETA_07"),
            "agreementCode": agreement_code,
            "agreementName": _lookup_name(indexes["convenio"], (agreement_code,), "DETA_02"),
            "categoryCode": category_code,
            "categoryName": _lookup_name(indexes["catego"], (agreement_code, category_code), "DETA_10"),
            "contractConditionCode": _as_code(row["CODI_03"]),
            "cargoId": cargo_id,
            "cargoName": _lookup_name(indexes["cargo"], (cargo_id,), "DENOCARGO"),
            "organizationId": organization_id,
            "organizationName": _lookup_name(indexes["organiza"], (organization_id,), "N1_DESC"),
            "interimOrganizationId": _as_code(row["IDORGANIZA_INTERINO"]),
            "profession": _as_text(row["PROF_12"], collapse=True),
            "workplace": _as_text(row["lugarDeTrabajo"], collapse=True),
            "baseSalary": _as_float(row["SUEL_12"]),
            "seniorityYears": _as_int(row["ANTA_12"]),
            "seniorityMonths": _as_int(row["ANTM_12"]),
            "dailyHours": _as_float(row["HDIA_12"]),
            "monthlyHours": _as_float(row["HMES_12"]),
            "isTenured": _as_bool(row["concursado"]),
            "exitReasonCode": exit_reason_code,
            "exitReason": _lookup_name(indexes["motibaja"], (exit_reason_code,), "DETA_29"),
            "statusId": status_id,
            "status": _lookup_name(indexes["revista"], (status_id,), "REVISTA"),
        },
        "unionMemberships": employee_memberships,
        "relatedRecordCounts": {
            "absences": scan.absence_counts[employee_key],
            "leaves": scan.leave_counts[employee_key],
            "familyMembers": scan.family_counts[employee_key],
            "unionMemberships": len(employee_memberships),
        },
    }


def _absence_record(row: Mapping[str, Any], indexes: Mapping[str, Any]) -> dict[str, Any]:
    company = _as_code(row["CODI_01"])
    employee = _as_code(row["LEGA_12"])
    reason_code = _as_code(row["CODI_21"])
    return {
        "sourceKey": {
            "companyCode": company,
            "employeeNumber": employee,
            "absenceDate": _date(row["FAUS_20"]),
        },
        "employeeExternalId": _employee_external_id(company, employee),
        "absenceDate": _date(row["FAUS_20"]),
        "reasonCode": reason_code,
        "reason": _lookup_name(indexes["motause"], (reason_code,), "DETA_21"),
        "quantity": _as_float(row["CANT_20"]),
        "days": _as_int(row["DIAS_24"]),
        "period": _as_code(row["peri_24"]),
        "registeredDate": _date(row["FREG_20"]),
        "presentationDate": _date(row["FECHAPRESENTACION"]),
        "untilDate": _date(row["FECHAHASTA"]),
        "sourceFields": {
            "legalInstrumentNumber": _as_text(row["NINS_20"]),
            "legalInstrumentDate": _date(row["FINS_20"]),
            "comment": _as_text(row["COME_20"]),
            "FDES_24": _date(row["FDES_24"]),
        },
    }


def _leave_record(row: Mapping[str, Any]) -> dict[str, Any]:
    company = _as_code(row["CODI_01"])
    employee = _as_code(row["LEGA_12"])
    start_date = _date(row["FINI_24"])
    return {
        "sourceKey": {
            "companyCode": company,
            "period": _as_code(row["PERI_24"]),
            "employeeNumber": employee,
            "startDate": start_date,
        },
        "employeeExternalId": _employee_external_id(company, employee),
        "typeCode": _as_code(row["TIPO_24"]),
        "startDate": start_date,
        "endDate": _date(row["FFIN_24"]),
        "days": _as_int(row["DIAS_24"]),
        "observations": _as_text(row["OBS1_24"]),
        "sourceFields": {
            "DESC_24": _as_code(row["DESC_24"]),
            "FDES_24": _date(row["FDES_24"]),
            "INST_24": _as_code(row["INST_24"]),
            "FEIN_24": _date(row["FEIN_24"]),
            "EXPE_24": _as_text(row["EXPE_24"]),
            "FEXP_24": _date(row["FEXP_24"]),
        },
    }


def _family_record(row: Mapping[str, Any], indexes: Mapping[str, Any]) -> dict[str, Any]:
    company = _as_code(row["CODI_01"])
    employee = _as_code(row["LEGA_12"])
    relationship_id = _as_code(row["IDVINCULO"])
    return {
        "sourceKey": {"familyMemberId": _as_code(row["CODI_14"])},
        "employeeExternalId": _employee_external_id(company, employee),
        "employeeSourceKey": {"companyCode": company, "employeeNumber": employee},
        "fullName": _as_text(row["NOMB_14"], collapse=True),
        "relationshipId": relationship_id,
        "relationship": _lookup_name(indexes["vinculo"], (relationship_id,), "DETA_46"),
        "sexCode": _as_code(row["SEXO_14"]),
        "birthDate": _date(row["FENA_14"]),
        "documentTypeCode": _as_code(row["CODI_47"]),
        "documentNumber": _as_code(row["NUDO_14"]),
        "cuil": _as_code(row["CUIL_14"]),
        "endDate": _date(row["FBAJ_14"]),
        "incapacityCode": _as_code(row["INCA_14"]),
        "schoolingCode": _as_code(row["ESCO_14"]),
        "courseCode": _as_code(row["CURS_14"]),
        "observations": _as_text(row["COBS_14"]),
        "deductionPercentage": _as_float(row["PORCDEDUCCION"]),
    }


def _sector_record(row: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "sourceKey": {
            "companyCode": _as_code(row["CODI_01"]),
            "sectorCode": _as_code(row["CODI_07"]),
        },
        "name": _as_text(row["DETA_07"], collapse=True),
        "abbreviation": _as_text(row["ABRE_07"], collapse=True),
        "budgetActivityId": _as_code(row["IDACTIVIDADPRES"]),
        "contracted": _as_bool(row["contratado"]),
    }


def _category_record(row: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "sourceKey": {
            "agreementCode": _as_code(row["CODI_02"]),
            "categoryCode": _as_code(row["CODI_10"]),
        },
        "companyCode": _as_code(row["CODI_01"]),
        "name": _as_text(row["DETA_10"], collapse=True),
        "abbreviation": _as_text(row["ABRE_10"], collapse=True),
        "baseSalary": _as_float(row["SUEL_10"]),
        "scaleCode": _as_code(row["ESCA_10"]),
        "guaranteeAmount": _as_float(row["GARA_10"]),
        "additionalAmount": _as_float(row["ADIC_10"]),
        "maximum": _as_int(row["MAXCATEGO"]),
        "positionCount": _as_int(row["CANTPUESTO"]),
        "initial": _as_bool(row["INICIAL"]),
    }


def _union_record(row: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "sourceKey": {"unionCode": _as_code(row["CODI_33"])},
        "name": _as_text(row["DETA_33"], collapse=True),
        "sourceFields": {
            "RETE_33": _as_float(row["RETE_33"]),
            "APOR_33": _as_float(row["APOR_33"]),
            "EMIS_33": _as_code(row["EMIS_33"]),
            "COD1_33": _as_code(row["COD1_33"]),
            "COD2_33": _as_code(row["COD2_33"]),
            "CONCEPTO": _as_code(row["CONCEPTO"]),
        },
    }


def _membership_record(row: Mapping[str, Any], indexes: Mapping[str, Any]) -> dict[str, Any]:
    company = _as_code(row["CODI_01"])
    employee = _as_code(row["LEGA_12"])
    union_code = _as_code(row["CODI_33"])
    return {
        "sourceKey": {
            "companyCode": company,
            "employeeNumber": employee,
            "unionCode": union_code,
            "startDate": _date(row["FECHA_ALTA"]),
        },
        "employeeExternalId": _employee_external_id(company, employee),
        "unionName": _lookup_name(indexes["gremio"], (union_code,), "DETA_33"),
        "endDate": _date(row["FECHA_BAJA"]),
        "workplace": _as_text(row["lugarTrabajo"], collapse=True),
        "sourceFields": {
            "SAFI_12": _as_text(row["SAFI_12"]),
            "notificationDate": _date(row["fechaNotificacion"]),
            "mandateDate": _date(row["fechaMandato"]),
            "mandateMonth": _as_code(row["mesMandato"]),
            "mandatePeriod": _as_code(row["periMandato"]),
            "commission": _as_text(row["comision"], collapse=True),
            "fileNumber": _as_text(row["expediente"]),
            "resolution": _as_text(row["resolucion"]),
        },
    }


def _agreement_record(row: Mapping[str, Any]) -> dict[str, Any]:
    source_fields = {
        key: (_as_float(value) if re.fullmatch(r"-?\d+(?:\.\d+)?", _as_code(value) or "") else _as_code(value))
        for key, value in row.items()
        if key not in {"CODI_02", "DETA_02"}
    }
    return {
        "sourceKey": {"agreementCode": _as_code(row["CODI_02"])},
        "name": _as_text(row["DETA_02"], collapse=True),
        "sourceFields": source_fields,
    }


def _absence_reason_record(row: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "sourceKey": {"reasonCode": _as_code(row["CODI_21"])},
        "name": _as_text(row["DETA_21"], collapse=True),
        "abbreviation": _as_text(row["ABRE_21"], collapse=True),
        "typeCode": _as_code(row["TIPO_21"]),
        "isLeave": _as_bool(row["LICE_21"]),
        "monthlyLimit": _as_float(row["XMES_21"]),
        "annualLimit": _as_float(row["XANO_21"]),
        "affectsAttendanceBonus": _as_bool(row["AFECTAPRESENTISMO"]),
        "generatesDiscountedDays": _as_bool(row["GENDIASDESCONTADOS"]),
        "leaveType": _as_code(row["tipolicencia"]),
        "calculationMethod": _as_code(row["metodocalculo"]),
        "calendarDays": _as_bool(row["diascorridos"]),
        "appliesToSex": _as_code(row["APLICAASEXO"]),
    }


def _relationship_record(row: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "sourceKey": {"relationshipId": _as_code(row["IDVINCULO"])},
        "code": _as_code(row["CODI_46"]),
        "name": _as_text(row["DETA_46"], collapse=True),
        "inverseCode": _as_code(row["VINC_46"]),
    }


def _job_role_record(row: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "sourceKey": {"cargoId": _as_code(row["CARGOID"])},
        "companyCode": _as_code(row["CODI_01"]),
        "name": _as_text(row["DENOCARGO"], collapse=True),
        "mission": _as_text(row["MISIONCARGO"]),
        "parentId": _as_code(row["PADREID"]),
        "reportsTo": _as_code(row["REPORTA_A"]),
    }


def _organization_record(row: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "sourceKey": {"organizationId": _as_code(row["IDORGANIZA"])},
        "companyCode": _as_code(row["CODI_01"]),
        "code": _as_code(row["codigoOrganiza"]),
        "name": _as_text(row["N1_DESC"], collapse=True),
        "abbreviation": _as_text(row["N1_ABRE"], collapse=True),
        "parentId": _as_code(row["ID_PADRE"]),
        "activeSourceValue": _as_code(row["activo"]),
    }


def _exit_reason_record(row: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "sourceKey": {"exitReasonCode": _as_code(row["CODI_29"])},
        "name": _as_text(row["DETA_29"], collapse=True),
        "typeCode": _as_code(row["TIPO_29"]),
        "sourceActiveValue": _as_code(row["BAJA_29"]),
    }


def _employment_status_record(row: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "sourceKey": {"statusId": _as_code(row["IDREVISTA"])},
        "name": _as_text(row["REVISTA"], collapse=True),
    }


OUTPUT_BY_TABLE = {
    "ausencia": ("absences", _absence_record),
    "catego": ("categories", _category_record),
    "convenio": ("agreements", _agreement_record),
    "familia": ("familyMembers", _family_record),
    "gremio": ("unions", _union_record),
    "legagremio": ("unionMemberships", _membership_record),
    "legajo": ("employees", _employee_record),
    "licencia": ("leaves", _leave_record),
    "motause": ("absenceReasons", _absence_reason_record),
    "motibaja": ("exitReasons", _exit_reason_record),
    "organiza": ("organizations", _organization_record),
    "revista": ("employmentStatuses", _employment_status_record),
    "sectores": ("sectors", _sector_record),
    "vinculo": ("familyRelationships", _relationship_record),
    "cargo": ("jobRoles", _job_role_record),
}


def _build_indexes(scan: ScanResult) -> tuple[dict[str, Any], dict[Any, list[Mapping[str, Any]]]]:
    indexes = {
        table: _index(scan.lookups[table], PRIMARY_KEYS[table])
        for table in LOOKUP_TABLES
        if table != "legagremio"
    }
    memberships: dict[tuple[str | None, str | None], list[Mapping[str, Any]]] = defaultdict(list)
    for row in scan.lookups["legagremio"]:
        memberships[_employee_key(row["CODI_01"], row["LEGA_12"])].append(row)
    return indexes, memberships


def _join_quality(scan: ScanResult, indexes: Mapping[str, Any]) -> dict[str, Any]:
    employee_person_orphans = 0
    employee_sector_null = 0
    employee_sector_orphans = 0
    employee_category_null = 0
    employee_category_orphans = 0

    for row in scan.lookups["legajo"]:
        person_id = _as_code(row["IDPERSONA"])
        if (person_id,) not in indexes["persona"]:
            employee_person_orphans += 1

        company = _as_code(row["CODI_01"])
        sector = _as_code(row["CODI_07"])
        if sector is None:
            employee_sector_null += 1
        elif (company, sector) not in indexes["sectores"]:
            employee_sector_orphans += 1

        agreement = _as_code(row["CODI_02"])
        category = _as_code(row["CODI_10"])
        if agreement is None or category is None:
            employee_category_null += 1
        elif (agreement, category) not in indexes["catego"]:
            employee_category_orphans += 1

    def fact_orphans(counter: Mapping[tuple[str | None, str | None], int]) -> int:
        return sum(count for key, count in counter.items() if key not in scan.employee_keys)

    membership_union_orphans = sum(
        (_as_code(row["CODI_33"]),) not in indexes["gremio"]
        for row in scan.lookups["legagremio"]
    )
    membership_employee_orphans = sum(
        _employee_key(row["CODI_01"], row["LEGA_12"]) not in scan.employee_keys
        for row in scan.lookups["legagremio"]
    )

    return {
        "employeePerson": {"orphanRows": employee_person_orphans},
        "employeeSector": {
            "nullRows": employee_sector_null,
            "orphanRows": employee_sector_orphans,
        },
        "employeeCategory": {
            "nullRows": employee_category_null,
            "orphanRows": employee_category_orphans,
        },
        "absenceEmployee": {"orphanRows": fact_orphans(scan.absence_counts)},
        "leaveEmployee": {"orphanRows": fact_orphans(scan.leave_counts)},
        "familyEmployee": {"orphanRows": fact_orphans(scan.family_counts)},
        "unionMembershipEmployee": {"orphanRows": membership_employee_orphans},
        "unionMembershipUnion": {"orphanRows": membership_union_orphans},
    }


def build_outputs(source: Path, output_dir: Path, scan: ScanResult) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    indexes, memberships = _build_indexes(scan)
    temp_paths = {
        entity: output_dir / f".{filename.removesuffix('.json')}.tmp.json"
        for entity, filename in OUTPUT_FILES.items()
    }
    writers = {entity: JsonArrayWriter(path) for entity, path in temp_paths.items()}

    try:
        for line in _sql_lines(source):
            table = _insert_table(line)
            if table not in OUTPUT_BY_TABLE:
                continue
            entity, mapper = OUTPUT_BY_TABLE[table]
            columns = scan.schemas[table]
            for values in parse_insert_rows(line):
                row = _table_row(columns, values, table)
                if table == "legajo":
                    record = mapper(row, scan, indexes, memberships)
                elif table in {"ausencia", "familia", "legagremio"}:
                    record = mapper(row, indexes)
                else:
                    record = mapper(row)
                writers[entity].write(record)

        for writer in writers.values():
            writer.close()

        output_expectations = {
            "employees": scan.counts["legajo"],
            "absences": scan.counts["ausencia"],
            "leaves": scan.counts["licencia"],
            "familyMembers": scan.counts["familia"],
            "sectors": scan.counts["sectores"],
            "categories": scan.counts["catego"],
            "unions": scan.counts["gremio"],
            "unionMemberships": scan.counts["legagremio"],
            "agreements": scan.counts["convenio"],
            "absenceReasons": scan.counts["motause"],
            "familyRelationships": scan.counts["vinculo"],
            "jobRoles": scan.counts["cargo"],
            "organizations": scan.counts["organiza"],
            "exitReasons": scan.counts["motibaja"],
            "employmentStatuses": scan.counts["revista"],
        }
        count_mismatches = {
            entity: {"expected": expected, "actual": writers[entity].count}
            for entity, expected in output_expectations.items()
            if writers[entity].count != expected
        }
        if count_mismatches:
            raise ExtractionError(
                f"Curated output count mismatch: {json.dumps(count_mismatches, sort_keys=True)}"
            )

        output_metadata: dict[str, Any] = {}
        for entity, temp_path in temp_paths.items():
            output_metadata[entity] = {
                "file": OUTPUT_FILES[entity],
                "records": writers[entity].count,
                "bytes": temp_path.stat().st_size,
                "sha256": _sha256_file(temp_path),
            }

        join_quality = _join_quality(scan, indexes)

        manifest = {
            "schemaVersion": "1.0.0",
            "profile": PROFILE_NAME,
            "source": {
                "fileName": source.name,
                "sizeBytes": scan.source_size_bytes,
                "sha256": scan.source_sha256,
                "dumpCompletedAt": scan.dump_completed_at,
                "database": "grh_junin",
                "format": "MariaDB 10.3 extended INSERT SQL dump",
            },
            "extractor": {
                "script": "scripts/extract_rrhh_curated.py",
                "version": SCRIPT_VERSION,
                "sha256": _sha256_file(Path(__file__)),
                "strategy": "two-pass streaming input and streaming JSON output",
                "commandPowerShell": (
                    "python .\\scripts\\extract_rrhh_curated.py "
                    "--grh-sql \"$env:USERPROFILE\\Downloads\\grh_junin_extracted.sql\" "
                    "--output-dir \".\\rrhh-data\""
                ),
            },
            "validation": {
                "strictSnapshot": scan.source_sha256 == EXPECTED_SOURCE_SHA256,
                "expectedSourceSha256": EXPECTED_SOURCE_SHA256,
                "sourceCounts": {
                    table: {
                        "expected": EXPECTED_COUNTS[table],
                        "actual": scan.counts[table],
                        "primaryKey": list(PRIMARY_KEYS[table]),
                        "distinctPrimaryKeys": len(scan.primary_keys_seen[table]),
                        "duplicatePrimaryKeyRows": scan.duplicate_primary_keys[table],
                    }
                    for table in sorted(EXPECTED_COUNTS)
                },
                "joins": join_quality,
            },
            "outputs": output_metadata,
            "mappingNotes": [
                "employees joins grh_junin.legajo to grh_junin.persona by IDPERSONA",
                "activeProxy is true only when FEGR_12 is SQL NULL or empty",
                "category identity preserves the source composite key CODI_02 plus CODI_10",
                "sector identity preserves the source composite key CODI_01 plus CODI_07",
                "absence and leave semantic source fields are retained where labels are ambiguous",
                "personas_junin is intentionally not cross-joined; identity resolution requires a separate reviewed pipeline",
            ],
        }

        manifest_temp = output_dir / ".curated-manifest.tmp.json"
        manifest_temp.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
            newline="\n",
        )

        # All validations passed. Replace only the exact generated targets.
        for entity, temp_path in temp_paths.items():
            os.replace(temp_path, output_dir / OUTPUT_FILES[entity])
        os.replace(manifest_temp, output_dir / "curated-manifest.json")
        return manifest
    except Exception:
        for writer in writers.values():
            writer.abort()
        (output_dir / ".curated-manifest.tmp.json").unlink(missing_ok=True)
        raise


def _self_test() -> None:
    line = (
        "INSERT INTO `demo` VALUES "
        "(1,NULL,'O\\'Brien, Sur','line\\nnext','\\0','it''s ok',-2.50);\n"
    )
    parsed = list(parse_insert_rows(line))
    assert parsed == [["1", None, "O'Brien, Sur", "line\nnext", "\x00", "it's ok", "-2.50"]]
    assert _insert_table(line) == "demo"
    assert _as_bool("\x00") is False
    assert _as_bool("\x01") is True
    assert _as_code(" 001 ") == "001"
    assert _date("0000-00-00") is None
    print("Self-test OK")


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    repo_root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(
        description="Extract complete curated RRHH JSON artifacts from the Junin MariaDB dump."
    )
    parser.add_argument(
        "--grh-sql",
        type=Path,
        default=Path.home() / "Downloads" / "grh_junin_extracted.sql",
        help="Path to grh_junin_extracted.sql (default: ~/Downloads/grh_junin_extracted.sql)",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=repo_root / "rrhh-data",
        help="Ignored output directory (default: <repo>/rrhh-data)",
    )
    parser.add_argument(
        "--allow-source-drift",
        action="store_true",
        help="Allow a reviewed newer dump; counts and source hash remain recorded in the manifest.",
    )
    parser.add_argument("--self-test", action="store_true", help="Run parser unit checks and exit.")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    if args.self_test:
        _self_test()
        return 0

    source = args.grh_sql.resolve()
    output_dir = args.output_dir.resolve()
    if not source.is_file():
        raise ExtractionError(f"GRH SQL dump not found: {source}")

    print(f"Scanning source: {source}")
    scan = scan_source(source)
    validate_scan(scan, allow_source_drift=args.allow_source_drift)
    print(
        "Validated source counts: "
        + ", ".join(f"{table}={scan.counts[table]}" for table in sorted(EXPECTED_COUNTS))
    )
    manifest = build_outputs(source, output_dir, scan)
    print(f"Wrote manifest: {output_dir / 'curated-manifest.json'}")
    print(
        "Curated records: "
        + ", ".join(
            f"{entity}={metadata['records']}"
            for entity, metadata in manifest["outputs"].items()
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ExtractionError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
