//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  ...tanstackConfig,

  {
    name: 'sportsline/ignores',
    ignores: [
      'eslint.config.js',
      'prettier.config.js',
      'public/**/*.js',
      '.claude/**',
      'worker-configuration.d.ts',
    ],
  },

  // Source-specific shapes never leak past a Source adapter (CONTEXT.md,
  // "Source"; docs/adr/0002). Only the adapters themselves and their tests
  // may import a League's raw Source module.
  {
    name: 'sportsline/source-boundary',
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/lib/sources/**', 'src/__tests__/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/sources/*/*'],
              message:
                'Import Source adapters through "@/lib/sources", never a League module directly.',
            },
            {
              group: ['@test/*', '**/__tests__/*'],
              message: 'Production code must not import from src/__tests__.',
            },
          ],
        },
      ],
    },
  },

  {
    name: 'sportsline/react-hooks',
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  {
    name: 'sportsline/overrides',
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/require-await': 'warn',
      'no-shadow': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    },
  },
]
