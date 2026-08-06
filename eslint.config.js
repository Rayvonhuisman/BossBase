import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

// ── Lint ──────────────────────────────────────────────────────────────────────
// Aanleiding: er stond een crash live doordat AbonnementSectie nog een variabele
// las die bij een refactor was weggehaald. `vite build` merkt dat niet — dat
// bundelt alleen — en de controle achteraf testte de RPC in plaats van het
// scherm. Eén regel `blokkades is not defined`, en elke admin kreeg een
// foutkaart in plaats van zijn abonnement.
//
// Deze configuratie is er om precies díé klasse fouten te vangen:
//   • no-undef      een identifier die nergens bestaat
//   • no-unused-vars een restant dat na een refactor is blijven staan
// Beide zijn errors; de rest van de aanbevolen regels staat op waarschuwing,
// zodat een bestaande codebase niet in één klap rood kleurt en de twee regels
// die ertoe doen zichtbaar blijven.
//
//   npm run lint       controleren (faalt bij een error)
//   npm run lint:fix   wat automatisch kan, oplossen
export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'supabase/functions/**', '*.config.js'],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,

      // ── De twee regels waar het om begonnen is ─────────────────────────────
      // no-undef blijft ALTIJD een error: dat is de klasse fout die het
      // abonnementstabblad liet crashen, en die mag nooit terugkomen.
      'no-undef': 'error',
      // Ongebruikte variabelen zijn een error, maar met twee uitzonderingen die
      // in echte code voorkomen en niets fout zeggen: een `catch (e)` waarvan je
      // de fout niet gebruikt, en het weggooien van velden met rest-destructuring
      // ({ wachtwoord, ...rest }). Argumenten vóór een gebruikt argument mogen
      // ook blijven staan — die kun je niet weglaten.
      // Op WARN, niet op error — bewust en tijdelijk. De codebase telt 79
      // ongebruikte variabelen van vóór deze linter: oude mockdata, imports die
      // bij refactors zijn blijven staan. Die op error zetten betekent dat
      // `npm run lint` vanaf dag één rood staat, en een lintstap die altijd
      // faalt wordt genegeerd. Ze zijn zichtbaar als waarschuwing en horen in
      // een eigen opruimronde weg; zet dit daarna op 'error'.
      'no-unused-vars': ['warn', {
        args: 'after-used',
        caughtErrors: 'none',
        ignoreRestSiblings: true,
        varsIgnorePattern: '^_',
        argsIgnorePattern: '^_',
      }],

      // ── De rest: zichtbaar, maar niet blokkerend ──────────────────────────
      // Deze codebase is niet met een linter opgebouwd. Ze allemaal op error
      // zetten levert honderden meldingen op, en dan wordt `npm run lint`
      // genegeerd — precies het tegenovergestelde van wat we willen.
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/no-unescaped-entities': 'off',
      // Bewust alleen deze twee uit de hooks-plugin. De aanbevolen set van v7
      // bevat een reeks nieuwe regels (set-state-in-effect en verwanten) die op
      // deze codebase honderden meldingen geven over patronen die werken. Die
      // ruis zou de twee regels waarvoor de linter er staat volledig
      // ondersneeuwen.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      // `{false && <Blok/>}` wordt op drie plekken gebruikt om de Google
      // Agenda-koppeling te verbergen tot de OAuth rond is, met een comment
      // erboven hoe je hem terugzet. Dat is een bewuste schakelaar, geen fout.
      'no-constant-binary-expression': 'warn',
    },
  },
]
