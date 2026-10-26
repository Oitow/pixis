import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'tests/visual/out'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-expressions': 'off',
      'no-restricted-properties': ['error', { object: 'Math', property: 'random', message: 'Use the seeded RNG from src/core/rng.ts' }],
    },
  },
  { files: ['tests/visual/**/*.mjs'], languageOptions: { globals: { window: 'readonly', process: 'readonly', console: 'readonly', setTimeout: 'readonly', URL: 'readonly' } } },
);
