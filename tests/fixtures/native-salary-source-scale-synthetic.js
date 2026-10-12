import {SCALE_REFERENCE_FIELDS,SCALE_REFERENCE_HEADER} from '../../assets/native-salary-source-scale-model.js';
// Every value and identifier here is fictional. No municipal source bytes.
export const sourceDeclaration={validFrom:'2026-09',validUntil:null,ruleReference:'Documento ficticio QA',active:true,sourceConfirmed:true};
export const sourceMappings=SCALE_REFERENCE_FIELDS.map((field,n)=>({field,code:String(700+n),label:'Base ficticia '+field}));
export const sourceCell=value=>'"'+(value===''?'':"'"+value).replaceAll('"','""')+'"';
export function sourceFixture(count=31){
 const agreements=['1','4','6'],classification=agreements.map(code=>({kind:'agreements',code,label:'Convenio ficticio '+code})),records=[];
 for(let n=0;n<count;n++){
  const agreementCode=agreements[n%agreements.length],categoryCode=String(n+1);classification.push({kind:'categories',agreementCode,code:categoryCode,label:'Clase ficticia '+categoryCode});
  for(const [index,field] of SCALE_REFERENCE_FIELDS.entries())records.push(['202',agreementCode,categoryCode,field,['100.001','0.000','-12.500','9999999999999999.999'][index],'3','2026-10-01T10:11:12','a'.repeat(64),'']);
 }
 return {classification,records,text:'\ufeff'+SCALE_REFERENCE_HEADER.map(v=>'"'+v+'"').join(';')+'\r\n'+records.map(r=>r.map(sourceCell).join(';')+'\r\n').join('')};
}
export function sourceText(records){return '\ufeff'+SCALE_REFERENCE_HEADER.map(v=>'"'+v+'"').join(';')+'\r\n'+records.map(r=>r.map(sourceCell).join(';')+'\r\n').join('');}
