// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  // поменяйте на адрес вашего сайта (нужно для RSS)
  site: 'https://example.com',

  markdown: {
    // подсветка кода отключена: весь код рисуется одним «фосфорным» цветом,
    // как на настоящем терминале
    syntaxHighlight: false,
  },

  adapter: cloudflare(),
});