import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import { loadEnv } from 'vite';
import { allowedDomains } from './src/lib/security/hosts.mjs';
Object.assign(process.env, loadEnv(process.env.NODE_ENV || 'development', process.cwd(), ['CURRENTDESK_', 'CONTACT_', 'MAILJET_']));
export default defineConfig({
  site: 'https://sv.fxem.com',
  output: 'static',
  adapter: vercel({ maxDuration: 60 }),
  security: { allowedDomains: allowedDomains() },
  devToolbar: { enabled: false },
});
