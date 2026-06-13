import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'cache/**',
      'data/**',
      'uploads/**',
      'backups/**'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }]
    }
  },
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs'
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off'
    }
  },
  {
    files: ['src/admin/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser
      }
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'off'
    }
  }
);
