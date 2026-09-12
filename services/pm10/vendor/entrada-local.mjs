// SPDX-License-Identifier: GPL-2.0-only
// Entrada local extraida de consola v3, sin ejecucion automatica.
const FAILURE_MESSAGES = Object.freeze({
  INTERACTIVE_TERMINAL_REQUIRED: 'La entrada no es una consola interactiva. No usar tuberias ni redirecciones.',
  INPUT_ERROR: 'Fallo la lectura del teclado. No se envio una clave.',
  INPUT_CLOSED: 'Se cerro la entrada del teclado. No se envio una clave.',
  CANCELLED: 'Operacion cancelada.',
});
const fail = code => Object.assign(new Error(FAILURE_MESSAGES[code] || code), {code});

// Sin CHOICE: toda la entrada se procesa aqui. ENTER vacio repregunta,
// evitando que un salto residual termine la aplicacion antes de pedir la clave.
// Las claves se muestran como asteriscos. Se descartan las secuencias de escape.
export function promptDigits({label, maxDigits=6, secret=false, allowed=null,
  input=process.stdin, output=process.stdout}={}) {
  if (!input?.isTTY || !output?.isTTY || typeof input.setRawMode !== 'function') {
    return Promise.reject(fail('INTERACTIVE_TERMINAL_REQUIRED'));
  }
  return new Promise((resolve, reject) => {
    const storage=Buffer.alloc(maxDigits);
    let size=0, done=false, swallowLF=false;
    const originalRaw=input.isRaw === true;
    const finish=(err, result)=>{
      if (done) return;
      done=true;
      input.off('data',onData);input.off('error',onError);input.off('end',onEnd);
      try {input.setRawMode(originalRaw);} catch {}
      input.pause();storage.fill(0);output.write('\n');
      if (err) reject(err); else resolve(result);
    };
    const onError=()=>finish(fail('INPUT_ERROR'));
    const onEnd=()=>finish(fail('INPUT_CLOSED'));
    const reset=message=>{
      storage.fill(0);size=0;output.write('\n'+message+'\n'+label);
    };
    const onData=chunk=>{
      const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
      for (const b of bytes) {
        if (b===3 || b===27) return finish(fail('CANCELLED'));
        if (b===10 && swallowLF) {swallowLF=false;continue;}
        swallowLF=false;
        if (b===13 || b===10) {
          swallowLF=b===13;
          if (!size) {reset('Entrada vacia: escribi una opcion/clave. ESC cancela.');continue;}
          if (allowed && !allowed.includes(storage.subarray(0,size).toString('ascii'))) {
            reset('Opcion no valida.');continue;
          }
          return finish(null, Buffer.from(storage.subarray(0,size)));
        }
        if (b===8 || b===127) {
          if (size) {storage[--size]=0;output.write('\b \b');}
          continue;
        }
        if (b<48 || b>57 || size>=maxDigits) {
          // Invalid input never becomes a modified candidate key.
          return finish(Object.assign(new Error('Solo digitos dentro del limite indicado. No se conecto al reloj.'), {code:'LOCAL_INPUT_INVALID'}));
        }
        storage[size++]=b;
        output.write(secret?'*':String.fromCharCode(b));
      }
    };
    input.on('data',onData);input.once('error',onError);input.once('end',onEnd);
    try {input.setRawMode(true);output.write(label);input.resume();}
    catch {finish(fail('INPUT_ERROR'));}
  });
}

