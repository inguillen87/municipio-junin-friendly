import {SALARY_NATURES,SALARY_UNITS} from '../../assets/native-salary-catalog-model.js';

export const salaryDefinitionTitle=row=>`${row.kind==='scale'?'Escala':row.kind==='auxiliary'?'Auxiliar':'Concepto'} ${row.code} · convenio ${row.agreementCode}${row.categoryCode?' · clase '+row.categoryCode:''} · desde ${row.validFrom}`;
export default function NativeSalaryDefinition({row}){
 return row?<dl className="sc-values"><dt>Descripción</dt><dd>{row.label}</dd><dt>Naturaleza / unidad</dt><dd>{SALARY_NATURES[row.nature]??'Escala salarial'} · {SALARY_UNITS[row.unit]} · {row.precision} decimales</dd><dt>Valor declarado</dt><dd>{row.value===null?'No informado; no se presume cero':row.value}</dd><dt>Vigencia</dt><dd>{row.validFrom} a {row.validUntil??'sin fin informado'} · {row.active?'Habilitada':'Desactivada'}</dd><dt>Respaldo</dt><dd>{row.ruleReference}</dd><dt>Dependencias</dt><dd>{row.dependencies.length?row.dependencies.join(' · '):'Sin dependencias declaradas'}</dd></dl>:<p>No existe esa definición en el destino.</p>;
}
