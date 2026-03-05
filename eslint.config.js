import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      "spaced-comment": "off",
      "capitalized-comments": "off",
      "multiline-comment-style": "off",
      "no-inline-comments": "off",
      "line-comment-position": "off"
    }
  },
]);
