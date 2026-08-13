import js from "@eslint/js";
import prettier from "eslint-plugin-prettier/recommended";
import globals from "globals";

export default [
  { ignores: ["dist"] },
  js.configs.recommended,
  prettier,
  {
    files: ["**/*.{js,jsx,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser },
    },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
    },
  },
  {
    // Build-time tooling runs in Node, not in the creative.
    files: ["tools/**/*.mjs", "*.config.mjs"],
    languageOptions: { globals: { ...globals.node } },
  },
];
