export type AeroState = { lift: number; tilt: number };
export function stepAero(state: AeroState, speed: number, braking: boolean, dt: number): AeroState {
  const deployed = speed > 120 ? 1 : speed < 65 ? 0 : state.lift;
  const lift = state.lift + (deployed - state.lift) * (1 - Math.exp(-1.2 * dt));
  const targetTilt = braking && speed > 15 ? -0.18 : 0;
  return { lift, tilt: state.tilt + (targetTilt - state.tilt) * (1 - Math.exp(-2 * dt)) };
}

/** Metres the 2024 Revuelto's wing rises when fully up (a slight lift). */
export const REVUELTO_WING_RISE = 0.05;
/**
 * 2024 Revuelto wing: lifts slightly while the driver accelerates (gas held,
 * rolling), settles flush when coasting; airbrake tilt only under braking.
 */
export function stepRevueltoWing(state: AeroState, speed: number, gas: boolean, braking: boolean, dt: number): AeroState {
  const target = gas && !braking && speed > 5 ? 1 : 0;
  const rate = target > state.lift ? 2.2 : 1.1;
  const lift = state.lift + (target - state.lift) * (1 - Math.exp(-rate * dt));
  const targetTilt = braking && speed > 15 ? -0.18 : -0.05 * lift;
  return { lift, tilt: state.tilt + (targetTilt - state.tilt) * (1 - Math.exp(-2 * dt)) };
}

/** Metres the traffic Bugatti's wing rises when fully deployed. */
export const TRAFFIC_WING_RISE = 0.2;
/** Angle of attack (radians, trailing edge up) at full deployment. */
export const TRAFFIC_WING_TILT = -0.16;
/**
 * Traffic Bugatti wing: up while the car is racing (a push or an overtake),
 * flush with the tail while it just cruises. Rises/retracts gradually.
 */
export function stepTrafficWing(lift: number, racing: boolean, dt: number): number {
  const target = racing ? 1 : 0;
  return lift + (target - lift) * (1 - Math.exp(-(racing ? 1.6 : 1.1) * dt));
}
