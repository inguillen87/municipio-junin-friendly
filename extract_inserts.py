import sys

tables = {'vinculo', 'motivo', 'motause', 'cargo', 'catego', 'familia', 'foja', 'licencia', 'ausencia'}

with open(r'C:\Users\guill\Downloads\grh_junin_extracted.sql', 'r', encoding='utf-8', errors='replace') as f:
    with open(r'C:\Users\guill\.gemini\antigravity\scratch\municipio-junin\inserts.sql', 'w', encoding='utf-8') as out:
        for line in f:
            if line.startswith('INSERT INTO '):
                # Extract table name
                # INSERT INTO `table` VALUES ...
                parts = line.split('`')
                if len(parts) >= 2:
                    table_name = parts[1]
                    if table_name in tables:
                        out.write(line)
