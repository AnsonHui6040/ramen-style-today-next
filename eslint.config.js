import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['**/dist/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['apps/**/*.{ts,tsx,mts,cts}'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{
          name: '@ramen-style/classification-core/compiler',
          message: 'apps may use only the classification-core runtime entrypoint',
        }],
        patterns: [{
          group: ['**/packages/classification-core/src/**'],
          message: 'cross-package source imports are forbidden',
        }],
      }],
    },
  },
  {
    files: ['tools/**/*.{ts,tsx,mts,cts}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/packages/classification-core/src/**'],
          message: 'tools must use the classification-core compiler entrypoint',
        }],
      }],
    },
  },
)
