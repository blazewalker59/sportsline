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

  // The server renders in UTC with its own locale, the browser in the
  // Viewer's: dates, times and numbers formatted with the runtime's defaults
  // differ between the two and break hydration. Format them through
  // "@/lib/time/format", which names the zone and the locale every time.
  {
    name: 'sportsline/time-format',
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/lib/time/**', 'src/__tests__/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...[
          'toLocaleString',
          'toLocaleDateString',
          'toLocaleTimeString',
          'getFullYear',
          'getMonth',
          'getDate',
          'getDay',
          'getHours',
          'getMinutes',
          'getTimezoneOffset',
          'setFullYear',
          'setMonth',
          'setDate',
          'setHours',
          'setMinutes',
        ].map((property) => ({
          property,
          message:
            'Uses the runtime’s time zone or locale; use "@/lib/time/format".',
        })),
        ...['DateTimeFormat', 'NumberFormat'].map((property) => ({
          object: 'Intl',
          property,
          message: 'Format through "@/lib/time/format", with its locale.',
        })),
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
