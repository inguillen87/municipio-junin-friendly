// Inert catalog observation source. Called only by the existing native190 CI tail.
// No installer, role switch, receipt-function call or event-row observation.
import {classifyReceipt126Inventory} from './own-payroll-receipt126-inventory-model.mjs';
export function readReceipt126Same190Inventory(h){
 const schema=h?.qa?.schema;
 if(!h||typeof h.json!=='function'||![17,18].includes(h.major)||h.qa?.operationalPairBaseline!=='published107'||typeof schema!=='string'||!/^mc_qa_fixed_092_[a-f0-9]{32}$/.test(schema))throw Error('RECEIPT126_SAME190_CONTEXT_REQUIRED');
 const statement=`WITH scope AS (
 SELECT n.oid,n.nspowner FROM pg_catalog.pg_namespace n WHERE n.nspname='${schema}'
 ), relation AS (
 SELECT c.* FROM pg_catalog.pg_class c JOIN scope n ON n.oid=c.relnamespace WHERE c.relname='own_payroll_receipt_event'
 )
 SELECT pg_catalog.jsonb_build_object(
 'version','own-receipt126-catalog-inventory.v1',
 'schema',(SELECT pg_catalog.jsonb_build_object('name','${schema}','oid',n.oid::bigint,'ownerOid',n.nspowner::bigint) FROM scope n),
 'bodyHashBasis','pg_proc.prosrc_utf8_lf',
 'table',(SELECT pg_catalog.jsonb_build_object(
  'oid',c.oid::bigint,'kind',c.relkind,'persistence',c.relpersistence,'ownerOid',c.relowner::bigint,'ownerMatchesSchema',c.relowner=(SELECT nspowner FROM scope),
  'rlsEnabled',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
  'acl',CASE WHEN c.relacl IS NULL THEN NULL ELSE(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('grantorOid',a.grantor::bigint,'granteeOid',a.grantee::bigint,'privilegeType',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantor,a.grantee,a.privilege_type),'[]'::jsonb) FROM pg_catalog.aclexplode(c.relacl) a) END,
  'columns',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('position',a.attnum,'name',a.attname,'type',pg_catalog.format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'dropped',a.attisdropped,'identityKind',a.attidentity,'generatedKind',a.attgenerated,
   'defaultSha256',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_expr(d.adbin,d.adrelid),'UTF8')),'hex'),
   'acl',CASE WHEN a.attacl IS NULL THEN NULL ELSE(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('grantorOid',x.grantor::bigint,'granteeOid',x.grantee::bigint,'privilegeType',x.privilege_type,'grantable',x.is_grantable) ORDER BY x.grantor,x.grantee,x.privilege_type),'[]'::jsonb) FROM pg_catalog.aclexplode(a.attacl) x) END) ORDER BY a.attnum),'[]'::jsonb) FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0),
  'constraints',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('oid',k.oid::bigint,'name',k.conname,'type',k.contype,'validated',k.convalidated,'deferrable',k.condeferrable,'initiallyDeferred',k.condeferred,'keyPositions',pg_catalog.to_jsonb(k.conkey),'referencedTableOid',k.confrelid::bigint,'definitionSha256',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_constraintdef(k.oid,true),'UTF8')),'hex')) ORDER BY k.oid),'[]'::jsonb) FROM pg_catalog.pg_constraint k WHERE k.conrelid=c.oid),
  'triggers',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('oid',t.oid::bigint,'name',t.tgname,'internal',t.tgisinternal,'enabled',t.tgenabled,'eventMask',t.tgtype,'functionOid',t.tgfoid::bigint,'functionSchema',n.nspname,'functionName',p.proname,'definitionSha256',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_triggerdef(t.oid,true),'UTF8')),'hex')) ORDER BY t.oid),'[]'::jsonb) FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE t.tgrelid=c.oid),
  'indexes',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('oid',i.indexrelid::bigint,'name',idx.relname,'unique',i.indisunique,'primary',i.indisprimary,'valid',i.indisvalid,'ready',i.indisready,'keyPositions',pg_catalog.to_jsonb(i.indkey::smallint[]),'definitionSha256',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_indexdef(i.indexrelid),'UTF8')),'hex')) ORDER BY i.indexrelid),'[]'::jsonb) FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class idx ON idx.oid=i.indexrelid WHERE i.indrelid=c.oid),
  'policies',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('oid',p.oid::bigint,'name',p.polname,'permissive',p.polpermissive,'command',p.polcmd,'roleOids',(SELECT coalesce(pg_catalog.jsonb_agg(r::bigint ORDER BY r),'[]'::jsonb) FROM pg_catalog.unnest(p.polroles) r),'usingSha256',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_expr(p.polqual,p.polrelid),'UTF8')),'hex'),'checkSha256',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid),'UTF8')),'hex')) ORDER BY p.oid),'[]'::jsonb) FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid)
 ) FROM relation c),
 'functions',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'oid',p.oid::bigint,'name',p.proname,'identityArguments',pg_catalog.pg_get_function_identity_arguments(p.oid),'resultType',pg_catalog.pg_get_function_result(p.oid),'language',l.lanname,'kind',p.prokind,
  'securityDefiner',p.prosecdef,'leakproof',p.proleakproof,'strict',p.proisstrict,'returnsSet',p.proretset,'volatility',p.provolatile,'parallel',p.proparallel,'config',pg_catalog.to_jsonb(p.proconfig),'ownerOid',p.proowner::bigint,'ownerMatchesSchema',p.proowner=(SELECT nspowner FROM scope),
  'acl',CASE WHEN p.proacl IS NULL THEN NULL ELSE(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('grantorOid',a.grantor::bigint,'granteeOid',a.grantee::bigint,'privilegeType',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantor,a.grantee,a.privilege_type),'[]'::jsonb) FROM pg_catalog.aclexplode(p.proacl) a) END,
  'bodySha256',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(p.prosrc,E'\\r\\n',E'\\n'),'UTF8')),'hex')
 ) ORDER BY p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid),p.oid),'[]'::jsonb)
 FROM pg_catalog.pg_proc p JOIN scope n ON n.oid=p.pronamespace JOIN pg_catalog.pg_language l ON l.oid=p.prolang WHERE pg_catalog.left(p.proname,12)='own_receipt_'),
 'capabilityDefinitions',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('key',c.capability_key,'label',c.label,'description',c.description,'scopeKind',c.scope_kind,'sensitivity',c.sensitivity) ORDER BY c.capability_key),'[]'::jsonb)
 FROM ${schema}.iam_capability c WHERE c.capability_key IN('payroll.receipt.approve','payroll.receipt.prepare','payroll.receipt.self.read'))
 )`;
 const observed=h.json([statement],{readOnly:true,fullJson:true});
 const classified=classifyReceipt126Inventory(observed,schema);
 return Object.freeze({...classified,sameCanonical190:true,observedBy:'existing_h_json_readonly_full',queryCount:1,receiptWorkflowExecuted:false,installationAllowed:false});
}
