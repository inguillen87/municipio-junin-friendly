// Importes que se escriben en pesos y se guardan en centavos exactos.
//
// La persona escribe «1234,50» (o con punto). Se guarda «123450». No se redondea ni se completa nada: más de dos
// decimales, separadores de miles o texto se rechazan con un mensaje.
export function pesosToCents(text){
  const value=typeof text==='string'?text.trim():'';
  if(value==='')return null;
  const plain=value.replace(',','.');
  if(!/^-?(0|[1-9]\d{0,15})(\.\d{1,2})?$/.test(plain)||/^-0(\.0+)?$/.test(plain))throw Error('Escribí el importe en pesos, con hasta dos decimales y sin puntos de miles. Ejemplo: 1234,50');
  const [whole,decimals='']=plain.replace('-','').split('.');
  return ((BigInt(whole)*100n+BigInt(decimals.padEnd(2,'0')))*(plain.startsWith('-')?-1n:1n)).toString();
}
// Centavos guardados → cómo se leen: «$ 1.234,50». Un valor que no son centavos enteros se muestra tal cual.
export function centsToPesosText(cents){
  if(cents===null||cents===undefined||cents==='')return 'No informado';
  const value=String(cents);if(!/^-?\d+$/.test(value))return value;
  const negative=value.startsWith('-'),digits=value.replace('-','').padStart(3,'0');
  const whole=digits.slice(0,-2).replace(/\B(?=(\d{3})+(?!\d))/g,'.');
  return (negative?'-':'')+'$ '+whole+','+digits.slice(-2);
}
