#!/usr/bin/env python3
"""Recover only GRH family keys, exact identity hashes and historical dates.

Never writes to a database. August remains the default; the known September
backup requires explicit selection. Extraction does not publish either source.
Its output contains no names, documents, credentials or sessions.
"""
import argparse
from collections import Counter
from datetime import date
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

import extract_rrhh_curated as curated

DEFAULT_SOURCE_PROFILE = 'grh-junin-2026-08-06'
SOURCE_PROFILE_CHILDREN = {
    DEFAULT_SOURCE_PROFILE: 2684,
    'grh-junin-2026-09-10': 2686,
}


def identity_hash(row):
    values = [curated._as_code(row['CODI_14']), str(int(row['CODI_01'])), curated._as_code(row['LEGA_12']),
              curated._as_text(row['NOMB_14'], collapse=True), curated._as_code(row['SEXO_14']),
              curated._date(row['FENA_14']), curated._as_code(row['NUDO_14']), curated._as_code(row['CUIL_14']),
              curated._as_code(row['IDVINCULO']), curated._date(row['FBAJ_14'])]
    if any(value is not None and '\0' in value for value in values):
        raise ValueError('SOURCE_IDENTITY_CONTROL_CHARACTER')
    return hashlib.sha256(json.dumps(values, ensure_ascii=False, separators=(', ', ': ')).encode('utf-8')).hexdigest()


def field_state(fields, key):
    if key not in fields:
        return 'absent'
    raw = fields[key]
    if raw is None:
        return 'null'
    try:
        if isinstance(raw, str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}', raw) and date.fromisoformat(raw).isoformat() == raw and '1900-01-01' <= raw <= '2100-12-31':
            return 'valid'
    except ValueError:
        pass
    return 'invalid'


def extract(source, profile=None):
    profile = profile or curated.load_source_profile(DEFAULT_SOURCE_PROFILE)
    metadata, schemas, records = {}, {}, {'familia': [], 'vinculo': []}
    current, columns, primary = None, [], False
    for line in curated._sql_lines(Path(source), metadata=metadata):
        if line.startswith('CREATE TABLE `'):
            current, columns, primary = line.split('`')[1], [], False
        elif current is not None:
            match = re.match(r'\s*`([^`]+)`\s+', line)
            if match:
                columns.append(match.group(1))
            if current == 'familia' and re.fullmatch(r'\s*PRIMARY KEY \(`CODI_14`\),?\s*', line):
                primary = True
            if line.startswith(') ENGINE='):
                if current in records:
                    if current in schemas or current == 'familia' and not primary:
                        raise ValueError('SOURCE_SCHEMA_INVALID')
                    schemas[current] = columns[:]
                current = None
        table = curated._insert_table(line)
        if table in records:
            if table not in schemas:
                raise ValueError('SOURCE_SCHEMA_REQUIRED')
            for values in curated.parse_insert_rows(line):
                if len(values) != len(schemas[table]):
                    raise ValueError('SOURCE_ROW_WIDTH_MISMATCH')
                records[table].append(dict(zip(schemas[table], values)))
    curated.validate_source_metadata(metadata, profile)
    expected = profile['curated']['expectedCounts']
    if any(len(records[name]) != expected[name] for name in records):
        raise ValueError('SOURCE_ROW_COUNT_MISMATCH')
    for key in ('PRES_14', 'VENC_14'):
        if key not in schemas.get('familia', []):
            raise ValueError('SOURCE_DATE_COLUMN_REQUIRED')
    catalog = [r for r in records['vinculo'] if r['IDVINCULO'] == '2']
    if len(catalog) != 1 or catalog[0]['DETA_46'] != 'HIJO' or catalog[0]['CODI_46'] != 'H':
        raise ValueError('SOURCE_CHILD_CATALOG_MISMATCH')
    families = records['familia']
    if len({r['CODI_14'] for r in families}) != len(families):
        raise ValueError('SOURCE_FAMILY_KEY_DUPLICATED')
    children = [r for r in families if r['IDVINCULO'] == '2']
    rows = []
    for r in children:
        fields = {key: r[key] for key in ('PRES_14', 'VENC_14') if key in r}
        if int(r['CODI_01']) != 101 or not re.fullmatch(r'[1-9][0-9]{0,17}', r['CODI_14'] or ''):
            raise ValueError('SOURCE_CHILD_KEY_INVALID')
        rows.append({'familyId': r['CODI_14'], 'companyId': int(r['CODI_01']), 'legajo': curated._as_code(r['LEGA_12']),
                     'identitySha256': identity_hash(r), 'sourceFields': fields})
    rows.sort(key=lambda r: int(r['familyId']))
    payload = {'version': 'schooling-source-recovery.v1', 'sourceSystem': 'GRH', 'sourceDatabase': metadata['database'],
               'sourceSha256': metadata['sha256'].lower(), 'sourceDeclaredCutoff': metadata['cutoff'], 'rows': rows}
    aggregate = {'version': 'schooling-source-extraction.v1', 'sourceSha256': payload['sourceSha256'],
                 'sourceDeclaredCutoff': metadata['cutoff'], 'sourceRows': len(families), 'children': len(rows),
                 'identityDigest': hashlib.sha256('\n'.join(r['identitySha256'] for r in rows).encode()).hexdigest(),
                 'fields': {key: dict(Counter(field_state(r['sourceFields'], key) for r in rows)) for key in ('PRES_14', 'VENC_14')},
                 'databaseContacted': False, 'namesPersisted': False, 'sourceModified': False}
    return payload, aggregate


def extract_known_source(source, profile_id=DEFAULT_SOURCE_PROFILE):
    """Only reviewed registry profiles may produce an operational recovery file."""
    if profile_id not in SOURCE_PROFILE_CHILDREN:
        raise ValueError('SCHOOLING_SOURCE_PROFILE_UNSUPPORTED')
    profile = curated.load_source_profile(profile_id)
    payload, aggregate = extract(source, profile)
    if aggregate['children'] != SOURCE_PROFILE_CHILDREN[profile_id]:
        raise ValueError('SOURCE_PROFILE_COHORT_COUNT_MISMATCH')
    # Profile expectations come only from versioned code, never from the dump.
    # The payload shape and its exact source hash/cutoff remain unchanged.
    aggregate['sourceProfileId'] = profile_id
    return payload, aggregate


def private_directory(directory):
    directory = Path(directory)
    if not directory.is_absolute() or directory.exists():
        raise ValueError('NEW_ABSOLUTE_PRIVATE_OUTPUT_DIRECTORY_REQUIRED')
    directory.mkdir(parents=True, mode=0o700)
    if os.name == 'nt':
        user = subprocess.check_output(['whoami'], text=True).strip()
        result = subprocess.run(['icacls', str(directory), '/inheritance:r', '/grant:r', f'{user}:(OI)(CI)F', '*S-1-5-18:(OI)(CI)F'], capture_output=True)
        if result.returncode:
            raise ValueError('PRIVATE_OUTPUT_ACL_FAILED')
    else:
        directory.chmod(0o700)
    return directory


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True)
    parser.add_argument('--output-dir', required=True)
    parser.add_argument('--profile', choices=tuple(SOURCE_PROFILE_CHILDREN), default=DEFAULT_SOURCE_PROFILE)
    args = parser.parse_args()
    payload, aggregate = extract_known_source(Path(args.source), args.profile)
    directory = private_directory(args.output_dir)
    data = (json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')
    aggregate['payloadSha256'] = hashlib.sha256(data).hexdigest()
    for name, content in [('source-schooling.private.json', data), ('extraction-report.json', (json.dumps(aggregate, indent=2) + '\n').encode())]:
        fd = os.open(directory / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'wb') as handle:
            handle.write(content)
    print(json.dumps(aggregate))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # Source parser errors can contain raw source values: keep them private.
        raise SystemExit('SCHOOLING_SOURCE_EXTRACTION_FAILED')
