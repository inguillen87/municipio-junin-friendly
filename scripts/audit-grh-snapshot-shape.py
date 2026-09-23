#!/usr/bin/env python3
"""Read-only, aggregate preflight for GRH multi-run snapshots. Never promotes a source."""
from __future__ import annotations
import argparse
from collections import Counter
from datetime import date, datetime
import json
from pathlib import Path
import re
from typing import Any
from extract_rrhh_curated import _sql_lines
from extract_grh_core import parse_insert_rows, _row, _code

REQUIRED = {
    'legajo': {'CODI_01', 'LEGA_12', 'FEGR_12'},
    'histolegajo': {'ID', 'CODI_01', 'LEGA_12', 'FECA_31', 'PERI_31', 'MES_31', 'TIPO_31'},
    'histocal': {'CODI_01', 'FECA_31', 'PERI_31', 'MES_31', 'TIPO_31', 'CIER_31'},
}
class AuditError(ValueError):
    """Stable, non-identifying diagnostic code."""

def iso_date(value: str | None) -> str:
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
        raise AuditError('SOURCE_DATE_INVALID')
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError:
        raise AuditError('SOURCE_DATE_INVALID') from None

def contract(row: dict[str, Any]) -> tuple[str, str]:
    values = tuple(_code(row.get(k)) for k in ('CODI_01', 'LEGA_12'))
    if None in values:
        raise AuditError('SOURCE_CONTRACT_KEY_INVALID')
    return values

def run_key(row: dict[str, Any]) -> tuple[str, str, int, int, str]:
    try:
        company = _code(row['CODI_01'])
        period, month = int(row['PERI_31']), int(row['MES_31'])
        kind = _code(row['TIPO_31'])
        if not company or not 0 <= period <= 999999999 or not 0 <= month <= 999999999 or not re.fullmatch('[A-Z]', kind or ''):
            raise ValueError()
        return company, iso_date(row['FECA_31']), period, month, kind
    except (ValueError, TypeError, KeyError):
        raise AuditError('SOURCE_RUN_KEY_INVALID') from None

def audit_snapshot(source: Path, expected_sha256: str | None = None) -> dict[str, Any]:
    schemas: dict[str, list[str]] = {}
    rows: dict[str, list[dict[str, Any]]] = {name: [] for name in REQUIRED}
    current = None
    metadata: dict[str, Any] = {}
    for line in _sql_lines(source, metadata=metadata):
        match = re.match(r'CREATE TABLE `([^`]+)`', line)
        if match:
            current = match.group(1) if match.group(1) in REQUIRED else None
            if current:
                if current in schemas:
                    raise AuditError('SOURCE_SCHEMA_DUPLICATE')
                schemas[current] = []
        elif current and line.startswith(') ENGINE='):
            current = None
        elif current:
            column = re.match(r'\s*`([^`]+)`\s+', line)
            if column:
                schemas[current].append(column.group(1))
        insert = re.match(r'INSERT INTO `([^`]+)`', line)
        if insert and insert.group(1) in REQUIRED:
            name = insert.group(1)
            if not REQUIRED[name].issubset(set(schemas.get(name, []))):
                raise AuditError('SOURCE_SCHEMA_INCOMPATIBLE')
            for values in parse_insert_rows(line):
                if len(rows[name]) >= 100000:
                    raise AuditError('SOURCE_DOMAIN_SIZE_LIMIT')
                full = _row(schemas[name], values, name)
                rows[name].append({k: full[k] for k in REQUIRED[name]})
    if set(schemas) != set(REQUIRED) or any(not REQUIRED[k].issubset(schemas[k]) for k in REQUIRED):
        raise AuditError('SOURCE_SCHEMA_INCOMPATIBLE')
    if metadata.get('database') != 'grh_junin' or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}', metadata.get('cutoff') or ''):
        raise AuditError('SOURCE_COMPLETION_INVALID')
    try:
        datetime.fromisoformat(metadata['cutoff'])
    except ValueError:
        raise AuditError('SOURCE_COMPLETION_INVALID') from None
    if expected_sha256 and metadata['physicalSha256'] != expected_sha256.upper():
        raise AuditError('SOURCE_HASH_MISMATCH')
    employees = {contract(r): r for r in rows['legajo']}
    if len(employees) != len(rows['legajo']):
        raise AuditError('SOURCE_CONTRACT_DUPLICATE')
    active = {key for key, row in employees.items() if _code(row['FEGR_12']) is None}
    cohort_counts: Counter = Counter()
    contract_counts: Counter = Counter()
    source_ids, assignments = set(), set()
    for row in rows['histolegajo']:
        key, run, identity = contract(row), run_key(row), _code(row['ID'])
        assignment = (key, run)
        if identity is None or identity in source_ids or assignment in assignments:
            raise AuditError('SOURCE_SNAPSHOT_DUPLICATE')
        source_ids.add(identity); assignments.add(assignment)
        contract_counts[key] += 1; cohort_counts[run] += 1
    if not cohort_counts:
        raise AuditError('SOURCE_SNAPSHOT_EMPTY')
    current_date = max(k[1] for k in cohort_counts)
    closure_by_type: dict[str, str] = {}
    current_runs = []
    run_keys = set()
    invalid_dates = 0
    period_mismatch = month_mismatch = 0
    for row in rows['histocal']:
        try:
            dt = iso_date(row['FECA_31'])
        except AuditError:
            invalid_dates += 1; continue
        if not '2008-01-01' <= dt <= current_date:
            invalid_dates += 1; continue
        key = run_key(row)
        if key in run_keys:
            raise AuditError('SOURCE_PAYROLL_RUN_DUPLICATE')
        run_keys.add(key)
        period_mismatch += key[2] != int(dt[:4])
        month_mismatch += key[3] != int(dt[5:7])
        flag = _code(row['CIER_31'])
        if flag not in (None, '1'):
            raise AuditError('SOURCE_CLOSURE_FLAG_UNKNOWN')
        state = 'closed' if flag == '1' else 'open' if dt == current_date else 'unknown'
        if state == 'closed':
            closure_by_type[key[4]] = max(dt, closure_by_type.get(key[4], dt))
        if dt == current_date:
            current_runs.append({'period': key[2], 'month': key[3], 'type': key[4], 'date': dt, 'closureStatus': state})
    snapshot_keys = set(contract_counts)
    blockers = []
    if len(cohort_counts) > 1: blockers.append('MULTIPLE_SNAPSHOT_COHORTS')
    repeated = sum(n - 1 for n in contract_counts.values())
    if repeated: blockers.append('REPEATED_CONTRACT_ACROSS_RUNS')
    if len({r['closureStatus'] for r in current_runs}) > 1: blockers.append('MIXED_CURRENT_RUN_CLOSURES')
    if snapshot_keys - set(employees): blockers.append('SNAPSHOT_CONTRACT_NOT_FOUND')
    if snapshot_keys - active: blockers.append('SNAPSHOT_CONTRACT_NOT_ADMINISTRATIVELY_ACTIVE')
    if not current_runs: blockers.append('CURRENT_PAYROLL_RUN_NOT_FOUND')
    if any(key not in run_keys for key in cohort_counts): blockers.append('SNAPSHOT_RUN_NOT_FOUND')
    return {
        'version': 'grh-snapshot-shape-audit.v1', 'source': metadata,
        'counts': {name: len(value) for name, value in rows.items()},
        'snapshot': {'records': len(rows['histolegajo']), 'distinctContracts': len(snapshot_keys),
                     'repeatedContractRows': repeated,
                     'cohorts': [{'date': k[1], 'period': k[2], 'month': k[3], 'type': k[4], 'records': n}
                                 for k, n in sorted(cohort_counts.items())]},
        'reconciliation': {'administrativeActive': len(active), 'snapshotContracts': len(snapshot_keys),
                           'activeInSnapshot': len(active & snapshot_keys), 'activeNotInSnapshot': len(active - snapshot_keys),
                           'snapshotNotActive': len(snapshot_keys - active), 'snapshotOrphans': len(snapshot_keys - set(employees))},
        'currentRuns': sorted(current_runs, key=lambda r: (r['date'], r['period'], r['month'], r['type'])),
        'latestClosedByType': dict(sorted(closure_by_type.items())),
        'invalidOrOutOfScopeRunDates': invalid_dates,
        'historicalSourceCoherence': {'periodDateMismatchRuns': period_mismatch, 'monthDateMismatchRuns': month_mismatch, 'valuesCorrected': 0},
        'legacySingleCohortShapeCompatible': not blockers, 'blockers': blockers,
        'productionImportAuthorized': False, 'databaseWrites': 0,
        'privacy': 'Aggregate only; no names, contract numbers, salary amounts or source row values.',
        'scope': 'Shape preflight only. Neither complete import validation, administrative approval nor payment evidence.',
    }

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--sha256', help='Expected physical file SHA-256, distinct from logical SQL SHA-256.')
    args = parser.parse_args()
    try:
        if args.sha256 and not re.fullmatch('[a-fA-F0-9]{64}', args.sha256):
            raise AuditError('SOURCE_HASH_INVALID')
        if args.output.resolve() == args.input.resolve():
            raise AuditError('OUTPUT_MUST_NOT_REPLACE_SOURCE')
        result = audit_snapshot(args.input, args.sha256)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps({'auditCompleted': True, 'blockers': result['blockers'], 'productionImportAuthorized': False}))
        return 0
    except Exception as error:
        # Upstream parsers may mention data: never echo their messages or input paths.
        print(json.dumps({'auditCompleted': False, 'code': str(error) if isinstance(error, AuditError) else 'SOURCE_AUDIT_FAILED'}))
        return 1

if __name__ == '__main__':
    raise SystemExit(main())
