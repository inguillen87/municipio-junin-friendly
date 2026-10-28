import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CANDIDATE_VERSION, CANDIDATE_WORKFLOWS, EVIDENCE_STEP, FULL_SUITE_STEP,
  M7_RELEASE_FILES, PROOF_SOURCE_FILES, fileProof, requireCandidateAdmission, verifyCandidateAdmission,
} from '../scripts/lib/release-candidate-admission.mjs';
import {
  DEPLOYMENT_ID, FULL_LOG, SHA, TREE, candidateEvidence, jsonBytes,
  replaceArtifactFile,
} from './fixtures/release-candidate-synthetic.js';

const verify = evidence => verifyCandidateAdmission(evidence,
  {expectedSha: SHA, expectedDeploymentId: DEPLOYMENT_ID});
const workflow = (evidence, key = 'capacity') => evidence.workflows.find(value => value.key === key);
const artifact = (evidence, key = 'capacity', index = 0) => workflow(evidence, key).artifacts[index];
const proof = value => JSON.parse(value.files['proof.json']);
const changeProof = (value, mutate) => {
  const next = proof(value); mutate(next); replaceArtifactFile(value, 'proof.json', next);
};
const reject = (mutate, code) => {
  const evidence = candidateEvidence(); mutate(evidence);
  assert.throws(() => verify(evidence), code ? {code} : /^Error: CANDIDATE_/);
};

test('eight exact-SHA PostgreSQL proofs admit only the technical publication scope', () => {
  const result = verify(candidateEvidence());
  assert.equal(result.version, CANDIDATE_VERSION);
  assert.equal(result.admitted, true);
  assert.equal(result.candidateSha, SHA); assert.equal(result.treeSha, TREE);
  assert.equal(result.deploymentId, DEPLOYMENT_ID);
  assert.equal(result.proofCount, 8);
  for (const policy of CANDIDATE_WORKFLOWS) {
    assert.deepEqual(result.proofs.filter(value => value.workflow === policy.file).map(value => value.major), [17, 18]);
  }
  assert.deepEqual(result.staticFiles, [...M7_RELEASE_FILES]);
  assert.equal(result.scope, 'm7-technical-publication');
  for (const key of ['noeliaReady', 'fullGoalComplete', 'normalAuthenticationVerified',
    'productionSqlVerified', 'productionEnvironmentVerified', 'promotionPerformed']) assert.equal(result[key], false);
  assert.equal(requireCandidateAdmission(result, SHA), result);
});

test('a serialized or copied admission is not an executable publication authorization', () => {
  const admitted = verify(candidateEvidence());
  for (const value of [JSON.parse(JSON.stringify(admitted)), {...admitted},
    {admitted: true, candidateSha: SHA}]) {
    assert.throws(() => requireCandidateAdmission(value, SHA), {code: 'REMOTE_BASE_CANDIDATE_ADMISSION_REQUIRED'});
  }
  assert.throws(() => requireCandidateAdmission(admitted, 'd'.repeat(40)), {code: 'REMOTE_BASE_CANDIDATE_ADMISSION_REQUIRED'});
});

test('admitted proof identities cannot be changed after validation', () => {
  const admitted = verify(candidateEvidence());
  const original = admitted.proofs[0].artifactSha256;
  assert.throws(() => { admitted.proofs[0].artifactSha256 = 'f'.repeat(64); }, TypeError);
  assert.equal(admitted.proofs[0].artifactSha256, original);
  assert.equal(requireCandidateAdmission(admitted, SHA), admitted);
});

test('missing or duplicated workflow cannot stand in for the required four workflows', () => {
  reject(e => e.workflows.pop(), 'CANDIDATE_WORKFLOW_MISSING');
  reject(e => { e.workflows[3] = e.workflows[2]; }, 'CANDIDATE_WORKFLOW_MISSING');
});

test('each PostgreSQL major requires its own successful job and artifact', () => {
  reject(e => workflow(e).jobs.pop(), 'CANDIDATE_PG_MATRIX_INCOMPLETE');
  reject(e => { workflow(e).jobs[1] = workflow(e).jobs[0]; }, 'CANDIDATE_JOB_NOT_SUCCESSFUL');
  reject(e => workflow(e).artifacts.pop(), 'CANDIDATE_PG_MATRIX_INCOMPLETE');
});

for (const conclusion of ['skipped', 'failure', 'cancelled', 'neutral', 'timed_out']) {
  test('workflow conclusion ' + conclusion + ' is never successful admission', () => {
    reject(e => { workflow(e).run.conclusion = conclusion; }, 'CANDIDATE_RUN_NOT_SUCCESSFUL');
  });
  test('job conclusion ' + conclusion + ' is never successful admission', () => {
    reject(e => { workflow(e).jobs[1].conclusion = conclusion; }, 'CANDIDATE_JOB_NOT_SUCCESSFUL');
  });
  test('step conclusion ' + conclusion + ' is never successful admission', () => {
    reject(e => { workflow(e).jobs[0].steps[0].conclusion = conclusion; }, 'CANDIDATE_STEP_NOT_SUCCESSFUL');
  });
}

test('pending workflow, job or step cannot inherit an earlier success', () => {
  reject(e => { workflow(e).run.status = 'in_progress'; }, 'CANDIDATE_RUN_NOT_SUCCESSFUL');
  reject(e => { workflow(e).jobs[0].status = 'queued'; }, 'CANDIDATE_JOB_NOT_SUCCESSFUL');
  reject(e => { workflow(e).jobs[0].steps[0].status = 'in_progress'; }, 'CANDIDATE_STEP_NOT_SUCCESSFUL');
});

test('a removed browser, full-suite or proof step blocks admission', () => {
  for (const name of [CANDIDATE_WORKFLOWS[1].requiredStep, FULL_SUITE_STEP, EVIDENCE_STEP]) {
    reject(e => { const job = workflow(e).jobs[0]; job.steps = job.steps.filter(step => step.name !== name); },
      'CANDIDATE_REQUIRED_STEP_MISSING');
  }
});

for (const field of ['latestRun', 'finalRun']) {
  test(field + ' detects a newer attempt even when both attempts succeeded', () => {
    reject(e => { workflow(e)[field].run_attempt++; }, 'CANDIDATE_RUN_ATTEMPT_CHANGED');
  });
  test(field + ' detects another run even when the SHA and result agree', () => {
    reject(e => { workflow(e)[field].id++; workflow(e)[field].run_number++; }, 'CANDIDATE_RUN_ATTEMPT_CHANGED');
  });
  test(field + ' cannot hide a newer pending or failed observation', () => {
    reject(e => { workflow(e)[field].status = 'in_progress'; }, 'CANDIDATE_RUN_NOT_SUCCESSFUL');
    reject(e => { workflow(e)[field].conclusion = 'failure'; }, 'CANDIDATE_RUN_NOT_SUCCESSFUL');
  });
}

test('another repository, workflow path, source SHA or PR event is rejected', () => {
  reject(e => { workflow(e).run.head_repository.full_name = 'outsider/fork'; }, 'CANDIDATE_RUN_REPOSITORY_CHANGED');
  reject(e => { workflow(e).run.path = '.github/workflows/unrelated.yml'; }, 'CANDIDATE_RUN_SOURCE_CHANGED');
  reject(e => { workflow(e).run.head_sha = 'd'.repeat(40); }, 'CANDIDATE_RUN_SOURCE_CHANGED');
  reject(e => { workflow(e).run.event = 'pull_request'; }, 'CANDIDATE_RUN_SOURCE_CHANGED');
});

test('a tested merge SHA cannot substitute for the requested head SHA or an equal tree', () => {
  reject(e => changeProof(artifact(e), p => { p.checkoutSha = 'd'.repeat(40); }), 'CANDIDATE_CHECKOUT_CHANGED');
  reject(e => changeProof(artifact(e), p => { p.eventSha = 'd'.repeat(40); }), 'CANDIDATE_CHECKOUT_CHANGED');
});

test('a different tested tree or dirty tracked source cannot claim the candidate', () => {
  reject(e => changeProof(artifact(e), p => { p.treeSha = 'd'.repeat(40); }), 'CANDIDATE_CHECKOUT_CHANGED');
  reject(e => changeProof(artifact(e), p => { p.trackedSourceClean = false; }), 'CANDIDATE_CHECKOUT_CHANGED');
});

test('proofs from the wrong PostgreSQL major, job or attempt are rejected', () => {
  reject(e => changeProof(artifact(e), p => { p.major = 18; }), 'CANDIDATE_PROOF_IDENTITY_CHANGED');
  reject(e => changeProof(artifact(e), p => { p.job = 'unrelated'; }), 'CANDIDATE_PROOF_IDENTITY_CHANGED');
  reject(e => changeProof(artifact(e), p => { p.runAttempt--; }), 'CANDIDATE_PROOF_ATTEMPT_CHANGED');
});

test('missing, expired or renamed artifact cannot satisfy the evidence requirement', () => {
  reject(e => { artifact(e).metadata.expired = true; }, 'CANDIDATE_ARTIFACT_MISSING');
  reject(e => { artifact(e).metadata.name += '-other'; }, 'CANDIDATE_ARTIFACT_MISSING');
  reject(e => { artifact(e).metadata.size_in_bytes = 0; }, 'CANDIDATE_ARTIFACT_MISSING');
});

test('artifact identity must match its run and exact candidate SHA', () => {
  reject(e => { artifact(e).metadata.workflow_run.id++; }, 'CANDIDATE_ARTIFACT_RUN_CHANGED');
  reject(e => { artifact(e).metadata.workflow_run.head_sha = 'd'.repeat(40); }, 'CANDIDATE_ARTIFACT_RUN_CHANGED');
  reject(e => { artifact(e).metadata.digest = 'sha256:' + 'f'.repeat(64); }, 'CANDIDATE_ARTIFACT_DIGEST_CHANGED');
});

test('missing or injected archive members cannot extend the declared proof surface', () => {
  reject(e => { delete artifact(e).files['report.json']; }, 'CANDIDATE_ARTIFACT_FILES_CHANGED');
  reject(e => { artifact(e).files['unreviewed.json'] = jsonBytes({passed: true}); }, 'CANDIDATE_ARTIFACT_FILES_CHANGED');
});

test('changed report bytes or source bytes are rejected before trusting their assertions', () => {
  reject(e => { artifact(e).files['report.json'] = jsonBytes({passed: true}); }, 'CANDIDATE_MANIFEST_DIGEST_CHANGED');
  reject(e => { e.source.files['scripts/build-friendly.mjs'] = Buffer.from('changed\n'); }, 'CANDIDATE_SOURCE_BYTES_CHANGED');
});

test('a coherently hashed failed or incomplete report still fails admission', () => {
  reject(e => { const a = artifact(e), r = JSON.parse(a.files['report.json']); r.passed = false; replaceArtifactFile(a, 'report.json', r); }, 'CANDIDATE_REPORT_FAILED');
  reject(e => { const a = artifact(e), r = JSON.parse(a.files['report.json']); r.cleanupError = 'synthetic cleanup failed'; replaceArtifactFile(a, 'report.json', r); }, 'CANDIDATE_REPORT_FAILED');
  reject(e => { const a = artifact(e), r = JSON.parse(a.files['report.json']); r.sourceCommit = 'd'.repeat(40); replaceArtifactFile(a, 'report.json', r); }, 'CANDIDATE_CAPACITY_REPORT_INVALID');
});

test('receipt and closed-report safety checks cannot be omitted from a success report', () => {
  reject(e => { const a = artifact(e, 'receipts'), r = JSON.parse(a.files['report.json']); r.ownAgentIsolation = false; replaceArtifactFile(a, 'report.json', r); }, 'CANDIDATE_RECEIPT_REPORT_INVALID');
  reject(e => { const a = artifact(e, 'reports'), r = JSON.parse(a.files['report.json']); r.reportBusinessPosts = 1; replaceArtifactFile(a, 'report.json', r); }, 'CANDIDATE_CLOSED_REPORT_INVALID');
});

test('the full suite command may not be narrowed by a filter or a different glob', () => {
  reject(e => { const pkg = JSON.parse(e.source.files['package.json']); pkg.scripts.test += ' --test-name-pattern=smoke'; e.source.files['package.json'] = jsonBytes(pkg); }, 'CANDIDATE_FULL_SUITE_COMMAND_CHANGED');
});

test('a shortened workflow cannot replace the full suite even when every source and artifact hash is recomputed', () => {
  for (const policy of CANDIDATE_WORKFLOWS.filter(value => value.fullSuite)) {
    reject(e => {
      const original = e.source.files[policy.file].toString('utf8');
      const narrowed = original.replace('npm run build 2>&1', 'node --test tests/release-candidate-admission.test.js 2>&1');
      assert.notEqual(narrowed, original, 'the real full-suite producer must be exercised');
      e.source.files[policy.file] = Buffer.from(narrowed);
      for (const record of e.workflows) for (const artifact of record.artifacts) {
        changeProof(artifact, p => {
          p.sourceFiles = PROOF_SOURCE_FILES.map(name => fileProof(name, e.source.files[name]));
        });
      }
    }, 'CANDIDATE_WORKFLOW_POLICY_CHANGED');
  }
});

test('an unexplained skipped full-suite test cannot be concealed in a success log', () => {
  reject(e => {
    const a = artifact(e);
    replaceArtifactFile(a, 'full-suite.log', Buffer.from(FULL_LOG.replace('# pass 12', '# pass 11').replace('# skipped 0', '# skipped 1')));
    changeProof(a, p => { p.fullSuite.pass = 11; p.fullSuite.skipped = 1; });
  });
});

test('missing terminal summary, failed summary and changed suite receipt are rejected', () => {
  reject(e => replaceArtifactFile(artifact(e), 'full-suite.log', Buffer.from('TAP version 13\n')), 'CANDIDATE_FULL_SUITE_RECEIPT_MISSING');
  reject(e => {
    const a = artifact(e); replaceArtifactFile(a, 'full-suite.log', Buffer.from(FULL_LOG.replace('# pass 12', '# pass 11').replace('# fail 0', '# fail 1')));
    changeProof(a, p => { p.fullSuite.pass = 11; p.fullSuite.fail = 1; });
  });
  reject(e => changeProof(artifact(e), p => { p.fullSuite.tests++; }), 'CANDIDATE_FULL_SUITE_RECEIPT_CHANGED');
});

test('READY preview, null target or a deployment from another project never admits production', () => {
  for (const target of ['preview', null]) reject(e => { e.deployment.target = target; }, 'CANDIDATE_STAGED_PRODUCTION_REQUIRED');
  reject(e => { e.deployment.projectId = 'prj_Other'; }, 'CANDIDATE_DEPLOYMENT_PROJECT_CHANGED');
  reject(e => { e.deployment.teamId = 'team_Other'; }, 'CANDIDATE_DEPLOYMENT_PROJECT_CHANGED');
});

test('wrong deployment, wrong source or already routed production cannot be admitted', () => {
  reject(e => { e.deployment.id = 'dpl_Other'; }, 'CANDIDATE_DEPLOYMENT_CHANGED');
  reject(e => { e.deployment.meta.githubCommitSha = 'd'.repeat(40); }, 'CANDIDATE_DEPLOYMENT_SOURCE_CHANGED');
  reject(e => { delete e.deployment.gitSource; delete e.deployment.meta; }, 'CANDIDATE_DEPLOYMENT_SOURCE_CHANGED');
  reject(e => { e.deployment.alias = ['municontrol.com']; }, 'CANDIDATE_DEPLOYMENT_ALREADY_ROUTED');
});

test('an additional stable branch or custom alias also means the candidate is already routed', () => {
  for (const alias of ['municipio-junin-friendly-git-candidate-fixture.vercel.app', 'payroll-m7-fixture.example.org']) {
    reject(e => { e.deployment.alias = [alias]; }, 'CANDIDATE_DEPLOYMENT_ALREADY_ROUTED');
  }
});

test('served M7 bytes must match every tested build artifact', () => {
  reject(e => { e.deployedFiles['nomina-control.html'] = Buffer.from('different served HTML\n'); }, 'CANDIDATE_DEPLOYED_BYTES_CHANGED');
  reject(e => { delete e.deployedFiles['assets/own-payroll-receipt-pdf.js']; }, 'CANDIDATE_DEPLOYED_BYTES_CHANGED');
});

test('a coherently hashed build manifest from another tree is rejected', () => {
  reject(e => { const a = artifact(e), manifest = JSON.parse(a.files['build-manifest.json']); manifest.treeSha = 'd'.repeat(40); replaceArtifactFile(a, 'build-manifest.json', manifest); }, 'CANDIDATE_BUILD_MANIFEST_CHANGED');
});

test('the artifact release identity must be the actual served release identity', () => {
  reject(e => {
    const stale = JSON.parse(e.deployedFiles['release-info.json']); stale.commitSha = 'd'.repeat(40);
    e.deployedFiles['release-info.json'] = jsonBytes(stale);
    for (const w of e.workflows) for (const a of w.artifacts) {
      const manifest = JSON.parse(a.files['build-manifest.json']);
      manifest.files = manifest.files.map(value => value.path === 'release-info.json'
        ? fileProof(value.path, e.deployedFiles[value.path]) : value);
      replaceArtifactFile(a, 'build-manifest.json', manifest);
    }
  });
});

test('a stored artifact build identity cannot claim a different source state', () => {
  reject(e => { const a = artifact(e), release = JSON.parse(a.files['release-info.json']); release.sourceState = 'modified'; replaceArtifactFile(a, 'release-info.json', release); });
});
