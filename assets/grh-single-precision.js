// Cómo guarda GRH un importe.
// GRH calcula y guarda cada importe en precisión simple (número de 32 bits) y lo escribe con los dígitos mínimos que lo
// identifican. Por debajo de $131.072 eso alcanza para todos los centavos; por encima no: los valores posibles van de a
// 1/64, 1/32, 1/16 de peso y así. Por eso GRH liquida 382.692,72 donde la escala dice 382.692,71, y 463.058,20 donde dice
// 463.058,18. Se comprobó sobre los 17.846 importes no nulos de la liquidación mensual de octubre de 2026: todos son
// representables de esta forma, incluidos los 7.537 mayores a $131.072.
//
// Esto no es una tolerancia ni un redondeo de MuniControl: dice cómo quedaría en GRH un importe exacto. Si la forma más
// corta no cabe en centavos, no se afirma nada (null).
export function grhSinglePrecision(amount) {
  if (typeof amount !== 'string' || !/^-?(0|[1-9][0-9]{0,12})(\.[0-9]{1,6})?$/.test(amount)) return null;
  const negative = amount.startsWith('-'), single = Math.fround(Number(negative ? amount.slice(1) : amount));
  if (!Number.isFinite(single)) return null;
  // Nueve dígitos significativos identifican cualquier número de precisión simple; se busca la escritura más corta.
  let text = null;
  for (let digits = 1; digits <= 9 && text === null; digits++) {
    const candidate = single.toPrecision(digits);
    if (Math.fround(Number(candidate)) === single) text = candidate;
  }
  if (text === null) return null;
  const value = Number(text);
  let plain;
  if (Number.isSafeInteger(value)) plain = String(value) + '.00';
  else {
    const parts = /^(0|[1-9][0-9]*)\.([0-9]{1,2})$/.exec(text);
    if (!parts) return null;
    plain = parts[1] + '.' + parts[2].padEnd(2, '0');
  }
  return (negative && plain !== '0.00' ? '-' : '') + plain;
}
