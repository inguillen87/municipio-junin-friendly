#!/usr/bin/env python3
"""Local read-only extraction. Private output; no SQL execution or network.
Never run a real municipal dump in public CI or commit the generated data.
"""
import argparse, collections, datetime, gzip, hashlib, json, os, pathlib, re

def tuples(text):
    i=0; size=len(text)
    while i<size:
        while i<size and text[i] in ' ,;\r\n\t': i+=1
        if i==size:return
        if text[i]!='(':raise ValueError('Unsupported INSERT tuple')
        i+=1;row=[]
        while True:
            while i<size and text[i].isspace():i+=1
            if i>=size:raise ValueError('Truncated tuple')
            if text[i]=="'":
                i+=1;v=[]
                while i<size:
                    c=text[i];i+=1
                    if c=='\\':
                        if i==size:raise ValueError('Truncated escape')
                        x=text[i];i+=1;v.append({'n':'\n','r':'\r','t':'\t','0':'\0','Z':'\x1a'}.get(x,x))
                    elif c=="'":
                        if i<size and text[i]=="'":v.append("'");i+=1
                        else:break
                    else:v.append(c)
                else:raise ValueError('Unclosed string')
                value=''.join(v)
            else:
                start=i
                while i<size and text[i] not in ',)':i+=1
                value=text[start:i].strip();value=None if value=='NULL' else value
            row.append(value)
            while i<size and text[i].isspace():i+=1
            if i==size:raise ValueError('Truncated tuple')
            if text[i]==')':i+=1;yield row;break
            if text[i]!=',':raise ValueError('Unsupported delimiter')
            i+=1

def extract(source,out,first,last,company):
    for v in (first,last):datetime.date.fromisoformat(v+'-01')
    if first>last:raise ValueError('Invalid period')
    h=hashlib.sha256()
    with open(source,'rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    sha=h.hexdigest();concepts={};runs={};groups=collections.defaultdict(list);footer=None;database=None
    with gzip.open(source,'rt',encoding='utf-8',errors='strict') as f:
        for line in f:
            if line.startswith('-- Host:') and 'Database:' in line:database=line.split('Database:',1)[1].strip()
            if line.startswith('-- Dump completed on '):footer=line.strip()[21:]
            match=re.match(r'^INSERT INTO `(calculo|concepto|histocal)` VALUES (.*);\s*$',line)
            if not match:
                if re.match(r'^INSERT INTO `(calculo|concepto|histocal)`',line):raise ValueError('Unsupported multiline/column INSERT')
                continue
            table=match[1]
            if table=='calculo':
                for chunk in match[2][1:-1].split('),('):
                    values=chunk.split(',')
                    if len(values)!=13:raise ValueError('calculo shape changed')
                    row=[None if s=='NULL' else s.strip("'") for s in values]
                    if row[0]!=company or not first<=row[3][:7]<=last:continue
                    for k in [0,1,2,5,6,9,10,11,12]:
                        if row[k] is not None and not re.fullmatch(r'\d+',row[k]):raise ValueError('Unexpected integer')
                    for k in [7,8]:
                        if row[k] is not None and not re.fullmatch(r'-?\d+\.\d{2}',row[k]):raise ValueError('Unexpected decimal')
                    datetime.date.fromisoformat(row[3])
                    if not re.fullmatch('[A-Z]',row[4]):raise ValueError('Unexpected type')
                    groups[tuple(row[:5])].append(row)
            elif table=='concepto':
                for r in tuples(match[2]):
                    if len(r)!=11:raise ValueError('concepto shape changed')
                    if r[0] in concepts:raise ValueError('Repeated concept')
                    concepts[r[0]]=dict(code=r[0],description=r[1],shortDescription=r[6],calculationClass=r[2],type=r[3],totalGroup=r[9],unit=r[7])
            else:
                for r in tuples(match[2]):
                    if len(r)!=7:raise ValueError('histocal shape changed')
                    runs[tuple(r[:5])]=r
    if not footer or not database:raise ValueError('Missing dump provenance/footer')
    target=pathlib.Path(out);target.mkdir(mode=0o700,parents=True,exist_ok=True);manifest=[]
    for key,rows in sorted(groups.items()):
        if key not in runs:raise ValueError('Run not found in histocal')
        persons=collections.defaultdict(list);seen=set()
        for r in rows:
            pk=(r[5],r[6])
            if pk in seen:raise ValueError('Duplicate payroll line')
            seen.add(pk);persons[r[5]].append(dict(code=r[6],quantity=r[7],amount=r[8],agreement=r[9],costCenter=r[10],paymentPlace=r[11],sector=r[12]))
        dt=datetime.datetime.fromisoformat(footer);payload=dict(version='payroll-detail-source.v1',sourceSha256=sha,sourceDatabase=database,sourceLabel='Respaldo GRH '+dt.strftime('%d/%m/%Y')+' · cierre del archivo '+dt.strftime('%H:%M:%S')+' (hora declarada)',company=key[0],period=int(key[1]),month=int(key[2]),date=key[3],type=key[4],closedFlag=runs[key][5],concepts=concepts,statements=[dict(legajo=k,lines=sorted(v,key=lambda x:int(x['code']))) for k,v in sorted(persons.items(),key=lambda x:int(x[0]))])
        data=json.dumps(payload,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode();dest=target/(key[3]+'-'+key[4]+'.private.json');dest.write_bytes(data);os.chmod(dest,0o600);manifest.append(dict(date=key[3],type=key[4],lines=len(rows),statements=len(persons),sourceSha256=sha,payloadSha256=hashlib.sha256(data).hexdigest()))
    (target/'manifest-aggregate.json').write_text(json.dumps(manifest,indent=2));return manifest
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--output',required=True);p.add_argument('--from-month',required=True);p.add_argument('--to-month',required=True);p.add_argument('--company',required=True);a=p.parse_args();print(json.dumps(extract(a.source,a.output,a.from_month,a.to_month,a.company),indent=2))
