import sys

with open(r'C:\Users\guill\.gemini\antigravity\scratch\municipio-junin\inserts.sql', 'r', encoding='utf-8', errors='replace') as f:
    for line in f:
        if "motivo" in line.split(' VALUES ')[0] or "cargo" in line.split(' VALUES ')[0]:
            print(line.split(' VALUES ')[0])
