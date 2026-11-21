import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Validate Docker's actual runtime config, not a mutable tag or an OCI label.
export function assertImageProvenance(images, expected) {
  let imageId;
  for (const [registry, inspected] of Object.entries(images)) {
    if (!Array.isArray(inspected) || inspected.length !== 1) {
      throw new Error(`${registry}: expected one inspected image`);
    }
    const image = inspected[0];
    if (!image?.Id || !Array.isArray(image.Config?.Env)) {
      throw new Error(`${registry}: missing image identity or runtime environment`);
    }
    for (const key of ['APP_VERSION', 'DEPLOY_STAGE', 'GIT_SHA']) {
      const entries = image.Config.Env.filter((entry) => entry.startsWith(`${key}=`));
      if (!expected[key] || entries.length !== 1 || entries[0] !== `${key}=${expected[key]}`) {
        throw new Error(`${registry}: ${key} does not match requested build; use a new release commit, never overwrite an immutable sha image`);
      }
    }
    if (imageId && imageId !== image.Id) {
      throw new Error('Registry image identities differ; restore matching immutable copies before retrying');
    }
    imageId = image.Id;
  }
  if (Object.keys(images).length !== 2) throw new Error('Both registry images must be verified');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [ghcrPath, acrPath] = process.argv.slice(2);
    assertImageProvenance({
      ghcr: JSON.parse(readFileSync(ghcrPath, 'utf8')),
      acr: JSON.parse(readFileSync(acrPath, 'utf8')),
    }, process.env);
    console.log('Both immutable images match the requested version, stage and commit.');
  } catch (error) {
    console.error(`Image reuse refused: ${error.message}`);
    process.exitCode = 1;
  }
}
