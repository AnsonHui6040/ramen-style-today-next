import type {
  EligibilityCandidate,
  EligibilityOutcome,
} from '@ramen-style/classification-core'

import { coreLabel, subtypeLabel } from './presentation-copy.js'

export interface PresentationCatalogRecord {
  readonly styleId: string
  readonly styleDisplayName: string
  readonly shortDescription: string
  readonly accent: string
}

export type PresentationCandidate =
  | {
      readonly availability: 'available'
      readonly styleId: string
      readonly styleDisplayName: string
      readonly coreId: string
      readonly coreDisplayName: string
      readonly subtypeId: string
      readonly subtypeDisplayName: string
      readonly shortDescription: string
      readonly accent: string
      readonly score: number
      readonly confidence: number | null
      readonly decision: 'eligible' | 'blocked'
      readonly eligibilityFacts: readonly string[]
      readonly originalRank: number
    }
  | {
      readonly availability: 'unavailable'
      readonly styleId: string
      readonly coreId: string
      readonly subtypeId: string
      readonly score: number
      readonly confidence: number | null
      readonly decision: 'eligible' | 'blocked'
      readonly originalRank: number
    }

export type PresentationCatalog = ReadonlyMap<string, PresentationCatalogRecord>

export function createPresentationCatalog(records: readonly PresentationCatalogRecord[]):
  | { readonly ok: true; readonly catalog: PresentationCatalog }
  | { readonly ok: false; readonly code: 'PRESENTATION_CATALOG_INVALID' } {
  const catalog = new Map<string, PresentationCatalogRecord>()
  for (const record of records) {
    if (!record.styleId || !record.styleDisplayName || !record.shortDescription
      || catalog.has(record.styleId)) {
      return { ok: false, code: 'PRESENTATION_CATALOG_INVALID' }
    }
    catalog.set(record.styleId, Object.freeze({ ...record }))
  }
  return { ok: true, catalog }
}

const records = [
  ['shoyu-chintan', '醬油清湯', '醬油香與清澈出汁互相襯托，線條俐落。', '#c45b32'],
  ['shio-chintan', '鹽味清湯', '以鹽味帶出鮮味，湯體乾淨而直接。', '#4c8291'],
  ['chicken-chintan', '雞清湯', '清澈雞湯配上細緻雞油香，溫和耐吃。', '#d49a32'],
  ['duck-chintan', '鴨清湯', '鴨脂香與清湯層次交疊，風味細長。', '#8e4c45'],
  ['chicken-paitan', '雞白湯', '乳化雞湯帶來圓潤、厚實的包覆感。', '#d8aa58'],
  ['duck-paitan', '鴨白湯', '濃郁鴨香與白湯質地，飽滿但不單調。', '#925f52'],
  ['tonkotsu', '豚骨', '豬骨乳化湯體，濃厚、黏唇而有力量。', '#8f664c'],
  ['hakata', '博多豚骨', '細直麵配上俐落豚骨湯，是經典博多節奏。', '#9e7458'],
  ['iekei', '家系', '豚骨醬油、雞油與粗麵構成鮮明的重口輪廓。', '#6e3f32'],
  ['jiro', '二郎系', '極粗麵、蒜、豆芽與背脂堆出份量感。', '#6f533d'],
  ['miso', '味噌拉麵', '發酵甜鹹與濃郁湯體交織，厚實暖胃。', '#bd7229'],
  ['sapporo', '札幌味噌', '炒香味噌、縮麵與油脂感，帶出北方風格。', '#c75d2c'],
  ['gyokai', '魚介拉麵', '魚乾、節香與湯底融合，海味層次清楚。', '#356f79'],
  ['shellfish-dashi', '貝出汁拉麵', '蛤蜊與貝類鮮味細緻延伸，清亮而有深度。', '#347f78'],
  ['konbusui-tsukemen', '昆布水沾麵', '昆布水包裹麵體，呈現滑順清爽的鮮味。', '#2f8173'],
  ['gyokai-tsukemen', '濃厚魚介沾麵', '粗麵搭配濃縮魚介沾汁，香氣集中有衝擊。', '#325e72'],
  ['aburasoba', '油拌麵', '以油香和醬香包覆麵條，無湯卻飽滿。', '#b55235'],
  ['taiwan-mazesoba', '台灣拌麵', '肉燥、蒜與辛香拌入麵條，濃烈有節奏。', '#9d3642'],
] as const satisfies readonly (readonly [string, string, string, string])[]

const compiledCatalog = createPresentationCatalog(records.map(([
  styleId, styleDisplayName, shortDescription, accent,
]) => ({ styleId, styleDisplayName, shortDescription, accent })))

if (!compiledCatalog.ok) throw new Error('Presentation catalog failed to compile')
export const presentationCatalog = compiledCatalog.catalog

export function adaptCandidateForPresentation(
  candidate: EligibilityCandidate,
  catalog: PresentationCatalog = presentationCatalog,
): PresentationCandidate {
  const record = catalog.get(candidate.styleId)
  const shared = {
    styleId: candidate.styleId,
    coreId: candidate.coreId,
    subtypeId: candidate.subtypeId,
    score: candidate.score,
    confidence: candidate.confidence,
    decision: candidate.decision,
    originalRank: candidate.originalRank,
  } as const
  if (!record) return { availability: 'unavailable', ...shared }
  return {
    availability: 'available',
    ...shared,
    styleDisplayName: record.styleDisplayName,
    coreDisplayName: coreLabel(candidate.coreId),
    subtypeDisplayName: subtypeLabel(candidate.subtypeId),
    shortDescription: record.shortDescription,
    accent: record.accent,
    eligibilityFacts: candidate.reasons.map(({ exclusionOptionId }) => exclusionOptionId),
  }
}

export function adaptEligibilityResults(outcome: EligibilityOutcome) {
  return Object.freeze({
    primary: outcome.selectedPrimaryResults.map((candidate) => (
      adaptCandidateForPresentation(candidate)
    )),
    alternatives: outcome.selectedAlternatives.map((candidate) => (
      adaptCandidateForPresentation(candidate)
    )),
    blockedLead: outcome.blockedLead
      ? adaptCandidateForPresentation(outcome.blockedLead)
      : null,
  })
}
