// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';
import { motionRelay } from './motion-relay.mjs';

// https://astro.build/config
export default defineConfig({
  vite: { plugins: [motionRelay()], server: { allowedHosts: ['.trycloudflare.com'] } },
  // поменяйте на адрес вашего сайта (нужно для RSS)
  site: 'https://example.com',

  markdown: {
    // подсветка кода отключена: весь код рисуется одним «фосфорным» цветом,
    // как на настоящем терминале
    syntaxHighlight: false,
  },

  // Static pages need no Cloudflare emulation during this motion test.
  // The adapter otherwise intercepts the custom WebSocket upgrade.
  adapter: process.env.MOTION_LAB === '1' ? undefined : cloudflare(),
});
