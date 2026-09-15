#!/usr/bin/env python3
"""Extract existing GRH banking fields once, privately. No SQL execution or upload."""
import argparse
import datetime
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import runpy

TABLE_FIELDS = {
    'legajo': ['CODI_01', 'LEGA_12', 'IDPERSONA', 'CODI_61', 'TCTA_12', 'NCTA_12', 'cbu_12', 'CBU'],
    'persona': ['IDPERSONA', 'NOMB_12', 'CUIL_12'],
    'banco': ['CODI_61', 'DETA_61', 'codigo_banco'],
    'histolegajo': ['CODI_01', 'LEGA_12', 'PERI_31', 'MES_31', 'TIPO_31', 'FECA_31', 'IDREPARTICION', 'REPARTICION'],
}

def extract(source, expected_sha256, company):
    source = Path(source).resolve(strict=True)
    digest = hashlib.sha256()
    with source.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    if digest.hexdigest() != expected_sha256.lower():
        raise ValueError('BANK_SOURCE_HASH_MISMATCH')
    parse = runpy.run_path(str(Path(__file__).with_name('extract-grh-payroll-detail.py')))['tuples']
    columns, retained = {}, {name: [] for name in TABLE_FIELDS}
    current = None
    database = cutoff = None
    opener = gzip.open if source.suffix == '.gz' else open
    with opener(source, 'rt', encoding='utf-8', errors='strict') as stream:
        for line in stream:
            if line.startswith('-- Host:') and 'Database:' in line:
                database = line.split('Database:', 1)[1].strip()
            if line.startswith('-- Dump completed on '):
                cutoff = datetime.datetime.fromisoformat(line.strip()[21:]).isoformat()
            match = re.match(r'CREATE TABLE `([^`]+)`', line)
            if match:
                current = match[1]
                columns[current] = []
            elif current:
                column = re.match(r'\s*`([^`]+)`\s+', line)
                if column:
                    columns[current].append(column[1])
                if line.startswith(')'):
                    current = None
            match = re.match(r'INSERT INTO `(legajo|persona|banco|histolegajo)` VALUES (.*);\s*$', line)
            if not match:
                if re.match(r'INSERT INTO `(legajo|persona|banco|histolegajo)`', line):
                    raise ValueError('BANK_SOURCE_INSERT_UNSUPPORTED')
                continue
            table = match[1]
            if not set(TABLE_FIELDS[table]).issubset(columns.get(table, [])):
                raise ValueError('BANK_SOURCE_FIELDS_MISSING')
            for values in parse(match[2]):
                if len(values) != len(columns[table]):
                    raise ValueError('BANK_SOURCE_ROW_SHAPE')
                row = dict(zip(columns[table], values))
                retained[table].append({key: row[key] for key in TABLE_FIELDS[table]})
    if database != 'grh_junin' or not cutoff:
        raise ValueError('BANK_SOURCE_PROVENANCE_INVALID')
    people = {row['IDPERSONA']: row for row in retained['persona']}
    if len(people) != len(retained['persona']):
        raise ValueError('BANK_SOURCE_DUPLICATE_IDENTITY')
    employees = []
    for row in retained['legajo']:
        if row['CODI_01'] != company:
            continue
        person = people.get(row['IDPERSONA'], {})
        employees.append(dict(legajo=row['LEGA_12'], name=person.get('NOMB_12'), cuil=person.get('CUIL_12'),
                              bankCode=row['CODI_61'], accountTypeCode=row['TCTA_12'], accountNumber=row['NCTA_12'],
                              cbuLegacy=row['cbu_12'], cbuCurrent=row['CBU']))
    assignments = [dict(legajo=row['LEGA_12'], period=str(row['PERI_31']) + '-' + str(row['MES_31']).zfill(2),
                        date=row['FECA_31'], type=row['TIPO_31'], repartitionCode=row['IDREPARTICION'], repartitionLabel=row['REPARTICION'])
                   for row in retained['histolegajo'] if row['CODI_01'] == company]
    banks = [dict(code=row['CODI_61'], label=row['DETA_61'], routingCode=row['codigo_banco']) for row in retained['banco']]
    if len({row['legajo'] for row in employees}) != len(employees):
        raise ValueError('BANK_SOURCE_DUPLICATE_LEGAJO')
    return dict(version='payroll-bank-source.v1', sourceSha256=digest.hexdigest(), sourceDatabase=database,
                cutoff=cutoff, company=company, banks=banks,
                employees=sorted(employees, key=lambda row: int(row['legajo'])),
                assignments=sorted(assignments, key=lambda row: (row['period'], row['date'], row['type'], int(row['legajo']))))

def write_private(payload, destination):
    target = Path(destination).resolve()
    if not target.is_absolute() or any((parent / '.git').exists() for parent in [target.parent, *target.parents]):
        raise ValueError('BANK_SOURCE_OUTPUT_MUST_BE_OUTSIDE_GIT')
    contents = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        if target.read_bytes() != contents:
            raise ValueError('BANK_SOURCE_OUTPUT_ALREADY_EXISTS')
    else:
        with target.open('xb') as stream:
            stream.write(contents)
        os.chmod(target, 0o600)
    return dict(sourceSha256=payload['sourceSha256'], payloadSha256=hashlib.sha256(contents).hexdigest(),
                cutoff=payload['cutoff'], employees=len(payload['employees']), assignments=len(payload['assignments']), banks=len(payload['banks']))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True)
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--company', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(write_private(extract(args.source, args.expected_sha256, args.company), args.output)))
    except Exception as error:
        code = str(error) if re.fullmatch(r'BANK_SOURCE_[A-Z_]+', str(error)) else 'BANK_SOURCE_EXTRACTION_FAILED'
        raise SystemExit(code)
