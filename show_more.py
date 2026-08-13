import re

with open(r'C:\Users\guill\.gemini\antigravity\scratch\municipio-junin\inserts.sql', 'r', encoding='utf-8', errors='replace') as f:
    for line in f:
        if line.startswith("INSERT INTO `motivo`"):
            print(line.strip()[:200])
        elif line.startswith("INSERT INTO `cargo`"):
            print(line.strip()[:200])
        elif line.startswith("INSERT INTO `catego`"):
            print(line.strip()[:200])
        elif line.startswith("INSERT INTO `foja`"):
            print(line.strip()[:200])
            break
