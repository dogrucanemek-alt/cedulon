#!/usr/bin/env node
'use strict'

// Launcher for `cedulon-mcp`. This package holds no logic of its own: it resolves
// the cedulon-mcp command inside @cedulon/mcp-server and hands over, unchanged.
//
// The exit code is forwarded verbatim. Cedulon is fail-closed — a non-zero exit
// is how a refused spend reports itself — so a launcher that normalised exit
// codes would turn a denial into an apparent success.

const { spawnSync } = require('node:child_process')
const path = require('node:path')

const TARGET = "cedulon-mcp"
const PKG = "@cedulon/mcp-server"

let targetPackageJson
try {
  targetPackageJson = require.resolve(PKG + '/package.json')
} catch {
  process.stderr.write("cedulon-mcp" + ': cannot resolve ' + PKG + '.\n')
  process.exit(1)
}

const targetPkg = require(targetPackageJson)
const relative = targetPkg.bin && targetPkg.bin[TARGET]
if (!relative) {
  process.stderr.write(
    "cedulon-mcp" + ': ' + PKG + '@' + targetPkg.version + ' does not provide ' + TARGET + '.\n'
  )
  process.exit(1)
}

const result = spawnSync(
  process.execPath,
  [path.join(path.dirname(targetPackageJson), relative), ...process.argv.slice(2)],
  { stdio: 'inherit' }
)

if (result.error) {
  process.stderr.write("cedulon-mcp" + ': ' + result.error.message + '\n')
  process.exit(1)
}
if (result.signal) process.exit(1)
process.exit(result.status === null ? 1 : result.status)
