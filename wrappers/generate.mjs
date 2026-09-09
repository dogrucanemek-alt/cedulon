#!/usr/bin/env node
// Generates the unscoped launcher packages for Cedulon.
//
// Cedulon ships as scoped packages (@cedulon/*) and the documented MCP command
// already uses the scoped form, so unlike Conarium nothing here is broken. What
// these close is the name: `cedulon` and `cedulon-mcp` were both unclaimed on
// npm, which means anyone could publish a package under this brand and every
// reader — human or model — who guessed `npx cedulon` would run their code.
//
// Run: node wrappers/generate.mjs

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')

const server = JSON.parse(
  readFileSync(join(repoRoot, 'packages', 'mcp-server', 'package.json'), 'utf8')
)
const TARGET_PKG = server.name
const TARGET_RANGE = `^${server.version}`
const TARGET_BIN = 'cedulon-mcp'
// LF, whatever the checkout did to the source file: these are published artefacts.
const LICENSE = readFileSync(join(repoRoot, 'LICENSE'), 'utf8').split('\r\n').join('\n')

// Both launchers start the same MCP server. `cedulon` is the brand entry point;
// `cedulon-mcp` matches the bin name someone reading the package listing would try.
const NAMES = ['cedulon', 'cedulon-mcp']

const cli = (name) => `#!/usr/bin/env node
'use strict'

// Launcher for \`${name}\`. This package holds no logic of its own: it resolves
// the ${TARGET_BIN} command inside ${TARGET_PKG} and hands over, unchanged.
//
// The exit code is forwarded verbatim. Cedulon is fail-closed — a non-zero exit
// is how a refused spend reports itself — so a launcher that normalised exit
// codes would turn a denial into an apparent success.

const { spawnSync } = require('node:child_process')
const path = require('node:path')

const TARGET = ${JSON.stringify(TARGET_BIN)}
const PKG = ${JSON.stringify(TARGET_PKG)}

let targetPackageJson
try {
  targetPackageJson = require.resolve(PKG + '/package.json')
} catch {
  process.stderr.write(${JSON.stringify(name)} + ': cannot resolve ' + PKG + '.\\n')
  process.exit(1)
}

const targetPkg = require(targetPackageJson)
const relative = targetPkg.bin && targetPkg.bin[TARGET]
if (!relative) {
  process.stderr.write(
    ${JSON.stringify(name)} + ': ' + PKG + '@' + targetPkg.version + ' does not provide ' + TARGET + '.\\n'
  )
  process.exit(1)
}

const result = spawnSync(
  process.execPath,
  [path.join(path.dirname(targetPackageJson), relative), ...process.argv.slice(2)],
  { stdio: 'inherit' }
)

if (result.error) {
  process.stderr.write(${JSON.stringify(name)} + ': ' + result.error.message + '\\n')
  process.exit(1)
}
if (result.signal) process.exit(1)
process.exit(result.status === null ? 1 : result.status)
`

const readme = (name) => `# ${name}

Launcher for the Cedulon MCP server.

\`\`\`bash
npx ${name}
\`\`\`

This package contains no logic. It resolves \`${TARGET_BIN}\` inside
[\`${TARGET_PKG}\`](https://www.npmjs.com/package/${TARGET_PKG}), runs it, and forwards
the exit code unchanged.

To register the server with an MCP client, the documented form is still:

\`\`\`bash
claude mcp add cedulon -- npx -y ${TARGET_PKG}
\`\`\`

Cedulon is an audit layer for agent-to-agent spend: a signed trade manifest before
the spend, a signed receipt after it, and a reconciliation against the payment
rail's own records. It is fail-closed, so a non-zero exit is a refusal, not a crash.

Documentation: <https://cedulon.com> · Source: <https://github.com/dogrucanemek-alt/cedulon>

Apache-2.0 licensed.
`

const pkg = (name) => ({
  name,
  version: '1.0.0',
  description: `Launcher for the Cedulon MCP server (${TARGET_PKG}).`,
  keywords: ['cedulon', 'mcp', 'agent-commerce', 'audit', 'spend-policy'],
  license: 'Apache-2.0',
  homepage: 'https://cedulon.com',
  repository: {
    type: 'git',
    url: 'git+https://github.com/dogrucanemek-alt/cedulon.git',
    directory: `wrappers/${name}`,
  },
  bugs: { url: 'https://github.com/dogrucanemek-alt/cedulon/issues' },
  engines: { node: '>=20' },
  bin: { [name]: 'bin/cli.cjs' },
  // Allow-list, never a denylist.
  files: ['bin/cli.cjs', 'README.md', 'LICENSE'],
  dependencies: { [TARGET_PKG]: TARGET_RANGE },
})

for (const name of NAMES) {
  const dir = join(here, name)
  mkdirSync(join(dir, 'bin'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg(name), null, 2) + '\n')
  writeFileSync(join(dir, 'bin', 'cli.cjs'), cli(name))
  writeFileSync(join(dir, 'README.md'), readme(name))
  writeFileSync(join(dir, 'LICENSE'), LICENSE)
  process.stdout.write(`generated wrappers/${name} -> ${TARGET_PKG}@${TARGET_RANGE}\n`)
}
