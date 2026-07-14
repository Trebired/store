import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = path.join(rootDir, ".tmp", "verify-pack");
const npmCacheDir = path.join(tempRoot, "npm-cache");
const packageJsonBackupPath = path.join(rootDir, ".tmp", "package.json.backup");
const resultDir = path.join(rootDir, "node_modules", "@trebired", "result");
const loggerAdapterDir = path.join(rootDir, "node_modules", "@trebired", "logger-adapter");
const nodeTypesDir = path.join(rootDir, "node_modules", "@types", "node");
const tscBin = path.join(rootDir, "node_modules", "typescript", "bin", "tsc");

async function main() {
  await resetTempRoot();
  const tarballPath = packPackage();
  const tarballEntries = listTarEntries(tarballPath);
  const packageJson = readPackedPackageJson(tarballPath);

  validatePackedEntrypoints(packageJson, tarballEntries);
  validatePackedImports(packageJson, tarballEntries);
  await runConsumerSmokeTest(tarballPath);
  console.log("Pack verification succeeded.");
}

async function resetTempRoot() {
  await fs.rm(tempRoot, {
    force: true,
    recursive: true,
  });
  await fs.mkdir(npmCacheDir, {
    recursive: true,
  });
}

function packPackage() {
  const stdoutPath = path.join(tempRoot, "pack-output.json");
  try {
    execFileSync("sh", ["-lc", `npm pack --json > ${shellEscape(stdoutPath)}`], {
      ...createNpmOptions(rootDir),
      stdio: ["ignore", "inherit", "inherit"],
    });
  } catch (error) {
    restorePackageJsonFromBackup();
    throw error;
  }

  const stdout = execFileSync("cat", [stdoutPath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  const [entry] = JSON.parse(stdout);
  if (!entry?.filename) {
    throw new Error("npm pack did not return a tarball filename.");
  }

  return path.join(rootDir, entry.filename);
}

function listTarEntries(tarballPath) {
  return new Set(execFileSync("tar", ["-tf", tarballPath], {
    encoding: "utf8",
  }).split("\n").map((entry) => entry.trim()).filter(Boolean));
}

function readPackedPackageJson(tarballPath) {
  return JSON.parse(execFileSync("tar", ["-xOf", tarballPath, "package/package.json"], {
    encoding: "utf8",
  }));
}

function validatePackedEntrypoints(packageJson, tarballEntries) {
  const targets = new Set([packageJson.main, packageJson.types]);
  for (const value of Object.values(packageJson.exports || {})) {
    collectExportTargets(value, targets);
  }

  for (const target of targets) {
    if (typeof target === "string") {
      assertTarEntryExists(tarballEntries, target, `Missing packed entrypoint target: ${target}`);
    }
  }
}

function collectExportTargets(value, targets) {
  if (typeof value === "string") {
    targets.add(value);
    return;
  }

  for (const nested of Object.values(value || {})) {
    collectExportTargets(nested, targets);
  }
}

function validatePackedImports(packageJson, tarballEntries) {
  for (const [alias, target] of Object.entries(packageJson.imports || {})) {
    if (typeof target !== "string") {
      continue;
    }
    if (target.includes("./src/")) {
      throw new Error(`Packed imports entry ${alias} still points at source path ${target}.`);
    }
    assertTarEntryExists(tarballEntries, target, `Packed imports target is missing for ${alias}: ${target}`);
  }
}

async function runConsumerSmokeTest(tarballPath) {
  const consumerDir = path.join(tempRoot, "consumer");
  await fs.mkdir(consumerDir, {
    recursive: true,
  });
  await fs.writeFile(path.join(consumerDir, "package.json"), JSON.stringify({
    dependencies: {
      "@trebired/logger-adapter": `file:${loggerAdapterDir}`,
      "@trebired/result": `file:${resultDir}`,
      "@trebired/store": `file:${tarballPath}`,
    },
    devDependencies: {
      "@types/node": `file:${nodeTypesDir}`,
    },
    name: "store-pack-smoke",
    private: true,
    type: "module",
  }, null, 2));
  await fs.writeFile(path.join(consumerDir, "index.ts"), [
    'import { createMemoryStorageAdapter, createStore, defineEntityRegistry } from "@trebired/store";',
    "const entities = defineEntityRegistry({ things: { table: \"things\", storage: \"memory\" } });",
    "const store = createStore({ entities, storages: { memory: createMemoryStorageAdapter() } });",
    "console.log(Boolean(store));",
  ].join("\n"));
  await fs.writeFile(path.join(consumerDir, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      lib: ["ES2020"],
      module: "ESNext",
      moduleResolution: "Bundler",
      noEmit: true,
      target: "ES2020",
      types: ["node"],
    },
    include: ["./index.ts"],
  }, null, 2));

  execFileSync("npm", ["install", "--ignore-scripts"], {
    ...createNpmOptions(consumerDir),
    stdio: "inherit",
  });
  execFileSync(process.execPath, [tscBin, "-p", "tsconfig.json"], {
    cwd: consumerDir,
    stdio: "inherit",
  });
}

function assertTarEntryExists(tarballEntries, packagePath, message) {
  if (!tarballEntries.has(`package/${String(packagePath).replace(/^\.\//u, "")}`)) {
    throw new Error(message);
  }
}

function createNpmOptions(cwd) {
  return {
    cwd,
    env: {
      ...process.env,
      npm_config_audit: "false",
      npm_config_cache: npmCacheDir,
      npm_config_fund: "false",
      npm_config_ignore_scripts: "false",
      npm_config_package_lock: "false",
    },
  };
}

function restorePackageJsonFromBackup() {
  try {
    execFileSync("test", ["-f", packageJsonBackupPath], {
      stdio: "ignore",
    });
    execFileSync("cp", [packageJsonBackupPath, path.join(rootDir, "package.json")], {
      stdio: "ignore",
    });
  } catch {
    // no backup was created
  }
}

function shellEscape(value) {
  return `'${String(value).replace(/'/gu, "'\\''")}'`;
}

await main();
