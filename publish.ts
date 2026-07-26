import { $ } from "bun";
import { existsSync } from "node:fs";
import { join } from "node:path";
import packageJson from "./package.json" with { type: "json" };

const distRoot = join("dist", "npm");
const rootPackageName = packageJson.name;
const registryUrl = "https://registry.npmjs.org";

const platformPackages = [
  "jbs-client-windows-x64",
  "jbs-client-windows-arm64",
  "jbs-client-linux-x64",
  "jbs-client-linux-arm64",
  "jbs-client-darwin-x64",
  "jbs-client-darwin-arm64",
];

async function assertPublishDir(name: string) {
  const dir = join(distRoot, name);
  const manifest = join(dir, "package.json");
  if (!existsSync(manifest)) {
    throw new Error(`Missing publish manifest: ${manifest}. Run 'bun run build' first.`);
  }
}

async function packageVersionExists(name: string, version: string) {
  const packageUrl = `${registryUrl}/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;
  const response = await fetch(packageUrl, {
    headers: {
      Accept: "application/json",
    },
  });

  if (response.status === 404) {
    return false;
  }

  if (!response.ok) {
    throw new Error(`Failed to check ${name}@${version}: npm registry returned ${response.status}`);
  }

  return true;
}

async function publishPackage(name: string) {
  await assertPublishDir(name);
  if (await packageVersionExists(name, packageJson.version)) {
    console.log(`Skipping ${name}@${packageJson.version}: version already exists.`);
    return;
  }

  console.log(`Publishing ${name}...`);
  await $`npm publish --access public --provenance --registry ${registryUrl}`.cwd(join(distRoot, name));
}

async function main() {
  for (const name of platformPackages) {
    await publishPackage(name);
  }

  await publishPackage(rootPackageName);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
