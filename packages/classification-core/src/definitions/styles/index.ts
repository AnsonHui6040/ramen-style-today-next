import type {
  StyleDefinition,
  StyleDefinitionBundleSource,
} from '../../contracts/style-model.js'
import { aburasobaStyle } from './aburasoba.js'
import { chickenChintanStyle } from './chicken-chintan.js'
import { chickenPaitanStyle } from './chicken-paitan.js'
import { duckChintanStyle } from './duck-chintan.js'
import { duckPaitanStyle } from './duck-paitan.js'
import { gyokaiStyle } from './gyokai.js'
import { gyokaiTsukemenStyle } from './gyokai-tsukemen.js'
import { hakataStyle } from './hakata.js'
import { iekeiStyle } from './iekei.js'
import { jiroStyle } from './jiro.js'
import { konbusuiTsukemenStyle } from './konbusui-tsukemen.js'
import { misoStyle } from './miso.js'
import { sapporoStyle } from './sapporo.js'
import { shellfishDashiStyle } from './shellfish-dashi.js'
import { shioChintanStyle } from './shio-chintan.js'
import { shoyuChintanStyle } from './shoyu-chintan.js'
import { styleTaxonomy } from './taxonomy.js'
import { taiwanMazesobaStyle } from './taiwan-mazesoba.js'
import { tonkotsuStyle } from './tonkotsu.js'

export const styleDefinitions = [
  shoyuChintanStyle,
  shioChintanStyle,
  misoStyle,
  tonkotsuStyle,
  chickenChintanStyle,
  chickenPaitanStyle,
  duckChintanStyle,
  duckPaitanStyle,
  gyokaiStyle,
  shellfishDashiStyle,
  iekeiStyle,
  jiroStyle,
  hakataStyle,
  sapporoStyle,
  konbusuiTsukemenStyle,
  gyokaiTsukemenStyle,
  aburasobaStyle,
  taiwanMazesobaStyle,
] as const satisfies readonly StyleDefinition[]

export const styleDefinitionBundle = {
  sourceFile: 'packages/classification-core/src/definitions/styles/index.ts',
  modelVersion: 'batch3a.1.0',
  taxonomy: styleTaxonomy,
  definitions: styleDefinitions,
} as const satisfies StyleDefinitionBundleSource
