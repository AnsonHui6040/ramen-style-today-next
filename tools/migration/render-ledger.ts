import { compareCodePoints } from '@ramen-style/classification-core/compiler'

import type { MigrationLedger } from './ledger-schema.js'

export function renderLedger(ledger: MigrationLedger) {
  const sections = [...ledger.entries]
    .sort((left, right) => compareCodePoints(left.batch, right.batch))
    .flatMap((entry) => [
      `## Batch ${entry.batch} — ${entry.status}`,
      '',
      `- Behavior: \`${entry.behavior}\``,
      `- Transformation: ${entry.transformation}`,
      ...(entry.foundationCommit ? [`- Foundation commit: \`${entry.foundationCommit}\``] : []),
      ...(entry.implementationSha ? [`- Implementation SHA: \`${entry.implementationSha}\``] : []),
      '',
      '### Legacy sources',
      '',
      ...(entry.legacySources.length
        ? [...entry.legacySources].sort(compareCodePoints).map((source) => `- \`${source}\``)
        : ['- None; this batch introduces new infrastructure.']),
      '',
      '### New owners',
      '',
      ...[...entry.newOwners].sort(compareCodePoints).map((owner) => `- \`${owner}\``),
      '',
      ...(entry.semanticPaths?.length ? [
        '### Semantic paths',
        '',
        ...entry.semanticPaths.map((path) => `- \`${path}\``),
        '',
      ] : []),
      ...(entry.incidents ? [
        '### Incidents',
        '',
        ...(entry.incidents.length
          ? entry.incidents.map((incident) => `- \`${incident}\``)
          : ['- None recorded.']),
        '',
      ] : []),
      ...(entry.fixtureManifestHash ? [
        `- ${entry.batch === '3A' ? 'Style' : 'Persistence'} fixture manifest hash: \`${entry.fixtureManifestHash}\``,
        '',
      ] : []),
      ...(entry.implementationPaths?.length ? [
        '### Implementation paths',
        '',
        ...entry.implementationPaths.map((path) => `- \`${path}\``),
        '',
      ] : []),
      ...(entry.verificationPaths?.length ? [
        '### Verification paths',
        '',
        ...entry.verificationPaths.map((path) => `- \`${path}\``),
        '',
      ] : []),
      ...(entry.acceptanceMetadataPaths?.length ? [
        '### Acceptance metadata paths',
        '',
        ...entry.acceptanceMetadataPaths.map((path) => `- \`${path}\``),
        '',
      ] : []),
      ...(entry.acceptanceBoundary ? [
        '### Accepted Batch 2B boundary',
        '',
        `- Accepted implementation SHA: \`${entry.acceptanceBoundary.implementationSha}\``,
        `- Accepted metadata SHA: \`${entry.acceptanceBoundary.metadataSha}\``,
        '',
        '#### Accepted metadata paths',
        '',
        ...entry.acceptanceBoundary.paths.map((path) => `- \`${path}\``),
        '',
        '#### Accepted boundary verification',
        '',
        ...[...entry.acceptanceBoundary.verification]
          .sort((left, right) => compareCodePoints(left.gate, right.gate))
          .flatMap((item) => [
            `- \`${item.gate}\`: \`${item.command}\` — ${item.outcome}; ${item.evidence}`,
            ...(item.commitSha ? [`  - Commit: \`${item.commitSha}\``] : []),
            ...(item.runUrl ? [`  - Run: ${item.runUrl}`] : []),
          ]),
        '',
      ] : []),
      ...(entry.boundaryMaintenance ? [
        '### Boundary maintenance',
        '',
        `- Status: \`${entry.boundaryMaintenance.status}\``,
        ...(entry.boundaryMaintenance.status === 'complete'
          ? [`- Boundary maintenance SHA: \`${entry.boundaryMaintenance.maintenanceSha}\``]
          : []),
        '',
        '#### Boundary maintenance paths',
        '',
        ...entry.boundaryMaintenance.paths.map((path) => `- \`${path}\``),
        '',
        '#### Boundary maintenance verification',
        '',
        ...(entry.boundaryMaintenance.verification.length
          ? [...entry.boundaryMaintenance.verification]
              .sort((left, right) => compareCodePoints(left.gate, right.gate))
              .flatMap((item) => [
                `- \`${item.gate}\`: \`${item.command}\` — ${item.outcome}; ${item.evidence}`,
                ...(item.commitSha ? [`  - Commit: \`${item.commitSha}\``] : []),
                ...(item.runUrl ? [`  - Run: ${item.runUrl}`] : []),
              ])
          : ['- Pending.']),
        '',
      ] : []),
      ...(entry.persistenceIdentityMaintenance ? [
        '### Persistence identity maintenance',
        '',
        `- Status: \`${entry.persistenceIdentityMaintenance.status}\``,
        `- Change SHA: \`${entry.persistenceIdentityMaintenance.changeSha}\``,
        `- Change parent SHA: \`${entry.persistenceIdentityMaintenance.changeParentSha}\``,
        `- Accepted fixture manifest hash: \`${entry.persistenceIdentityMaintenance.acceptedFixtureManifestHash}\``,
        `- Maintained fixture manifest hash: \`${entry.persistenceIdentityMaintenance.maintainedFixtureManifestHash}\``,
        `- Cases hash: \`${entry.persistenceIdentityMaintenance.casesHash}\``,
        `- Accepted extractor hash: \`${entry.persistenceIdentityMaintenance.acceptedExtractorHash}\``,
        `- Maintained extractor hash: \`${entry.persistenceIdentityMaintenance.maintainedExtractorHash}\``,
        ...(entry.persistenceIdentityMaintenance.status === 'complete' ? [
          `- Candidate SHA: \`${entry.persistenceIdentityMaintenance.candidateSha}\``,
          `- Remote evidence gate: \`${entry.persistenceIdentityMaintenance.remoteEvidenceGate}\``,
        ] : []),
        '',
        '#### Persistence identity maintenance paths',
        '',
        ...entry.persistenceIdentityMaintenance.paths.map((path) => `- \`${path}\``),
        '',
        '#### Persistence identity maintenance verification',
        '',
        ...(entry.persistenceIdentityMaintenance.verification.length
          ? [...entry.persistenceIdentityMaintenance.verification]
              .sort((left, right) => compareCodePoints(left.gate, right.gate))
              .flatMap((item) => [
                `- \`${item.gate}\`: \`${item.command}\` — ${item.outcome}; ${item.evidence}`,
              ])
          : ['- Pending.']),
        '',
      ] : []),
      ...(entry.maintenance ? [
        '### Controlled maintenance',
        '',
        `- Status: \`${entry.maintenance.status}\``,
        '- Historical Batch 2A semantic implementation remains unchanged.',
        ...(entry.maintenance.status === 'complete'
          ? [`- Maintenance SHA: \`${entry.maintenance.maintenanceSha}\``]
          : []),
        '',
        '#### Approved maintenance paths',
        '',
        ...entry.maintenance.paths.map((path) => `- \`${path}\``),
        '',
        '#### Protected question baseline',
        '',
        ...Object.entries(entry.maintenance.baseline).map(
          ([key, value]) => `- ${key}: \`${value}\``,
        ),
        '',
        '#### Maintenance verification',
        '',
        ...(entry.maintenance.verification.length
          ? [...entry.maintenance.verification]
              .sort((left, right) => compareCodePoints(left.gate, right.gate))
              .flatMap((item) => [
                `- \`${item.gate}\`: \`${item.command}\` — ${item.outcome}; ${item.evidence}`,
                ...(item.commitSha ? [`  - Commit: \`${item.commitSha}\``] : []),
                ...(item.runUrl ? [`  - Run: ${item.runUrl}`] : []),
              ])
          : ['- Pending.']),
        '',
      ] : []),
      '### Verification',
      '',
      ...(entry.verification.length
        ? [...entry.verification]
            .sort((left, right) => compareCodePoints(left.gate, right.gate))
            .flatMap((item) => [
              `- \`${item.gate}\`: \`${item.command}\` — ${item.outcome}; ${item.evidence}`,
              ...(item.commitSha ? [`  - Commit: \`${item.commitSha}\``] : []),
              ...(item.runUrl ? [`  - Run: ${item.runUrl}`] : []),
            ])
        : ['- Pending.']),
      '',
    ])
  return [
    '# Migration Ledger',
    '',
    '> Generated from `docs/migration/ledger.json`. Do not edit this file directly.',
    '',
    `Baseline: \`${ledger.baseline.repository}@${ledger.baseline.commit}\``,
    '',
    ...sections,
  ].join('\n')
}
