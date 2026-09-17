import {createFirmarRuntime} from '../lib/firmar-http-runtime.js';
export const config={api:{bodyParser:false}};
// Disabled by default; TEST-provider only. No request creation or official issuance.
export default createFirmarRuntime().interactive;
