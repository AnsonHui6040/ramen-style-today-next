export const diagnosticCodes = [
  'STRUCTURE_INVALID',
  'QUESTION_DUPLICATE_ID',
  'OPTION_DUPLICATE_ID',
  'STYLE_DUPLICATE_ID',
  'REFERENCE_UNKNOWN',
  'FLOW_CYCLE',
  'POLICY_WEIGHT_TOTAL',
  'CONCEPT_DUPLICATE_KEY',
  'DOC_RELATION_INVALID',
  'DOC_INDEX_DRIFT',
  'LEDGER_INVALID',
] as const

export type DiagnosticCode = (typeof diagnosticCodes)[number]
