// Receipt v6 reader: the frozen facts a pay slip prints besides its amounts (docs: OWN_RECEIPT_V6_CONTRACT_20261113).
// Units per printed concept, employment start date, classification and the masked declared account. Nothing here reads
// current employment or bank data, recalculates an amount or fills a missing fact: an absent historical fact stays null.
import {salaryExact,salaryHash,salarySerialized,salaryUuid} from './native-salary-catalog-model.js';

export const OWN_RECEIPT_PRINT_FACTS_VERSION='own-receipt-print-facts.v1';
export const OWN_RECEIPT_PRINT_FACTS_SNAPSHOT_VERSION='own-receipt-snapshot.v6';
// The producer masks on the server. A reader only accepts a number that shows, at most, its last four characters.
export const OWN_RECEIPT_ACCOUNT_MASK='*';
// Same closed sets the approved bank-account definition admits (own-bank-accounts.v1): the type may be undeclared.
export const OWN_RECEIPT_ACCOUNT_TYPES=Object.freeze({CA:'Caja de ahorro',CC:'Cuenta corriente'});
export const OWN_RECEIPT_ACCOUNT_CURRENCIES=Object.freeze(['ARS','USD']);

const need=(condition,message)=>{if(!condition)throw Error(message);};
const same=(left,right)=>salarySerialized(left)===salarySerialized(right);
// Same text rule the receipt reader applies to identities and labels.
const text=(value,max=160)=>typeof value==='string'&&value===value.trim()&&value===value.normalize('NFC')&&value.length>=1&&value.length<=max&&!/[<>\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(value);
const optionalText=(value,max)=>value===null||text(value,max);
function civilDate(value){
 const m=typeof value==='string'?/^((?:19|20)\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(value):null;
 if(!m)return false;
 const date=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));
 return date.getUTCFullYear()===+m[1]&&date.getUTCMonth()===+m[2]-1&&date.getUTCDate()===+m[3];
}
// An ISO instant with zone whose date and time exist. Date.parse is not used to decide: it turns 30 February into
// 2 March and accepts hour 24, and a frozen instant must be the one that was written.
function instant(value){
 const m=typeof value==='string'?/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value):null;
 return !!m&&civilDate(m[1])&&+m[2]<=23&&+m[3]<=59&&+m[4]<=59&&(m[5]===undefined||+m[5]<=23&&+m[6]<=59);
}
// Exactly what the producer writes for an account number of 1 to 40 characters: the mask repeated over everything but
// the last four characters, which stay as they are (an account number may carry «-» or «/»); four or fewer characters
// are hidden completely. Same length as the original, so nothing else can travel in it.
export function ownReceiptMaskedAccount(value){
 // Counted in characters (code points), as PostgreSQL's char_length and right() do: an account number is NFC text, not
 // only ASCII. Same character rules as the SQL text check: no surrounding spaces, markup or control characters.
 if(typeof value!=='string'||value!==value.normalize('NFC')||/^ | $/.test(value)||/[<>\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(value))return false;
 const characters=Array.from(value);
 if(characters.length<1||characters.length>40)return false;
 const hidden=characters.length<=4?characters.length:characters.length-4;
 return characters.slice(0,hidden).every(character=>character===OWN_RECEIPT_ACCOUNT_MASK);
}

// Validates `record.printFacts` against the official record that carries it. Returns the same object, untouched.
export function ownReceiptPrintFacts(record){
 const facts=record?.printFacts;
 need(salaryExact(facts,['version','frozenAt','units','employmentStartDate','classification','paymentDestination','sources'])&&facts.version===OWN_RECEIPT_PRINT_FACTS_VERSION&&instant(facts.frozenAt),'No se verificaron los datos de impresión conservados del recibo.');
 need(Array.isArray(facts.units)&&Array.isArray(record.concepts)&&facts.units.length===record.concepts.length,'Las unidades conservadas no cubren exactamente los conceptos impresos.');
 const quantities=new Map((record.quantities??[]).map(quantity=>[quantity.conceptCode,quantity]));
 facts.units.forEach((unit,index)=>{
  const concept=record.concepts[index],original=quantities.get(concept.code)??null;
  need(salaryExact(unit,['rowKey','quantity'])&&unit.rowKey===record.contractId+':concept:'+concept.code,'Una unidad conservada no corresponde al concepto impreso en ese orden.');
  need(original===null?unit.quantity===null:same(unit.quantity,original),'Una unidad impresa no es la copia exacta de la cantidad original del cálculo.');
 });
 need(facts.employmentStartDate===null||civilDate(facts.employmentStartDate),'La fecha de ingreso conservada no es una fecha civil.');
 need(salaryExact(facts.classification,['categoryCode','categoryLabel','jobTitle','positionStructure'])&&optionalText(facts.classification.categoryCode,40)&&optionalText(facts.classification.categoryLabel,160)&&optionalText(facts.classification.jobTitle,160)&&optionalText(facts.classification.positionStructure,240),'No se verificó la clasificación conservada del recibo.');
 const destination=facts.paymentDestination;
 need(destination===null||(salaryExact(destination,['bankLabel','accountType','accountNumberMasked','currency','referenceDate'])&&text(destination.bankLabel,160)&&(destination.accountType===null||(typeof destination.accountType==='string'&&Object.hasOwn(OWN_RECEIPT_ACCOUNT_TYPES,destination.accountType)))&&(destination.accountNumberMasked===null||ownReceiptMaskedAccount(destination.accountNumberMasked))&&OWN_RECEIPT_ACCOUNT_CURRENCIES.includes(destination.currency)&&civilDate(destination.referenceDate)),'La cuenta declarada no está enmascarada o está incompleta.');
 const sources=facts.sources;
 need(salaryExact(sources,['runId','payloadSha256','inputSha256','resultSha256','employmentEvidenceSha256','bankConfigurationVersion','bankApprovalId'])&&sources.runId===record.runId&&sources.payloadSha256===record.payloadSha256&&sources.inputSha256===record.inputSha256&&sources.resultSha256===record.resultSha256,'Los datos de impresión no pertenecen al mismo cálculo original del recibo.');
 need(sources.employmentEvidenceSha256===null||salaryHash(sources.employmentEvidenceSha256),'No se verificó la huella del encuadre conservado.');
 // Without the frozen employment component there is nothing that backs an employment fact.
 need(sources.employmentEvidenceSha256!==null||(facts.employmentStartDate===null&&Object.values(facts.classification).every(value=>value===null)),'Un dato de empleo no tiene encuadre conservado que lo respalde.');
 need(destination===null?sources.bankConfigurationVersion===null&&sources.bankApprovalId===null:salaryHash(sources.bankConfigurationVersion)&&salaryUuid(sources.bankApprovalId),'La cuenta declarada no conserva su revisión aprobada, o hay una revisión sin cuenta.');
 return facts;
}

// Presentation only. A missing quantity prints nothing: it is never shown as 0, 1, days or a percentage.
const UNIT_SUFFIX={days:' d',hours:' h',minutes:' min',percent:' %',units:'',coefficient:'',money:''};
const groupThousands=digits=>digits.replace(/\B(?=(\d{3})+(?!\d))/g,'.');
function decimalText(value){
 const m=/^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value));
 need(m,'Una cantidad conservada no es un decimal exacto.');
 const fraction=(m[3]??'').replace(/0+$/,'');
 return m[1]+groupThousands(m[2])+(fraction?','+fraction:'');
}
function exactText({numerator,denominator}){
 need(/^-?\d+$/.test(String(numerator))&&/^[1-9]\d*$/.test(String(denominator)),'Una cantidad conservada no es una fracción exacta.');
 let n=BigInt(numerator),d=BigInt(denominator);
 const negative=n<0n;if(negative)n=-n;
 const gcd=(a,b)=>{while(b){[a,b]=[b,a%b];}return a;};
 const g=gcd(n,d)||1n;n/=g;d/=g;
 // A decimal is printed only when its expansion is finite, so it is exact; otherwise the fraction is kept.
 let rest=d,places=0;
 while(rest%10n===0n){rest/=10n;places++;}
 let twos=0,fives=0;
 while(rest%2n===0n){rest/=2n;twos++;}
 while(rest%5n===0n){rest/=5n;fives++;}
 if(rest!==1n)return (negative?'-':'')+groupThousands(n.toString())+'/'+groupThousands(d.toString());
 places+=Math.max(twos,fives);
 const scaled=(n*10n**BigInt(places))/d,digits=scaled.toString().padStart(places+1,'0');
 const whole=digits.slice(0,digits.length-places),fraction=places?digits.slice(-places).replace(/0+$/,''):'';
 return (negative?'-':'')+groupThousands(whole)+(fraction?','+fraction:'');
}
export function ownReceiptQuantityText(quantity){
 if(quantity===null||quantity===undefined)return '';
 need(Object.hasOwn(UNIT_SUFFIX,quantity.unit)&&['exact','rounded'].includes(quantity.stage),'Una cantidad conservada tiene una unidad o etapa desconocida.');
 // A rounded quantity prints the decimal already proven by the run; an exact one prints its own value.
 const number=quantity.stage==='rounded'?decimalText(quantity.decimalValue):exactText(quantity.value);
 return number+UNIT_SUFFIX[quantity.unit];
}
// The printed quantity of each visible concept, by concept code. Empty text when the calculation produced none.
export function ownReceiptPrintedQuantities(record){
 const facts=record?.printFacts;
 if(!facts)return null;
 return new Map(facts.units.map((unit,index)=>[record.concepts[index].code,ownReceiptQuantityText(unit.quantity)]));
}
export const OWN_RECEIPT_DECLARED_ACCOUNT_LABEL='Cuenta de acreditación declarada';
export function ownReceiptDeclaredAccountText(destination){
 if(!destination)return '';
 // An undeclared type prints nothing: it is not guessed from the number.
 return [destination.bankLabel,destination.accountType===null?null:OWN_RECEIPT_ACCOUNT_TYPES[destination.accountType],destination.accountNumberMasked??'número no informado',destination.currency].filter(part=>part!==null).join(' · ');
}
