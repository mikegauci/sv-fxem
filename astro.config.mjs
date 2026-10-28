import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import { loadEnv } from 'vite';
Object.assign(process.env, loadEnv(process.env.NODE_ENV || 'development', process.cwd(), 'CURRENTDESK_'));
export default defineConfig({
  site: 'https://sv.fxem.com',
  output: 'static',
  adapter: vercel({ maxDuration: 60 }),
  devToolbar: { enabled: false },
});
