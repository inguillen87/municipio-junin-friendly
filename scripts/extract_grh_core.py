#!/usr/bin/env python3
"""Extract the GRH operational core into deterministic, private artifacts.

GRH remains the source of truth for employment and payroll. This extractor
adds the high-value facts that are intentionally absent from the first RRHH
curation pass:

* payroll runs and their literal close flag (``histocal``),
* the current payroll snapshot (``histolegajo``),
* normalized employee movements (``legamov``),
* an employee/month payroll mart derived from ``calculo``, and
* an evidence-only reconciliation of administrative and liquidated status.

Raw SQL and generated person-level JSON stay outside Git. Only this extractor,
its schema and aggregate test evidence are versioned.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Iterator, Mapping, Sequence


SCRIPT_VERSION = "1.1.0"
PROFILE_NAME = "grh-core-junin-2026-08"
SOURCE_NAME = "grh_junin"
EXPECTED_SOURCE_SHA256 = (
    "CB5C60A0E5DD2462AB7D5E89BA4FE9B7F57B9283AEEB0F89F7C8918730359E92"
)
EXPECTED_CURRENT_PAYROLL_DATE = "2026-08-31"
MIN_VALID_PAYROLL_DATE = "2008-01-01"
EXPECTED_COUNTS = {
    "calculo": 4_363_790,
    "concepto": 294,
    "histocal": 625,
    "histolegajo": 854,
    "legajo": 2_450,
    "legamov": 489_681,
}
OUTPUT_FILES = {
    "payrollRuns": "grh-core-payroll-runs.json",
    "payrollSnapshot": "grh-core-payroll-snapshot.json",
    "movements": "grh-core-movements.json",
    "payrollMonthly": "grh-core-payroll-monthly.json",
    "employmentReconciliation": "grh-core-employment-reconciliation.json",
}
REQUIRED_COLUMNS = {
    "calculo": {
        "CODI_01", "PERI_31", "MES_31", "FECA_31", "TIPO_31", "LEGA_12",
        "CODI_27", "CANT_31", "IMPO_31", "CODI_02", "CODI_06", "CODI_17",
        "CODI_07",
    },
    "concepto": {
        "CODI_27", "DETA_15", "CALC_15", "TIPO_15", "ABRE_15", "TOTA_15",
    },
    "histocal": {
        "CODI_01", "PERI_31", "MES_31", "FECA_31", "TIPO_31", "CIER_31",
        "fechaIG",
    },
    "histolegajo": {
        "ID", "LEGA_12", "CODI_01", "FECA_31", "MES_31", "PERI_31",
        "TIPO_31", "IDCONVENIO", "CONVENIO", "CATEGORIA", "CARGO",
        "ESTRUCTURAPRESU", "PRESUDETALLE", "IDREPARTICION", "REPARTICION",
        "AREA", "CUENTA",
    },
    "legajo": {"CODI_01", "LEGA_12", "FING_12", "FEGR_12"},
    "legamov": {
        "CODI_01", "ANO_30", "MES_30", "TIPO_31", "LEGA_12", "CODI_27",
        "cant_30", "CUOT_30", "AUTO_30", "CODI_06", "AJUS_30", "FORZ_30",
        "NRO_INSTRUMENTO_LEGAL", "TIPO_MOVIMIENTO", "ESTADO",
    },
}

# These are literal totals emitted by GRH's own payroll catalogue. They are
# kept separate from the technical sum of every item because adding earnings,
# deductions, totals and net rows together is not a financial measure.
PAYROLL_TOTAL_CONCEPTS = {
    "990": "employerContributions",
    "991": "socialSecurityTaxableBase",
    "992": "healthTaxableBase",
    "993": "subjectEarnings",
    "994": "nonSubjectEarnings",
    "995": "familyAllowances",
    "996": "employeeWithholdings",
    "997": "employerTaxableBase",
    "998": "net",
    "999": "netPayable",
}


class ExtractionError(RuntimeError):
    """Raised when a source or output invariant is not satisfied."""


def _insert_table(line: str) -> str | None:
    if not line.startswith("INSERT INTO `"):
        return None
    end = line.find("`", len("INSERT INTO `"))
    return None if end < 0 else line[len("INSERT INTO `"):end]


def parse_insert_rows(line: str) -> Iterator[list[str | None]]:
    """Parse rows from one mysqldump extended INSERT without type loss."""
    marker = " VALUES "
    start = line.find(marker)
    if start < 0:
        return
    text = line[start + len(marker):]
    index = 0
    mysql_escapes = {
        "0": "\x00", "b": "\b", "n": "\n", "r": "\r", "t": "\t", "Z": "\x1a",
    }
    while index < len(text):
        while index < len(text) and text[index] in " \t\r\n,;":
            index += 1
        if index >= len(text):
            break
        if text[index] != "(":
            index += 1
            continue
        index += 1
        row: list[str | None] = []
        token: list[str] = []
        quoted = False
        token_was_quoted = False
        while index < len(text):
            char = text[index]
            if quoted:
                if char == "\\" and index + 1 < len(text):
                    escaped = text[index + 1]
                    token.append(mysql_escapes.get(escaped, escaped))
                    index += 2
                    continue
                if char == "'":
                    if index + 1 < len(text) and text[index + 1] == "'":
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
                value = None if not token_was_quoted and raw_value.upper() == "NULL" else raw_value
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


class JsonArrayWriter:
    """Incremental JSON writer used for large private outputs."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.handle = path.open("w", encoding="utf-8", newline="\n")
        self.handle.write("[\n")
        self.count = 0
        self.closed = False

    def write(self, value: Mapping[str, Any]) -> None:
        if self.count:
            self.handle.write(",\n")
        json.dump(value, self.handle, ensure_ascii=False, separators=(",", ":"))
        self.count += 1

    def close(self) -> None:
        if self.closed:
            return
        self.handle.write("\n]\n")
        self.handle.close()
        self.closed = True

    def abort(self) -> None:
        if not self.closed:
            self.handle.close()
        self.path.unlink(missing_ok=True)
        self.closed = True


def _row(columns: Sequence[str], values: Sequence[str | None], table: str) -> dict[str, str | None]:
    if len(columns) != len(values):
        raise ExtractionError(
            f"Arity mismatch in {table}: expected {len(columns)}, found {len(values)}"
        )
    return dict(zip(columns, values))


def _text(value: Any) -> str | None:
    if value is None:
        return None
    result = " ".join(str(value).strip().split())
    return result or None


def _code(value: Any) -> str | None:
    if value is None:
        return None
    result = str(value).strip()
    return result or None


def _integer(value: Any, field: str) -> int | None:
    code = _code(value)
    if code is None:
        return None
    try:
        return int(code)
    except ValueError as error:
        raise ExtractionError(f"Expected integer in {field}, found {code!r}") from error


def _decimal(value: Any, field: str) -> Decimal:
    code = _code(value)
    if code is None:
        return Decimal(0)
    try:
        return Decimal(code)
    except InvalidOperation as error:
        raise ExtractionError(f"Expected decimal in {field}, found {code!r}") from error


def _decimal_text(value: Decimal) -> str:
    return format(value, "f")


def _employee_key(row: Mapping[str, Any]) -> tuple[str, str]:
    company = _code(row.get("CODI_01"))
    employee = _code(row.get("LEGA_12"))
    if company is None or employee is None:
        raise ExtractionError("GRH employee keys cannot be null")
    return company, employee


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def _valid_payroll_date(value: str | None) -> bool:
    if value is None:
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return MIN_VALID_PAYROLL_DATE <= value <= EXPECTED_CURRENT_PAYROLL_DATE


def _valid_movement_year(value: int | None) -> bool:
    return value is not None and 2008 <= value <= 2026


def _classify_reconciliation(
    administrative_active: bool,
    liquidated_current: bool,
    last_payroll_date: str | None,
) -> str:
    if not administrative_active:
        return "administrative_inactive"
    if liquidated_current:
        return "active_liquidated_current"
    current = date.fromisoformat(EXPECTED_CURRENT_PAYROLL_DATE)
    previous_month_end = current.replace(day=1) - timedelta(days=1)
    if last_payroll_date is None:
        return "active_not_liquidated_never_observed"
    if last_payroll_date == previous_month_end.isoformat():
        return "active_not_liquidated_previous_cycle"
    return "active_not_liquidated_historical"


def extract(source: Path, output_dir: Path, *, allow_source_drift: bool) -> dict[str, Any]:
    if not source.is_file():
        raise ExtractionError(f"GRH source not found: {source}")
    output_dir.mkdir(parents=True, exist_ok=True)
    temp_paths = {name: output_dir / f".{filename}.tmp" for name, filename in OUTPUT_FILES.items()}
    writers = {
        "payrollRuns": JsonArrayWriter(temp_paths["payrollRuns"]),
        "payrollSnapshot": JsonArrayWriter(temp_paths["payrollSnapshot"]),
        "movements": JsonArrayWriter(temp_paths["movements"]),
    }
    schemas: dict[str, list[str]] = {}
    current_table: str | None = None
    current_columns: list[str] = []
    counts: Counter[str] = Counter()
    source_hasher = hashlib.sha256()
    employees: dict[tuple[str, str], dict[str, str | None]] = {}
    snapshot_keys: set[tuple[str, str]] = set()
    snapshot_dates: Counter[str] = Counter()
    payroll_run_keys: set[tuple[str, str, str, str, str]] = set()
    payroll_run_statuses: Counter[str] = Counter()
    invalid_payroll_run_dates: Counter[str] = Counter()
    latest_closed_payroll_date: str | None = None
    last_payroll: dict[tuple[str, str], str] = {}
    monthly: dict[tuple[str, str, str, str, str, str], dict[str, Any]] = {}
    concepts: dict[str, dict[str, str | None]] = {}
    calculation_concept_codes: set[str] = set()
    invalid_calculation_dates: Counter[str] = Counter()
    invalid_movement_years: Counter[str] = Counter()
    calculation_null_amounts = 0
    movement_keys: set[tuple[str, str, str, str, str, str, str]] = set()
    duplicate_movement_keys = 0

    try:
        with source.open("rb") as handle:
            for raw_line in handle:
                source_hasher.update(raw_line)
                line = raw_line.decode("utf-8", errors="replace")
                if current_table is None:
                    match = re.match(r"CREATE TABLE `([^`]+)`", line)
                    if match and match.group(1) in EXPECTED_COUNTS:
                        current_table = match.group(1)
                        current_columns = []
                elif line.startswith(") ENGINE="):
                    schemas[current_table] = list(current_columns)
                    current_table = None
                    current_columns = []
                else:
                    match = re.match(r"\s*`([^`]+)`\s+", line)
                    if match:
                        current_columns.append(match.group(1))

                table = _insert_table(line)
                if table not in EXPECTED_COUNTS:
                    continue
                if table not in schemas:
                    raise ExtractionError(f"INSERT for {table} appeared before its schema")
                missing = REQUIRED_COLUMNS[table] - set(schemas[table])
                if missing:
                    raise ExtractionError(
                        f"Source table {table} is missing columns: {', '.join(sorted(missing))}"
                    )

                for values in parse_insert_rows(line):
                    row = _row(schemas[table], values, table)
                    counts[table] += 1
                    if table == "concepto":
                        concept_code = _code(row.get("CODI_27"))
                        if concept_code is None:
                            raise ExtractionError("concepto.CODI_27 cannot be null")
                        if concept_code in concepts:
                            raise ExtractionError(f"Duplicate concepto.CODI_27: {concept_code}")
                        concepts[concept_code] = {
                            "name": _text(row.get("DETA_15")),
                            "calculationClass": _code(row.get("CALC_15")),
                            "typeCode": _code(row.get("TIPO_15")),
                            "abbreviation": _text(row.get("ABRE_15")),
                            "sourceTotalCode": _code(row.get("TOTA_15")),
                        }
                    elif table == "histocal":
                        company_code = _code(row.get("CODI_01"))
                        payroll_date = _code(row.get("FECA_31"))
                        source_period = _code(row.get("PERI_31"))
                        source_month = _code(row.get("MES_31"))
                        payroll_type = _code(row.get("TIPO_31"))
                        if None in (company_code, payroll_date, source_period, source_month, payroll_type):
                            raise ExtractionError("histocal payroll key cannot contain null values")
                        if not _valid_payroll_date(payroll_date):
                            invalid_payroll_run_dates[payroll_date or "<null>"] += 1
                            continue
                        closure_flag = _integer(row.get("CIER_31"), "histocal.CIER_31")
                        if closure_flag not in (None, 1):
                            raise ExtractionError(
                                f"Unexpected histocal.CIER_31 value: {closure_flag!r}"
                            )
                        closure_status = (
                            "closed" if closure_flag == 1
                            else ("open" if payroll_date == EXPECTED_CURRENT_PAYROLL_DATE else "unknown")
                        )
                        run_key = (
                            company_code, payroll_date, source_period, source_month, payroll_type
                        )
                        if run_key in payroll_run_keys:
                            raise ExtractionError(f"Duplicate histocal key: {run_key}")
                        payroll_run_keys.add(run_key)
                        payroll_run_statuses[closure_status] += 1
                        if closure_status == "closed" and (
                            latest_closed_payroll_date is None
                            or payroll_date > latest_closed_payroll_date
                        ):
                            latest_closed_payroll_date = payroll_date
                        writers["payrollRuns"].write({
                            "sourceKey": {
                                "companyCode": company_code,
                                "payrollDate": payroll_date,
                                "period": int(source_period),
                                "month": int(source_month),
                                "payrollType": payroll_type,
                            },
                            "closureStatus": closure_status,
                            "sourceClosureFlag": closure_flag,
                            "sourceDateIg": _code(row.get("fechaIG")),
                            "executivePublishable": closure_status == "closed",
                        })
                    elif table == "legajo":
                        employees[_employee_key(row)] = {
                            "hireDate": _code(row.get("FING_12")),
                            "exitDate": _code(row.get("FEGR_12")),
                        }
                    elif table == "histolegajo":
                        key = _employee_key(row)
                        payroll_date = _code(row.get("FECA_31"))
                        if payroll_date is None:
                            raise ExtractionError("histolegajo.FECA_31 cannot be null")
                        snapshot_keys.add(key)
                        snapshot_dates[payroll_date] += 1
                        writers["payrollSnapshot"].write({
                            "sourceKey": {
                                "id": _code(row.get("ID")),
                                "companyCode": key[0],
                                "employeeNumber": key[1],
                            },
                            "payrollDate": payroll_date,
                            "period": _integer(row.get("PERI_31"), "histolegajo.PERI_31"),
                            "month": _integer(row.get("MES_31"), "histolegajo.MES_31"),
                            "payrollType": _code(row.get("TIPO_31")),
                            "agreement": {
                                "id": _code(row.get("IDCONVENIO")),
                                "name": _text(row.get("CONVENIO")),
                            },
                            "category": _text(row.get("CATEGORIA")),
                            "role": _text(row.get("CARGO")),
                            "budget": {
                                "structure": _text(row.get("ESTRUCTURAPRESU")),
                                "detail": _text(row.get("PRESUDETALLE")),
                                "account": _text(row.get("CUENTA")),
                            },
                            "organization": {
                                "departmentId": _code(row.get("IDREPARTICION")),
                                "department": _text(row.get("REPARTICION")),
                                "area": _text(row.get("AREA")),
                            },
                        })
                    elif table == "legamov":
                        key = _employee_key(row)
                        year = _integer(row.get("ANO_30"), "legamov.ANO_30")
                        month = _integer(row.get("MES_30"), "legamov.MES_30")
                        source_key = (
                            key[0], _code(row.get("ANO_30")) or "", _code(row.get("MES_30")) or "",
                            _code(row.get("TIPO_31")) or "", key[1], _code(row.get("CODI_27")) or "",
                            _code(row.get("CODI_06")) or "",
                        )
                        if source_key in movement_keys:
                            duplicate_movement_keys += 1
                        else:
                            movement_keys.add(source_key)
                        if not _valid_movement_year(year):
                            invalid_movement_years[str(year)] += 1
                            continue
                        writers["movements"].write({
                            "sourceKey": {
                                "companyCode": key[0], "year": year, "month": month,
                                "payrollType": _code(row.get("TIPO_31")),
                                "employeeNumber": key[1], "conceptCode": _code(row.get("CODI_27")),
                                "costCenterCode": _code(row.get("CODI_06")),
                            },
                            "quantity": _code(row.get("cant_30")),
                            "installment": _code(row.get("CUOT_30")),
                            "automatic": _code(row.get("AUTO_30")),
                            "adjustment": _code(row.get("AJUS_30")),
                            "forced": _code(row.get("FORZ_30")),
                            "legalInstrument": _text(row.get("NRO_INSTRUMENTO_LEGAL")),
                            "movementType": _text(row.get("TIPO_MOVIMIENTO")),
                            "status": _text(row.get("ESTADO")),
                        })
                    elif table == "calculo":
                        key = _employee_key(row)
                        payroll_date = _code(row.get("FECA_31"))
                        if not _valid_payroll_date(payroll_date):
                            invalid_calculation_dates[payroll_date or "<null>"] += 1
                            continue
                        assert payroll_date is not None
                        if payroll_date > last_payroll.get(key, ""):
                            last_payroll[key] = payroll_date
                        monthly_key = (
                            key[0], key[1], payroll_date, _code(row.get("PERI_31")) or "",
                            _code(row.get("MES_31")) or "", _code(row.get("TIPO_31")) or "",
                        )
                        aggregate = monthly.setdefault(monthly_key, {
                            "itemCount": 0,
                            "quantitySum": Decimal(0),
                            "technicalSourceAmountSum": Decimal(0),
                            "agreementCounts": Counter(),
                            "sectorCounts": Counter(),
                            "conceptCodes": set(),
                            "sourceTotals": {
                                field: Decimal(0) for field in PAYROLL_TOTAL_CONCEPTS.values()
                            },
                            "sourceTotalPresence": set(),
                        })
                        concept_code = _code(row.get("CODI_27")) or "<null>"
                        amount = _decimal(row.get("IMPO_31"), "calculo.IMPO_31")
                        calculation_concept_codes.add(concept_code)
                        aggregate["itemCount"] += 1
                        aggregate["quantitySum"] += _decimal(row.get("CANT_31"), "calculo.CANT_31")
                        aggregate["technicalSourceAmountSum"] += amount
                        if _code(row.get("IMPO_31")) is None:
                            calculation_null_amounts += 1
                        aggregate["agreementCounts"][_code(row.get("CODI_02")) or "<null>"] += 1
                        aggregate["sectorCounts"][_code(row.get("CODI_07")) or "<null>"] += 1
                        aggregate["conceptCodes"].add(concept_code)
                        source_total_field = PAYROLL_TOTAL_CONCEPTS.get(concept_code)
                        if source_total_field:
                            aggregate["sourceTotals"][source_total_field] += amount
                            aggregate["sourceTotalPresence"].add(source_total_field)

        source_sha256 = source_hasher.hexdigest().upper()
        missing_tables = sorted(set(EXPECTED_COUNTS) - set(schemas))
        if missing_tables:
            raise ExtractionError(f"Required tables not found: {', '.join(missing_tables)}")
        if not allow_source_drift:
            if source_sha256 != EXPECTED_SOURCE_SHA256:
                raise ExtractionError(
                    f"Unexpected GRH SHA-256: {source_sha256}; expected {EXPECTED_SOURCE_SHA256}"
                )
            mismatches = {
                table: {"expected": expected, "actual": counts[table]}
                for table, expected in EXPECTED_COUNTS.items()
                if counts[table] != expected
            }
            if mismatches:
                raise ExtractionError(f"Source count mismatch: {json.dumps(mismatches)}")
        if duplicate_movement_keys:
            raise ExtractionError(f"Duplicate legamov keys found: {duplicate_movement_keys}")
        unknown_calculation_concepts = sorted(calculation_concept_codes - set(concepts))
        if unknown_calculation_concepts:
            raise ExtractionError(
                f"calculo references unknown concepto codes: {unknown_calculation_concepts[:20]}"
            )
        for concept_code, output_field in PAYROLL_TOTAL_CONCEPTS.items():
            concept = concepts.get(concept_code)
            if concept is None or concept.get("typeCode") != "9":
                raise ExtractionError(
                    f"Payroll source total {concept_code}/{output_field} is missing or not type 9"
                )
        if set(snapshot_dates) != {EXPECTED_CURRENT_PAYROLL_DATE}:
            raise ExtractionError(f"Unexpected histolegajo dates: {dict(snapshot_dates)}")
        monthly_run_keys = {
            (key[0], key[2], key[3], key[4], key[5]) for key in monthly
        }
        missing_payroll_runs = sorted(monthly_run_keys - payroll_run_keys)
        if missing_payroll_runs:
            raise ExtractionError(
                f"calculo contains {len(missing_payroll_runs)} valid run keys absent from histocal: "
                f"{missing_payroll_runs[:5]}"
            )
        if latest_closed_payroll_date != "2026-07-31":
            raise ExtractionError(
                f"Unexpected latest closed payroll date: {latest_closed_payroll_date}"
            )

        for writer in writers.values():
            writer.close()

        monthly_writer = JsonArrayWriter(temp_paths["payrollMonthly"])
        month_mismatch_groups = 0
        month_mismatch_items = 0
        period_mismatch_groups = 0
        period_mismatch_items = 0
        for key in sorted(monthly):
            aggregate = monthly[key]
            source_month_matches_date = int(key[4]) == int(key[2][5:7])
            source_period_matches_date = int(key[3]) == int(key[2][:4])
            if not source_month_matches_date:
                month_mismatch_groups += 1
                month_mismatch_items += aggregate["itemCount"]
            if not source_period_matches_date:
                period_mismatch_groups += 1
                period_mismatch_items += aggregate["itemCount"]
            source_totals = {
                field: _decimal_text(aggregate["sourceTotals"][field])
                for field in sorted(aggregate["sourceTotalPresence"])
            }
            payroll_record = {
                "sourceKey": {
                    "companyCode": key[0], "employeeNumber": key[1], "payrollDate": key[2],
                    "period": int(key[3]), "month": int(key[4]), "payrollType": key[5],
                },
                "itemCount": aggregate["itemCount"],
                "quantitySum": _decimal_text(aggregate["quantitySum"]),
                "technicalSourceAmountSum": _decimal_text(aggregate["technicalSourceAmountSum"]),
                "sourceTotals": source_totals,
                "dominantAgreementCode": aggregate["agreementCounts"].most_common(1)[0][0],
                "dominantSectorCode": aggregate["sectorCounts"].most_common(1)[0][0],
                "distinctConcepts": len(aggregate["conceptCodes"]),
            }
            quality_flags = []
            if not source_month_matches_date:
                quality_flags.append("SOURCE_MONTH_MISMATCH")
            if not source_period_matches_date:
                quality_flags.append("SOURCE_PERIOD_MISMATCH")
            if quality_flags:
                payroll_record["qualityFlags"] = quality_flags
            monthly_writer.write(payroll_record)
        monthly_writer.close()

        current_keys = {key for key in snapshot_keys if key in employees}
        liquidated_orphans = snapshot_keys - set(employees)
        if liquidated_orphans:
            raise ExtractionError(f"histolegajo contains {len(liquidated_orphans)} unknown legajos")
        reconciliation_writer = JsonArrayWriter(temp_paths["employmentReconciliation"])
        reconciliation_counts: Counter[str] = Counter()
        active_keys: set[tuple[str, str]] = set()
        for key, employee in sorted(employees.items()):
            administrative_active = employee["exitDate"] is None
            if administrative_active:
                active_keys.add(key)
            liquidated_current = key in current_keys
            status = _classify_reconciliation(
                administrative_active, liquidated_current, last_payroll.get(key)
            )
            reconciliation_counts[status] += 1
            reconciliation_writer.write({
                "sourceKey": {"companyCode": key[0], "employeeNumber": key[1]},
                "administrativeActive": administrative_active,
                "liquidatedCurrent": liquidated_current,
                "lastPayrollDate": last_payroll.get(key),
                "evidenceStatus": status,
                "hireDate": employee["hireDate"],
                "exitDate": employee["exitDate"],
            })
        reconciliation_writer.close()

        active_liquidated = active_keys & current_keys
        active_not_liquidated = active_keys - current_keys
        liquidated_not_active = current_keys - active_keys
        if liquidated_not_active:
            raise ExtractionError(
                f"Current payroll contains {len(liquidated_not_active)} administratively inactive legajos"
            )

        for name, filename in OUTPUT_FILES.items():
            temp_paths[name].replace(output_dir / filename)

        outputs: dict[str, Any] = {}
        output_counts = {
            "payrollRuns": len(payroll_run_keys),
            "payrollSnapshot": len(snapshot_keys),
            "movements": counts["legamov"] - sum(invalid_movement_years.values()),
            "payrollMonthly": len(monthly),
            "employmentReconciliation": len(employees),
        }
        for name, filename in OUTPUT_FILES.items():
            path = output_dir / filename
            outputs[name] = {
                "file": filename,
                "records": output_counts[name],
                "bytes": path.stat().st_size,
                "sha256": _sha256(path),
            }

        manifest = {
            "schemaVersion": 1,
            "scriptVersion": SCRIPT_VERSION,
            "profile": PROFILE_NAME,
            "source": {
                "name": SOURCE_NAME,
                "file": source.name,
                "bytes": source.stat().st_size,
                "sha256": source_sha256,
                "currentPayrollDate": EXPECTED_CURRENT_PAYROLL_DATE,
                "currentPayrollClosureStatus": "open",
                "latestClosedPayrollDate": latest_closed_payroll_date,
            },
            "sourceCounts": dict(sorted(counts.items())),
            "outputs": outputs,
            "reconciliation": {
                "administrativeActive": len(active_keys),
                "liquidatedCurrent": len(current_keys),
                "activeAndLiquidated": len(active_liquidated),
                "activeNotLiquidated": len(active_not_liquidated),
                "liquidatedNotActive": len(liquidated_not_active),
                "coveragePercent": round(len(active_liquidated) / len(active_keys) * 100, 2),
                "evidenceStates": dict(sorted(reconciliation_counts.items())),
            },
            "quality": {
                "strictSnapshot": not allow_source_drift,
                "invalidCalculationDatesExcluded": {
                    "records": sum(invalid_calculation_dates.values()),
                    "byDate": dict(sorted(invalid_calculation_dates.items())),
                },
                "invalidPayrollRunDatesExcluded": {
                    "records": sum(invalid_payroll_run_dates.values()),
                    "byDate": dict(sorted(invalid_payroll_run_dates.items())),
                },
                "payrollRunClosure": {
                    "statuses": dict(sorted(payroll_run_statuses.items())),
                    "currentRun": "open",
                    "latestClosedDate": latest_closed_payroll_date,
                    "executiveFinancialRule": "Only closureStatus=closed can feed executive financial KPIs",
                },
                "invalidMovementYearsExcluded": {
                    "records": sum(invalid_movement_years.values()),
                    "byYear": dict(sorted(invalid_movement_years.items())),
                },
                "calculationNullAmountsTreatedAsZero": calculation_null_amounts,
                "payrollPeriodCoherence": {
                    "sourceMonthMismatch": {
                        "groups": month_mismatch_groups,
                        "items": month_mismatch_items,
                    },
                    "sourcePeriodMismatch": {
                        "groups": period_mismatch_groups,
                        "items": period_mismatch_items,
                    },
                },
                "crossSourceJoinByIdPersona": 0,
                "moneySemantics": (
                    "sourceTotals are literal GRH total concepts 990..999 and remain nominal; "
                    "technicalSourceAmountSum mixes detail and total rows and is never a financial KPI; "
                    "no IPC, paritaria or scale normalization"
                ),
            },
            "methodology": [
                "GRH is the employment and payroll source of truth.",
                "The 882/854 difference is reconciled against the open August payroll snapshot; it is an operational control, not a closed financial KPI.",
                "histocal.CIER_31=1 is the only source-level close evidence; July 2026 is the latest closed run and August 2026 remains open.",
                "calculo is reduced to employee/payroll-date/source-period/source-month/type grain; raw items remain in the immutable source dump.",
                "Dates outside 2008-01-01..2026-08-31 are quarantined from analytical outputs.",
                "No PERSONAS identifier is used or joined in this extraction.",
            ],
        }
        manifest_path = output_dir / "grh-core-manifest.json"
        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        return manifest
    except Exception:
        for writer in writers.values():
            writer.abort()
        for path in temp_paths.values():
            path.unlink(missing_ok=True)
        raise


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--grh-sql",
        type=Path,
        default=Path.home() / "Downloads" / "grh_junin_extracted.sql",
    )
    parser.add_argument("--output-dir", type=Path, default=Path("rrhh-data"))
    parser.add_argument(
        "--allow-source-drift",
        action="store_true",
        help="Disable known hash/count gates; accepted only together with --fixture-mode.",
    )
    parser.add_argument(
        "--fixture-mode",
        action="store_true",
        help="Explicitly acknowledge that the input is a test fixture, never an operational backup.",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    if args.allow_source_drift and not args.fixture_mode:
        print(
            "GRH core extraction failed: --allow-source-drift requires --fixture-mode",
            file=sys.stderr,
        )
        return 2
    try:
        manifest = extract(
            args.grh_sql.resolve(), args.output_dir.resolve(),
            allow_source_drift=args.allow_source_drift,
        )
    except (ExtractionError, OSError) as error:
        print(f"GRH core extraction failed: {error}", file=sys.stderr)
        return 1
    print(json.dumps({
        "status": "completed",
        "profile": manifest["profile"],
        "sourceCounts": manifest["sourceCounts"],
        "reconciliation": manifest["reconciliation"],
        "outputs": manifest["outputs"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
