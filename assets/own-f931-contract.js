import {isoDay} from './native-employee-contract.js';
import {ownReportQuery} from './own-payroll-report-model.js';
import {salaryExact} from './native-salary-catalog-model.js';

// Positional reference only: the public manual names V47.5. It does not
// certify V47.8/V48, fiscal mappings, decimal representation or encoding.
export const F931_REFERENCE=Object.freeze({version:'47.5',recordWidth:499,fieldCount:60,
 url:'https://serviciossegsoc.afip.gob.ar/djproforma/app/ayuda/Manual.pdf',
 sha256:'89beca64fac3648372b0b78495dbe339c87a522b42d0f1346729eeba338b447c',pages:'25–27'});
export const F931_VERSION_RULE=Object.freeze({effectiveDate:'2026-11-01',firstPeriod:'2026-11',
 url:'https://biblioteca.arca.gob.ar/search/query/norma.aspx?p=t%3ARAG%7Cn%3A5907%7Co%3A9%7Ca%3A2026%7Cf%3A30%2F09%2F2026',articles:'17–19'});
const definitions=[
 ['CUIL',11],['Apellido y nombre',30],['Cónyuge',1],['Cantidad de hijos',2],
 ['Código de situación',2],['Código de condición',2],['Código de actividad',3],['Código de zona',2],
 ['Porcentaje de aporte adicional SS',5],['Código de modalidad de contratación',3],['Código de obra social',6],['Cantidad de adherentes',2],
 ['Remuneración total',12],['Remuneración imponible 1',12],['Asignaciones familiares pagadas',9],['Importe aporte voluntario',9],
 ['Importe adicional OS',9],['Importe excedentes aportes SS',9],['Importe excedentes aportes OS',9],['Provincia localidad',50],
 ['Remuneración imponible 2',12],['Remuneración imponible 3',12],['Remuneración imponible 4',12],['Código de siniestrado',2],
 ['Marca de corresponde reducción',1],['Capital de recomposición LRT',9],['Tipo de empresa',1],['Aporte adicional de obra social',9],['Régimen',1],
 ['Situación de revista 1',2],['Día de inicio situación de revista 1',2],['Situación de revista 2',2],['Día de inicio situación de revista 2',2],
 ['Situación de revista 3',2],['Día de inicio situación de revista 3',2],['Sueldo',12],['SAC',12],['Horas extras',12],['Zona desfavorable',12],
 ['Vacaciones',12],['Cantidad de días trabajados',9],['Remuneración imponible 5',12],['Trabajador convencionado (0-No 1-Sí)',1],
 ['Remuneración imponible 6',12],['Tipo de operación',1],['Adicionales',12],['Premios',12],['Rem. Dto. 788/05 / Remuneración 8',12],
 ['Remuneración imponible 7',12],['Cantidad de horas extras',3],['Conceptos no remunerativos',12],['Maternidad / Art. 13 - Ley 27.674',12],
 ['Rectificación de remuneración',9],['Remuneración imponible 9',12],['Contribución tarea diferencial %',9],['Horas trabajadas',3],
 ['Seguro colectivo de vida obligatorio',1],['Importe detracción Ley 27430',12],
 ['Incremento salarial / Asignación no remunerativa Dec. 438/2023',12],['Remuneración imponible 11',12],
];
let position=1;
export const F931_FIELDS=Object.freeze(definitions.map(([label,width],i)=>{
 const from=position;position+=width;return Object.freeze({number:i+1,label,width,from,to:position-1});
}));
if(position!==500||F931_FIELDS.length!==60)throw Error('El diseño de referencia F.931 no está completo.');

export function ownF931Params(value){
 if(!salaryExact(value,['period','presentationDate','types'])||!isoDay(value.presentationDate))throw Error('Elegí período, fecha prevista de presentación y tipos completos.');
 const query=ownReportQuery({from:value.period,to:value.period,types:value.types});
 return {period:query.from,presentationDate:value.presentationDate,types:query.types};
}
export function ownF931VersionRequirement(value){
 const p=ownF931Params(value),byPeriod=p.period>=F931_VERSION_RULE.firstPeriod,byPresentation=p.presentationDate>=F931_VERSION_RULE.effectiveDate;
 return Object.freeze({mandatedVersion:byPeriod||byPresentation?'48':null,byPeriod,byPresentation,
  referenceVersion:F931_REFERENCE.version,referenceWidth:F931_REFERENCE.recordWidth,layoutConfirmed:false,
  label:byPeriod||byPresentation?'Requiere versión 48: su diseño debe verificarse antes de generar.':'Debe verificarse el diseño aplicable: el manual de referencia indica versión 47.5.'});
}
