// Guarded forward214; preserves complete payroll state and every non-target definition.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
import {buildSalaryAuxiliaryNamespaceSql} from './salary-auxiliary-namespace-installation.mjs';
import {composeOwnFullCapacity190Installation} from './own-payroll-full-capacity-190-installation.mjs';
import {composeOwnCloseSnapshot214Equivalence,OWN_CLOSE_SNAPSHOT214_EQUIVALENCE_ENTRIES} from './own-close-snapshot214-equivalence.mjs';

export const OWN_CLOSE_SNAPSHOT214_SQL="scripts/migrations/214-own-close-snapshot-linear-collection.sql";
export const OWN_CLOSE_SNAPSHOT214_SOURCE_PINS=Object.freeze({
 "scripts/migrations/112-native-salary-definitions.sql": "da72986b8eb8b834f8f11f0cdfd793708eba90c96de59c399ff063fe31a95cd3",
 "scripts/migrations/122-own-payroll-programs.sql": "edaf70ef87f9ac3de170e079c460d38c4188b36de349b5c58808f5a09a9f9785",
 "scripts/migrations/104-native-employment-changes.sql": "0f3e408bb12ef64c0d197826ce4331b263987c6d7f36719e528648f4b750de4a",
 "scripts/migrations/123-own-payroll-runs.sql": "a9fe1129e921bb7c01985b8caadb009f6086aef9866e2298398175f7f25b4b6b",
 "scripts/migrations/124-own-payroll-liquidation-decisions.sql": "03035e3f7e126b1561222f1a894bcf1000dd586b6d05fb579cb4722d9aa41f4a",
 "scripts/migrations/125-own-payroll-close.sql": "443127dd55b9be5f37da47af303fcdd599b4d5dc0aad0a319a18253f8f139af5",
 "scripts/migrations/132-employment-adoption-preparation.sql": "8166f5785cf8846ba63065df506471d0f49efca0f7c3e92d6c6d755ac988a274",
 "scripts/migrations/133-employment-adoption-application.sql": "36230ca788dc8afc3312c9bbb25ecf45029bf84a1a2373669a48245cca798ea9",
 "scripts/migrations/134-employment-adoption-history-read.sql": "d326c185d37448b5b5d1517cc2d694a1eb1f947eae911ddd2a610a91ceb31120",
 "scripts/migrations/135-native-employee-read-projection.sql": "6d2e3f512340b0986ebd94845ffa86ef42d46d7d0fc2ba5958db4721a7491ea0",
 "scripts/migrations/136-adopted-employment-lifecycle.sql": "577f0c7aee2d594ec67153810e052190b1a055b17d4d0a6ba96065f68ea1870a",
 "scripts/migrations/096-grh-effective-source.sql": "92c54747f9e4fb28ad624ef6876b712f48d02f127d2a7a5b7c448097c6f4e15f",
 "scripts/migrations/110-native-employment-lifecycle.sql": "e31ee11235b8ac2579e2d0d4c863627a146d062e883faef48420e4d39fb66219",
 "scripts/migrations/103-native-employment-catalog.sql": "759bde35236dc0add938e55664f0addb3c301f79e4ecfdf0771300dbd9795cd6",
 "scripts/migrations/067-native-employee-registration.sql": "aa33538cea459a275de8056b8316f3eb4465ebb88ad1de54578bb24380c4d749",
 "scripts/migrations/137-adopted-operator-context.sql": "b1db803f7d50d6a744cfdf8bf5fcc8af08395ca9b6d67f8704cde4b7eab64d0f",
 "scripts/migrations/138-adopted-fixed-novelties.sql": "da7bc276e367dc3c0377c99e3c687747665a53c0c186eb457f27ab9032803469",
 "scripts/migrations/139-adopted-monthly-novelties.sql": "691c07b4b16fe1e681e9b6024d00e447251937ffb231176fa617e8d82647ab95",
 "scripts/migrations/140-adopted-own-payroll-capture.sql": "6c5993aeedf2152074265fb912121d846ad293f74c7b1a39fca3c261964ec8e0",
 "scripts/migrations/141-adopted-own-payroll-close.sql": "96cd6fd2a2f81b023a8481b89b0a8fb7bd0971011fcef49498e93f4a9bab82a3",
 "scripts/migrations/142-adopted-own-payroll-receipts.sql": "c92e086f7aa3c43e4662ead5ded70709092a03d9d6612bd81cdc7ba302deb294",
 "scripts/migrations/130-own-bulk-novelties.sql": "27bfed41ea1449b964fc8719c4d71a145ba9693b9c86086e2fa5db2fd14a9e4d",
 "scripts/migrations/101-native-monthly-novelties.sql": "17da7f491d64babfdc2c0a15e215809e814a6451cdd7d69e94ca49e995475801",
 "scripts/migrations/143-own-payroll-jurisdiction-snapshot.sql": "1486014334a5e70d8c1bb7dbb4025cdddfb3a741dc299d51cfc2803a938aa5fe",
 "scripts/migrations/144-final-grh-source-revision.sql": "818e53c560da8ec3cad55073071d0a56669c6581f51c20d910600ea58b9697d5",
 "scripts/lib/final-contract-adoption-installation.mjs": "c1fc4d150ee118cbeb42f0650f7d7e78db6d4689017870180b969051bbf12d6f",
 "scripts/lib/grh-final-contract-transition.mjs": "222e5e86a0c2a6c285c4220a22b0f41a455864c6635a6915d44b70c01e6b369c",
 "scripts/lib/municipal-adoption-operator-installation.mjs": "81787d0cb0be77196d90e7c3d446c55e030bfa57c63e962807fadf4604714756",
 "scripts/lib/active-contract-adoption-installation.mjs": "f7467d80caff2f07de915433358b52844435d69340450a9a62fbd4d9ba64f387",
 "scripts/lib/active-adoption-serialization-installation.mjs": "ab00c62b16deaa8d346775a5bbde3dc96cac5db0bf0fc14d0ec1838324ab10cd",
 "scripts/lib/final-identity-profile-installation.mjs": "7338ebb3eae58500fb79a12bac3c00888190eefc00911d8c4823627587c86e45",
 "scripts/lib/active-source-declarations-installation.mjs": "1996f4ddd44dbb26fa6798fcb9cbc96e84724fd08a634a18da98efeed16ce11a",
 "scripts/migrations/145-own-declared-liquidation-date.sql": "26db273be2b24cad51e67f8e465b73c2855aedb6daed7a079f4e274c0434099d",
 "scripts/lib/registry-original-facts-installation.mjs": "1aae39db872ee61c06b378536e15329eedff31264f0668907aedd0db8c4c160e",
 "scripts/lib/own-payroll-run-date-installation.mjs": "ea7da7faa1f1d66e8581fd7ad54bf193d3ea221c5eb9a30999408cde965c588b",
 "scripts/lib/salary-auxiliary-namespace-installation.mjs": "6d492a4c56adba6a78242604f27b86ba18067359c1b28dc39879e50d43eed9b9",
 "scripts/lib/native-leave-installation.mjs": "57d7f79c358665dc208dfcb9b0d7b2a2ecebaba84dfb6c6057bb3acef6bb25ef",
 "scripts/lib/own-payroll-installation.mjs": "6ad8f07733adfb17b6a32a6efd228073bfb3566844b858167581e2d7896bb3d0",
 "scripts/lib/sql-statements.mjs": "d81477c5aed918e944aefe16d05015080acc4fe543059cbf15e2c69e9f5201c2",
 "scripts/migrations/201-own-full-payroll-decision-capacity.sql": "46de1308360a076eff1453f57a9e4f4d6c14ba176d73cf8531b7b0821ed35b1b",
 "scripts/migrations/214-own-close-snapshot-linear-collection.sql": "28e53f17aecb60fe1d51c4b55e4bca39dec3bac5ec8df6ec10da3ee800240130",
 "scripts/lib/own-payroll-full-capacity-190-installation.mjs": "f88d5a1979201c17572ae3c6932675dc991641cb736b9480895fd2ff761153eb",
 "assets/civil-date.js": "8675aae822c336aa038da1af04b0e72b181303692efdab80ab735b3b7d453efb",
 "assets/employment-adoption-mixed-cohort.js": "3993a99c00d57c552744d60171a949183002e5d7f3b0fdad2a20051cd4c3572c",
 "assets/employment-adoption-operational-cohort.js": "f366762a32892895a2fd67885372b4abe7592028cec057951e2271eb2fa286cd",
 "assets/employment-adoption-review-model.js": "574ccab7293082b88306c64aa9930e6792660245b27260629056ca2253ef3d88",
 "assets/employment-source-declarations.js": "e9afd849b099c0235955e1d9675364f134342dd63efc5b7797b07c96d466405b",
 "assets/native-employee-confirmation-model.js": "625c8eb8a4ed2c660fdb70bf3ea0189313490d0a6fb67198c54a1e8464295829",
 "assets/native-employee-contract.js": "cfc986253c3d1a59f091d1a2926ac483068a2ffc5521a8dc5ed228f0eb6f95a7",
 "assets/native-employment-catalog-model.js": "40a8989a232e7b7919f97fb457a739797383c9e46eb80c452f9f72d386a670ca",
 "assets/native-employment-lifecycle-model.js": "5fd92064504995b9f71a0ebf1a50ea26be0977c04ae5d0b4a26cf10d027d9393",
 "assets/native-salary-catalog-model.js": "0277d8e93a362e4bdfd3f2b698d84b6903ef2bb7f774d932423e2088dcfea908",
 "assets/native-salary-stream-model.js": "1cfdd9c44b9de3ea73dc54c45ab72bb8c3b39f7c77e0040938256df52901a9f2",
 "assets/own-agreement-working-time-model.js": "4dcfda9e2159cb16ea822b7ebef0c21c56c7154e047605e556247c42e0d55e27",
 "assets/own-agreement-working-time-program.js": "649579614470a337cba017a199e2c5c4a853858eb08bcc556f4a3fa6d2c6bc6f",
 "assets/own-contract-salary-conditions-model.js": "14998c8813fdbb82a572ffb47bce553cf4be15579e4f2cbfb673c2934ed024e4",
 "assets/own-contract-working-time-model.js": "b81fafe69cca3bbf69715eef1522957b76423830c2332192a3d9a1b7554504e5",
 "assets/own-monthly-day-declaration-model.js": "f425f3beb553df8366d8fdbc32d89f5bea1b6280ef45835643b629d5b0134864",
 "assets/own-monthly-day-declaration-program.js": "d38b09d6e3ab48dec108f9a1976bb948291893cc42f2150c876736fcc5ab0982",
 "assets/own-monthly-day-policy-model.js": "7c51746f680aafa3d14d183ed1cef6914aa9669e4a931719a4bd3b1734d1bb7f",
 "assets/own-monthly-day-policy-program.js": "e947a12108128052f9900eb9777eadfe5387a1227671b2f770c646dc186d3d5c",
 "assets/own-payroll-close-model.js": "a761bcf5fcfc8d160200799d9ac729efb8af535cea9e4aa3df760bc5836a3264",
 "assets/own-payroll-conditions.js": "3c490719bc233827e7847d0b39906c1519528b9a2c3a4b38652055382d013f11",
 "assets/own-payroll-engine.js": "ce406f804ed0e1aa90e1f515da011caf16b95eaf4b0d28c1bd04ecd091057a5e",
 "assets/own-payroll-exact.js": "975d7192e2b407ba149bff185fae6bd60ed85f085ac48e788c432e97d1855666",
 "assets/own-payroll-jurisdiction-model.js": "3b278f0728bfef494f2099609bc8addabc8c0eebc9f9b2b2e8625aa4787a5439",
 "assets/own-payroll-monetary-manifest.js": "70f67119f767586c050fe200303528d1f4a3f18e195326d2312e25d25b005b3b",
 "assets/own-payroll-monetary-policy.js": "a4979613ccb5f21cfa5aff49cfe07fda593f657cb112587f1d0f712eca09c09c",
 "assets/own-payroll-novelties-model.js": "cdcc650de599a3505db8ba80d132c885877beeb5992d3a0c74a730a412e2e080",
 "assets/own-payroll-period-classification.js": "651ddba1ad0036df5083f283b1c23d77ad70bd0bb41d948b888ebf319b1f8c6a",
 "assets/own-payroll-period-context.js": "147926a853a63ee73b75b191f56638c98698823a903bf1d19d2b1ad4ee3af4e5",
 "assets/own-payroll-program-model.js": "f4b3101fb8cf050dbe8f11fb61b46065706c7a7e231a52cf126019f04d9701a8",
 "assets/own-payroll-receipt-model.js": "991a76fc3912a0a92fcff88f686c0c4ebeaa4266ae7a65e84c58b6327d6e9eb3",
 "assets/own-payroll-report-census-model.js": "f2817696040329935fb5c717caf03c3d9feaed33a86f947d530c766eb506ca56",
 "assets/own-payroll-report-legajo.js": "903bdf7f5a2dabf7c83bae892dcd61ecf815fcca1a82f69befd56dc2c92e31d2",
 "assets/own-payroll-report-model.js": "2f7ddb3989c55f0435fbb998ebf605353e818fcf13cb44369eb457114dcf3a98",
 "assets/own-payroll-report-statement.js": "9e1852f8c7279b5c138d46b90473c0e397a24e82dd3671bb8ee9d3d530a7da48",
 "assets/own-payroll-report-variables.js": "1f7d9ff380ccb6fa3a0451774dafb95ff5b32a15415fa3f1b8e8f44afd78b481",
 "assets/own-payroll-response.js": "8c3f755274e79a7a1bafe849d05ec105ca2974dd3d34c39e56dcbdbb1aa02688",
 "assets/own-payroll-run-date.js": "ea30ee07f0abc5a7a4253ec10852d41b53bcafdba386aea7cf865868aae735db",
 "assets/own-payroll-run-model.js": "8dca2715bd2dbc14f8deb1491899ccb363fc8c5996290de2365262f260993b2a",
 "assets/own-payroll-run-workspace-model.js": "ed4636cfe779c7f4ba911514294c73e073180bb6b0b8274155f64f99a8620edb",
 "assets/own-period-classification-model.js": "867b674d51dd15b22ad8d9ac7eff3da5c6336a79a149ad0f00703a2e97895df3",
 "assets/own-period-participation-model.js": "d5995e857438f66ed9923c844c211f99fe752b91dd5cea90888196eda501a441",
 "assets/own-period-participation-program.js": "f85ea1fb0dd2d0c6f908f54defa8778f928477c313783c2b056afb81ba255a05",
 "assets/own-salary-seniority-model.js": "d49b73cbeb990c9a4359326d86e695ed2bce44c7d48f7764a0206c6111e70f1f",
 "assets/payroll-fixed-capacity-model.js": "476e1188f3416c935ab6d8b1d234b4d60816839b023d919fbfb7a8352b25a5cc",
 "assets/payroll-fixed-novelties-model.js": "e8b5d3480401fb8c616d0688713303486b8850f9e3615944165448749a2a5240",
 "assets/payroll-native-monthly-model.js": "c91a5bc981eb43a750af2f774829ddb8f865dbdc63cd9db024872474787c6522",
 "lib/internal-native-employees.js": "0f044bb371566fe2225ae875ca0383657c05f27fc876019b08ba779d80e121d8",
 "lib/internal-native-salary.js": "f9c66548004e722820e1a3b500775156f8ad9c4ca0ebbc7f97f18564016a3aca",
 "lib/internal-own-payroll-run.js": "5ae996ad4bb48d35136fa5fc45d2c434ec4b8c8a064c1e80ec325a05033201ad",
 "lib/own-monthly-day-declaration-input.js": "c0e0fc065dd4b32b44f20c1003a874e83bfc342d3ed3fa94ba1095bd622ec565",
 "lib/own-monthly-day-policy-input.js": "ab480a160478ab67bdd9e010916eb570dfc9a3e3aed09bb2c2377d9f57857b47",
 "lib/own-payroll-approved-input.js": "df80132c620ab9c60d9427ccc46daa44851495f34c9c3607ab00e329d661a03a",
 "lib/own-payroll-monetary-verification.js": "0c0e1bf1dd7ed1047b35ef4d0218a6e030ac0172036d48b6f06c4946d85135d4",
 "lib/own-payroll-snapshot.js": "9e795b2aa47c8c98e139389157fdcbb951c90e1d99a5fc6d1df17c9c38166da2",
 "scripts/lib/own-close-snapshot214-equivalence.mjs": "06c4dce1f2aaabe156cd3e86288052f360e4681b61685063fe7c850cae581688",
 "tests/fixtures/native-salary-synthetic.js": "83ac29be27d799127341cf226b61d952dd5c441b3203fbe4d83bea03fc5499e2",
 "tests/fixtures/novelty-saved-review-synthetic.js": "e0804ee8692db786a1d65c725b5093edf126ac3d74f3ffaa16b3061fb7ff3a09",
 "tests/fixtures/own-payroll-approved-synthetic.js": "3fa51ac1edbf3e0e235787d87916e8d22480e133153980a929bb71c9c3d2f748",
 "tests/fixtures/own-payroll-auxiliary-synthetic.js": "a7707214e4d3793eb54525f0871c0321475ae3154c158655c6b35939b4af827f",
 "tests/fixtures/own-payroll-close-synthetic.js": "d58aac0af4e97e0505f9c1b1f90d62ba3e211625975512ae9f482c37f5b1a42f",
 "tests/fixtures/own-payroll-liquidation-synthetic.js": "d7d6381555bf53e0828a9ce1e753270695a4270582bffb8719e06deafb113a99",
 "tests/fixtures/own-payroll-program-synthetic.js": "5de76098ed937c21927005bf69b4d33b968bca1aa26ccc534e398d4e4d165f81",
 "tests/fixtures/own-payroll-receipt-synthetic.js": "d3cc6af52061af6479d453e29302296681ed12e1bf4cbe94906c2dce1cd140d1",
 "tests/fixtures/own-payroll-run-synthetic.js": "5809fe3ac9c66c9f552aa00d1d4a15a70c153096679c9c2e95106bcd88683a71",
 "tests/fixtures/own-payroll-synthetic.js": "eefa7caec24aa20ca3a39f85491e8111f2399ce08eae7597699b853adbcb7812",
 "tests/fixtures/payroll-fixed-novelties-synthetic.js": "4f24beeea3c8655eb33e8264a38748f8802334dd257d59915c550fc53eaace91",
 "tests/fixtures/payroll-monthly-annul-synthetic.js": "da82148a69eda99faade1dda76135ac9c911b91b1c3b58fc3348aef6fb2d0f0a",
 "tests/own-close-snapshot214-equivalence.test.js": "63568ceab27b5bb5df5ec51f6cf4d907ded336ef4b76f633bfcc4672c212e1b2"
});
export const OWN_CLOSE_SNAPSHOT214_ENTRIES=Object.freeze([...new Set([
 'scripts/lib/own-close-snapshot214-installation.mjs',
 'tests/own-close-snapshot214-installation.test.js',
 ...OWN_CLOSE_SNAPSHOT214_EQUIVALENCE_ENTRIES,
 ...Object.keys(OWN_CLOSE_SNAPSHOT214_SOURCE_PINS)
])]);
const PREFIX='municontrol_close_snapshot214.',VERSION='own-close-snapshot214-installation.v1';
const q=v=>"'"+String(v).replaceAll("'","''")+"'",hash=v=>createHash('sha256').update(v).digest('hex');
const lf=value=>{assert.equal(typeof value,'string');return value.replace(/\r\n?/g,'\n');};
const clean=value=>value.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim();
const once=(text,old,next)=>{assert.equal(text.split(old).length,2,'CLOSE_SNAPSHOT214_SOURCE_ANCHOR_CHANGED');return text.replace(old,()=>next);};
const body=definition=>{const match=/\bAS\s+(\$\w*\$)([\s\S]*)\1\s*;?\s*$/.exec(definition);assert.ok(match,'CLOSE_SNAPSHOT214_FUNCTION_BODY_REQUIRED');return match[2];};
const one=(source,name)=>{const rows=splitPostgresStatements(source).map(clean).filter(value=>new RegExp('^CREATE(?: OR REPLACE)? FUNCTION public\\.'+name+'\\(').test(value));assert.equal(rows.length,1,'CLOSE_SNAPSHOT214_UNIQUE_FUNCTION_REQUIRED:'+name);return rows[0];};
const plans=new WeakMap();

// Three finite substitutions preserve the entire namespace/jurisdiction
// predecessor. No authority, validation, ordering or decimal rule changes.
export function deriveOwnCloseSnapshot214(original){
 const before={...ownInstallationFunctionPin(original),runtime:false};
 assert.equal(before.sha256,"11d46e478ab606b0a9d4602e83a072a16924e47d7b8d2da064ed1d7abd2885b0",'CLOSE_SNAPSHOT214_PREIMAGE_CHANGED');
 assert.deepEqual({...before,sha256:null},{"name":"own_close_snapshot_v1","signature":"public.own_close_snapshot_v1(jsonb,jsonb)","sha256":null,"argNames":["detail","selection"],"defaults":"","resultType":"jsonb","language":"plpgsql","returnsSet":false,"strict":false,"definer":true,"volatility":"i","config":["search_path=pg_catalog, public, pg_temp"],"runtime":false},'CLOSE_SNAPSHOT214_PREIMAGE_METADATA_CHANGED');
 let changed=original;for(const [old,next]of [["concepts jsonb:='[]'","concepts jsonb[]:='{}'"],["concepts:=concepts||jsonb_build_array(concept)","concepts:=array_append(concepts,concept)"],["'concepts',concepts,'conceptCount',jsonb_array_length(concepts)","'concepts',to_jsonb(concepts),'conceptCount',cardinality(concepts)"]])changed=once(changed,old,next);
 assert.deepEqual({...ownInstallationFunctionPin(changed),runtime:false,sha256:null},{...before,sha256:null},'CLOSE_SNAPSHOT214_METADATA_CHANGED');
 return changed;
}

function snapshot(slot){
 let value=preservationSnapshot(slot);
 const excluded="p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')";
 assert.equal(value.split(excluded).length,3);value=value.replaceAll(excluded,'true');
 value=once(value,"AND NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",'AND true');
 value=once(value,"public.digest(to_jsonb(p)::text,'sha256')","public.digest((CASE WHEN p.oid=to_regprocedure('public.own_close_snapshot_v1(jsonb,jsonb)') THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text,'sha256')");
 return value.replaceAll('municontrol_sql111.',PREFIX);
}

export function composeOwnCloseSnapshot214Plan({foundation,major,sourceCommit,read}){
 assert.ok(foundation&&foundation.major===major&&foundation.sourceCommit===sourceCommit,'CLOSE_SNAPSHOT214_FOUNDATION_CHANGED');
 assert.ok([17,18].includes(major));assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 assert.match(foundation.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 assert.equal(foundation.operationalPairBaseline,'published107');assert.equal(typeof foundation.normalized,'function');assert.equal(typeof read,'function');
 const texts={};for(const [file,sha256]of Object.entries(OWN_CLOSE_SNAPSHOT214_SOURCE_PINS)){texts[file]=lf(read(file));assert.equal(hash(texts[file]),sha256,'CLOSE_SNAPSHOT214_SOURCE_CHANGED:'+file);}
 const namespace=buildSalaryAuxiliaryNamespaceSql({read:file=>{assert.ok(Object.hasOwn(texts,file),'CLOSE_SNAPSHOT214_UNPINNED_SOURCE:'+file);return texts[file];},sourceCommit});
 const originals=namespace.changed.filter(value=>value.startsWith('CREATE OR REPLACE FUNCTION public.own_close_snapshot_v1('));assert.equal(originals.length,1,'CLOSE_SNAPSHOT214_UNIQUE_PREDECESSOR');
 const original=originals[0],changed=deriveOwnCloseSnapshot214(original);
 const statements=splitPostgresStatements(texts[OWN_CLOSE_SNAPSHOT214_SQL]).map(clean);
 assert.deepEqual(statements,[changed],'CLOSE_SNAPSHOT214_UNREVIEWED_FORWARD_DEFINITION');
 const rawBefore={...ownInstallationFunctionPin(original),runtime:false},rawAfter={...ownInstallationFunctionPin(changed),runtime:false};
 const core=one(texts['scripts/migrations/201-own-full-payroll-decision-capacity.sql'],'own_close_command_capacity_core_v2');
 const rawPrerequisites=[{...ownInstallationFunctionPin(core),runtime:false}];
 const rawDefinitions=[original,changed,core];
 const localDefinitions=rawDefinitions.map(value=>foundation.normalized(value));
 const newLocalDigest=hash(body(localDefinitions[1]));
 // A new local digest is a private extension. No foundation/hash-map mutation.
 const normalize=value=>foundation.normalized(value).replaceAll(rawAfter.sha256,newLocalDigest);
 const localPin=(raw,definition)=>({...raw,signature:raw.signature.replace('public.',foundation.schema+'.'),config:raw.config.map(value=>value.replace('search_path=pg_catalog, public, pg_temp','search_path=pg_catalog, '+foundation.schema+', public, pg_temp')),sha256:hash(body(definition))});
 const beforePin=localPin(rawBefore,localDefinitions[0]),afterPin=localPin(rawAfter,localDefinitions[1]),prerequisites=rawPrerequisites.map((pin,index)=>localPin(pin,localDefinitions[index+2]));
 const beforeCheck=pinsCheck([...prerequisites,beforePin],'CLOSE_SNAPSHOT214_PREREQUISITE_CHANGED'),afterCheck=pinsCheck([...prerequisites,afterPin],'CLOSE_SNAPSHOT214_FUNCTION_CHANGED');
 const schema=foundation.schema,signature=afterPin.signature;
 const equivalence=composeOwnCloseSnapshot214Equivalence({schema,sourceCommit,read:file=>{assert.ok(Object.hasOwn(texts,file),'CLOSE_SNAPSHOT214_EQ_UNPINNED_SOURCE:'+file);return texts[file];},sourcePins:Object.fromEntries(OWN_CLOSE_SNAPSHOT214_EQUIVALENCE_ENTRIES.map(file=>[file,OWN_CLOSE_SNAPSHOT214_SOURCE_PINS[file]]))});
 const environment=readOnly=>`DO $close_snapshot214_environment$ BEGIN
 IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>${q(readOnly?'on':'off')}
  OR current_setting('server_version_num')::integer/10000<>${major}
  OR NOT EXISTS(SELECT 1 FROM pg_namespace n WHERE n.oid=${q(schema)}::regnamespace AND n.nspowner=current_user::regrole)
 THEN RAISE EXCEPTION 'CLOSE_SNAPSHOT214_OWNER_TRANSACTION_REQUIRED';END IF;
 END $close_snapshot214_environment$`;
 const digest=`(SELECT encode(public.digest(replace(p.prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex') FROM pg_proc p WHERE p.oid=to_regprocedure(${q(signature)}))`;
 const mode=`DO $close_snapshot214_mode$ BEGIN
 IF NOT pg_try_advisory_xact_lock(214) THEN RAISE EXCEPTION 'CLOSE_SNAPSHOT214_BUSY';END IF;
 IF ${digest}=${q(beforePin.sha256)} THEN PERFORM set_config('${PREFIX}mode','install',true);
 ELSIF ${digest}=${q(afterPin.sha256)} THEN PERFORM set_config('${PREFIX}mode','verify',true);
 ELSE RAISE EXCEPTION 'CLOSE_SNAPSHOT214_PARTIAL_OR_DRIFTED';END IF;
 END $close_snapshot214_mode$`;
 const choose=`DO $close_snapshot214_choose$ BEGIN IF current_setting('${PREFIX}mode')='install' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $close_snapshot214_choose$`;
 const before=normalize(snapshot('before')),after=normalize(snapshot('after'));
 const apply=`DO $close_snapshot214_apply$ BEGIN IF current_setting('${PREFIX}mode')='install' THEN EXECUTE ${q(localDefinitions[1])};END IF;END $close_snapshot214_apply$`;
 const conservation=`DO $close_snapshot214_conserved$ BEGIN IF current_setting('${PREFIX}before')::jsonb IS DISTINCT FROM current_setting('${PREFIX}after')::jsonb THEN RAISE EXCEPTION 'CLOSE_SNAPSHOT214_PRIOR_STATE_CHANGED';END IF;END $close_snapshot214_conserved$`;
 const proof=modeValue=>`SELECT jsonb_build_object('version',${q(VERSION)},'sourceCommit',${q(sourceCommit)},'schema',${q(schema)},'mode',${modeValue},'sourceHashes',${q(JSON.stringify(OWN_CLOSE_SNAPSHOT214_SOURCE_PINS))}::jsonb,'newTables',0,'newFunctions',0,'adaptedFunctions',1,'newCapabilities',0,'roleAssignmentsAdded',0,'existingAclChanges',0,'associationWrites',0,'businessWrites',0,'priorStatePreserved',true,'priorFingerprint',encode(public.digest(current_setting('${PREFIX}after')::jsonb::text,'sha256'),'hex'),'objectFingerprint',(SELECT encode(public.digest(to_jsonb(p)::text,'sha256'),'hex') FROM pg_proc p WHERE p.oid=to_regprocedure(${q(signature)})))`;
 const plan=Object.freeze({version:VERSION,foundation,major,sourceCommit,schema,sourceEntries:OWN_CLOSE_SNAPSHOT214_ENTRIES,sourceHashes:OWN_CLOSE_SNAPSHOT214_SOURCE_PINS,rawBefore,rawAfter,beforePin,afterPin,prerequisites:Object.freeze(prerequisites),original,changed,normalize,equivalence:Object.freeze({version:equivalence.version,caseDigest:equivalence.caseDigest,caseIds:Object.freeze([...equivalence.caseIds]),caseCount:equivalence.caseCount,positives:equivalence.positives,negatives:equivalence.negatives}),
  rehearsal:Object.freeze([environment(false),mode,choose,before,equivalence.before,apply,afterCheck,equivalence.after,after,conservation,equivalence.proof,proof("current_setting('"+PREFIX+"mode')")]),
  installation:Object.freeze([environment(false),mode,choose,before,apply,afterCheck,after,conservation,proof("current_setting('"+PREFIX+"mode')")]),
  verification:Object.freeze([environment(true),afterCheck,after,proof("'verify'")])});
 plans.set(plan,{read,sourceHashes:OWN_CLOSE_SNAPSHOT214_SOURCE_PINS});return plan;
}

// The historical201 admission remains immutable. A later authority check
// must require the exact214 successor, while retaining every other201 check.
export function projectOwnCloseSnapshot214Postflight(h,plan,postflight){
 const record=plans.get(plan);assert.ok(record,'CLOSE_SNAPSHOT214_UNMINTED_PLAN');
 assert.strictEqual(plan.foundation,h.qa);assert.equal(plan.sourceCommit,h.sourceCommit);
 for(const [file,pin]of Object.entries(record.sourceHashes))assert.equal(hash(lf(record.read(file))),pin,'CLOSE_SNAPSHOT214_SOURCE_CHANGED:'+file);
 const historical=composeOwnFullCapacity190Installation(h).postflight;
 assert.equal(postflight,historical,'CLOSE_SNAPSHOT214_HISTORICAL201_GUARD_CHANGED');
 assert.equal(postflight.split(plan.beforePin.sha256).length,2,'CLOSE_SNAPSHOT214_UNIQUE_PROTECTED_DEPENDENCY_REQUIRED');
 const updated=once(postflight,plan.beforePin.sha256,plan.afterPin.sha256);
 assert.equal(updated.split(plan.afterPin.sha256).length,2);
 assert.equal(once(updated,plan.afterPin.sha256,plan.beforePin.sha256),historical,'CLOSE_SNAPSHOT214_ONLY_ONE_BODY_PIN');
 return updated;
}

export function assertOwnCloseSnapshot214Proof(value,plan){
 assert.deepEqual(Reflect.ownKeys(value).sort(),['version','sourceCommit','schema','mode','sourceHashes','newTables','newFunctions','adaptedFunctions','newCapabilities','roleAssignmentsAdded','existingAclChanges','associationWrites','businessWrites','priorStatePreserved','priorFingerprint','objectFingerprint'].sort());
 assert.equal(value.version,VERSION);assert.equal(value.sourceCommit,plan.sourceCommit);assert.equal(value.schema,plan.schema);assert.ok(['install','verify'].includes(value.mode));
 assert.deepEqual(value.sourceHashes,plan.sourceHashes);
 for(const [key,wanted]of Object.entries({newTables:0,newFunctions:0,adaptedFunctions:1,newCapabilities:0,roleAssignmentsAdded:0,existingAclChanges:0,associationWrites:0,businessWrites:0,priorStatePreserved:true}))assert.equal(value[key],wanted,'CLOSE_SNAPSHOT214_PROOF_CHANGED:'+key);
 for(const key of ['priorFingerprint','objectFingerprint'])assert.match(value[key],/^[a-f0-9]{64}$/);
 return value;
}

export function installOwnCloseSnapshot214(h,plan){
 const record=plans.get(plan);assert.ok(record,'CLOSE_SNAPSHOT214_UNMINTED_PLAN');
 assert.strictEqual(plan.foundation,h.qa);assert.equal(plan.major,h.major);assert.equal(plan.schema,h.qa.schema);assert.equal(plan.sourceCommit,h.sourceCommit);
 assert.equal(h.sourceCustody?.sourceCommit,h.sourceCommit,'CLOSE_SNAPSHOT214_SOURCE_CUSTODY_REQUIRED');
 for(const [file,expected]of Object.entries(record.sourceHashes))assert.equal(hash(lf(record.read(file))),expected,'CLOSE_SNAPSHOT214_SOURCE_CHANGED:'+file);
 const baseline=h.readFullSnapshot();h.setPhase('close-snapshot214-rehearsal');
 const rehearsal=h.json(plan.rehearsal,{end:'ROLLBACK',fullJson:true});assertOwnCloseSnapshot214Proof(rehearsal,plan);assert.equal(rehearsal.mode,'install');
 assert.deepEqual(h.readFullSnapshot(),baseline,'CLOSE_SNAPSHOT214_REHEARSAL_CHANGED_STATE');
 h.setPhase('close-snapshot214-installation');const installed=h.json(plan.installation,{fullJson:true});assertOwnCloseSnapshot214Proof(installed,plan);assert.equal(installed.mode,'install');
 const committed=h.readFullSnapshot();h.setPhase('close-snapshot214-durable-readonly');const durable=h.json(plan.verification,{readOnly:true,fullJson:true});assertOwnCloseSnapshot214Proof(durable,plan);assert.equal(durable.mode,'verify');
 assert.deepEqual({...durable,mode:'install'},installed,'CLOSE_SNAPSHOT214_DURABILITY_CHANGED');assert.deepEqual(h.readFullSnapshot(),committed,'CLOSE_SNAPSHOT214_READBACK_CHANGED_STATE');
 h.setPhase('close-snapshot214-repetition');const repeated=h.json(plan.installation,{fullJson:true});assertOwnCloseSnapshot214Proof(repeated,plan);assert.equal(repeated.mode,'verify');assert.deepEqual(repeated,durable,'CLOSE_SNAPSHOT214_REPETITION_CHANGED');assert.deepEqual(h.readFullSnapshot(),committed,'CLOSE_SNAPSHOT214_REPETITION_CHANGED_STATE');
 h.check('forward214 preserves the entire close snapshot contract while collecting native concept arrays once, with all rows/OIDs/ACL conserved before full855 business');
 return Object.freeze({version:'own-close-snapshot214-admission.v1',passed:true,sourceCommit:h.sourceCommit,rehearsal,installed,durable,repeated,rehearsalEquivalence:Object.freeze({version:plan.equivalence.version,caseCount:plan.equivalence.caseCount,positives:plan.equivalence.positives,negatives:plan.equivalence.negatives,caseDigest:plan.equivalence.caseDigest,caseIds:[...plan.equivalence.caseIds],passed:true,oldNewEqual:true,javascriptOracleEqual:true,metadataEqual:true,omitted:0,transactionEnd:'ROLLBACK'}),sourceHashes:plan.sourceHashes,production:false});
}
