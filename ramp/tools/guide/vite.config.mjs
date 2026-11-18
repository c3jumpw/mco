// Sample-data preview of the real RAMP app, used to take the guide and tour screenshots.
// RAMP_DATA picks the sample data set (work | core | money | launch). The app's own supabase client and session are
// swapped for in-memory mocks; every page, route and component is the real one from src/.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const H = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(H, '../..');
const APP = path.join(ROOT, 'src');
const DATA = path.join(H, 'datasets', process.env.RAMP_DATA || 'work');
const redirect = {
  [path.join(APP, 'lib/supabase.ts')]: path.join(DATA, 'mock-supabase.ts'),
  [path.join(APP, 'lib/session.tsx')]: path.join(H, 'session.tsx'),
};

export default defineConfig({
  root: H,
  cacheDir: path.join(H, '.vite-cache', process.env.RAMP_DATA || 'work'),
  publicDir: path.join(ROOT, 'public'),
  plugins: [
    {
      name: 'guide-mocks',
      enforce: 'pre',
      async resolveId(source, importer, opts) {
        if (!importer || importer.startsWith(H)) return null;
        const r = await this.resolve(source, importer, { ...opts, skipSelf: true });
        if (r && redirect[r.id]) return redirect[r.id];
        return null;
      },
    },
    react(), tailwindcss(),
  ],
  resolve: { alias: { '@app': APP, '@data': DATA } },
  server: { port: Number(process.env.PORT || 5311), strictPort: true, fs: { allow: [ROOT] } },
  logLevel: 'warn',
});
