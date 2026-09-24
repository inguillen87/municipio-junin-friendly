// Compare JSON number lexemes without converting decimal amounts to binary floating point.
function invalid(){throw Object.assign(new Error('GRH_CURATED_REVIEW_NUMBER_INVALID'),{code:'GRH_CURATED_REVIEW_NUMBER_INVALID'});}
export function canonicalCuratedNumber(lexeme){
 if(typeof lexeme!=='string'||lexeme.length>4096)invalid();
 const m=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(lexeme);
 if(!m||(m[4]?.replace(/^[+-]/,'').length??0)>5)invalid();
 const fraction=m[3]??'';let digits=(m[2]+fraction).replace(/^0+/,'');
 if(!digits)return '0';
 let exponent=BigInt(m[4]??'0')-BigInt(fraction.length);
 const trailing=/0+$/.exec(digits)?.[0].length??0;
 if(trailing){digits=digits.slice(0,-trailing);exponent+=BigInt(trailing);}
 return m[1]+digits+'e'+exponent.toString();
}
export class ExactCuratedNumber {
 constructor(lexeme){this.canonical=canonicalCuratedNumber(lexeme);Object.freeze(this);}
}
export function reviveCuratedNumber(_key,value,context){
 if(typeof value!=='number')return value;
 if(typeof context?.source!=='string')invalid();
 const exact=new ExactCuratedNumber(context.source);
 if(Number.isSafeInteger(value)&&exact.canonical===canonicalCuratedNumber(JSON.stringify(value)))return value;
 return exact;
}
