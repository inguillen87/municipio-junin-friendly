import sys

tables_to_find = {
    'familia', 'vinculo', 'foja', 'motivo', 'licencia', 
    'ausencia', 'motause', 'catego', 'convenio', 'legajo'
}

in_table = False
table_name = ""
output = []

with open(r'C:\Users\guill\Downloads\grh_junin_extracted.sql', 'r', encoding='utf-8', errors='replace') as f:
    for line in f:
        if line.startswith('CREATE TABLE '):
            parts = line.strip().split('`')
            if len(parts) > 1:
                name = parts[1]
                if name in tables_to_find:
                    in_table = True
                    table_name = name
                    output.append(line)
                    continue
        
        if in_table:
            output.append(line)
            if line.strip() == ';' or line.strip().endswith(';'):
                in_table = False
                output.append("\n")

with open(r'C:\Users\guill\.gemini\antigravity\scratch\municipio-junin\schemas.txt', 'w', encoding='utf-8') as out:
    out.writelines(output)
