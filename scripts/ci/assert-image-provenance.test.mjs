import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { assertImageProvenance } from './assert-image-provenance.mjs';

const expected = { APP_VERSION: 'v0.1.126', DEPLOY_STAGE: 'production', GIT_SHA: '12345678' };
const image = (changes = {}, id = 'sha256:fixture') => [{
  Id: id,
  Config: { Env: Object.entries({ ...expected, ...changes }).map(([key, value]) => `${key}=${value}`) },
}];
const verify = (ghcr = image(), acr = ghcr) => assertImageProvenance({ ghcr, acr }, expected);

test('same release retry reuses matching runtime identities', () => {
  assert.doesNotThrow(() => verify());
});
for (const [name, changes] of [
  ['main prebuild cannot become production', { APP_VERSION: 'dev', DEPLOY_STAGE: 'dev' }],
  ['beta cannot become production', { APP_VERSION: 'beta-20261121.1', DEPLOY_STAGE: 'beta' }],
  ['another release version cannot be relabeled', { APP_VERSION: 'v0.1.125' }],
  ['stage must match even with same version', { DEPLOY_STAGE: 'dev' }],
  ['short sha collision cannot be reused', { GIT_SHA: '12345679' }],
]) {
  test(name, () => assert.throws(() => verify(image(changes)), /does not match/));
}
test('both registries must match the requested identity', () => {
  assert.throws(() => verify(image(), image({ DEPLOY_STAGE: 'dev' })), /acr: DEPLOY_STAGE/);
  assert.throws(() => verify(image(), image({}, 'sha256:other')), /identities differ/);
  assert.throws(() => assertImageProvenance({ ghcr: image() }, expected), /Both registry/);
});
test('missing, duplicate or malformed runtime config refuses reuse', () => {
  for (const config of [[], [{}], [{ Id: 'sha256:fixture', Config: { Env: [] } }]]) {
    assert.throws(() => verify(config));
  }
  const duplicate = image();
  duplicate[0].Config.Env.push('APP_VERSION=dev');
  assert.throws(() => verify(duplicate), /APP_VERSION/);
});
test('workflow validates both configs before permitting reuse and runs regression checks', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/build.yml', import.meta.url), 'utf8');
  const guard = workflow.indexOf('node scripts/ci/assert-image-provenance.mjs');
  assert.ok(guard > workflow.indexOf('docker image inspect "${acr_repo}:${IMAGE_TAG}"'));
  assert.ok(guard < workflow.indexOf('echo "build=false"'));
  for (const key of ['APP_VERSION', 'DEPLOY_STAGE', 'GIT_SHA']) {
    assert.match(workflow, new RegExp(`${key}: \\$\\{\\{ steps.prov.outputs\\.`));
  }
  assert.match(workflow, /if \[ "\$ghcr_exists" != "\$acr_exists" \]; then[\s\S]*?exit 1/);
  const ci = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(ci, /node --test scripts\/ci\/assert-image-provenance\.test\.mjs/);
});

for (const [scenario, shouldPass, output] of [
  ['missing', true, 'build=true'],
  ['matching', true, 'build=false'],
  ['partial', false, ''],
  ['network', false, ''],
  ['wrong-stage', false, ''],
  ['pull-failure', false, ''],
]) {
  test(`actual workflow decision: ${scenario}`, () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'image-provenance-'));
    try {
      const docker = `#!/usr/bin/env node
const args = process.argv.slice(2);
const scenario = process.env.SCENARIO;
if (args[0] === 'buildx') {
  if (scenario === 'network') { console.error('TLS handshake timeout'); process.exit(1); }
  if (scenario === 'missing' || (scenario === 'partial' && args.at(-1).includes('acr.example'))) {
    console.error('manifest unknown: not found'); process.exit(1);
  }
} else if (args[0] === 'pull' && scenario === 'pull-failure') {
  console.error('pull failed'); process.exit(1);
} else if (args[0] === 'image') {
  console.log(JSON.stringify([{ Id: 'sha256:fixture', Config: { Env: [
    'APP_VERSION=v0.1.126', 'GIT_SHA=12345678',
    'DEPLOY_STAGE=' + (scenario === 'wrong-stage' ? 'dev' : 'production'),
  ] } }]));
}
`;
      writeFileSync(join(fixtureDir, 'docker'), docker, { mode: 0o755 });
      const workflow = readFileSync(new URL('../../.github/workflows/build.yml', import.meta.url), 'utf8');
      const step = workflow.split('      - name: Decide build vs retag')[1].split('      - name: Build and push image')[0];
      const script = step.split('        run: |\n')[1].replace(/^          /gm, '');
      const outputFile = join(fixtureDir, 'output');
      writeFileSync(outputFile, '');
      const result = spawnSync('bash', ['-c', script], {
        cwd: new URL('../../', import.meta.url),
        env: { ...process.env, ...expected, PATH: `${fixtureDir}:${process.env.PATH}`,
          SCENARIO: scenario, GHCR_NAMESPACE: 'fixture', IMAGE: 'app', IMAGE_TAG: 'sha-1234567',
          ACR_REGISTRY: 'acr.example', ACR_NAMESPACE: 'fixture', GITHUB_OUTPUT: outputFile },
        encoding: 'utf8',
      });
      assert.equal(result.status === 0, shouldPass, result.stderr);
      assert.equal(readFileSync(outputFile, 'utf8').trim(), output);
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
}
