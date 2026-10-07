// Metadata and zero-row aggregates only. No employee or municipal source records.
import {MUNICIPAL_CONTINUITY_TABLES,MUNICIPAL_CONTINUITY_BINDINGS,MUNICIPAL_CONTINUITY_INHERITANCE} from '../../scripts/lib/grh-municipal-continuity-schema.mjs';
export const municipalFootprintTarget=Object.freeze({projectId:'municipal-qa-project',branchId:'br-municipal-qa',databaseName:'municipal_qa',
 tenantId:'00000000-0000-0000-0000-000000000001',bindingId:'00000000-0000-0000-0000-000000000002',
 coreVersionId:'00000000-0000-0000-0000-000000000003',curatedVersionId:'00000000-0000-0000-0000-000000000004',publicationSha256:'a'.repeat(64)});
export function municipalFootprintCatalog(){
 const tables=MUNICIPAL_CONTINUITY_TABLES.map(name=>{const binding=MUNICIPAL_CONTINUITY_BINDINGS[name],inheritance=MUNICIPAL_CONTINUITY_INHERITANCE.find(p=>p.child===name);
  return {name,kind:'r',columns:binding?['id','tenant_id',binding]:['id',...inheritance.childColumns]};});
 const foreignKeys=MUNICIPAL_CONTINUITY_INHERITANCE.map((p,index)=>{
  const parent=tables.find(t=>t.name===p.parent);parent.columns=[...new Set([...parent.columns,...p.parentColumns])];
  return {child:p.child,parent:p.parent,name:'synthetic_scope_fk_'+index,child_schema:'public',parent_schema:'public',validated:true,child_columns:[...p.childColumns],parent_columns:[...p.parentColumns]};
 });
 return {tables,foreignKeys};
}
export function municipalFootprintResults(catalog=municipalFootprintCatalog(),target=municipalFootprintTarget){
 const metadata=()=>[{observation:{...target,readOnly:'on',isolation:'repeatable read',timezone:'UTC',snapshot:'10:20:11'}}];
 return [metadata(),structuredClone(catalog.tables),structuredClone(catalog.foreignKeys),
  ...[...MUNICIPAL_CONTINUITY_TABLES].sort().map(table=>[{observation:{table,rows:0,sha256:'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'}}]),
  structuredClone(catalog.tables),structuredClone(catalog.foreignKeys),metadata()];
}
