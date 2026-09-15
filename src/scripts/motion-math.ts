import { Euler, Quaternion, Vector3 } from 'three';

export function orientation(alpha: number, beta: number, gamma: number) {
  const rad = Math.PI / 180;
  // Device Orientation spec: intrinsic Z-X'-Y'' rotations.
  return new Quaternion().setFromEuler(new Euler(beta * rad, gamma * rad, alpha * rad, 'ZXY'));
}

export class PositionEstimator {
  position = new Vector3();
  velocity = new Vector3();
  previousTime: number | null = null;
  reset() { this.position.set(0, 0, 0); this.velocity.set(0, 0, 0); this.previousTime = null; }
  step(acceleration: Vector3, time: number) {
    const dt = this.previousTime === null ? 0 : (time - this.previousTime) / 1000;
    this.previousTime = time;
    // Never integrate across suspended tabs or dropped sensor streams.
    if (dt <= 0 || dt > 0.1) { this.velocity.set(0, 0, 0); return; }
    this.position.addScaledVector(this.velocity, dt).addScaledVector(acceleration, 0.5 * dt * dt);
    this.velocity.addScaledVector(acceleration, dt);
  }
}
