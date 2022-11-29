module.exports = {
    env: {
        browser: true,
        es2021: true,
    },
    extends: [
        'eslint:recommended',
        'plugin:vue/vue3-essential',
        '@vue/eslint-config-vue3-typescript',
        'plugin:prettier-vue/recommended',
    ],
    overrides: [],
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
    },
    plugins: [],
    rules: {},
};
