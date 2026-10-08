import {curatedFixture,coordinatedFixture} from './grh-successor-panel-synthetic.js';
import {summarizeEmployeeSourceFacts} from '../../assets/grh-employee-source-facts.js';
export const employee=(n,patch={})=>({sourceKey:{companyCode:'101',employeeNumber:String(n)},
 identity:{fullName:'PRIVATE_SYNTHETIC_PERSON',documentNumber:'PRIVATE_SYNTHETIC_DOCUMENT'},employment:{activeProxy:n%3!==0},unionMemberships:[],
 sourceFields:{iddepartamento:n%2?'1':'2',NOLI_12:n%2?'0':'1',SUEL_12:'100.100000000000000001'},
 sourceProvenance:{table:'legajo',primaryKey:{CODI_01:'101',LEGA_12:String(n)}},
 sourceReferences:{department:{table:'departamento',primaryKey:{iddepartamento:n%2?'1':'2'},sourceFields:{nombre:n%2?'042':'055'}}},...patch});
export function employeeFactsFixture(){const value=curatedFixture();value.version='grh-curated-successor-comparison.v2';value.employeeSourceFacts={
 baseline:summarizeEmployeeSourceFacts(Array.from({length:value.artifacts.employees.before},()=>({employment:{activeProxy:true}}))),
 candidate:summarizeEmployeeSourceFacts(Array.from({length:value.artifacts.employees.after},(_,n)=>employee(n+1)))};return value;}
export function coordinatedEmployeeFactsFixture(){const value=coordinatedFixture();value.version='grh-coordinated-successor-review.v2';value.curated=employeeFactsFixture();return value;}
