// «Consultar cortes» (final and mixed) reads the shared catalogue of prepared backups through
// employment_adoption_prepared_sources_v1, a function installed in production outside the numbered migrations. The product
// reader (lib/internal-employment-adoption-prepared-sources.js) refuses any other body by its pinned hash. Disposable QA
// schemas do not have the function; this installs the same exact definition, captured from the live catalogue and pinned
// here by hash, relocated like every other QA function. Pure construction: no connection and no SQL is executed here.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ADOPTION_PREPARED_SOURCES_READER_SHA256} from '../../lib/internal-employment-adoption-prepared-sources.js';

export const PREPARED_SOURCES_FUNCTION='employment_adoption_prepared_sources_v1';
export const PREPARED_SOURCES_FIXTURE='tests/fixtures/employment-adoption-prepared-sources.sql.txt';
export const PREPARED_SOURCES_FIXTURE_SHA256='3eb3e31afe5edbd4f9ff428b11dd33425539aa20ee8f4ae4cf6f7f78a99bd601';
const sha256=value=>createHash('sha256').update(value).digest('hex');
const body=definition=>{const match=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?\s*$/.exec(definition);assert.ok(match,'QA_PREPARED_SOURCES_BODY_REQUIRED');return match[2];};
// pg_get_functiondef spelling of the installed setting, and the spelling the QA relocation understands.
const installedSearchPath="SET search_path TO 'pg_catalog', 'public', 'pg_temp'",relocatableSearchPath='SET search_path=pg_catalog,public,pg_temp';
const installedHeader='CREATE OR REPLACE FUNCTION public.'+PREPARED_SOURCES_FUNCTION+'(p jsonb)';

// The fixture is the unformatted pg_get_functiondef text. Its body must be the one the product reader admits.
export function preparedSourcesDefinition(read=file=>fs.readFileSync(new URL('../../'+file,import.meta.url),'utf8')){
 const source=read(PREPARED_SOURCES_FIXTURE);
 assert.equal(sha256(source),PREPARED_SOURCES_FIXTURE_SHA256,'QA_PREPARED_SOURCES_SOURCE_CHANGED');
 assert.equal(sha256(body(source)),ADOPTION_PREPARED_SOURCES_READER_SHA256,'QA_PREPARED_SOURCES_READER_PIN_CHANGED');
 return source;
}

// `relocate` moves a canonical `public.` definition into the disposable schema. The statements create the function (never
// replace one), leave it executable only by its owner and the runtime role, exactly as the reader demands, and report the
// hash of the relocated body: the QA maps the reader's pin to it, so the reader's own metadata gate keeps deciding.
export function preparedSourcesForQa({schema,relocate,read}){
 assert.match(schema,/^mc_qa_[a-z0-9_]+$/,'QA_PREPARED_SOURCES_DESTINATION');assert.equal(typeof relocate,'function','QA_PREPARED_SOURCES_RELOCATION_REQUIRED');
 const source=preparedSourcesDefinition(read);
 for(const anchor of[installedHeader,installedSearchPath])assert.equal(source.split(anchor).length,2,'QA_PREPARED_SOURCES_HEADER_CHANGED');assert.ok(source.startsWith(installedHeader));
 const definition=relocate(source.replace(installedSearchPath,()=>relocatableSearchPath)).replace('CREATE OR REPLACE FUNCTION ',()=>'CREATE FUNCTION ').trimEnd(),signature=schema+'.'+PREPARED_SOURCES_FUNCTION+'(jsonb)';
 assert.ok(definition.startsWith('CREATE FUNCTION '+schema+'.'+PREPARED_SOURCES_FUNCTION+'(p jsonb)'),'QA_PREPARED_SOURCES_NOT_RELOCATED');
 assert.ok(!definition.includes('public.')&&!definition.includes(installedSearchPath)&&definition.includes(schema),'QA_PREPARED_SOURCES_NOT_RELOCATED');
 assert.equal(body(definition),body(source).replaceAll('public.',schema+'.'),'QA_PREPARED_SOURCES_BODY_REWRITTEN');
 return Object.freeze({signature,canonicalSha256:ADOPTION_PREPARED_SOURCES_READER_SHA256,relocatedSha256:sha256(body(definition)),
  statements:Object.freeze([definition,'REVOKE ALL ON FUNCTION '+signature+' FROM PUBLIC','GRANT EXECUTE ON FUNCTION '+signature+' TO municontrol_actions_runtime_app'])});
}
