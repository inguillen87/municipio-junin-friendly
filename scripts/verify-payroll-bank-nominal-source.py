"""Independent, local-only reconciliation of the nominal bank XLSX.

Uses only stdlib OOXML readers, never application parsers or formula evaluation.
Original formula cells are read through their cached values. Every generated
subtotal/total is recalculated from the nominal rows with Decimal.
Only counts and booleans are emitted, including on failure.
"""

import argparse
from collections import Counter
from decimal import Decimal, ROUND_HALF_UP
import hashlib
from io import BytesIO
import json
from pathlib import Path, PurePosixPath
import re
import sys
import unicodedata
from xml.etree import ElementTree as ET
from zipfile import ZipFile


SOURCE_ENTRY = "AGOSTO/LIQUIDACION MENSUAL/ACREDITACION/PLANILLA CONTROL GENERAL 08.2026.xlsx"
NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
RID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
CENT = Decimal("0.01")
JURISDICTIONS = {code: "42" for code in "01 02 03 04 06 07 13 14 15 16 40".split()}
JURISDICTIONS.update({code: "55" for code in "17 18 19 20 21 22 23 24 25 26 27 33 35 36 37 38 39".split()})
SOURCE_TITLES = {
    "BANCAR. 08.2026- CRED. JUR.42": "Credicoop J42",
    "BANCAR. 08.2026- CRED. JUR.55": "Credicoop J55",
    "BARCAR. 08.2026- SANT JUR.42": "Santander J42",
    "BANCAR. 08.2026- SANT JUR.55": "Santander J55",
    "TRANSF. FUNCIONARIOS 08.2026": "Transferencias funcionarios",
    "TRANSF. VARIAS 08.2026": "Transferencias varias",
    "BANCAR. 08.2026- NAC JUR.42": "Nación J42",
    "BANCAR. 08.2026- NAC JUR.55": "Nación J55",
}


def require(condition):
    if not condition:
        raise ValueError("Verification failed")


class QuietArgumentParser(argparse.ArgumentParser):
    def error(self, message):
        raise ValueError("Invalid verification arguments")


def plain(value):
    return re.sub(r"_x([0-9a-fA-F]{4})_", lambda match: chr(int(match[1], 16)), value)


def compact(value):
    return "".join(character for character in unicodedata.normalize("NFD", value).upper()
                   if character.isalnum())


def money(value, source=False):
    require(isinstance(value, str) and len(value) <= 80)
    number = Decimal(value)
    require(number.is_finite() and 0 <= number <= Decimal("9999999999999.99"))
    rounded = number.quantize(CENT, rounding=ROUND_HALF_UP)
    # Only remove negligible binary-floating-point residue from source caches.
    require(abs(number - rounded) <= (Decimal("0.00001") if source else Decimal(0)))
    return rounded


def read_workbook(data):
    require(0 < len(data) <= 32 * 1024 * 1024)
    with ZipFile(BytesIO(data)) as archive:
        items = archive.infolist()
        require(len(items) <= 512 and sum(item.file_size for item in items) <= 64 * 1024 * 1024)
        names = archive.namelist()
        require(len(names) == len(set(names)))
        for name in names:
            require(not PurePosixPath(name).is_absolute() and ".." not in PurePosixPath(name).parts)
        shared = []
        if "xl/sharedStrings.xml" in names:
            shared = [plain("".join(node.text or "" for node in item.findall(".//s:t", NS)))
                      for item in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("s:si", NS)]
        relationships = {}
        for item in ET.fromstring(archive.read("xl/_rels/workbook.xml.rels")):
            require(item.attrib.get("TargetMode") != "External")
            relationships[item.attrib["Id"]] = item.attrib["Target"]
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        result = {}
        for sheet in workbook.find("s:sheets", NS):
            name = sheet.attrib["name"]
            require(name not in result)
            target = relationships[sheet.attrib[RID]]
            target = target.lstrip("/") if target.startswith("/") else "xl/" + target
            document = ET.fromstring(archive.read(target))
            rows = []
            for row in document.find("s:sheetData", NS):
                cells = {}
                for cell in row:
                    reference = cell.attrib.get("r", "")
                    match = re.fullmatch(r"([A-Z]+)([1-9][0-9]*)", reference)
                    require(match is not None and int(match[2]) == int(row.attrib["r"]))
                    require(match[1] not in cells)
                    kind = cell.attrib.get("t", "n")
                    cached = cell.find("s:v", NS)
                    value = cached.text or "" if cached is not None else ""
                    if kind == "s":
                        value = shared[int(value)]
                    elif kind == "inlineStr":
                        value = plain("".join(item.text or "" for item in cell.findall("s:is//s:t", NS)))
                    elif kind == "str":
                        value = plain(value)
                    require(kind != "e")
                    formula = cell.find("s:f", NS)
                    cells[match[1]] = {"value": value, "type": kind,
                                       "formula": None if formula is None else formula.text or ""}
                rows.append((int(row.attrib["r"]), cells))
            require(all(left[0] < right[0] for left, right in zip(rows, rows[1:])))
            result[name] = rows
        return result


def value(cells, column):
    return cells.get(column, {}).get("value", "").strip()


def source_records(rows):
    header = None
    records = []
    fields = {"CUIL": "cuil", "APELLIDOYNOMBRE": "name", "NETOACOBRAR": "net",
              "NETOAPAGAR": "net", "REPARTICION": "repartition", "CTABANCARIA": "account", "CBU": "cbu"}
    for _, cells in rows:
        if any(compact(cell["value"]) == "CUIL" for cell in cells.values()):
            header = {}
            for column, cell in cells.items():
                key = fields.get(compact(cell["value"]))
                if key:
                    require(key not in header)
                    header[key] = column
            require(all(key in header for key in ["cuil", "name", "net", "repartition"]))
            continue
        if not header:
            continue
        identity = value(cells, header["cuil"])
        cuil = re.sub(r"[.\-\s]", "", identity)
        if not re.fullmatch(r"[0-9]{11}", cuil):
            # Summary/blank rows never become personal records; unexpected data fails.
            require(not (identity and re.fullmatch(r"[0-9.\-\s]+", identity)))
            continue
        name = value(cells, header["name"])
        repartition = value(cells, header["repartition"])
        net = money(value(cells, header["net"]), source=True)
        require(name and repartition and net > 0)
        code = re.match(r"^0*([0-9]{1,2})(?:\s*[-–—.]|\s*$)", repartition)
        require(code is not None)
        code = code[1].zfill(2)
        # Source labels already have their numeric code, padded or unpadded.
        # Their original text must be preserved, not prefixed or rewritten.
        shown_repartition = repartition
        require(code in JURISDICTIONS)
        account = value(cells, header["account"]) if "account" in header else ""
        cbu = value(cells, header["cbu"]) if "cbu" in header else ""
        records.append((cuil, name, net, account, cbu, shown_repartition, JURISDICTIONS[code]))
    require(header is not None)
    return records


def verify_generated(rows, expected, source_hash, source_name):
    by_number = dict(rows)
    header = {cell["value"]: column for column, cell in by_number[4].items()}
    headings = ["Nº", "CUIL", "Apellido y nombre", "Neto a pagar", "Repartición", "Jurisdicción"]
    if any(record[3] for record in expected):
        headings.append("Cuenta")
    if any(record[4] for record in expected):
        headings.append("CBU")
    require(list(header) == headings)
    require([header[key] for key in headings] == [chr(65 + index) for index in range(len(headings))])
    records = []
    pending = []
    subtotals = []
    total = None
    subtotal_rows = []
    formula_count = 0
    for row_number, cells in rows:
        formula_count += sum(cell["formula"] is not None for cell in cells.values())
        if row_number < 5:
            continue
        cuil = value(cells, "B")
        if re.fullmatch(r"[0-9]{11}", cuil):
            require(total is None and value(cells, "A") == str(len(records) + 1))
            for column in ["B", "C", "E", "F"] + [header[key] for key in ["Cuenta", "CBU"] if key in header]:
                require(cells[column]["type"] in ["inlineStr", "s", "str"] and cells[column]["formula"] is None)
            require(cells["D"]["type"] == "n" and cells["D"]["formula"] is None)
            require(value(cells, "F") in ["42", "55"])
            record = (cuil, value(cells, "C"), money(value(cells, "D")),
                      value(cells, header["Cuenta"]) if "Cuenta" in header else "",
                      value(cells, header["CBU"]) if "CBU" in header else "", value(cells, "E"), value(cells, "F"))
            code = re.match(r"^0*([0-9]{1,2})(?:\s*[-–—.]|\s*$)", record[5])
            require(code is not None)
            records.append(record)
            pending.append((row_number, record[2], value(cells, "F"), code[1].zfill(2)))
        elif cuil == "Subtotal":
            require(total is None and pending and pending[-1][0] == row_number - 1)
            require(all(right[0] == left[0] + 1 for left, right in zip(pending, pending[1:])))
            require(len({item[2] for item in pending}) == 1 and value(cells, "F") == pending[0][2])
            require(len({item[3] for item in pending}) == 1)
            require(value(cells, "C") == "Rep. {} · {} operaciones".format(pending[0][3], len(pending)))
            expected_formula = "SUM(D{}:D{})".format(pending[0][0], pending[-1][0])
            require(cells["D"]["formula"] == expected_formula)
            expected_subtotal = sum((item[1] for item in pending), Decimal(0))
            require(money(value(cells, "D")) == expected_subtotal)
            subtotals.append(expected_subtotal)
            subtotal_rows.append(row_number)
            pending = []
        elif cells.get("D", {}).get("formula") is not None:
            require(total is None and not pending)
            expected_formula = ('SUMIF(B5:B{},"Subtotal",D5:D{})'.format(subtotal_rows[-1], subtotal_rows[-1])
                                if subtotal_rows else 'SUM(0)')
            require(cells["D"]["formula"] == expected_formula)
            total = money(value(cells, "D"))
            require(total == sum(subtotals, Decimal(0)) == sum((record[2] for record in records), Decimal(0)))
    require(not pending and total is not None and formula_count == len(subtotals) + 1)
    require(Counter(records) == Counter(expected))
    require(total == sum((record[2] for record in expected), Decimal(0)))
    all_text = [cell["value"] for _, cells in rows for cell in cells.values()]
    require("SHA-256: " + source_hash in all_text and "Fuente: " + source_name in all_text)
    return len(records), len(subtotals)


def main():
    summary = {"ok": False, "source_read": False, "export_read": False,
               "worksheets": 0, "operations": 0, "subtotals_verified": 0,
               "totals_verified": 0, "nominal_multisets_match": False,
               "identifiers_preserved": False, "formula_caches_match": False,
               "source_evidence_match": False}
    try:
        parser = QuietArgumentParser(add_help=False)
        sources = parser.add_mutually_exclusive_group(required=True)
        sources.add_argument("--source-xlsx")
        sources.add_argument("--outer-zip")
        parser.add_argument("--download", required=True)
        parser.add_argument("--expected-operations", type=int, default=842)
        args = parser.parse_args()
        if args.source_xlsx:
            source = Path(args.source_xlsx).read_bytes()
            source_name = Path(args.source_xlsx).name
        else:
            with ZipFile(args.outer_zip) as archive:
                matches = [item for item in archive.infolist() if item.filename.replace("\\", "/") == SOURCE_ENTRY]
                require(len(matches) == 1 and 0 < matches[0].file_size <= 2 * 1024 * 1024)
                source = archive.read(matches[0])
            source_name = PurePosixPath(SOURCE_ENTRY).name
        source_book = read_workbook(source)
        require(set(source_book) == set(SOURCE_TITLES))
        summary["source_read"] = True
        output_book = read_workbook(Path(args.download).read_bytes())
        require(set(output_book) == set(SOURCE_TITLES.values()))
        summary["export_read"] = True
        source_hash = hashlib.sha256(source).hexdigest()
        for source_title, output_title in SOURCE_TITLES.items():
            records = source_records(source_book[source_title])
            count, subtotal_count = verify_generated(output_book[output_title], records, source_hash, source_name)
            summary["worksheets"] += 1
            summary["operations"] += count
            summary["subtotals_verified"] += subtotal_count
            summary["totals_verified"] += 1
        require(summary["operations"] == args.expected_operations and summary["worksheets"] == 8)
        for key in ["ok", "nominal_multisets_match", "identifiers_preserved", "formula_caches_match", "source_evidence_match"]:
            summary[key] = True
    except (Exception, SystemExit):
        pass
    print(json.dumps(summary, ensure_ascii=True))
    return 0 if summary["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
