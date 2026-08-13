import re

with open(r'C:\Users\guill\.gemini\antigravity\scratch\municipio-junin\inserts.sql', 'r', encoding='utf-8', errors='replace') as f:
    for line in f:
        if line.startswith("INSERT INTO `vinculo`"):
            print(line.strip())
        elif line.startswith("INSERT INTO `motivo`"):
            print(line.strip())
        elif line.startswith("INSERT INTO `motause`"):
            print(line.strip()[:200]) # truncated
