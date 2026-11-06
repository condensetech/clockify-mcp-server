// Builds the npm package in dist/: one bundled file with no dependencies to install, plus a
// generated manifest. Publish with `npm publish ./dist`; the root package.json stays private.
import { existsSync, readFileSync } from "node:fs";
import { cp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import pkg from "../package.json";

const root = join(import.meta.dir, "..");
const dist = join(root, "dist");

await rm(dist, { recursive: true, force: true });
const result = await Bun.build({
  entrypoints: [join(root, "src/index.ts")],
  outdir: dist,
  naming: "index.js",
  target: "node",
  minify: true,
  metafile: true,
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

// "Runtime dependencies = what ships": every bundled package must be in the production tree,
// so a dev tool can't end up in the published file unnoticed.
const production = productionTree();
const bundled = new Set<string>();
for (const input of Object.keys(result.metafile?.inputs ?? {})) {
  const name = input.match(/.*node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1];
  if (name) bundled.add(name);
}
const strays = [...bundled].filter((name) => !production.has(name));
if (strays.length) {
  console.error(`Bundled packages outside the production tree: ${strays.join(", ")}`);
  process.exit(1);
}

await Bun.write(
  join(dist, "package.json"),
  `${JSON.stringify(
    {
      name: pkg.name,
      version: pkg.version,
      description: pkg.description,
      license: pkg.license,
      repository: pkg.repository,
      type: pkg.type,
      bin: { "clockify-mcp-server": "index.js" },
      engines: { node: pkg.engines.node },
    },
    null,
    2,
  )}\n`,
);
await cp(join(root, "README.md"), join(dist, "README.md"));
await cp(join(root, "LICENSE"), join(dist, "LICENSE"));
console.error(`built ${pkg.name}@${pkg.version} in dist/ (${[...bundled].sort().join(", ")})`);

type Manifest = {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

// `dependencies` and everything they depend on, resolved through node_modules the way Node does.
function productionTree(): Set<string> {
  const names = new Map<string, string>(); // package dir -> name
  const visit = (fromDir: string, manifest: Manifest) => {
    const deps = { ...manifest.dependencies, ...manifest.optionalDependencies };
    for (const name of Object.keys(deps)) {
      const dir = resolvePackage(fromDir, name);
      if (!dir || names.has(dir)) continue;
      names.set(dir, name);
      visit(dir, JSON.parse(readFileSync(join(dir, "package.json"), "utf8")));
    }
  };
  visit(root, pkg);
  return new Set(names.values());
}

function resolvePackage(fromDir: string, name: string): string | undefined {
  for (let dir = fromDir; ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return candidate;
    if (dir === dirname(dir)) return undefined;
  }
}
