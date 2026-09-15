import * as THREE from 'three';
import QRCode from 'qrcode';
import { orientation, PositionEstimator } from './motion-math';

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const phone = new URLSearchParams(location.search).get('controller') === '1';
const hash = location.hash.slice(1);
const room = /^[a-f0-9]{24}$/.test(hash) ? hash : Array.from(crypto.getRandomValues(new Uint8Array(12)), n => n.toString(16).padStart(2, '0')).join('');
history.replaceState(null, '', `${location.pathname}${location.search}#${room}`);
el('desktop').hidden = phone;
el('phone').hidden = !phone;
if (phone) document.querySelector('.intro')?.setAttribute('hidden', '');

type Sample = { type: 'sample'; angles: number[] | null; q: number[]; p: number[]; a: number[] | null; seq: number; calibrated: boolean; source: string };
let socket: WebSocket;
let latest: Sample | null = null;
let lastReceived = 0, count = 0, rtt = 0, seq = 0;
let replaced = false, simulation = false;
let active = false, calibrated = false;
let angles: number[] | null = null;
let absoluteQ = new THREE.Quaternion(), neutral = new THREE.Quaternion();
let acceleration: number[] | null = null;
const estimator = new PositionEstimator();
let sampleSent = 0;
let sensorSeen = 0;
const send = (msg: object) => {
  if (socket?.readyState === WebSocket.OPEN && socket.bufferedAmount < 16384) socket.send(JSON.stringify(msg));
};
function recenter() {
  if (!angles) { el('sensor-status').textContent = 'Waiting for orientation data before recentering.'; return; }
  neutral.copy(absoluteQ).invert(); estimator.reset(); calibrated = true;
  el('sensor-status').textContent = 'Recentered. Rotate or move your phone to test.';
}
function connect() {
  socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/motion-ws?room=${room}&role=${phone ? 'phone' : 'host'}`);
  socket.onopen = () => { el('connection').textContent = 'Relay connected · waiting for peer'; };
  socket.onmessage = event => {
    let msg; try { msg = JSON.parse(event.data); } catch { return; }
    if (msg.type === 'peers') el('connection').textContent = msg.host && msg.phone ? '● Phone paired' : phone ? 'Waiting for desktop' : 'Waiting for phone';
    if (msg.type === 'pong') rtt = Math.round(performance.now() - msg.time);
    if (msg.type === 'reset' && phone) recenter();
    if (msg.type === 'sample' && !phone && validSample(msg)) {
      simulation = false; el('demo').textContent = 'Try simulated motion';
      latest = msg; lastReceived = performance.now(); count++; updateMetrics(msg);
    }
  };
  socket.onclose = event => {
    replaced = event.code === 4000;
    el('connection').textContent = replaced ? 'Replaced by another tab · reload to reconnect' : 'Disconnected · retrying…';
    if (!replaced) setTimeout(connect, 1500);
  };
  socket.onerror = () => { el('connection').textContent = 'Connection unavailable'; };
}
function validSample(s: Sample) {
  const nums = (v: unknown, n: number) => Array.isArray(v) && v.length === n && v.every(x => typeof x === 'number' && Number.isFinite(x));
  return nums(s.q, 4) && nums(s.p, 3) && (s.angles === null || nums(s.angles, 3)) && (s.a === null || nums(s.a, 3));
}
connect();
setInterval(() => {
  send({ type: 'ping', time: performance.now() });
  el('rate').textContent = simulation ? 'Simulated' : `${count} samples/s`;
  el('latency').textContent = `Relay round trip: ${rtt} ms`;
  count = 0;
  if (!phone && !simulation) el('sample-status').textContent = !lastReceived ? 'Connect a phone to begin.' : performance.now() - lastReceived > 1500 ? 'Stream paused — holding last pose.' : 'Live phone sensor data';
}, 1000);
function updateMetrics(s: Sample) {
  const fmt = (values: number[] | null, digits: number) => values ? values.map(v => v.toFixed(digits)).join(' / ') : 'Unavailable';
  el('angles').textContent = fmt(s.angles, 0);
  el('accel').textContent = s.a ? `${new THREE.Vector3(...s.a).length().toFixed(2)} m/s²` : 'Unavailable';
  el('position').textContent = s.a ? fmt(s.p, 2) : 'Unavailable';
}

if (phone) {
  type PermissionSensor = { requestPermission?: () => Promise<string> };
  el('enable').onclick = async () => {
    if (!isSecureContext) { el('sensor-status').textContent = 'Motion requires HTTPS. Open the secure pairing link from your desktop.'; return; }
    try {
      // Invoke both requests synchronously during the user gesture, before awaiting.
      const requests = [window.DeviceOrientationEvent, window.DeviceMotionEvent].filter(Boolean).map(api => (api as unknown as PermissionSensor).requestPermission?.());
      const results = await Promise.all(requests);
      if (results.some(result => result === 'denied')) { el('sensor-status').textContent = 'Motion permission denied. Allow motion access in browser settings, then reload.'; return; }
      if (active) return;
      active = true;
      el('enable').textContent = 'Motion sensors enabled';
      el<HTMLButtonElement>('enable').disabled = true;
      el('sensor-status').textContent = 'Waiting for sensors…';
      window.addEventListener('deviceorientation', event => {
        if (![event.alpha, event.beta, event.gamma].every(v => typeof v === 'number' && Number.isFinite(v))) return;
        angles = [event.alpha!, event.beta!, event.gamma!]; absoluteQ = orientation(...angles as [number, number, number]);
        sensorSeen = performance.now();
        if (!calibrated) recenter();
        publish();
      });
      window.addEventListener('devicemotion', event => {
        sensorSeen = performance.now();
        const a = event.acceleration;
        acceleration = a && [a.x, a.y, a.z].every(v => typeof v === 'number' && Number.isFinite(v)) ? [a.x!, a.y!, a.z!] : null;
        if (acceleration && calibrated) {
          const world = new THREE.Vector3(...acceleration).applyQuaternion(absoluteQ).applyQuaternion(neutral);
          estimator.step(world, performance.now());
        } else estimator.reset();
        publish();
      });
      setTimeout(() => {
        if (!angles) el('sensor-status').textContent = 'No orientation readings. Try Safari on iPhone or Chrome on Android, check motion permissions, and keep this tab visible.';
        else if (!acceleration) el('sensor-status').textContent = 'Rotation available. Gravity-free acceleration unavailable; position tracking disabled.';
      }, 4000);
    } catch (error) { el('sensor-status').textContent = `Could not start sensors: ${error instanceof Error ? error.message : error}`; }
  };
  function publish() {
    const now = performance.now();
    if (now - sampleSent < 30 || !angles) return;
    sampleSent = now;
    const sample: Sample = { type: 'sample', angles, q: neutral.clone().multiply(absoluteQ).toArray(), p: estimator.position.toArray(), a: acceleration, seq: seq++, calibrated, source: 'phone' };
    send(sample); updateMetrics(sample); count++;
    el('sample-status').textContent = `Sending sample ${seq}`;
  }
  el('phone-reset').onclick = recenter;
  document.addEventListener('visibilitychange', () => {
    estimator.reset();
    if (!document.hidden && active) el('sensor-status').textContent = 'Position reset after tab visibility changed. Recenter if needed.';
  });
  setInterval(() => {
    if (active && sensorSeen && performance.now() - sensorSeen > 2000) el('sensor-status').textContent = 'Sensor stream paused. Keep this page in the foreground.';
  }, 1000);
} else {
  const join = new URL('/motion?controller=1', location.origin); join.hash = room;
  el<HTMLInputElement>('join-url').value = join.href;
  QRCode.toCanvas(el<HTMLCanvasElement>('qr'), join.href, { width: 180, margin: 2, color: { dark: '#10171f', light: '#ffffff' } }).catch(() => { el('https-note').textContent = 'QR unavailable; use the controller link.'; });
  if (location.protocol !== 'https:') el('https-note').textContent = 'Local preview: open this viewer through an HTTPS tunnel before scanning. localhost links cannot connect your phone.';
  el('copy').onclick = async () => {
    try { await navigator.clipboard.writeText(join.href); el('copy').textContent = 'Copied!'; }
    catch { el<HTMLInputElement>('join-url').select(); el('copy').textContent = 'Select and copy the link above'; }
  };
  el('reset').onclick = () => { send({ type: 'reset' }); trailPoints.length = 0; if (simulation) demoStart = performance.now(); };
  el<HTMLInputElement>('position-mode').onchange = () => { el('mode-label').textContent = el<HTMLInputElement>('position-mode').checked ? 'Rotation + estimated position' : 'Rotation · fixed handle'; trailPoints.length = 0; };
  let demoStart = performance.now();
  el('demo').onclick = () => {
    simulation = !simulation; demoStart = performance.now();
    el('demo').textContent = simulation ? 'Stop simulation' : 'Try simulated motion';
    el('sample-status').textContent = simulation ? 'SIMULATION — synthetic movement, not phone readings' : 'Waiting for phone samples';
    trailPoints.length = 0;
    if (!simulation) {
      latest = null; sword.position.set(0, 0, 0); sword.quaternion.identity();
      for (const id of ['angles', 'accel', 'position']) el(id).textContent = '—';
    }
  };
  const mount = el('scene');
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#131a22'); scene.fog = new THREE.Fog('#131a22', 9, 22);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100); camera.position.set(4, 3, 6); camera.lookAt(0, 0.6, 0);
  const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); mount.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xe4f0ff, 0x283b4a, 3));
  const light = new THREE.DirectionalLight(0xffffff, 4); light.position.set(3, 5, 4); scene.add(light);
  const grid = new THREE.GridHelper(30, 30, 0x607443, 0x28333e); grid.position.y = -1.3; scene.add(grid);
  const axes = new THREE.AxesHelper(1); axes.position.set(-2, -1.28, 0); scene.add(axes);
  const sword = new THREE.Group(); scene.add(sword);
  const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.12, 2.1, 4), new THREE.MeshStandardMaterial({ color: 0xe4efef, metalness: 0.7, roughness: 0.3 })); blade.position.y = 1.4; sword.add(blade);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.11, 0.18), new THREE.MeshStandardMaterial({ color: 0xccff75, metalness: 0.35, roughness: 0.35 })); guard.position.y = 0.3; sword.add(guard);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.5, 12), new THREE.MeshStandardMaterial({ color: 0x354351 })); sword.add(grip);
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.105), new THREE.MeshStandardMaterial({ color: 0xccff75 })); pommel.position.y = -0.29; sword.add(pommel);
  const origin = new THREE.Mesh(new THREE.SphereGeometry(0.045), new THREE.MeshBasicMaterial({ color: 0xccff75 })); scene.add(origin);
  const trailPoints: THREE.Vector3[] = [];
  const trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xccff75, transparent: true, opacity: 0.55 })); scene.add(trail);
  new ResizeObserver(() => { camera.aspect = mount.clientWidth / mount.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(mount.clientWidth, mount.clientHeight, false); }).observe(mount);
  let previous = performance.now();
  renderer.setAnimationLoop(() => {
    const now = performance.now(), dt = Math.min((now - previous) / 1000, 0.1); previous = now;
    if (simulation) {
      const t = (now - demoStart) / 1000;
      latest = { type: 'sample', angles: [Math.sin(t) * 40, Math.cos(t * .7) * 25, Math.sin(t * .8) * 30], q: orientation(Math.sin(t) * 40, Math.cos(t * .7) * 25, Math.sin(t * .8) * 30).toArray(), p: [Math.sin(t) * .6, Math.sin(t * 1.3) * .2, Math.cos(t) * .4], a: [.4, .1, .2], calibrated: true, source: 'simulation', seq: 0 };
      updateMetrics(latest);
    }
    if (latest) {
      const q = new THREE.Quaternion().fromArray(latest.q).normalize();
      sword.quaternion.slerp(q, 1 - Math.exp(-35 * dt));
      const showPosition = el<HTMLInputElement>('position-mode').checked && latest.a !== null;
      sword.position.copy(showPosition ? new THREE.Vector3(...latest.p) : new THREE.Vector3());
      if (showPosition && (simulation || now - lastReceived < 1500)) {
        if (!trailPoints.length || trailPoints[trailPoints.length - 1].distanceToSquared(sword.position) > .0001) {
          trailPoints.push(sword.position.clone()); if (trailPoints.length > 500) trailPoints.shift();
        }
      }
      trail.visible = showPosition;
      trail.geometry.dispose(); trail.geometry = new THREE.BufferGeometry().setFromPoints(trailPoints);
      if (showPosition && sword.position.length() > 6) el('sample-status').textContent = 'Estimate has drifted outside the view. Recenter to reset.';
    }
    renderer.render(scene, camera);
  });
}
