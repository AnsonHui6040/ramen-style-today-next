import { z } from 'zod'

export const stableIdSchema = z.string().regex(
  /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/,
  'stable IDs must use lowercase kebab case',
)

export const versionSchema = z.string().regex(
  /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/,
  'versions must be stable lowercase tokens',
)
