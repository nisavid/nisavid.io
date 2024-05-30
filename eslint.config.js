// FIXME: Sync in customizations from .eslintrc.cjs, then delete that file

import { FlatCompat } from "@eslint/eslintrc";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

import editorconfig from "eslint-plugin-editorconfig";
import globals from "globals";
//import html from "@html-eslint/eslint-plugin";
//import htmlParser from "@html-eslint/parser";
import js from "@eslint/js";
import jsdoc from "eslint-plugin-jsdoc";
import jsonc from "eslint-plugin-jsonc";
import jsonSchema from "eslint-plugin-json-schema-validator";
//import markdown from "eslint-plugin-markdown";
import prettier from "eslint-plugin-prettier";

export default [
  js.configs.recommended,
  ...compat.extends("plugin:@typescript-eslint/strict"),
  ...compat.extends("plugin:@typescript-eslint/stylistic"),
  ...compat.plugins("editorconfig"),
  editorconfig.configs.all,
  ...compat.config(jsdoc.configs.recommended),
  ...compat.config(jsonc.configs.base),
  ...compat.config(jsonSchema.configs.recommended),
  //...compat.plugins("@html-eslint"),
  //{
  //  files: ["**/*.html"],
  //  languageOptions: {
  //    parser: htmlParser,
  //  },
  //  ...compat.config(html.configs.recommended),
  //},
  // NOTE: This contains a circular reference chain
  //...compat.config(markdown.configs.recommended),
  ...compat.config(prettier.configs.recommended),
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
];
