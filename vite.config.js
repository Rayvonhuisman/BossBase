import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import contentPlugin from './scripts/vite-plugin-content.mjs';

// De build draait twee keer (zie package.json):
//   1. de gewone clientbuild naar dist/ — met manifest, zodat het
//      prerenderscript per pagina de juiste JS- en CSS-bestanden kan koppelen;
//   2. een SSR-build van src/marketing/entry-server.jsx naar dist-ssr/,
//      waarmee scripts/prerender.mjs de websitepagina's naar HTML rendert.
// Op Vercel moet elke omgeving (Production, Preview) zijn eigen Supabase-
// configuratie hebben. Ontbreekt die, dan stopt de build hier met een
// duidelijke melding, in plaats van een site te publiceren die niet kan starten.
function controleerConfiguratie(mode) {
  if (!process.env.VERCEL) return;
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const ontbreekt = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].filter(k => !env[k]);
  if (ontbreekt.length) {
    throw new Error(`Build gestopt: ${ontbreekt.join(' en ')} ontbreekt voor Vercel-omgeving "${process.env.VERCEL_ENV}". Zet de variabele in Vercel → Settings → Environment Variables voor deze omgeving.`);
  }
}

export default defineConfig(({ isSsrBuild, mode }) => (controleerConfiguratie(mode), {
  plugins: [react(), contentPlugin()],
  build: isSsrBuild
    ? {}
    : {
        manifest: true,
        rollupOptions: {
          output: {
            // Zware dashboardbibliotheken in een eigen chunk. Rollup stopt ook de
            // afhankelijkheden van zo'n chunk erin, tenzij die al een eigen chunk
            // hebben. Zonder de regels voor React en de Vite-hulpcode belandden
            // die in de recharts- en jsPDF-chunk, en laadde de website ze mee.
            manualChunks(id) {
              if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
              if (id.includes('vite/preload-helper') || id.includes('commonjsHelpers')) return 'vite-helpers';
              for (const pakket of ['recharts', 'jspdf', 'exceljs', 'jszip']) {
                if (id.includes(`/node_modules/${pakket}/`)) return pakket;
              }
              return undefined;
            },
          },
        },
      },
}));
