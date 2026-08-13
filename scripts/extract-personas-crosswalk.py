#!/usr/bin/env python3
"""Build a reviewed GRH -> PERSONAS identity crosswalk from Junin dumps.

GRH remains authoritative for every employment fact.  PERSONAS is read only as
an auxiliary identity/territory source.  The pipeline deliberately never joins
the databases by ``IDPERSONA``: source identifiers are retained as lineage and
the bridge is resolved from a validated CUIL, or conservatively from DNI plus
supporting identity evidence.

The SQL dumps are processed line-by-line.  PERSONAS domicile rows are scanned a
second time, but only addresses belonging to an already matched PERSONAS record
are retained.  No municipal dump or generated person-level artifact belongs in
Git; the default output directory is covered by the repository ignore rules.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
import os
import re
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Callable, Iterable, Iterator, Mapping, Sequence

from extract_rrhh_curated import ExtractionError, _insert_table, parse_insert_rows


SCRIPT_VERSION = "1.1.0"
POLICY_VERSION = "junin-person-crosswalk-v1"

EXPECTED_SOURCES = {
    "grh_junin": {
        "contentSha256": "CB5C60A0E5DD2462AB7D5E89BA4FE9B7F57B9283AEEB0F89F7C8918730359E92",
        "tables": {"persona": 2_349, "legajo": 2_450},
    },
    "personas_junin": {
        "contentSha256": "7D638D03CF49046C967534164BA380E7282674A21827FC0401F754EBCD95E72B",
        "tables": {
            "persona": 96_777,
            "domicilio": 273_314,
            "localidad": 42,
            "calle": 1_037,
            "barrio": 381,
            "provin": 26,
        },
    },
}

REFERENCE_TIERS = {
    "cuil_unique": 1_432,
    "cuil_duplicate_resolved": 40,
    "dni_unique": 203,
    "dni_duplicate_resolved": 24,
    "ambiguous": 157,
    "unmatched": 493,
}

PLACEHOLDER_BIRTH_DATES = {"1900-01-01", "1992-12-31"}
CUIL_WEIGHTS = (5, 4, 3, 2, 7, 6, 5, 4, 3, 2)
EXPECTED_GRH_PERSONS_WITHOUT_LEGAJO = 24

PERSON_COLUMNS = {
    "IDPERSONA",
    "NOMB_12",
    "SEXO_12",
    "FENA_12",
    "NUDO_12",
    "CUIL_12",
}

GRH_IDENTITY_COLUMNS = PERSON_COLUMNS | {
    "CODI_47",
    "TELE_12",
    "EMIA_12",
    "GSAN_12",
    "CODI_08",
    "IDLOCALIDAD",
    "idcalle",
    "calle",
    "numero",
    "piso",
    "dpto",
    "localidad",
    "DOMI_12",
    "CPOS_12",
    "LUGNAC_12",
}

PERSONAS_AUXILIARY_COLUMNS = PERSON_COLUMNS | {
    "CODI_08",
    "IDLOCALIDAD",
    "IDCALLE",
    "CALLE",
    "NUMERO",
    "PISO",
    "DPTO",
    "IDBARRIO",
    "LOCALIDAD",
    "CPOS_12",
    "domicilioString",
}

DOMICILE_COLUMNS = {
    "id",
    "persona_IDPERSONA",
    "localidad_IDLOCALIDAD",
    "localidadNom",
    "localidadString",
    "calle_IDCALLE",
    "calleNom",
    "calleString",
    "numero",
    "piso",
    "barrio_CODI_BRR",
    "barrioNom",
    "barrioString",
    "provincia_CODI_08",
    "provinciaNom",
    "provinciaString",
    "departamento",
    "departamentoNom",
    "tipo",
    "tipoDomicilio",
    "latitud",
    "longitud",
    "lote",
    "manzana",
    "ubicacion",
    "domicilioString",
}

CATALOG_COLUMNS = {
    "localidad": {"IDLOCALIDAD", "NOMBRE", "ABREV", "CP", "CODI_08"},
    "calle": {"IDCALLE", "DETA_08", "CODI_19"},
    "barrio": {"CODI_BRR", "DESC_BRR", "ABR_BRR", "CP", "idlocalidad"},
    "provin": {"CODI_08", "DETA_08", "ABRE_08", "codigoAFIP"},
}


def _content_lines(path: Path, hasher: Any | None = None) -> Iterator[str]:
    """Yield decompressed physical lines and optionally hash logical SQL bytes."""
    opener = gzip.open if path.name.lower().endswith(".gz") else open
    with opener(path, "rb") as handle:
        for raw_line in handle:
            if hasher is not None:
                hasher.update(raw_line)
            yield raw_line.decode("utf-8", errors="replace")


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


@dataclass
class DumpScan:
    path: Path
    content_sha256: str | None
    container_sha256: str | None
    container_size_bytes: int
    logical_size_bytes: int
    dump_completed_at: str | None
    schemas: dict[str, list[str]]
    source_counts: Counter[str]
    retained: dict[str, list[dict[str, str | None]]]
    decode_replacement_characters: int


def scan_dump(
    path: Path,
    tables: Iterable[str],
    *,
    row_filters: Mapping[str, Callable[[Mapping[str, str | None]], bool]] | None = None,
    calculate_hashes: bool = True,
) -> DumpScan:
    """Scan requested tables without loading the SQL dump as a whole."""
    requested = set(tables)
    filters = dict(row_filters or {})
    schemas: dict[str, list[str]] = {}
    counts: Counter[str] = Counter()
    retained = {table: [] for table in requested}
    current_table: str | None = None
    current_columns: list[str] = []
    completed_at: str | None = None
    replacements = 0
    logical_size = 0
    content_hasher = hashlib.sha256() if calculate_hashes else None

    for line in _content_lines(path, content_hasher):
        logical_size += len(line.encode("utf-8", errors="replace"))
        replacements += line.count("\ufffd")

        if current_table is None:
            create_match = re.match(r"CREATE TABLE `([^`]+)`", line)
            if create_match:
                current_table = create_match.group(1)
                current_columns = []
        else:
            if line.startswith(") ENGINE="):
                schemas.setdefault(current_table, list(current_columns))
                current_table = None
                current_columns = []
            else:
                column_match = re.match(r"\s*`([^`]+)`\s+", line)
                if column_match:
                    current_columns.append(column_match.group(1))

        if line.startswith("-- Dump completed on "):
            completed_at = line.removeprefix("-- Dump completed on ").strip()

        table = _insert_table(line)
        if table not in requested:
            continue
        if table not in schemas:
            raise ExtractionError(f"INSERT for {table} appeared before its schema")
        columns = schemas[table]
        predicate = filters.get(table)
        for values in parse_insert_rows(line):
            if len(values) != len(columns):
                raise ExtractionError(
                    f"Arity mismatch in {table}: expected {len(columns)}, found {len(values)}"
                )
            row = dict(zip(columns, values))
            counts[table] += 1
            if predicate is None or predicate(row):
                retained[table].append(row)

    content_hash = content_hasher.hexdigest().upper() if content_hasher else None
    container_hash = _sha256_file(path) if calculate_hashes and path.name.lower().endswith(".gz") else content_hash
    return DumpScan(
        path=path,
        content_sha256=content_hash,
        container_sha256=container_hash,
        container_size_bytes=path.stat().st_size,
        logical_size_bytes=logical_size,
        dump_completed_at=completed_at,
        schemas=schemas,
        source_counts=counts,
        retained=retained,
        decode_replacement_characters=replacements,
    )


def require_columns(scan: DumpScan, table: str, required: set[str]) -> None:
    actual = set(scan.schemas.get(table, []))
    missing = sorted(required - actual)
    if missing:
        raise ExtractionError(f"{scan.path.name}:{table} is missing columns: {', '.join(missing)}")


def validate_source(
    scan: DumpScan,
    source_system: str,
    tables: Iterable[str],
    *,
    allow_source_drift: bool,
) -> None:
    expected = EXPECTED_SOURCES[source_system]
    missing = sorted(set(tables) - set(scan.schemas))
    if missing:
        raise ExtractionError(f"Missing {source_system} tables: {', '.join(missing)}")
    if allow_source_drift:
        return
    if scan.content_sha256 != expected["contentSha256"]:
        raise ExtractionError(
            f"Unexpected {source_system} content SHA-256. Expected "
            f"{expected['contentSha256']}, found {scan.content_sha256}. Review the new "
            "snapshot before using --allow-source-drift."
        )
    mismatches = {
        table: {"expected": expected["tables"][table], "actual": scan.source_counts[table]}
        for table in tables
        if table in expected["tables"] and scan.source_counts[table] != expected["tables"][table]
    }
    if mismatches:
        raise ExtractionError(f"{source_system} source count mismatch: {json.dumps(mismatches)}")


def source_text(value: Any) -> str | None:
    if value is None:
        return None
    cleaned = " ".join(str(value).strip().split())
    return cleaned or None


def source_code(value: Any) -> str | None:
    text = source_text(value)
    return text if text else None


def digits_only(value: Any) -> str:
    return re.sub(r"\D", "", str(value or ""))


def normalize_cuil(value: Any) -> str | None:
    digits = digits_only(value)
    if len(digits) != 11 or digits == "0" * 11:
        return None
    check = 11 - sum(int(number) * weight for number, weight in zip(digits[:10], CUIL_WEIGHTS)) % 11
    if check == 11:
        check = 0
    elif check == 10:
        check = 9
    return digits if check == int(digits[-1]) else None


def normalize_dni(value: Any) -> str | None:
    digits = digits_only(value).lstrip("0")
    return digits if 6 <= len(digits) <= 8 else None


def dni_from_cuil(cuil: str | None) -> str | None:
    if cuil is None:
        return None
    return normalize_dni(cuil[2:10])


def normalize_name(value: Any) -> str | None:
    if value is None:
        return None
    ascii_name = unicodedata.normalize("NFKD", str(value)).encode("ascii", "ignore").decode("ascii")
    normalized = " ".join(re.sub(r"[^A-Z0-9]+", " ", ascii_name.upper()).split())
    return normalized or None


def normalize_birth_date(value: Any, cutoff: date = date(2026, 8, 6)) -> str | None:
    text = source_code(value)
    if not text:
        return None
    candidate = text[:10]
    if candidate in PLACEHOLDER_BIRTH_DATES:
        return None
    try:
        parsed = date.fromisoformat(candidate)
    except ValueError:
        return None
    if parsed.year < 1900 or parsed > cutoff:
        return None
    return candidate


@dataclass(frozen=True)
class PersonIdentity:
    system: str
    source_id: str
    name: str | None
    normalized_name: str | None
    birth_date: str | None
    raw_dni: str | None
    cuil: str | None
    match_dni: str | None
    match_dni_origin: str | None
    row: Mapping[str, str | None]


def identity_from_row(system: str, row: Mapping[str, str | None]) -> PersonIdentity:
    cuil = normalize_cuil(row.get("CUIL_12"))
    raw_dni = normalize_dni(row.get("NUDO_12"))
    derived_dni = dni_from_cuil(cuil)
    if system == "grh_junin":
        # GRH CUIL is authoritative identity evidence when it validates.
        match_dni = derived_dni or raw_dni
        origin = "derived_from_valid_cuil" if derived_dni else "source_document" if raw_dni else None
    elif system == "personas_junin":
        # PERSONAS is auxiliary: retain its explicit document first, derive only
        # when the source document is absent or malformed.
        match_dni = raw_dni or derived_dni
        origin = "source_document" if raw_dni else "derived_from_valid_cuil" if derived_dni else None
    else:
        raise ValueError(f"Unknown source system: {system}")
    return PersonIdentity(
        system=system,
        source_id=source_code(row.get("IDPERSONA")) or "",
        name=source_text(row.get("NOMB_12")),
        normalized_name=normalize_name(row.get("NOMB_12")),
        birth_date=normalize_birth_date(row.get("FENA_12")),
        raw_dni=raw_dni,
        cuil=cuil,
        match_dni=match_dni,
        match_dni_origin=origin,
        row=row,
    )


def grh_identity_seed(person: PersonIdentity) -> dict[str, Any]:
    """Preserve the complete GRH identity master independently of legajo.

    A GRH person can legitimately have no employment row.  Such records still
    need a canonical identity and source xref so the crosswalk decision is not
    silently lost. Invalid source identifiers remain as evidence but are never
    promoted into validated canonical CUIL/DNI fields.
    """
    if person.system != "grh_junin":
        raise ValueError("GRH identity seeds can only be built from grh_junin")
    row = person.row
    raw_cuil = source_code(row.get("CUIL_12"))
    raw_dni = source_code(row.get("NUDO_12"))
    raw_birth_date = source_code(row.get("FENA_12"))
    sex_code = source_code(row.get("SEXO_12"))
    phone = source_text(row.get("TELE_12"))
    email = source_text(row.get("EMIA_12"))
    raw_address = source_text(row.get("DOMI_12"))
    locality = source_text(row.get("localidad"))
    quality_score = (
        (30 if person.cuil else 0)
        + (20 if person.raw_dni else 0)
        + (20 if person.name else 0)
        + (15 if person.birth_date else 0)
        + (5 if sex_code else 0)
        + (3 if phone else 0)
        + (2 if email else 0)
        + (3 if raw_address else 0)
        + (2 if locality else 0)
    )
    return {
        "source": {
            "system": "grh_junin",
            "entity": "persona",
            "sourceId": person.source_id,
        },
        "identity": {
            "fullName": person.name,
            "normalizedName": person.normalized_name,
            "birthDate": person.birth_date,
            "sourceBirthDate": raw_birth_date,
            "documentTypeCode": source_code(row.get("CODI_47")),
            "documentNumber": person.raw_dni,
            "sourceDocumentNumber": raw_dni,
            "cuil": person.cuil,
            "sourceCuil": raw_cuil,
            "sexCode": sex_code,
            "bloodType": source_text(row.get("GSAN_12")),
            "phone": phone,
            "email": email,
            "birthplace": source_text(row.get("LUGNAC_12")),
        },
        "address": {
            "raw": raw_address,
            "streetId": source_code(row.get("idcalle")),
            "street": source_text(row.get("calle")),
            "number": source_code(row.get("numero")),
            "floor": source_code(row.get("piso")),
            "unit": source_code(row.get("dpto")),
            "localityId": source_code(row.get("IDLOCALIDAD")),
            "locality": locality,
            "postalCode": source_code(row.get("CPOS_12")),
            "provinceCode": source_code(row.get("CODI_08")),
        },
        "quality": {
            "score": quality_score,
            "validCuil": person.cuil is not None,
            "validDni": person.raw_dni is not None,
            "validBirthDate": person.birth_date is not None,
            "invalidSourceCuilRetained": raw_cuil is not None and person.cuil is None,
            "invalidSourceDniRetained": raw_dni is not None and person.raw_dni is None,
            "invalidSourceBirthDateRetained": raw_birth_date is not None and person.birth_date is None,
        },
        "scope": "grh_identity_master_independent_of_employment",
    }


def supporting_evidence(grh: PersonIdentity, personas: PersonIdentity) -> dict[str, bool]:
    return {
        "normalizedNameAgreement": bool(
            grh.normalized_name and grh.normalized_name == personas.normalized_name
        ),
        "birthDateAgreement": bool(grh.birth_date and grh.birth_date == personas.birth_date),
    }


def _evidence_candidates(
    grh: PersonIdentity, candidates: Sequence[PersonIdentity]
) -> list[PersonIdentity]:
    return [candidate for candidate in candidates if any(supporting_evidence(grh, candidate).values())]


def _confidence(method: str, evidence: Mapping[str, bool]) -> float:
    if method == "cuil_unique":
        return 1.0
    if method == "cuil_duplicate_resolved":
        return 0.99 if all(evidence.values()) else 0.97
    if method == "dni_unique":
        return 0.94 if any(evidence.values()) else 0.90
    if method == "dni_duplicate_resolved":
        return 0.90 if all(evidence.values()) else 0.87
    raise ValueError(f"No confidence for method {method}")


def _bridge_record(
    grh: PersonIdentity,
    *,
    status: str,
    method: str | None,
    candidates: Sequence[PersonIdentity],
    selected: PersonIdentity | None,
    candidate_count: int,
    support_count: int,
    valid_from: str,
) -> dict[str, Any]:
    evidence = supporting_evidence(grh, selected) if selected else {
        "normalizedNameAgreement": False,
        "birthDateAgreement": False,
    }
    return {
        "crosswalkVersion": POLICY_VERSION,
        "validFrom": valid_from,
        "validTo": None,
        "status": status,
        "source": {"system": "grh_junin", "entity": "persona", "sourceId": grh.source_id},
        "target": (
            {"system": "personas_junin", "entity": "persona", "sourceId": selected.source_id}
            if selected
            else None
        ),
        "candidateTargetSourceIds": [candidate.source_id for candidate in candidates] if not selected else [],
        "matchMethod": method,
        "confidence": _confidence(method, evidence) if method and selected else None,
        "evidence": {
            "matchKey": "cuil" if method and method.startswith("cuil") else "dni" if method else None,
            "candidateCount": candidate_count,
            "supportingCandidateCount": support_count,
            "grhCuilCheckDigitValidated": grh.cuil is not None,
            "grhDniOrigin": grh.match_dni_origin,
            **evidence,
            "rawIdJoinUsed": False,
        },
    }


def build_crosswalk(
    grh_people: Sequence[PersonIdentity],
    personas_people: Sequence[PersonIdentity],
    *,
    valid_from: str,
) -> tuple[list[dict[str, Any]], Counter[str]]:
    by_cuil: dict[str, list[PersonIdentity]] = defaultdict(list)
    by_dni: dict[str, list[PersonIdentity]] = defaultdict(list)
    for person in personas_people:
        if person.cuil:
            by_cuil[person.cuil].append(person)
        if person.match_dni:
            by_dni[person.match_dni].append(person)

    records: list[dict[str, Any]] = []
    tiers: Counter[str] = Counter()
    for grh in grh_people:
        cuil_candidates = list(by_cuil.get(grh.cuil or "", []))
        if len(cuil_candidates) == 1:
            method = "cuil_unique"
            selected = cuil_candidates[0]
            supporting = _evidence_candidates(grh, cuil_candidates)
            records.append(_bridge_record(
                grh, status="matched", method=method, candidates=[], selected=selected,
                candidate_count=1, support_count=len(supporting), valid_from=valid_from,
            ))
            tiers[method] += 1
            continue
        if len(cuil_candidates) > 1:
            supporting = _evidence_candidates(grh, cuil_candidates)
            if len(supporting) == 1:
                method = "cuil_duplicate_resolved"
                records.append(_bridge_record(
                    grh, status="matched", method=method, candidates=[], selected=supporting[0],
                    candidate_count=len(cuil_candidates), support_count=1, valid_from=valid_from,
                ))
                tiers[method] += 1
            else:
                records.append(_bridge_record(
                    grh, status="ambiguous", method=None, candidates=cuil_candidates, selected=None,
                    candidate_count=len(cuil_candidates), support_count=len(supporting), valid_from=valid_from,
                ))
                tiers["ambiguous"] += 1
            continue

        dni_candidates = list(by_dni.get(grh.match_dni or "", []))
        if len(dni_candidates) == 1:
            method = "dni_unique"
            supporting = _evidence_candidates(grh, dni_candidates)
            records.append(_bridge_record(
                grh, status="matched", method=method, candidates=[], selected=dni_candidates[0],
                candidate_count=1, support_count=len(supporting), valid_from=valid_from,
            ))
            tiers[method] += 1
            continue
        if len(dni_candidates) > 1:
            supporting = _evidence_candidates(grh, dni_candidates)
            # A duplicate DNI sourced only from a raw GRH document remains for
            # assisted review.  Automatic duplicate resolution requires the DNI
            # to be independently derivable from a check-digit-valid GRH CUIL.
            can_resolve = grh.match_dni_origin == "derived_from_valid_cuil" and len(supporting) == 1
            if can_resolve:
                method = "dni_duplicate_resolved"
                records.append(_bridge_record(
                    grh, status="matched", method=method, candidates=[], selected=supporting[0],
                    candidate_count=len(dni_candidates), support_count=1, valid_from=valid_from,
                ))
                tiers[method] += 1
            else:
                records.append(_bridge_record(
                    grh, status="ambiguous", method=None, candidates=dni_candidates, selected=None,
                    candidate_count=len(dni_candidates), support_count=len(supporting), valid_from=valid_from,
                ))
                tiers["ambiguous"] += 1
            continue

        records.append(_bridge_record(
            grh, status="unmatched", method=None, candidates=[], selected=None,
            candidate_count=0, support_count=0, valid_from=valid_from,
        ))
        tiers["unmatched"] += 1

    return records, tiers


def _lookup(rows: Iterable[Mapping[str, Any]], key: str) -> dict[str, Mapping[str, Any]]:
    result: dict[str, Mapping[str, Any]] = {}
    for row in rows:
        code = source_code(row.get(key))
        if code:
            result[code] = row
    return result


def _reference(source_id: Any, label: Any = None, **extra: Any) -> dict[str, Any] | None:
    code = source_code(source_id)
    text = source_text(label)
    if not code and not text and not any(value is not None for value in extra.values()):
        return None
    return {"sourceId": code, "label": text, **extra}


def _float(value: Any) -> float | None:
    text = source_code(value)
    if text is None:
        return None
    try:
        number = float(text)
    except ValueError:
        return None
    return number if math.isfinite(number) else None


def _coordinates(row: Mapping[str, Any]) -> dict[str, float] | None:
    latitude = _float(row.get("latitud"))
    longitude = _float(row.get("longitud"))
    if latitude is None or longitude is None:
        return None
    # PERSONAS stores (0, 0) as the overwhelmingly common "not geocoded"
    # sentinel.  Treat either zero coordinate as missing, not as a real point.
    if abs(latitude) < 1e-9 or abs(longitude) < 1e-9:
        return None
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        return None
    return {"latitude": latitude, "longitude": longitude}


def domicile_record(
    row: Mapping[str, Any],
    catalogs: Mapping[str, Mapping[str, Mapping[str, Any]]],
) -> dict[str, Any]:
    locality_id = source_code(row.get("localidad_IDLOCALIDAD"))
    province_id = source_code(row.get("provincia_CODI_08"))
    street_id = source_code(row.get("calle_IDCALLE"))
    barrio_id = source_code(row.get("barrio_CODI_BRR"))
    locality = catalogs["localidad"].get(locality_id or "", {})
    province = catalogs["provin"].get(province_id or "", {})
    street = catalogs["calle"].get(street_id or "", {})
    barrio = catalogs["barrio"].get(barrio_id or "", {})
    return {
        "sourceId": source_code(row.get("id")),
        "type": source_text(row.get("tipo")) or source_text(row.get("tipoDomicilio")),
        "province": _reference(
            province_id,
            row.get("provinciaNom") or row.get("provinciaString") or province.get("DETA_08"),
        ),
        "locality": _reference(
            locality_id,
            row.get("localidadNom") or row.get("localidadString") or locality.get("NOMBRE"),
        ),
        "department": source_text(row.get("departamentoNom")) or source_text(row.get("departamento")),
        "barrio": _reference(
            barrio_id,
            row.get("barrioNom") or row.get("barrioString") or barrio.get("DESC_BRR"),
        ),
        "street": _reference(
            street_id,
            row.get("calleNom") or row.get("calleString") or street.get("DETA_08"),
        ),
        "number": source_text(row.get("numero")),
        "floor": source_text(row.get("piso")),
        "lot": source_text(row.get("lote")),
        "block": source_text(row.get("manzana")),
        "sourceDisplay": source_text(row.get("domicilioString")) or source_text(row.get("ubicacion")),
        "coordinates": _coordinates(row),
    }


def build_auxiliary_people(
    personas_people: Sequence[PersonIdentity],
    matched_target_ids: set[str],
    domicile_rows: Sequence[Mapping[str, Any]],
    catalog_rows: Mapping[str, Sequence[Mapping[str, Any]]],
) -> list[dict[str, Any]]:
    catalogs = {
        "localidad": _lookup(catalog_rows["localidad"], "IDLOCALIDAD"),
        "provin": _lookup(catalog_rows["provin"], "CODI_08"),
        "calle": _lookup(catalog_rows["calle"], "IDCALLE"),
        "barrio": _lookup(catalog_rows["barrio"], "CODI_BRR"),
    }
    addresses: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in domicile_rows:
        person_id = source_code(row.get("persona_IDPERSONA"))
        if person_id in matched_target_ids:
            addresses[person_id].append(domicile_record(row, catalogs))

    result: list[dict[str, Any]] = []
    for person in personas_people:
        if person.source_id not in matched_target_ids:
            continue
        row = person.row
        locality_id = source_code(row.get("IDLOCALIDAD"))
        province_id = source_code(row.get("CODI_08"))
        street_id = source_code(row.get("IDCALLE"))
        barrio_id = source_code(row.get("IDBARRIO"))
        locality = catalogs["localidad"].get(locality_id or "", {})
        province = catalogs["provin"].get(province_id or "", {})
        street = catalogs["calle"].get(street_id or "", {})
        barrio = catalogs["barrio"].get(barrio_id or "", {})
        result.append({
            "source": {"system": "personas_junin", "entity": "persona", "sourceId": person.source_id},
            "identity": {
                "name": person.name,
                "normalizedName": person.normalized_name,
                "birthDate": person.birth_date,
                "documentNumber": person.raw_dni,
                "cuil": person.cuil,
                "sex": source_text(row.get("SEXO_12")),
            },
            "territory": {
                "province": _reference(province_id, province.get("DETA_08")),
                "locality": _reference(locality_id, row.get("LOCALIDAD") or locality.get("NOMBRE")),
                "postalCode": source_text(row.get("CPOS_12")) or source_text(locality.get("CP")),
                "inlineAddress": {
                    "street": _reference(street_id, row.get("CALLE") or street.get("DETA_08")),
                    "number": source_text(row.get("NUMERO")),
                    "floor": source_text(row.get("PISO")),
                    "unit": source_text(row.get("DPTO")),
                    "barrio": _reference(barrio_id, barrio.get("DESC_BRR")),
                    "sourceDisplay": source_text(row.get("domicilioString")),
                },
            },
            "domiciles": addresses.get(person.source_id, []),
            "scope": "auxiliary_identity_and_territory_only",
        })
    return result


def _identity_profile(people: Sequence[PersonIdentity]) -> dict[str, int]:
    nonzero_cuil = [digits_only(person.row.get("CUIL_12")) for person in people]
    nonzero_cuil = [value for value in nonzero_cuil if value and set(value) != {"0"}]
    raw_dni = [normalize_dni(person.row.get("NUDO_12")) for person in people]
    return {
        "records": len(people),
        "nonzeroCuil": len(nonzero_cuil),
        "validCuil": sum(person.cuil is not None for person in people),
        "invalidNonzeroCuil": sum(person.cuil is None for person in people if digits_only(person.row.get("CUIL_12")) and set(digits_only(person.row.get("CUIL_12"))) != {"0"}),
        "distinctNonzeroCuil": len(set(nonzero_cuil)),
        "distinctValidCuil": len({person.cuil for person in people if person.cuil}),
        "validDni": sum(value is not None for value in raw_dni),
        "distinctValidDni": len({value for value in raw_dni if value}),
        "usableNormalizedName": sum(person.normalized_name is not None for person in people),
        "usableNonPlaceholderBirthDate": sum(person.birth_date is not None for person in people),
    }


def _dump_metadata(scan: DumpScan, table_names: Iterable[str]) -> dict[str, Any]:
    return {
        "fileName": scan.path.name,
        "containerSizeBytes": scan.container_size_bytes,
        "logicalSizeBytes": scan.logical_size_bytes,
        "containerSha256": scan.container_sha256,
        "contentSha256": scan.content_sha256,
        "dumpCompletedAt": scan.dump_completed_at,
        "decodeReplacementCharacters": scan.decode_replacement_characters,
        "tablesRead": {table: scan.source_counts[table] for table in sorted(table_names)},
    }


def _write_json_atomic(path: Path, value: Any) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    try:
        with temporary.open("w", encoding="utf-8", newline="\n") as handle:
            json.dump(value, handle, ensure_ascii=False, separators=(",", ":"))
            handle.write("\n")
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def _source_valid_from(grh: DumpScan, personas: DumpScan) -> str:
    values = [value for value in (grh.dump_completed_at, personas.dump_completed_at) if value]
    return (max(values).replace(" ", "T") + "Z") if values else "2026-08-06T00:00:00Z"


def _raw_id_diagnostic(
    grh: Sequence[PersonIdentity], personas: Sequence[PersonIdentity]
) -> dict[str, int]:
    personas_by_id = {person.source_id: person for person in personas}
    overlap = 0
    identity_agreement = 0
    for person in grh:
        target = personas_by_id.get(person.source_id)
        if target is None:
            continue
        overlap += 1
        same_cuil = bool(person.cuil and person.cuil == target.cuil)
        same_dni_with_evidence = bool(
            person.match_dni
            and person.match_dni == target.match_dni
            and any(supporting_evidence(person, target).values())
        )
        if same_cuil or same_dni_with_evidence:
            identity_agreement += 1
    return {"overlappingSourceIds": overlap, "sameIdentityByIndependentEvidence": identity_agreement}


def run_pipeline(
    grh_path: Path,
    personas_path: Path,
    output_dir: Path,
    *,
    allow_source_drift: bool = False,
) -> dict[str, Any]:
    grh_tables = {"persona", "legajo"}
    grh_scan = scan_dump(grh_path, grh_tables)
    require_columns(grh_scan, "persona", GRH_IDENTITY_COLUMNS)
    require_columns(grh_scan, "legajo", {"IDPERSONA"})
    validate_source(grh_scan, "grh_junin", grh_tables, allow_source_drift=allow_source_drift)

    personas_tables = {"persona", *CATALOG_COLUMNS}
    personas_scan = scan_dump(personas_path, personas_tables)
    require_columns(personas_scan, "persona", PERSONAS_AUXILIARY_COLUMNS)
    for table, columns in CATALOG_COLUMNS.items():
        require_columns(personas_scan, table, columns)
    validate_source(
        personas_scan,
        "personas_junin",
        personas_tables,
        allow_source_drift=allow_source_drift,
    )

    grh_people = [identity_from_row("grh_junin", row) for row in grh_scan.retained["persona"]]
    personas_people = [
        identity_from_row("personas_junin", row) for row in personas_scan.retained["persona"]
    ]
    if any(not person.source_id for person in [*grh_people, *personas_people]):
        raise ExtractionError("A source persona has no IDPERSONA")
    if len({person.source_id for person in grh_people}) != len(grh_people):
        raise ExtractionError("GRH persona IDPERSONA is not unique")
    if len({person.source_id for person in personas_people}) != len(personas_people):
        raise ExtractionError("PERSONAS persona IDPERSONA is not unique")

    legajo_person_ids = {
        source_code(row.get("IDPERSONA"))
        for row in grh_scan.retained["legajo"]
        if source_code(row.get("IDPERSONA"))
    }
    grh_person_ids = {person.source_id for person in grh_people}
    legajo_ids_without_person = legajo_person_ids - grh_person_ids
    if legajo_ids_without_person:
        raise ExtractionError(
            f"GRH legajo references {len(legajo_ids_without_person)} unknown persona IDs"
        )
    grh_person_ids_without_legajo = grh_person_ids - legajo_person_ids
    grh_identity_seeds = []
    for person in grh_people:
        seed = grh_identity_seed(person)
        seed["employmentLink"] = {
            "hasLegajo": person.source_id in legajo_person_ids,
        }
        grh_identity_seeds.append(seed)

    valid_from = _source_valid_from(grh_scan, personas_scan)
    crosswalk, tiers = build_crosswalk(grh_people, personas_people, valid_from=valid_from)
    matched_ids = {
        record["target"]["sourceId"]
        for record in crosswalk
        if record["status"] == "matched"
    }

    domicile_scan = scan_dump(
        personas_path,
        {"domicilio"},
        row_filters={
            "domicilio": lambda row: source_code(row.get("persona_IDPERSONA")) in matched_ids
        },
        calculate_hashes=False,
    )
    require_columns(domicile_scan, "domicilio", DOMICILE_COLUMNS)
    if not allow_source_drift:
        expected_addresses = EXPECTED_SOURCES["personas_junin"]["tables"]["domicilio"]
        if domicile_scan.source_counts["domicilio"] != expected_addresses:
            raise ExtractionError(
                f"PERSONAS domicilio count mismatch: expected {expected_addresses}, "
                f"found {domicile_scan.source_counts['domicilio']}"
            )

    auxiliary = build_auxiliary_people(
        personas_people,
        matched_ids,
        domicile_scan.retained["domicilio"],
        {table: personas_scan.retained[table] for table in CATALOG_COLUMNS},
    )

    matched = sum(value for key, value in tiers.items() if key not in {"ambiguous", "unmatched"})
    if sum(tiers.values()) != len(grh_people):
        raise ExtractionError("Crosswalk status totals do not reconcile to GRH persons")
    if len(crosswalk) != len(grh_people):
        raise ExtractionError("Crosswalk must contain one decision for each GRH person")
    if len(auxiliary) != len(matched_ids):
        raise ExtractionError("Auxiliary output does not cover every distinct matched PERSONAS source ID")
    decisions_without_legajo = [
        record for record in crosswalk
        if record["source"]["sourceId"] in grh_person_ids_without_legajo
    ]
    if len(grh_identity_seeds) != len(grh_people):
        raise ExtractionError("GRH identity seed output does not cover every GRH persona")
    if len(decisions_without_legajo) != len(grh_person_ids_without_legajo):
        raise ExtractionError("Crosswalk does not preserve every GRH persona without legajo")
    if not allow_source_drift:
        without_legajo_statuses = Counter(record["status"] for record in decisions_without_legajo)
        if len(grh_person_ids_without_legajo) != EXPECTED_GRH_PERSONS_WITHOUT_LEGAJO:
            raise ExtractionError(
                "GRH persona/legajo anti-join changed: expected "
                f"{EXPECTED_GRH_PERSONS_WITHOUT_LEGAJO}, found {len(grh_person_ids_without_legajo)}"
            )
        if without_legajo_statuses != {"unmatched": EXPECTED_GRH_PERSONS_WITHOUT_LEGAJO}:
            raise ExtractionError(
                "GRH persons without legajo changed crosswalk status: "
                f"{dict(without_legajo_statuses)}"
            )
    if not allow_source_drift and dict(tiers) != REFERENCE_TIERS:
        raise ExtractionError(
            "Matching tiers differ from the independently audited snapshot: "
            f"expected {REFERENCE_TIERS}, found {dict(tiers)}"
        )

    output_dir.mkdir(parents=True, exist_ok=True)
    grh_identity_path = output_dir / "grh-identity-seeds.json"
    crosswalk_path = output_dir / "personas-crosswalk.json"
    auxiliary_path = output_dir / "personas-matched-auxiliary.json"
    manifest_path = output_dir / "personas-crosswalk-manifest.json"
    _write_json_atomic(grh_identity_path, grh_identity_seeds)
    _write_json_atomic(crosswalk_path, crosswalk)
    _write_json_atomic(auxiliary_path, auxiliary)

    raw_id = _raw_id_diagnostic(grh_people, personas_people)
    mapped_target_counts = Counter(
        record["target"]["sourceId"] for record in crosswalk if record["target"]
    )
    address_count = len(domicile_scan.retained["domicilio"])
    geocoded_count = sum(
        domicile.get("coordinates") is not None
        for person in auxiliary
        for domicile in person["domiciles"]
    )
    manifest = {
        "schemaVersion": 1,
        "scriptVersion": SCRIPT_VERSION,
        "policyVersion": POLICY_VERSION,
        "generatedFromSourceCutoff": valid_from,
        "authority": {
            "employmentSystemOfRecord": "grh_junin",
            "personasRole": "auxiliary_identity_and_territory_only",
            "personasCanOverrideEmployment": False,
            "rawIdJoinAllowed": False,
        },
        "sources": {
            "grh_junin": _dump_metadata(grh_scan, grh_tables),
            "personas_junin": {
                **_dump_metadata(personas_scan, personas_tables),
                "domicilioRowsScanned": domicile_scan.source_counts["domicilio"],
            },
        },
        "profiles": {
            "grhIdentity": _identity_profile(grh_people),
            "personasIdentity": _identity_profile(personas_people),
        },
        "grhIdentityMaster": {
            "personsExported": len(grh_identity_seeds),
            "distinctPersonsLinkedToLegajo": len(legajo_person_ids),
            "personsWithoutLegajo": len(grh_person_ids_without_legajo),
            "personsWithoutLegajoDecisionStatus": dict(sorted(Counter(
                record["status"] for record in decisions_without_legajo
            ).items())),
            "employmentRowsCreatedForPersonsWithoutLegajo": 0,
        },
        "matching": {
            "grhPersons": len(grh_people),
            "matched": matched,
            "ambiguous": tiers["ambiguous"],
            "unmatched": tiers["unmatched"],
            "matchRatePercent": round(matched * 100 / len(grh_people), 1),
            "tiers": {key: tiers[key] for key in REFERENCE_TIERS},
            "distinctMatchedPersonas": len(matched_ids),
            "targetIdsMappedMoreThanOnce": sum(count > 1 for count in mapped_target_counts.values()),
            "rawIdDiagnostic": raw_id,
        },
        "auxiliaryTerritory": {
            "personsExported": len(auxiliary),
            "domicilesExported": address_count,
            "domicilesGeocoded": geocoded_count,
            "allPersonasDomicilesScanned": domicile_scan.source_counts["domicilio"],
            "unmatchedAndAmbiguousPersonsExported": 0,
        },
        "outputs": {
            "grhIdentitySeeds": {
                "fileName": grh_identity_path.name,
                "records": len(grh_identity_seeds),
                "sha256": _sha256_file(grh_identity_path),
            },
            "crosswalk": {
                "fileName": crosswalk_path.name,
                "records": len(crosswalk),
                "sha256": _sha256_file(crosswalk_path),
            },
            "matchedAuxiliary": {
                "fileName": auxiliary_path.name,
                "records": len(auxiliary),
                "sha256": _sha256_file(auxiliary_path),
            },
        },
        "acceptance": {
            "oneDecisionPerGrhPerson": len(crosswalk) == len(grh_people),
            "allGrhPersonsExported": len(grh_identity_seeds) == len(grh_people),
            "grhPersonsWithoutLegajoRetained": (
                len(decisions_without_legajo) == len(grh_person_ids_without_legajo)
            ),
            "statusTotalsReconcile": sum(tiers.values()) == len(grh_people),
            "noRawIdJoin": all(not row["evidence"]["rawIdJoinUsed"] for row in crosswalk),
            "validCuilOnly": True,
            "employmentFieldsImportedFromPersonas": False,
            "manifestContainsPersonLevelData": False,
            "referenceSnapshotReproduced": dict(tiers) == REFERENCE_TIERS,
        },
        "limitations": [
            "PERSONAS is auxiliary and does not govern employment, payroll, status, position, or organization data.",
            "Ambiguous records remain unresolved and require assisted review; they are not exported as enriched identities.",
            "Only matched PERSONAS identities and their domiciles are retained; the full municipal padrón is not duplicated.",
            "Territorial values preserve source semantics and are not a normalized geospatial master.",
        ],
    }
    _write_json_atomic(manifest_path, manifest)
    return manifest


def _self_test() -> None:
    assert normalize_cuil("20-99999999-9") == "20999999999"
    assert normalize_cuil("20-99999999-8") is None
    assert normalize_dni("99.999.999") == "99999999"
    assert normalize_name("Muñoz, José  María") == "MUNOZ JOSE MARIA"
    assert normalize_birth_date("1992-12-31") is None
    print("Crosswalk primitive self-test OK")


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    repo_root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(
        description="Build the GRH -> PERSONAS auxiliary identity crosswalk from Junin SQL dumps."
    )
    parser.add_argument(
        "--grh-sql",
        type=Path,
        default=Path.home() / "Downloads" / "grh_junin_extracted.sql",
    )
    parser.add_argument(
        "--personas-sql",
        type=Path,
        default=Path.home() / "Downloads" / "personas_junin_extracted.sql",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=repo_root / "rrhh-data" / "personas-crosswalk",
    )
    parser.add_argument(
        "--allow-source-drift",
        action="store_true",
        help="Process a reviewed newer snapshot without enforcing the known hashes/counts.",
    )
    parser.add_argument("--self-test", action="store_true")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    if args.self_test:
        _self_test()
        return 0
    grh_path = args.grh_sql.resolve()
    personas_path = args.personas_sql.resolve()
    output_dir = args.output_dir.resolve()
    for label, path in (("GRH", grh_path), ("PERSONAS", personas_path)):
        if not path.is_file():
            raise ExtractionError(f"{label} SQL dump not found: {path}")
    print("Scanning GRH and PERSONAS sources (aggregate progress only)...")
    manifest = run_pipeline(
        grh_path,
        personas_path,
        output_dir,
        allow_source_drift=args.allow_source_drift,
    )
    matching = manifest["matching"]
    print(
        "Crosswalk complete: "
        f"matched={matching['matched']}, ambiguous={matching['ambiguous']}, "
        f"unmatched={matching['unmatched']}, rate={matching['matchRatePercent']}%"
    )
    print(f"Aggregate manifest: {output_dir / 'personas-crosswalk-manifest.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
