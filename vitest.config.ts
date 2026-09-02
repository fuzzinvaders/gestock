import { defineConfig } from 'vitest/config'

// Config autonome (sans les plugins React/Tailwind) : les tests ne ciblent que des modules
// purs — calcul de période, formatage, validation serveur — importés en relatif.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.js'],
  },
})
