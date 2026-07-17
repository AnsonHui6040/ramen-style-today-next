import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  eligibilityCasesSchema,
  eligibilityManifestSchema,
  maximumEligibilityFixtureBytes,
  serializeEligibilityValue,
  sha256,
} from './contracts.js'

const fixtureRoot = resolve(import.meta.dirname, '../fixtures/eligibility/legacy-v1')
const expectedFixtureContentHash =
  'b96d59285f6725dec5da2dda77776fbf877a5258b8ae5ee821fb5ca5618de1c9'
const expectedManifestHash =
  'fb189722968020fb0aa8eb91674a94f5ee0448d910a786cd9021cb216e06706d'

export function verifyEligibilityFixtureSet(input: {
  readonly casesBytes: Uint8Array
  readonly manifestBytes: Uint8Array
}) {
  const casesBytes = Buffer.from(input.casesBytes)
  const manifestBytes = Buffer.from(input.manifestBytes)
  if (
    casesBytes.byteLength === 0
      || casesBytes.byteLength > maximumEligibilityFixtureBytes
  ) throw new Error('eligibility fixture exceeds approved byte bound')
  const casesFile = eligibilityCasesSchema.parse(JSON.parse(casesBytes.toString('utf8')))
  const manifest = eligibilityManifestSchema.parse(JSON.parse(manifestBytes.toString('utf8')))
  if (!casesBytes.equals(serializeEligibilityValue(casesFile))) {
    throw new Error('eligibility fixture bytes are not canonical')
  }
  if (!manifestBytes.equals(serializeEligibilityValue(manifest))) {
    throw new Error('eligibility manifest bytes are not canonical')
  }
  const fixtureContentHash = sha256(casesBytes)
  const manifestHash = sha256(manifestBytes)
  if (
    fixtureContentHash !== expectedFixtureContentHash
      || manifestHash !== expectedManifestHash
      || manifest.fixtureContentHash !== fixtureContentHash
      || manifest.caseCount !== casesFile.cases.length
      || JSON.stringify(manifest.orderedCaseIds)
        !== JSON.stringify(casesFile.cases.map(({ id }) => id))
  ) throw new Error('eligibility fixture identity drifted')
  return Object.freeze({
    cases: casesFile.cases,
    manifest,
    verification: Object.freeze({
      status: 'pass' as const,
      caseCount: casesFile.cases.length,
      fixtureContentHash,
      manifestHash,
      coverage: manifest.coverage,
    }),
  })
}

export function loadVerifiedEligibilityFixtureSet() {
  return verifyEligibilityFixtureSet({
    casesBytes: readFileSync(resolve(fixtureRoot, 'cases.json')),
    manifestBytes: readFileSync(resolve(fixtureRoot, 'manifest.json')),
  })
}

if (process.argv[1]?.endsWith('verify-fixtures.ts')) {
  console.log(JSON.stringify(loadVerifiedEligibilityFixtureSet().verification))
}
