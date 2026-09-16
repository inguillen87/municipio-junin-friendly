// Synthetic identities only; never production data.
export const ID='11111111-1111-4111-8111-111111111111',CONTRACT='22222222-2222-4222-8222-222222222222',TENANT='33333333-3333-4333-8333-333333333333',MEMBER='44444444-4444-4444-8444-444444444444',SESSION='55555555-5555-4555-8555-555555555555';
export const draft=(patch={})=>({legajo:'',fullName:'PERSONA SINTÉTICA QA',dni:'99999990',cuil:'20999999906',birthDate:'1990-01-01',sexCode:'',startDate:'2026-10-01',agreementCode:'1',categoryCode:'6',organizationId:'1',sectorCode:'1',jobTitle:'',legalReference:'Resolución sintética QA',...patch});
export const catalog={version:'c'.repeat(64),items:[
 {kind:'agreements',code:'1',label:'Convenio QA 1'},{kind:'agreements',code:'2',label:'Convenio QA 2'},
 {kind:'categories',code:'6',agreementCode:'1',label:'6-D'},{kind:'categories',code:'13',agreementCode:'2',label:'13-I'},
 {kind:'organizations',code:'1',label:'Repartición QA'},{kind:'sectors',code:'1',label:'Sector QA'}]};
export const bootstrap={version:'native-employee.v1',canCreate:true,today:'2026-09-16',suggestedLegajo:'5001',catalog};
export const receipt={version:'native-employee.v1',registrationId:ID,contractId:CONTRACT,legajo:'5001',name:'PERSONA SINTÉTICA QA',startDate:'2026-10-01',createdAt:'2026-09-16T12:00:00Z',origin:'MUNICONTROL',accountCreated:false,payrollCalculated:false,replayed:false};
export const principal={user:{email:'qa@example.invalid'},tenant:{source:'membership',id:TENANT,membershipId:MEMBER,effectiveCapabilities:['workforce.employee.read','employee.record.create']}};
export const session={id:SESSION,email:'qa@example.invalid',version:1,releaseSha:'a'.repeat(40)};
