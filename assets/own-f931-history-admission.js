// Puerta de activación del lector histórico F.931. Es FUENTE de la versión publicada, no catálogo:
// root reemplaza la constante únicamente con el texto que emite
// scripts/lib/own-f931-history-release-gate.mjs tras la admisión durable (200→201[→215]).
// Inactiva: el panel y las API conservan exactamente el camino operativo v1 vigente.
// R21: despacho explícito por versión. 'own-f931-current-state-admission.v1' (modo admit_current_state, época 201+215,
// emitida por scripts/lib/own-f931-current-state-admission.mjs) tiene su propio conjunto exacto de claves; el contrato
// histórico v1 y su custodia no cambian. La constante exportada sigue inactiva (v1, todos los campos de prueba null).
export const OWN_F931_HISTORY_ADMISSION_VERSION='own-f931-history-admission.v1';
export const OWN_F931_HISTORY_EPOCHS=Object.freeze(['201','201+215']);
export const OWN_F931_HISTORY_FACADES=Object.freeze(['census','groupFull','liquidationDetailFull']);
export const OWN_F931_HISTORY_DESTINATION_KEYS=Object.freeze(['major','projectId','branchId','endpointId','database','role']);
export const OWN_F931_HISTORY_ADMISSION=Object.freeze({"version":"own-f931-current-state-admission.v1","activated":true,"sourceCommit":"4dc2c19b7549e07e1cad52b16924d25f87ea5589","epoch":"201+215","target":{"major":17,"projectId":"noisy-poetry-54471701","branchId":"br-plain-dust-acpjgebb","endpointId":"ep-shiny-cherry-actlyudg","database":"neondb","role":"neondb_owner"},"protocol":"9150efac997c256f397e3d6bb9538dab","mode":"admit_current_state","installedProvenance":{"sourceCommit":"47c98ecb6115ea6c60a58d3f56c79b5d0ba9ff11","major":17},"capacityPostflightSha256":"9e12aae6d1d166bef021314e8954e5bddab2a3bdaf7901e37ae2c9e819056ffc","ledgerProjectionSha256":"10de24f887201c7676e95aeacb36723d0262e9f595dc089c5a1b86cbbba1a18a","facades":{"census":"5912530eb374316518cf7b33006b0bb7555040391131321b82c000a455da1ebd","groupFull":"2bb9b017085a8441e44f70dfe8545ed52a7fda9ce4258e4829baf2b9b7e36c91","liquidationDetailFull":"8b0bd3213b3b025f92892742bd5846822fabb254787214b6ce912a9de90ec5d8"},"censusObjectFingerprint":"92a98a6dbf496f409f34381e3b4c2e60dfbd65ce0b9b2c950ed762890c856d0f","snapshot215ObjectFingerprint":"9a171119f472dd9dbf44a13dae88e05b32a2a26dc9d63c7e0df322438f9004af","eventRows":0,"ledgerDigest":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","descriptorSha256":"ee8dc6ead961bd410f45ca2f47b9ec910db64431c042246d3730fada79785eb9","runSha256":"c4fc962a36329750f620fcc717a38019830ff4b6f4b2555cc20cbb4ce2c1b3a7","receiptSha256":{"t1":"3bc40d50d4b126aadbf7c848032254c11007987af4a654b68c36fe5752c7ce6b","t2":"4f9558266a3a63fe329b02965028fecbe54fb1b2a1fa1720c7919f1eb331083d"},"m7ProvenanceSha256":"447d08d4c8eee520dadf2266d84baa3dadda110d499fc994c394e5d49901de1a","durableProofSha256":"0857631dcd1383a135e63f41fd955eaa394e3d4156082dcc818059287cbb7f5f"});
const KEYS=Object.freeze(['version','activated','sourceCommit','epoch','target','protocol','mode','custodyRunSha256','capacityPostflightSha256','ledgerProjectionSha256','facades','durableProofSha256']);
export const OWN_F931_HISTORY_MODES=Object.freeze(['install_fresh','admit_existing']);
const HASH=/^[a-f0-9]{64}$/,COMMIT=/^[a-f0-9]{40}$/,PROTOCOL=/^[a-f0-9]{32}$/;
const destinationValid=t=>exact(t,OWN_F931_HISTORY_DESTINATION_KEYS)&&[17,18].includes(t.major)&&['projectId','branchId','endpointId','database','role'].every(k=>typeof t[k]==='string'&&t[k].length>0);
const exact=(v,keys)=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===[...keys].sort().join('|');
export const OWN_F931_CURRENT_STATE_ADMISSION_VERSION='own-f931-current-state-admission.v1';
export const OWN_F931_CURRENT_STATE_MODES=Object.freeze(['admit_current_state']);
export const OWN_F931_CURRENT_STATE_EPOCHS=Object.freeze(['201+215']);
const CURRENT_KEYS=Object.freeze(['version','activated','sourceCommit','epoch','target','protocol','mode','installedProvenance','capacityPostflightSha256','ledgerProjectionSha256','facades','censusObjectFingerprint','snapshot215ObjectFingerprint','eventRows','ledgerDigest','descriptorSha256','runSha256','receiptSha256','m7ProvenanceSha256','durableProofSha256']);
const CURRENT_HASHES=Object.freeze(['capacityPostflightSha256','ledgerProjectionSha256','censusObjectFingerprint','snapshot215ObjectFingerprint','ledgerDigest','descriptorSha256','runSha256','m7ProvenanceSha256','durableProofSha256']);
function ownF931CurrentStateAdmission(value){
 if(!exact(value,CURRENT_KEYS)||value.version!==OWN_F931_CURRENT_STATE_ADMISSION_VERSION||typeof value.activated!=='boolean')throw Error('La admisión de estado actual del lector histórico no es válida.');
 if(value.activated===false){if(CURRENT_KEYS.slice(2).some(k=>value[k]!==null))throw Error('Una admisión inactiva no conserva pruebas.');return value;}
 const provenance=value.installedProvenance,receipts=value.receiptSha256;
 if(typeof value.sourceCommit!=='string'||!COMMIT.test(value.sourceCommit)||!OWN_F931_CURRENT_STATE_EPOCHS.includes(value.epoch)||!destinationValid(value.target)||value.target.major!==17||typeof value.protocol!=='string'||!PROTOCOL.test(value.protocol)||!OWN_F931_CURRENT_STATE_MODES.includes(value.mode)
  ||!exact(provenance,['sourceCommit','major'])||typeof provenance.sourceCommit!=='string'||!COMMIT.test(provenance.sourceCommit)||provenance.major!==17||provenance.major!==value.target.major
  ||!CURRENT_HASHES.every(k=>typeof value[k]==='string'&&HASH.test(value[k]))||!Number.isSafeInteger(value.eventRows)||value.eventRows<0
  ||!exact(receipts,['t1','t2'])||typeof receipts.t1!=='string'||typeof receipts.t2!=='string'||!HASH.test(receipts.t1)||!HASH.test(receipts.t2)||receipts.t1===receipts.t2
  ||!exact(value.facades,OWN_F931_HISTORY_FACADES)||!OWN_F931_HISTORY_FACADES.every(k=>typeof value.facades[k]==='string'&&HASH.test(value.facades[k])))throw Error('La admisión activa de estado actual del lector histórico está incompleta.');
 return value;
}
export function ownF931HistoryAdmission(value=OWN_F931_HISTORY_ADMISSION){
 if(value&&typeof value==='object'&&!Array.isArray(value)&&value.version===OWN_F931_CURRENT_STATE_ADMISSION_VERSION)return ownF931CurrentStateAdmission(value);
 if(!exact(value,KEYS)||value.version!==OWN_F931_HISTORY_ADMISSION_VERSION||typeof value.activated!=='boolean')throw Error('La admisión del lector histórico no es válida.');
 if(value.activated===false){if(KEYS.slice(2).some(k=>value[k]!==null))throw Error('Una admisión inactiva no conserva pruebas.');return value;}
 if(!COMMIT.test(value.sourceCommit??'')||!OWN_F931_HISTORY_EPOCHS.includes(value.epoch)||!destinationValid(value.target)||!PROTOCOL.test(value.protocol??'')||!OWN_F931_HISTORY_MODES.includes(value.mode)||!HASH.test(value.custodyRunSha256??'')||![value.capacityPostflightSha256,value.ledgerProjectionSha256,value.durableProofSha256].every(h=>HASH.test(h??''))||!exact(value.facades,OWN_F931_HISTORY_FACADES)||!OWN_F931_HISTORY_FACADES.every(k=>HASH.test(value.facades[k]??'')))throw Error('La admisión activa del lector histórico está incompleta.');
 return value;
}
export const ownF931HistoryActive=(value=OWN_F931_HISTORY_ADMISSION)=>ownF931HistoryAdmission(value).activated===true;
