import re
import json

def parse_tuples(line):
    # This is a naive parser for SQL INSERT values like (1,'A',NULL),(2,'B','C')
    # It removes the INSERT INTO ... VALUES part and parses the rest.
    start = line.find(' VALUES ')
    if start == -1: return []
    values_str = line[start + 8:].strip()
    if values_str.endswith(';'): values_str = values_str[:-1]
    
    tuples = []
    in_str = False
    escape = False
    current_tuple = []
    current_val = ''
    in_tuple = False
    
    for char in values_str:
        if in_str:
            if escape:
                current_val += char
                escape = False
            elif char == '\\':
                escape = True
            elif char == "'":
                in_str = False
                current_val += char
            else:
                current_val += char
        else:
            if char == "'":
                in_str = True
                current_val += char
            elif char == '(':
                in_tuple = True
                current_tuple = []
                current_val = ''
            elif char == ')':
                in_tuple = False
                current_tuple.append(current_val.strip())
                current_val = ''
                tuples.append(current_tuple)
            elif char == ',':
                if in_tuple:
                    current_tuple.append(current_val.strip())
                    current_val = ''
            else:
                current_val += char
                
    return tuples

vinculos = {}
categorias = {}
cargos = {}
motause = {}
motivos = {}

familiares = {}
fojas = {}
licencias = {}
ausencias = {}

with open(r'C:\Users\guill\.gemini\antigravity\scratch\municipio-junin\inserts.sql', 'r', encoding='utf-8', errors='replace') as f:
    for line in f:
        if line.startswith("INSERT INTO `vinculo`"):
            for t in parse_tuples(line):
                if len(t) >= 4:
                    # CODI_46, DETA_46, VINC_46, IDVINCULO
                    id_v = t[3]
                    desc = t[1].strip("'")
                    vinculos[id_v] = desc
        elif line.startswith("INSERT INTO `motivo`"):
            for t in parse_tuples(line):
                if len(t) >= 2:
                    motivos[t[0]] = t[1].strip("'")
        elif line.startswith("INSERT INTO `motause`"):
            for t in parse_tuples(line):
                if len(t) >= 2:
                    motause[t[0]] = t[1].strip("'")
        elif line.startswith("INSERT INTO `cargo`"):
            for t in parse_tuples(line):
                if len(t) >= 2:
                    cargos[t[0]] = t[1].strip("'")
        elif line.startswith("INSERT INTO `catego`"):
            for t in parse_tuples(line):
                if len(t) >= 3:
                    categorias[t[0] + '-' + t[1]] = t[2].strip("'")

# Print what we found
print(f"Vinculos: {len(vinculos)}")
print(f"Motivos: {len(motivos)}")
print(f"Motause: {len(motause)}")
print(f"Cargos: {len(cargos)}")
print(f"Categorias: {len(categorias)}")
