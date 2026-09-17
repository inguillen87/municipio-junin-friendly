import {createFirmarRuntime} from '../lib/firmar-http-runtime.js';
export const config={api:{bodyParser:false}};
// Provider transport callback, not a municipal browser/upload/signature-validation API.
export default createFirmarRuntime().callback;
