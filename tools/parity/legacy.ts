import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const mode = process.argv[2]
const legacyRoot = process.argv[3]
if ((mode !== '--write' && mode !== '--check') || !legacyRoot) {
  console.error('Usage: tsx tools/parity/legacy.ts (--write|--check) <legacy checkout at the baseline commit>')
  process.exit(2)
}

let failed = false
for (const script of ['generate.ts', 'restore-generate.ts']) {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', resolve(import.meta.dirname, script), mode, legacyRoot],
    { stdio: 'inherit' },
  )
  if (result.status !== 0) failed = true
}
process.exit(failed ? 1 : 0)
