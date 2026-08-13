import sys
import json

tables_to_extract = ['vinculo', 'motivo', 'motause', 'cargo', 'catego']
data = {t: [] for t in tables_to_extract}

current_table = None

with open(r'C:\Users\guill\Downloads\grh_junin_extracted.sql', 'r', encoding='utf-8', errors='replace') as f:
    for line in f:
        if line.startswith('COPY '):
            parts = line.strip().split(' ')
            table_name = parts[1].replace('`', '')
            if table_name in tables_to_extract:
                current_table = table_name
            else:
                current_table = None
            continue
        
        if current_table:
            if line.strip() == '\\.':
                current_table = None
                continue
            data[current_table].append(line.strip().split('\t'))

with open(r'C:\Users\guill\.gemini\antigravity\scratch\municipio-junin\lookups.json', 'w', encoding='utf-8') as out:
    json.dump(data, out, indent=2, ensure_ascii=False)
