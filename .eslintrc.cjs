module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/strict",
    "plugin:@typescript-eslint/stylistic",
    "plugin:editorconfig/all",
    "plugin:jsdoc/recommended",
    "plugin:prettier/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: "tsconfig.json",
    tsconfigRootDir: __dirname,
    ecmaVersion: "latest",
    sourceType: "module",
  },
  plugins: [
    "@typescript-eslint/eslint-plugin",
    "eslint-plugin-tsdoc",
    "editorconfig",
  ],
  rules: {
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "jsdoc/check-param-names": [1, {
      checkDestructured: false,
    }],
    "jsdoc/require-description": [1, {
      contexts: ["ClassDeclaration", "ClassProperty", "FunctionDeclaration"],
    }],
    "jsdoc/require-jsdoc": [1, {
      contexts: ["ClassDeclaration", "ClassProperty", "FunctionDeclaration"],
    }],
    "jsdoc/require-param": [1, {
      checkDestructured: false,
    }],
    "jsdoc/require-param-type": "off",
    "jsdoc/require-property-description": 1,
    "jsdoc/require-returns-type": "off",
    "jsdoc/valid-types": "off",
    "tsdoc/syntax": "warn",
    "prettier/prettier": "off",
  },
  overrides: [
    {
      env: {
        node: true,
      },
      files: [".eslintrc.{js,cjs}"],
      parserOptions: {
        sourceType: "script",
      },
    },
  ],
};
