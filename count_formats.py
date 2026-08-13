import sys

copy_count = 0
insert_count = 0

with open(r'C:\Users\guill\Downloads\grh_junin_extracted.sql', 'r', encoding='utf-8', errors='replace') as f:
    for line in f:
        if line.startswith('COPY '):
            copy_count += 1
        elif line.startswith('INSERT INTO '):
            insert_count += 1
            
print(f"COPY count: {copy_count}")
print(f"INSERT count: {insert_count}")
