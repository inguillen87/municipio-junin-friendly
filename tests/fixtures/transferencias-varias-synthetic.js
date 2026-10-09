// Deliberately synthetic byte layout. No municipal source records.
export function syntheticVarRecord({month='8',year='2026',cents='12345',concept='VAR'}={}) {
  return new TextEncoder().encode('1234567890123456789012'+cents.padStart(10,'0')+'20123456789'.padEnd(22,' ')+'PERSONA SINTETICA'.padEnd(40,' ')+'0000000042'+`HABERES ${month}-${year}`.padEnd(60,' ')+concept);
}
export function syntheticVarFile(rows){
  const bytes=new Uint8Array(rows.reduce((n,r)=>n+r.length+2,0));let offset=0;
  for(const row of rows){bytes.set(row,offset);offset+=row.length;bytes.set([13,10],offset);offset+=2;}return bytes;
}
