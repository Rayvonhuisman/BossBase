import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import contentPlugin from './scripts/vite-plugin-content.mjs';

// De build draait twee keer (zie package.json):
//   1. de gewone clientbuild naar dist/ — met manifest, zodat het
//      prerenderscript per pagina de juiste JS- en CSS-bestanden kan koppelen;
//   2. een SSR-build van src/marketing/entry-server.jsx naar dist-ssr/,
//      waarmee scripts/prerender.mjs de websitepagina's naar HTML rendert.
export default defineConfig(({ isSsrBuild }) => ({
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
