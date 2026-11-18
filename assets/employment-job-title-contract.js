// One text contract for the job title (cargo), shared by the people who write it and by the payroll evidence that later
// conserves it. A title written through registration or a rectification therefore never stops a later capture or receipt.
// Pure and dependency-free so the registration form and its API can load it without the payroll modules.
export const EMPLOYMENT_JOB_TITLE_MAX_UNITS=120;

// Fixed reason codes. Neither the value nor a normalized substitute is ever returned.
export function employmentJobTitleReasons(value){
 if(value===null)return [];
 if(typeof value!=='string')return ['invalid_type'];
 if(value.length===0)return ['empty'];
 if(value.length>EMPLOYMENT_JOB_TITLE_MAX_UNITS)return ['utf16_length'];
 const reasons=[];
 // PostgreSQL UTF8/jsonb cannot hold lone surrogates; reject them before they reach a writer or a reader.
 if([...value].some(character=>{const cp=character.codePointAt(0);return cp>=0xd800&&cp<=0xdfff;}))reasons.push('invalid_unicode');
 if(value!==value.trim())reasons.push('exterior_whitespace');
 if(value!==value.normalize('NFC'))reasons.push('non_nfc');
 if(/[\u0000-\u001f\u007f-\u009f]/.test(value))reasons.push('control_characters');
 if(/[‪-‮⁦-⁩]/.test(value))reasons.push('bidirectional_controls');
 if(/[<>]/.test(value))reasons.push('markup_characters');
 return reasons;
}

const MESSAGES=Object.freeze({
 invalid_type:'Revisá el cargo o función.',
 utf16_length:'El cargo admite hasta 120 caracteres; algunos símbolos cuentan como dos.',
 invalid_unicode:'El cargo contiene un carácter inválido. Escribilo de nuevo.',
 exterior_whitespace:'El cargo no puede empezar ni terminar con espacios.',
 non_nfc:'El cargo contiene letras con acentos separados. Escribilo de nuevo.',
 control_characters:'No se admiten etiquetas ni caracteres de control.',
 bidirectional_controls:'El cargo contiene marcas invisibles de dirección de escritura, que suelen venir al copiar y pegar. Escribilo de nuevo.',
 markup_characters:'No se admiten etiquetas ni caracteres de control.',
});

// Input side: the same NFC + trim every writer already applied, then the shared contract. An empty title stays empty
// (the writer stores it as unknown, never as text). Returns {value} or {message}; it never repairs the text.
export function employmentJobTitleInput(raw){
 if(typeof raw!=='string')return {message:MESSAGES.invalid_type};
 const value=raw.normalize('NFC').trim();
 if(value==='')return {value};
 const reasons=employmentJobTitleReasons(value);
 return reasons.length?{message:MESSAGES[reasons[0]]??MESSAGES.invalid_type,reasons}:{value};
}
