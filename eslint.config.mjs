import tseslint from "typescript-eslint";
export default tseslint.config(
  { ignores: ["**/.next/**", "**/.next-test/**", "**/dist/**", "**/next-env.d.ts"] },
  ...tseslint.configs.recommended,
  { rules: { "@typescript-eslint/no-explicit-any": "error" } },
);
