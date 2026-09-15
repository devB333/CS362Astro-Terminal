import { WebSocketServer, WebSocket } from 'ws';

// Development-only, ephemeral room relay. No sensor data is persisted.
export function motionRelay() {
  return {
    name: 'motion-relay',
    configureServer(server) {
      const wss = new WebSocketServer({ noServer: true, maxPayload: 8192 });
      const rooms = new Map();
      server.httpServer?.on('upgrade', (req, socket, head) => {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname !== '/motion-ws') return;
        const room = url.searchParams.get('room');
        const role = url.searchParams.get('role');
        if (!/^[a-f0-9]{24}$/.test(room || '') || !['host', 'phone'].includes(role)) {
          socket.destroy(); return;
        }
        wss.handleUpgrade(req, socket, head, ws => {
          let peers = rooms.get(room);
          if (!peers) rooms.set(room, peers = new Map());
          peers.get(role)?.close(4000, 'Replaced by another connection');
          peers.set(role, ws);
          const notify = () => {
            for (const peer of peers.values()) if (peer.readyState === WebSocket.OPEN)
              peer.send(JSON.stringify({ type: 'peers', host: peers.has('host'), phone: peers.has('phone') }));
          };
          notify();
          ws.on('message', data => {
            try {
              const msg = JSON.parse(data.toString());
              if (role === 'phone' && msg.type === 'sample' || role === 'host' && msg.type === 'reset') {
                const other = peers.get(role === 'phone' ? 'host' : 'phone');
                if (other?.readyState === WebSocket.OPEN && other.bufferedAmount < 16384) other.send(JSON.stringify(msg));
              } else if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong', time: msg.time }));
            } catch { /* Ignore malformed packets. */ }
          });
          ws.on('error', () => {});
          ws.on('close', () => {
            if (peers.get(role) === ws) peers.delete(role);
            notify();
            if (!peers.size) rooms.delete(room);
          });
        });
      });
      server.httpServer?.on('close', () => wss.close());
    },
  };
}
