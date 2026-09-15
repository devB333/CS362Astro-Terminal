// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://example.com',
  markdown: {
    syntaxHighlight: false,
  },
  adapter: cloudflare(),
});