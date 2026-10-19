// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  ...expoConfig,
  {
    ignores: ['dist/*', 'node_modules/*', '.expo/*', 'coverage/*'],
  },
  {
    // The codebase uses the canonical fetch-on-mount pattern (load() called
    // from useEffect sets loading state before the first await). The new
    // react-hooks v6 rule flags this pattern repo-wide, including screens
    // that predate it — downgraded to a warning until the data layer moves
    // to an async boundary (tracked as tech debt, not a correctness issue).
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    // Node-scope build/tooling scripts (flat config ignores `eslint-env`
    // comments, so CommonJS + Buffer globals are declared here instead).
    files: ['scripts/**/*.js'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        __dirname: 'readonly',
        require: 'readonly',
        module: 'writable',
        exports: 'writable',
        process: 'readonly',
        console: 'readonly',
      },
    },
  },
]);
