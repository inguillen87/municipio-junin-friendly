import sys

with open(r'C:\Users\guill\Downloads\grh_junin_extracted.sql', 'r', encoding='utf-8', errors='replace') as f:
    for i, line in enumerate(f):
        if line.startswith('COPY ') or line.startswith('INSERT INTO '):
            print(line.strip())
            break
