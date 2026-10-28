// PROPOSED by Claude (source only; never run by Claude). Target: scripts/release-qualification-contract.mjs
// The reviewed release contract. Every value below is copied from a repository source named next to it.
// Changing any value is a reviewed source change of this file and its regression, never a runtime input.
const deepFreeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(deepFreeze);Object.freeze(v);}return v;};
export const CHECKOUT_ATTESTATION_STEP='Attest checkout equals the event commit';

export const RELEASE_CONTRACT=deepFreeze({
 version:'municontrol-release-contract.v1',
 // fullName/branch: scripts/verify-remote-release-base.mjs (RELEASE_REPOSITORY, branches/master).
 // id: .handoff/production-binding-git-deployment-2a2cda0a-20261027-r1/request.validated.json gitSource.repoId.
 repository:{fullName:'inguillen87/municipio-junin-friendly',id:1332672248,productionBranch:'master'},
 // team/project: .handoff/check-pr197-ci-gate-20261014.mjs and request.validated.json.
 // Domains: municontrol.com + www.municontrol.com (check-pr197 canonical production aliases) and
 // municipio-junin-friendly.vercel.app (verify-remote-release-base RELEASE_DOMAIN).
 vercel:{teamId:'team_BV1xuY6BnEzGanfok8GAyjZv',teamSlug:'marcelos-projects-c26aa499',projectId:'prj_AoxjtYZS3aqVUKqlOaXbYkPhneTT',projectName:'municipio-junin-friendly',
  productionDomains:['municontrol.com','www.municontrol.com','municipio-junin-friendly.vercel.app']},
 // Provider reads/writes exactly as used by existing root sources (see proposal §4). Promotion is NOT here:
 // no repository source performs it, so it is a root-owned, hash-pinned adapter.
 github:{
  masterRef:'git/ref/heads/master',commit:'git/commits/{sha}',runs:'actions/runs?head_sha={sha}&per_page=100',
  jobs:'actions/runs/{runId}/jobs?filter=all&per_page=100',artifacts:'actions/runs/{runId}/artifacts?per_page=100',
  artifactZip:'actions/artifacts/{artifactId}/zip',contents:'contents/{path}?ref={sha}'},
 vercelApi:{create:'/v13/deployments?teamId={teamId}',deployment:'/v13/deployments/{id}?withGitRepoInfo=true'},
 // Existing DB attestation verifier (2a2cda0a precedent) + bundle without the in-build test suite.
 stageBuildCommand:'node scripts/verify-vercel-build-db-attestation.mjs --source-sha <sha> && npm run build:vercel',
 scripts:{
  test:'node scripts/verify-platform-baseline.mjs && node scripts/verify-friendly-containment.mjs && node --test tests/*.test.js',
  build:'npm run test && node scripts/build-friendly.mjs',
  'build:vercel':'node scripts/verify-platform-baseline.mjs && node scripts/verify-friendly-containment.mjs && node scripts/build-friendly.mjs'},
 // Closed Git path: no fast buildCommand anywhere and no automatic Git deployment of the production branch.
 vercelJson:{buildCommand:null,gitDeploymentEnabled:{'internal-*':false,master:false}},
 // Vercel project settings that NO repository source shows. Root must attest exactly these values in the
 // hash-pinned admission (from its own read of the project), or nothing proceeds:
 //  - productionBranch: the branch whose Git pushes Vercel deploys to production (vercelJson blocks only `master`);
 //  - projectBuildCommand: dashboard Build Command used when vercel.json has none (null = framework default `npm run build`).
 // Still unknown and NOT attested: whether git.deploymentEnabled.master:false affects API deployments with gitSource
 // (if it does, the stage fails closed), and Deployment Protection on generated URLs (stage release-info then unverifiable).
 providerSettingsRequired:{productionBranch:'master',projectBuildCommand:null},
 buildBindingVersion:'vercel-normal-build-binding-observation.v1',
 // R3. Reviewed bytes of the DB attestation verifier that the stage build command runs. It is read from GitHub
 // contents of the SAME candidate SHA; `builtinShaMatchedByPinnedVerifier` in a binding never replaces this.
 // sha256 = body proposed in RELEASE_QUALIFIED_BUILD_SOURCE_PROPOSAL_20261028_R3 (PROVISION_EVENT_PRESENT guard).
 pinnedSources:[{path:'scripts/verify-vercel-build-db-attestation.mjs',sha256:'345ec78cfbd13c98f595d7c0d57a9456afe23e17c6ec3abd4c420de6828ceb18'}],
 // R3. Expected identities of the two build clients. The database destination is NOT written here and is never
 // taken from an observation: it is the OWN_RELEASE_TARGETS entry (scripts/lib/own-payroll-release-target.mjs)
 // whose major root names in the admission (productionDatabaseMajor). Owner role = that entry's `role`.
 // Actions role: lib/internal-identity-access.js:34 `const IDENTITY_RUNTIME_ROLE = 'municontrol_actions_runtime_app';`.
 buildClients:{ownerClient:'DATABASE_URL',actionsClient:'ACTIONS_DATABASE_URL',actionsRuntimeRole:'municontrol_actions_runtime_app'},
 // R3. Effective build command on GET /v13/deployments/{id}: the field path is the one create-once.ps1 reads from the
 // same v13 deployment object (`projectSettings.buildCommand`, plus top-level `buildCommand` when present). No
 // repository source shows GET returning it: absence or any contradiction is a STOP, never a pass.
 workflows:[
  {path:'.github/workflows/noelia-payroll-circuit.yml',name:'Noelia complete own payroll circuit',
   sha256:'6a6fcec6571d765d86b53ee6e3345bd6bd84031b4ddc2d768aec0ea632f30e6b',
   jobs:[17,18].map(major=>({name:`circuit (${major})`,major,artifact:`noelia-circuit-pg${major}-<sha>`,
    report:{entry:'noelia-circuit-ci/result.json',fields:{passed:true,major,sourceCommit:'<sha>',transport:'ci',browser:'chromium',productionWrites:false}}})),
   // Every named step of the reviewed bytes; 'Build and run all existing regressions' is `npm run build` (full suite).
   steps:[
    "Attest checkout equals the event commit",
    "Build and run all existing regressions",
    "Prepare the disposable synthetic database",
    "Verify prerequisites, empty receipts and complete unsigned PDF on desktop and mobile",
    "Complete adoption declarations, mixed jurisdictions and immutable recovery",
    "Upgrade the published SQL130 baseline and preserve existing synthetic history",
    "Complete actual HTTP, SQL and browser circuit, jurisdiction and annual positions",
    "Preserve inactive history with unknown jurisdiction and refuse active unknowns",
    "Complete final-cut source, proposal and exact immutable application",
    "Review, compare, download and recover the complete final-cut proposal",
    "Adopt every active contract at full operational volume while preserving inactive history",
    "Recover and replay earlier complete adoption requests after the active schema upgrade",
    "Correct complete identity profiles without changing rows, permissions or earlier requests",
    "Declare missing active facts and independently adopt the complete roster without editing the source",
    "Preview declared facts, preserve all pages and recover the original voluntary attempt",
    "Preserve original pending facts while adopting all active contracts and blocking incomplete salary subjects",
    "Explicit original-facts acknowledgement, full review, mobile and unchanged recovery",
    "Independently adopt all 855 operational contracts and preserve every deferred and historical row",
    "Complete operational scope, immutable recovery, revocation and accessible mobile browser",
    "Administrative adoption identity with archived employment, unchanged requests and actual SQL mobile UI",
    "Compare complete streaming projections against canonical SQL061 and SQL144 with both delta layers and exact decimals",
    "Complete streaming installation, all ten source checks, unchanged attempts, revocation and actual SQL mobile UI",
    "Parameter audit identity with historical contracts, unchanged shared context and actual SQL HTTP mobile UI",
    "Review all 869 active rows, download observations and recover the same voluntary attempt",
    "Independently decide and consult the final-cut result through actual SQL and HTTP",
    "Project QA browser for the read-only payroll summary",
    "Complete own payroll summary, original result and mobile access recovery",
    "Preserve synthetic evidence even when a check fails"
   ]},
  {path:'.github/workflows/own-payroll-full-capacity.yml',name:'Own payroll complete capacity',
   sha256:'d95544cedfb35d913bf16b86b932e6827a5aa62491e6de48ef9c7116d3eab5dc',
   jobs:[17,18].map(major=>({name:`M7, receipt126 and Family195 browser, positions210-212 SQL / PG${major} / published107`,major,artifact:`own-full-capacity-pg${major}-published107-<sha>`,
    report:{entry:`own-full-capacity-pg${major}/result.json`,fields:{version:'municipal-owner-adoption-authority-qa.v1',passed:true,major,sourceCommit:'<sha>',transport:'ci',operationalPairBaseline:'published107'}}})),
   steps:[
    "Attest checkout equals the event commit",
    "Source contracts only; no constructor or native SQL in this step",
    "Synthetic092 supports before technical192 with recording transports",
    "Administrative liquidation history authority and preservation",
    "Receipt126 real-browser boundary witnesses without native SQL",
    "Exact native rejection adapters with synthetic services",
    "Canonical transaction modes with recording transports",
    "Owned QA cleanup with synthetic transcripts",
    "Prepare only the existing disposable synthetic service",
    "Install project Chromium for the unchanged190 programme flow",
    "Same190 M7 and receipt126 browser, Family195 native/browser and positions210-212 SQL"
   ]}
 ]
});
