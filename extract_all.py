import json
import os

def parse_tuples(line):
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

# Lookups
vinculos = {}
motause = {}
categorias = {}
cargos = {}

# Data
familiares = {}
fojas = {}
licencias_ord = {}
licencias_esp = {}

print("Parsing inserts.sql...")
with open('inserts.sql', 'r', encoding='utf-8', errors='replace') as f:
    for line in f:
        if line.startswith("INSERT INTO `vinculo`"):
            for t in parse_tuples(line):
                if len(t) >= 4:
                    id_v = t[3].strip("'")
                    desc = t[1].strip("'")
                    vinculos[id_v] = desc
        elif line.startswith("INSERT INTO `motause`"):
            for t in parse_tuples(line):
                if len(t) >= 2:
                    motause[t[0]] = t[1].strip("'")

# Parse data tables
with open('inserts.sql', 'r', encoding='utf-8', errors='replace') as f:
    for line in f:
        if line.startswith("INSERT INTO `familia`"):
            for t in parse_tuples(line):
                if len(t) >= 13:
                    legajo = t[1].strip("'")
                    nombre = t[2].strip("'").strip()
                    fecha_nac = t[4].strip("'")
                    doc = t[6].strip("'")
                    id_vinc = t[12].strip("'")
                    vinc_name = vinculos.get(id_vinc, id_vinc)
                    
                    if legajo not in familiares:
                        familiares[legajo] = []
                    familiares[legajo].append({
                        "nombre": nombre,
                        "vinculo": vinc_name,
                        "fechaNacimiento": fecha_nac if fecha_nac != 'NULL' else '',
                        "documento": doc if doc != 'NULL' else ''
                    })
        elif line.startswith("INSERT INTO `foja`"):
            for t in parse_tuples(line):
                if len(t) >= 14:
                    legajo = t[1].strip("'")
                    fecha = t[2].strip("'")
                    # index 11: DETA_FJ, index 12: DETA_FJ_ANTERIOR, index 13: MOTI_FJ_DETA
                    deta = t[11].strip("'").strip() if t[11] != 'NULL' else ''
                    deta_ant = t[12].strip("'").strip() if t[12] != 'NULL' else ''
                    moti = t[13].strip("'").strip() if t[13] != 'NULL' else ''
                    
                    if deta_ant and deta:
                        detalle_text = f"{deta_ant} -> {deta}"
                    elif deta:
                        detalle_text = deta
                    elif deta_ant:
                        detalle_text = deta_ant
                    else:
                        detalle_text = ""
                        
                    if not detalle_text and not moti:
                        # use obse_fj if others empty
                        obse = t[5].strip("'")
                        if obse != 'NULL': detalle_text = obse
                        
                    if legajo not in fojas:
                        fojas[legajo] = []
                    fojas[legajo].append({
                        "fecha": fecha if fecha != 'NULL' else '',
                        "detalle": detalle_text,
                        "motivo": moti
                    })
        elif line.startswith("INSERT INTO `licencia`"):
            for t in parse_tuples(line):
                if len(t) >= 14:
                    legajo = t[1].strip("'")
                    fini = t[4].strip("'")
                    ffin = t[5].strip("'")
                    dias = t[13].strip("'")
                    if legajo not in licencias_ord:
                        licencias_ord[legajo] = []
                    licencias_ord[legajo].append({
                        "fecha_inicio": fini if fini != 'NULL' else '',
                        "fecha_fin": ffin if ffin != 'NULL' else '',
                        "dias": dias if dias != 'NULL' else ''
                    })
        elif line.startswith("INSERT INTO `ausencia`"):
            for t in parse_tuples(line):
                if len(t) >= 18: # index 3: motause id, index 2: fecha, index 17: dias
                    legajo = t[1].strip("'")
                    faus = t[2].strip("'")
                    codi_21 = t[3].strip("'")
                    dias = t[17].strip("'")
                    moti_name = motause.get(codi_21, codi_21)
                    if legajo not in licencias_esp:
                        licencias_esp[legajo] = []
                    licencias_esp[legajo].append({
                        "fecha": faus if faus != 'NULL' else '',
                        "motivo": moti_name,
                        "dias": dias if dias != 'NULL' else ''
                    })

print("Loading current enrichment.json...")
enrichment_path = os.path.join('rrhh-data', 'enrichment.json')
with open(enrichment_path, 'r', encoding='utf-8') as f:
    enrichment = json.load(f)

# Update data
enrichment['familiares'] = familiares
enrichment['fojas'] = fojas
enrichment['licencias_ordinarias'] = licencias_ord
enrichment['licencias_especiales'] = licencias_esp

print("Saving fixed enrichment.json...")
with open(enrichment_path, 'w', encoding='utf-8') as f:
    json.dump(enrichment, f, indent=2, ensure_ascii=False)
    
print("Done!")
