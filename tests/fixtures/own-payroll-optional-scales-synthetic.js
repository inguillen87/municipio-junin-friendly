// Synthetic configuration only. No municipal values, approvals or identities.
import {approvedSources} from './own-payroll-approved-synthetic.js';
import {uid,hash} from './own-payroll-program-synthetic.js';
import {salaryItems} from '../../assets/native-salary-catalog-model.js';
import {policySha256} from '../../assets/own-payroll-policy-validity.js';
import {OWN_PAYROLL_OPTIONAL_SCALES_VERSION,OWN_OPTIONAL_SCALE_CATALOGUE_VERSION} from '../../assets/own-payroll-optional-scales.js';
export const optionalScaleRow=(patch={})=>({active:true,agreementCode:'1',categoryCode:'6',code:'90',dependencies:[],kind:'scale',label:'Escala adicional sintética',nature:null,precision:2,ruleReference:'Decisión sintética, sin efecto municipal',unit:'money',validFrom:'2026-10',validUntil:null,value:'12.34',...patch});
export function stampOptionalCatalogue(source){
 const catalog=source.programState.salaryCatalog;
 source.sourceInventory={...(source.sourceInventory??{}),optionalScales:{version:OWN_OPTIONAL_SCALE_CATALOGUE_VERSION,complete:true,tenantId:uid(900),sourceBindingId:uid(901),revision:catalog.revision,approvalId:uid(902),proposalId:uid(903),catalogueVersion:catalog.version,itemsSha256:policySha256(catalog.items),itemCount:catalog.items.length}};
 return source;
}
export function optionalScaleSources({rows=[],period='2026-10',count=2}={}){
 const source=approvedSources(count);source.period=period;source.monthly.batches=[];
 source.fixed.list.data.periodMonth=period+'-01';source.fixed.export.data.periodMonth=period+'-01';
 const rule={code:'90',agreementCode:'1',nature:'non_remuneration',unit:'money',validFrom:'2026-10',validUntil:null,liquidationTypes:['monthly'],ruleReference:'Adicional opcional sintético',rounding:{precision:2,mode:'exact'},expression:{op:'input',key:'additional90',unit:'money'}};
 source.programState.program.definition={namespaceVersion:'own-payroll-namespaces.v2',optionalScalesVersion:OWN_PAYROLL_OPTIONAL_SCALES_VERSION,totalsPrecision:2,rules:[rule],bindings:[{agreementCode:'1',key:'additional90',unit:'money',sourceKind:'optional_scale',sourceCode:'90',onMissing:'zero',combine:'single',ruleReference:'Catálogo aprobado íntegro, caso sintético'}]};
 source.programState.salaryCatalog.items=salaryItems([{...optionalScaleRow(),kind:'concept',categoryCode:null,nature:'non_remuneration',value:null},...rows]);
 source.programState.program.salaryVersion=source.programState.salaryCatalog.version=hash('c');
 return stampOptionalCatalogue(source);
}
