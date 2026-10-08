import {successorHash} from '../../scripts/lib/grh-successor-package.mjs';
import {stableJson} from '../../scripts/lib/canonical-import.mjs';
export function syntheticManifestEvidence(pack){
 const manifest={scriptVersion:'1.3.0',sourceProfileId:pack.baseline.profileId,
  source:{sha256:pack.baseline.sourceSha256,cutoff:pack.baseline.cutoff},
  methodology:['GRH is the migration source for this extraction; native MuniControl operations are not overwritten.','Fictional QA records only.'],
  outputs:{fictional:{file:'synthetic.json',bytes:42,records:3,sha256:'a'.repeat(64)}},
  quality:{unknown:null,zero:0,literal:'Prueba ñ'}};
 const bytes=Buffer.from(JSON.stringify(manifest,null,2).replaceAll('\n','\r\n')+'\r\n');
 const historical=Buffer.from(bytes.toString('utf8').replace('"scriptVersion": "1.3.0"','"scriptVersion": "1.2.0"')
  .replace('GRH is the migration source for this extraction; native MuniControl operations are not overwritten.','GRH is the employment and payroll source of truth.'));
 const updated=structuredClone(pack);updated.baseline.coreManifestSha256=successorHash(bytes);
 const {payloadSha256,...payload}=updated;updated.payloadSha256=successorHash(stableJson(payload));
 return {pack:updated,bytes,historical,storedManifestSha256:successorHash(historical)};
}
