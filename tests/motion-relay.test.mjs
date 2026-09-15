import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { motionRelay } from '../motion-relay.mjs';

test('pairs devices, relays samples and reset, isolates rooms', async () => {
  const server = createServer();
  motionRelay().configureServer({ httpServer: server });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `ws://127.0.0.1:${server.address().port}/motion-ws`;
  const sockets = [];
  async function join(role, room = '1234567890abcdef12345678') {
    const ws = new WebSocket(`${url}?role=${role}&room=${room}`);
    sockets.push(ws);
    const ready = once(ws, 'message');
    await once(ws, 'open'); await ready;
    return ws;
  }
  function receive(ws, type) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), 2000);
      function handler(data) {
        const msg = JSON.parse(data);
        if (msg.type === type) { clearTimeout(timer); ws.off('message', handler); resolve(msg); }
      }
      ws.on('message', handler);
    });
  }
  try {
    const host = await join('host');
    const phone = await join('phone');
    const outsider = await join('host', 'aaaaaaaaaaaaaaaaaaaaaaaa');
    let leaked = false; outsider.on('message', () => { leaked = true; });
    const sample = receive(host, 'sample');
    phone.send(JSON.stringify({ type: 'sample', q: [0, 0, 0, 1] }));
    assert.deepEqual((await sample).q, [0, 0, 0, 1]);
    const reset = receive(phone, 'reset'); host.send(JSON.stringify({ type: 'reset' }));
    assert.equal((await reset).type, 'reset');
    const pong = receive(host, 'pong'); host.send(JSON.stringify({ type: 'ping', time: 42 }));
    assert.equal((await pong).time, 42);
    assert.equal(leaked, false);
  } finally {
    for (const ws of sockets) ws.terminate();
    server.close();
    await once(server, 'close');
  }
});
