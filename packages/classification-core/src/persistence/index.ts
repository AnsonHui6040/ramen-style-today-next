export {
  CURRENT_SCHEMA_VERSION,
  type MigrationResult,
  type RepairResult,
  type RestoreResult,
  type SourceVersion,
  type StoredClassificationPayload,
  type ValidationResult,
} from './contracts.js'
export { migrateStoredClassification } from './migrate.js'
export { repairAnswers } from './repair.js'
export {
  restoreQuestionnaire,
  serializeClassificationPayload,
  validateStoredPayload,
} from './restore.js'
