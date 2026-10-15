// Static metadata can be compared between independent connections. Whole data
// preservation remains an exact before/after assertion inside each transaction.
import assert from'node:assert/strict';
export function installationPriorMetadataFingerprint(slot){
 assert.equal(typeof slot,'string');assert.ok(slot.length<100&&/^municontrol_[a-z0-9_]+\.(?:before|after)$/.test(slot));
 return "encode(public.digest(jsonb_build_object('objects',current_setting('"+slot+"')::jsonb-'tables'-'sequences','tables',(SELECT jsonb_agg(v-'rows'-'rowsSha256' ORDER BY v->>'schema',v->>'name') FROM jsonb_array_elements(current_setting('"+slot+"')::jsonb->'tables') v),'sequences',(SELECT jsonb_agg(jsonb_build_object('definition',to_jsonb(seq),'owner',relation.relowner,'acl',relation.relacl,'options',relation.reloptions) ORDER BY seq.seqrelid) FROM pg_sequence seq JOIN pg_class relation ON relation.oid=seq.seqrelid JOIN pg_namespace ns ON ns.oid=relation.relnamespace WHERE ns.nspname NOT LIKE 'pg_%' AND ns.nspname<>'information_schema'))::text,'sha256'),'hex')";
}
