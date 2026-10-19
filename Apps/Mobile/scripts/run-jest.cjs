const { spawnSync } = require("node:child_process");
const { createRequire } = require("node:module");
const path = require("node:path");

const requireFromProject = createRequire(path.join(process.cwd(), "package.json"));
const projectNodeModules = path.resolve(process.cwd(), "node_modules");
process.env.NODE_PATH = [projectNodeModules, process.env.NODE_PATH]
  .filter(Boolean)
  .join(path.delimiter);
require("node:module").Module._initPaths();

const result = spawnSync(
  process.execPath,
  [
    path.resolve(path.dirname(requireFromProject.resolve("jest")), "..", "bin", "jest.js"),
    ...process.argv.slice(2),
  ],
  { stdio: "inherit", env: process.env },
);

process.exit(result.status ?? 1);
