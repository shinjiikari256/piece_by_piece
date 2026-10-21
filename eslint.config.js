import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "offline/**", "working/**", "node_modules/**", "**/migrations/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["apps/client/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks, "jsx-a11y": jsxA11y },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      // autoFocus в окнах и формах осознанный: фокус уходит в только что открытое окно
      "jsx-a11y/no-autofocus": "off",
      // составные виджеты: карточка узла графа (group), фокусируемый разделитель панели (separator)
      "jsx-a11y/no-noninteractive-tabindex": ["error", { roles: ["tabpanel", "group", "separator"] }],
      // наши Select и подобные — кнопки внутри <label>
      "jsx-a11y/label-has-associated-control": ["error", { controlComponents: ["Select", "KeyInput"], assert: "either" }],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Нативный <select> не открывается во встроенном браузере VS Code — только src/ui/Select.tsx.
      "no-restricted-syntax": [
        "error",
        { selector: "JSXOpeningElement[name.name='select']", message: "Нативный <select> запрещён: используйте src/ui/Select.tsx." },
      ],
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true }],
    },
  },
  {
    files: ["apps/server/**/*.ts", "shared/**/*.ts", "scripts/**/*.ts", "*.config.*"],
    languageOptions: { globals: globals.node },
  },
);
