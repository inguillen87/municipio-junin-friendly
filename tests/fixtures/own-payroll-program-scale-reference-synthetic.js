import {salaryItems,salaryRowKey} from '../../assets/native-salary-catalog-model.js';
import {OWN_PAYROLL_NAMESPACE_VERSION} from '../../assets/own-payroll-engine.js';
import {bootstrap} from './own-payroll-program-synthetic.js';
import {row} from './native-salary-synthetic.js';

// Invented classes, codes, amounts and evidence; never a municipal rule.
export function scaleReferenceFixture(targets=['1','4','6']){
 const boot=bootstrap(),source=row({kind:'scale',nature:null,categoryCode:'3',agreementCode:'1',code:'1',value:'100.010',precision:3,unit:'money',validFrom:'2026-10',validUntil:'2026-10'});
 boot.salaryCatalog.items=salaryItems([source,...targets.map(agreementCode=>row({kind:'auxiliary',nature:'auxiliary',agreementCode,code:'9000',unit:'money',value:null,precision:6,validFrom:'2026-10',validUntil:'2026-10'}))]);
 const draft={namespaceVersion:OWN_PAYROLL_NAMESPACE_VERSION,rules:[],bindings:[],totalsPrecision:6};
 const intent={sourceKey:salaryRowKey(source),auxiliaryCode:'9000',targets,validFrom:'2026-10',validUntil:'2026-10',liquidationTypes:['monthly'],factor:'1.50',precision:6,ruleReference:'Regla de referencia inventada QA, sin norma municipal',mode:'add',periodTreatment:null};
 return {boot,draft,intent,source};
}
