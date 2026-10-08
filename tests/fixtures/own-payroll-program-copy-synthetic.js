import { bootstrap, uid, hash } from './own-payroll-program-synthetic.js';
import { ownProgramRuleKey } from '../../assets/own-payroll-program-model.js';
export function copyFixture(targets = ['2','4']) {
  const base = bootstrap();
  const rule = {code:'606',agreementCode:'1',nature:'deduction',unit:'money',validFrom:'2026-01',validUntil:null,
    liquidationTypes:['monthly'],ruleReference:'Fórmula inventada exclusivamente QA',rounding:{precision:2,mode:'half_even'},expression:{op:'literal',unit:'money',value:'17.125'}};
  const definition = {rules:[rule],bindings:[],totalsPrecision:2};
  base.salaryCatalog.items = ['1',...targets].map(agreementCode => ({active:true,agreementCode,categoryCode:null,code:'606',dependencies:[],kind:'concept',label:'Retención inventada QA',nature:'deduction',precision:2,ruleReference:'Definición sintética QA',unit:'money',validFrom:'2026-01',validUntil:null,value:null}));
  base.program = {version:hash('b'),revision:1,definition,salaryVersion:hash('c'),proposalId:uid(80),approvalId:uid(81)};
  return {boot:base,draft:structuredClone(definition),intent:{sourceKey:ownProgramRuleKey(rule),targets,validFrom:'2026-10',validUntil:null,ruleReference:'Cambio explícito sintético QA',mode:'add'}};
}
export function multiCopyFixture(targets=['2','4'],codes=['606','607','612','550']) {
  const f=copyFixture(targets),rule=f.draft.rules[0],item=f.boot.salaryCatalog.items[0];
  f.draft.rules=codes.map(code=>({...structuredClone(rule),code,expression:{op:'literal',unit:'money',value:code+'.125'}}));
  f.boot.salaryCatalog.items=codes.flatMap(code=>['1',...targets].map(agreementCode=>({...item,code,agreementCode})));
  f.boot.program.definition=structuredClone(f.draft);
  f.intent={...f.intent,sourceKeys:f.draft.rules.map(ownProgramRuleKey)};delete f.intent.sourceKey;return f;
}
