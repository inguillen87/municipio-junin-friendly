// Source-only reuse of the tested, stored-ZIP workbook utility.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function set16(view, offset, value) { view.setUint16(offset, value, true); }
function set32(view, offset, value) { view.setUint32(offset, value >>> 0, true); }

function joinBytes(parts) {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function storedZip(entries) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const [name, text] of entries) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(text);
    const checksum = crc32(data);
    const localHeader = new Uint8Array(30);
    const localView = new DataView(localHeader.buffer);
    set32(localView, 0, 0x04034b50);
    set16(localView, 4, 20);
    set16(localView, 6, 0x0800);
    set16(localView, 8, 0);
    set16(localView, 10, 0);
    set16(localView, 12, 0x0021);
    set32(localView, 14, checksum);
    set32(localView, 18, data.byteLength);
    set32(localView, 22, data.byteLength);
    set16(localView, 26, nameBytes.byteLength);
    set16(localView, 28, 0);
    localParts.push(localHeader, nameBytes, data);

    const centralHeader = new Uint8Array(46);
    const centralView = new DataView(centralHeader.buffer);
    set32(centralView, 0, 0x02014b50);
    set16(centralView, 4, 20);
    set16(centralView, 6, 20);
    set16(centralView, 8, 0x0800);
    set16(centralView, 10, 0);
    set16(centralView, 12, 0);
    set16(centralView, 14, 0x0021);
    set32(centralView, 16, checksum);
    set32(centralView, 20, data.byteLength);
    set32(centralView, 24, data.byteLength);
    set16(centralView, 28, nameBytes.byteLength);
    set16(centralView, 30, 0);
    set16(centralView, 32, 0);
    set16(centralView, 34, 0);
    set16(centralView, 36, 0);
    set32(centralView, 38, 0);
    set32(centralView, 42, localOffset);
    centralParts.push(centralHeader, nameBytes);
    localOffset += localHeader.byteLength + nameBytes.byteLength + data.byteLength;
  }
  const centralBytes = joinBytes(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  set32(endView, 0, 0x06054b50);
  set16(endView, 4, 0);
  set16(endView, 6, 0);
  set16(endView, 8, entries.length);
  set16(endView, 10, entries.length);
  set32(endView, 12, centralBytes.byteLength);
  set32(endView, 16, localOffset);
  set16(endView, 20, 0);
  return joinBytes([...localParts, centralBytes, end]);
}


export { storedZip };
