// Read adapters only. Explicit V4/V5 opt-in; historical validation stays intact.
import {ownRunWorkspaceResult,verifiedWorkspaceCapture} from './own-payroll-run-workspace-model.js';
import {ownOfficialCapture,verifiedOwnOfficialCapture} from './own-payroll-official-snapshot-model.js';
export const ownHistoricalOfficialInput=input=>['own-payroll-input.v4','own-payroll-input.v5'].includes(input?.version);
export const ownHistoricalNamespaced=input=>input?.version==='own-payroll-input.v2'||input?.namespaceVersion==='own-payroll-namespaces.v2';
export function ownHistoricalRunResult(capture){return ownHistoricalOfficialInput(capture?.saved?.input)?ownOfficialCapture(capture):ownRunWorkspaceResult(capture);}
export async function verifiedHistoricalCapture(capture){return ownHistoricalOfficialInput(capture?.saved?.input)?verifiedOwnOfficialCapture(capture):verifiedWorkspaceCapture(capture);}
