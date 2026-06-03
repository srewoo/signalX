// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // Root config files live outside tsconfig's include set.
          allowDefaultProject: ['eslint.config.js', 'vite.config.ts', 'vitest.config.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Project hard rules (ARCHITECTURE.md): no `any`, no console (structured
      // logger only), no swallowed errors.
      'no-console': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Build/tooling configs run outside the tsconfig project — syntax-only
    // linting there (type-aware rules can't resolve their imports).
    files: ['eslint.config.js', 'vite.config.ts', 'vitest.config.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // Vitest test files: allow non-null assertions on indexed access (out[0]!)
    // and async mocks that resolve without awaiting anything.
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
);
