// One-time reviewed patch: exact input/output fingerprints; no network or municipal data.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex');
const patches=[{
 path:'local-agents/clock-fleet/windows-installer/InstallerCore.cs',before:'32b80bad4ee694efa861436361369f3f8627a75e840277f13fbc15d334363f7b',after:'686262ad4b94377b71526583ac14cd4df2387fee2019dc109cc8cbff78d6691b',
 from:`  static void ValidatePrincipal(object principal){
   Need((string)Get(principal,"UserId")=="S-1-5-19"&&Convert.ToInt32(Get(principal,"LogonType"),CultureInfo.InvariantCulture)==5
    &&Convert.ToInt32(Get(principal,"RunLevel"),CultureInfo.InvariantCulture)==0,"TASK_REGISTRATION_INVALID");
  }`,to:`  static bool IsLocalService(object identity){
   string value=identity as string;if(String.IsNullOrWhiteSpace(value)||value.Length>256)return false;
   try{
    var sid=value.StartsWith("S-",StringComparison.OrdinalIgnoreCase)?new SecurityIdentifier(value)
     :(SecurityIdentifier)new NTAccount(value).Translate(typeof(SecurityIdentifier));
    return sid.IsWellKnown(WellKnownSidType.LocalServiceSid);
   }catch(IdentityNotMappedException){return false;}catch(ArgumentException){return false;}
  }
  static void ValidatePrincipal(object principal){
   // COM returns the localized account name, while task XML stores its SID.
   // Resolve to the actual well-known identity, never trust a display-name substring.
   Need(IsLocalService(Get(principal,"UserId"))&&Convert.ToInt32(Get(principal,"LogonType"),CultureInfo.InvariantCulture)==5
    &&Convert.ToInt32(Get(principal,"RunLevel"),CultureInfo.InvariantCulture)==0,"TASK_REGISTRATION_INVALID");
  }`
},{path:'administracion-plataforma.html',before:'37a4047c9138395fa76f636d9addc56d420c7322220bb1c8735d4df8f75cf37f',after:'5c45afb3343196fcd507f9c18ca91ba0f1e87716bfa8c72a607dbd54f94f217e',
 from:`    function statusTone(value) {
      var normalized = normalizeSearch(value);
      if (/operativ|activ|ready|aprob|success|ok|complet/.test(normalized)) return 'is-ok';
      if (/bloque|suspend|deneg|revoc|error|critical|fall/.test(normalized)) return 'is-danger';
      if (/atencion|pend|riesgo|warning|invite|observ|venc|expir/.test(normalized)) return 'is-attention';
      if (/pilot|progreso|config|info|implement/.test(normalized)) return 'is-info';
      return '';
    }`,to:`    function statusTone(value) {
      var key = normalizeSearch(value).trim().replace(/[_-]+/g, ' ').replace(/\\s+/g, ' ');
      var groups = {
        'is-ok': ['active', 'activo', 'activa', 'ready', 'approved', 'aprobado', 'aprobada', 'success', 'ok', 'completed', 'completado', 'operativo', 'operativa', 'operational', 'published', 'accepted'],
        'is-danger': ['inactive', 'inactivo', 'inactiva', 'disabled', 'suspended', 'suspendido', 'suspendida', 'blocked', 'bloqueado', 'bloqueada', 'denied', 'rejected', 'revoked', 'revocado', 'revocada', 'error', 'failed', 'failure', 'critical', 'denegado'],
        'is-attention': ['pending', 'pendiente', 'warning', 'observed', 'observado', 'expired', 'expirado', 'vencido', 'cancelled', 'canceled', 'invalidated', 'invitado', 'invited', 'invitation', 'in review', 'attention', 'atencion', 'en revision', 'riesgo'],
        'is-info': ['pilot', 'piloto', 'configuring', 'configuration', 'configuracion', 'in progress', 'en progreso', 'provisioning', 'draft', 'informativo']
      };
      return Object.keys(groups).find(function (tone) { return groups[tone].includes(key); }) || '';
    }`
}];
const outputs=patches.map(p=>{const old=fs.readFileSync(p.path,'utf8');assert.equal(hash(old),p.before,'Unexpected base '+p.path);assert.equal(old.split(p.from).length,2);const next=old.replace(p.from,p.to);assert.equal(hash(next),p.after,'Unexpected result '+p.path);return{...p,next}});
for(const p of outputs)fs.writeFileSync(p.path,p.next);console.log(JSON.stringify(outputs.map(p=>({path:p.path,sha256:p.after}))));
