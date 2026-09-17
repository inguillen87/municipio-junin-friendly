import {createFirmarWorkspaceRuntime} from '../lib/firmar-workspace-runtime.js';
export const config={api:{bodyParser:false}};
// Disabled by default, TEST-only. Read-only personal queue and prepared source; not signed originals.
export default createFirmarWorkspaceRuntime();
