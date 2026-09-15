# Motion Lab

Open `/motion` on the desktop. Scan its QR code on your phone, tap **Enable motion sensors**, allow motion permissions, then hold the phone upright with its screen facing you and tap **Recenter & reset position**. The blade follows the phone's top edge. Keep the controller tab visible.

## Running

```powershell
pnpm install
$env:MOTION_LAB = '1'
npm run dev -- --background --host 0.0.0.0
```

Phone sensors require a trusted HTTPS origin. Expose the development server through an HTTPS tunnel (for example `cloudflared tunnel --url http://localhost:4321`), and open **the tunnel URL + `/motion` on the desktop** before scanning. The desktop and phone must use the same URL/room. A localhost QR code does not work from another device. The Vite configuration allows `*.trycloudflare.com` tunnel hosts.

Manage Astro with `npm run astro -- dev status`, `npm run astro -- dev logs`, and `npm run astro -- dev stop`.

## What it measures

- Orientation is a quaternion derived from browser device orientation, relative to the last recenter. The viewer lightly interpolates rotation.
- Position is **inertial dead reckoning**, not camera or marker tracking. Browser gravity-free acceleration is rotated into the calibrated reference frame, then integrated twice. No damping or automatic centering hides the drift. Calibration defines the origin but does not eliminate sensor bias.
- Null acceleration disables position estimation. Missing orientation is reported. Suspended tabs and sensor gaps reset velocity instead of integrating over the gap.
- The position trail uses metres; each floor square is one metre. Recenter if drift takes the sword off screen.
- Stream rate measures received packets. Relay round trip measures the viewer-to-server connection, **not phone-to-screen latency**.
- Simulation uses synthetic data and is visibly labeled. A real phone sample automatically exits simulation.

## Architecture and limits

`motion-relay.mjs` is a Vite **development-only** WebSocket relay. It pairs one viewer and one controller with a random 96-bit room token in the URL fragment. No samples are saved. Anyone with the controller link can join that room; close the tunnel after testing. A production build alone does not provide the relay. Production hosting would need a separate WebSocket service or a Durable Object.

This prototype does not infer reliable hand location, use the webcam, or promise collision accuracy. Test actual iOS/Android hardware for drift and sensor availability.

## Checks

```powershell
node --experimental-strip-types --test tests/motion.test.ts tests/motion-relay.test.mjs
npm run build
```

Hardware check: pair a real phone, recenter, rotate each axis, hold still with position enabled to observe drift, move out and back, recenter, and background/reopen the phone tab.
