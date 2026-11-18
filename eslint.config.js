import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'coverage/'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // JavaScript que corre en el navegador
    files: ['src/public/js/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser, io: 'readonly' },
    },
  },
  {
    // Scripts de línea de comandos: imprimir en consola es su trabajo
    files: ['scripts/**/*.js'],
    rules: { 'no-console': 'off' },
  },
  prettier,
];
