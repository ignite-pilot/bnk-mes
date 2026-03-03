module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  overrides: [
    {
      files: ['server/**/*.test.js'],
      env: { jest: true },
    },
  ],
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18' } },
  plugins: ['react', 'react-hooks'],
  rules: {
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
  },
  ignorePatterns: ['dist', 'node_modules'],
};
