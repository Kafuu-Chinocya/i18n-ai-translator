import { defineConfig } from 'eslint/config'

import eslintConfig from './internal/eslint-config-custom'

export default defineConfig(eslintConfig, {
  languageOptions: { globals: {} }
})
