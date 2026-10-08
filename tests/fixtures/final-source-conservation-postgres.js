// Fictional relational fixture for conservation hashing. It exercises actual
// PostgreSQL foreign keys and cross-municipality scope, not municipal actions.
import assert from 'node:assert/strict';
import {municipalFootprintCatalog} from './municipal-footprint-synthetic.js';
export async function addFinalConservationQaTables(query,target){
 const existing=new Set((await query("SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'")).rows.map(r=>r.name));
 const catalog=municipalFootprintCatalog('municipal-sql144'),created=new Set();
 const type=c=>c==='catalog_kind'?'text':'uuid';
 for(const table of catalog.tables){
  if(existing.has(table.name))continue;
  assert.match(table.name,/^[a-z_]+$/);assert.ok(table.columns.every(c=>/^[a-z_]+$/.test(c)));
  await query(`CREATE TABLE public.${table.name}(${table.columns.map(c=>`${c} ${type(c)}${c==='id'?' PRIMARY KEY':''}`).join(',')},synthetic text NOT NULL DEFAULT 'fictional')`);
  created.add(table.name);
 }
 // Scope is declared by actual validated FKs. Do not invent a tenant column
 // on seals or applications to make them look like independent roots.
 for(const f of catalog.foreignKeys){
  if(!created.has(f.child))continue;
  if(f.parent_columns.length>1)await query(`ALTER TABLE public.${f.parent} ADD CONSTRAINT ${f.name}_parent UNIQUE(${f.parent_columns.join(',')})`);
  await query(`ALTER TABLE public.${f.child} ADD CONSTRAINT ${f.name} FOREIGN KEY(${f.child_columns.join(',')}) REFERENCES public.${f.parent}(${f.parent_columns.join(',')})`);
 }
 if(!existing.has('platform_tenant'))await query("CREATE TABLE public.platform_tenant(id uuid PRIMARY KEY,status text NOT NULL)");
 await query("INSERT INTO public.platform_tenant(id,status) VALUES($1::uuid,'active')",[target.tenantId]);
 const otherTenant='01010101-0101-4101-8101-010101010101',otherBinding='02020202-0202-4202-8202-020202020202';
 for(const [suffix,tenant,binding]of [['1',target.tenantId,target.bindingId],['2',otherTenant,otherBinding]]){
  const id='03030303-0303-4303-8303-03030303030'+suffix;
  for(const table of ['employment_adoption_proposal','employment_adoption_decision'])await query(`INSERT INTO public.${table}(id,tenant_id,source_binding_id) VALUES($1,$2,$3)`,[id,tenant,binding]);
  await query('INSERT INTO public.employment_adoption_seal(id,proposal_id) VALUES($1,$1)',[id]);
  await query('INSERT INTO public.employment_adoption_application(id,decision_id) VALUES($1,$1)',[id]);
 }
 return {created:created.size,municipalTables:86,syntheticOnly:true};
}
