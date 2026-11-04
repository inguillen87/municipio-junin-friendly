#!/usr/bin/env python3
"""Read-only local extraction of histolegajo from the SAME compressed payroll source.
No SQL execution, network, names, identity documents or monetary data. Private output only.
"""
import argparse, datetime, gzip, hashlib, importlib.util, io, json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('payroll_detail_parser', ROOT / 'extract-grh-payroll-detail.py')
parser = importlib.util.module_from_spec(spec)
spec.loader.exec_module(parser)
REQUIRED = {'histolegajo': {'ID','CODI_01','LEGA_12','FECA_31','PERI_31','MES_31','TIPO_31','CARGO','ESTRUCTURAPRESU','PRESUDETALLE'},
            'histocal': {'CODI_01','FECA_31','PERI_31','MES_31','TIPO_31','CIER_31'}}

def integer(value, minimum=0, maximum=999999999999):
    if not isinstance(value,str) or not re.fullmatch(r'\d{1,12}',value) or not minimum <= int(value) <= maximum:
        raise ValueError('Invalid source integer')
    return int(value)

def text(value):
    if value is None: return None
    if not isinstance(value,str) or len(value)>400 or re.search(r'[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]',value):
        raise ValueError('Invalid position text')
    return value

def run_key(row):
    return tuple(row[k] for k in ['CODI_01','FECA_31','PERI_31','MES_31','TIPO_31'])

def extract(source, expected_sha256, company, expected_database):
    path=pathlib.Path(source)
    if path.stat().st_size>256*1024*1024: raise ValueError('Compressed source exceeds limit')
    compressed=path.read_bytes(); sha=hashlib.sha256(compressed).hexdigest()
    if not re.fullmatch('[a-f0-9]{64}',expected_sha256) or sha!=expected_sha256: raise ValueError('Source hash mismatch')
    integer(company,1); columns={}; creating=None; snapshots={}; runs={}; ids=set(); database=None; footer=None
    logical=hashlib.sha256(); read_bytes=0
    with gzip.GzipFile(fileobj=io.BytesIO(compressed)) as stream:
        while True:
            raw=stream.readline(32*1024*1024+1)
            if not raw: break
            read_bytes+=len(raw);logical.update(raw)
            if len(raw)>32*1024*1024 or read_bytes>2*1024*1024*1024: raise ValueError('Logical source exceeds limit')
            line=raw.decode('utf-8',errors='strict')
            if line.startswith('-- Host:') and 'Database:' in line:
                value=line.split('Database:',1)[1].strip()
                if database is not None and database!=value: raise ValueError('Mixed source databases')
                database=value
            if line.startswith('-- Dump completed on '): footer=line.strip()[21:]
            match=re.match(r'^CREATE TABLE `(histolegajo|histocal)`',line)
            if match:
                creating=match[1]
                if creating in columns: raise ValueError('Repeated table declaration')
                columns[creating]=[];continue
            if creating:
                match=re.match(r'^\s*`([^`]+)`',line)
                if match: columns[creating].append(match[1])
                if line.startswith(')'): creating=None
            match=re.match(r'^INSERT INTO `(histolegajo|histocal)` VALUES (.*);\s*$',line)
            if not match:
                if re.match(r'^INSERT INTO `(histolegajo|histocal)`',line): raise ValueError('Unsupported INSERT form')
                continue
            table=match[1];names=columns.get(table,[])
            if len(names)!=len(set(names)) or not REQUIRED[table].issubset(names): raise ValueError('Source schema mismatch')
            for values in parser.tuples(match[2]):
                if len(values)!=len(names): raise ValueError('Source row shape mismatch')
                row=dict(zip(names,values))
                if row['CODI_01']!=company: continue
                key=run_key(row)
                if table=='histocal':
                    if key in runs: raise ValueError('Duplicate run')
                    runs[key]=row['CIER_31'];continue
                datetime.date.fromisoformat(row['FECA_31']);integer(row['PERI_31'],1900,2100);integer(row['MES_31'],1,12)
                if not re.fullmatch('[A-Z]',row['TIPO_31'] or ''): raise ValueError('Invalid run type')
                integer(row['ID'],1);integer(row['LEGA_12'],1)
                if row['ID'] in ids: raise ValueError('Duplicate snapshot record')
                ids.add(row['ID']);members=snapshots.setdefault(key,{})
                if row['LEGA_12'] in members: raise ValueError('Duplicate snapshot member')
                members[row['LEGA_12']]={'number':row['LEGA_12'],'recordId':row['ID'],'role':text(row['CARGO']),'structure':text(row['ESTRUCTURAPRESU']),'detail':text(row['PRESUDETALLE'])}
                if len(members)>2000 or len(snapshots)>100: raise ValueError('Snapshot limit exceeded')
    if database!=expected_database or not footer or not snapshots: raise ValueError('Missing or unexpected source provenance')
    datetime.datetime.strptime(footer,'%Y-%m-%d %H:%M:%S')
    result=[]
    for key,members in sorted(snapshots.items()):
        if key not in runs or runs[key] not in (None,'0','1'): raise ValueError('Unverified snapshot run')
        result.append({'version':'budget-position-source.v1','sourceSha256':sha,'logicalSha256':logical.hexdigest(),'sourceDatabase':database,'sourceFooter':footer,'sourceTable':'histolegajo','company':company,'date':key[1],'period':int(key[2]),'month':int(key[3]),'type':key[4],'closedFlag':None if runs[key] is None else int(runs[key]),'rows':sorted(members.values(),key=lambda r:(len(r['number']),r['number']))})
    return result

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',required=True);p.add_argument('--source-sha256',required=True)
    p.add_argument('--company',required=True);p.add_argument('--database',required=True);p.add_argument('--output',required=True)
    args=p.parse_args();destination=pathlib.Path(args.output).resolve();repo=ROOT.parent.resolve()
    if destination==repo or repo in destination.parents: p.error('Private output must be outside the repository')
    packages=extract(args.source,args.source_sha256,args.company,args.database)
    destination.mkdir(mode=0o700,parents=True,exist_ok=True);summaries=[]
    for package in packages:
        content=json.dumps(package,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')
        target=destination/(package['date']+'-'+package['type']+'-positions.private.json')
        if target.exists() and target.read_bytes()!=content: raise ValueError('Existing private output differs')
        if not target.exists():
            with target.open('xb') as f: f.write(content)
            target.chmod(0o600)
        summaries.append({'date':package['date'],'type':package['type'],'records':len(package['rows']),'completePositions':sum(all(row[k] not in (None,'') for k in ['role','structure','detail']) for row in package['rows']),'sourceSha256':package['sourceSha256'],'logicalSha256':package['logicalSha256'],'packageSha256':hashlib.sha256(content).hexdigest(),'bytes':len(content)})
    print(json.dumps({'ok':True,'sourceModified':False,'businessWrites':0,'packages':summaries},indent=2))
