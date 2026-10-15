import { BEACON_PRECISE_ACCURACY_METERS } from './beacon-location.js';

const OFF_PATH_DISTANCE_METERS = 100;
const REQUIRED_ACCURACY_METERS = BEACON_PRECISE_ACCURACY_METERS;
const OFF_PATH_SUSTAINED_MS = 20000;
const REARM_INSIDE_MS = 30000;
const MAX_OBSERVATION_GAP_MS = 30000;
const monitorsBySession = new WeakMap();

export function getOffPathMonitor(session, options) {
  if (!session || typeof session !== 'object') return new OffPathMonitor(options);
  if (!monitorsBySession.has(session)) {
    monitorsBySession.set(session, new OffPathMonitor(options));
  }
  return monitorsBySession.get(session);
}

export function resetOffPathMonitor(session) {
  if (!session || typeof session !== 'object') return new OffPathMonitor();
  const monitor = new OffPathMonitor();
  monitorsBySession.set(session, monitor);
  return monitor;
}

export class OffPathMonitor {
  constructor({ initiallyOffPath = false } = {}) {
    this._isOffPath = initiallyOffPath;
    this._isArmed = !initiallyOffPath;
    this._outsideSince = null;
    this._insideSince = null;
    this._lastObservationAt = null;
  }

  observe({ distanceMeters, accuracyMeters, now = Date.now() }) {
    if (
      !Number.isFinite(distanceMeters)
      || !Number.isFinite(accuracyMeters)
      || accuracyMeters >= REQUIRED_ACCURACY_METERS
      || !Number.isFinite(now)
    ) {
      this._outsideSince = null;
      this._insideSince = null;
      this._lastObservationAt = null;
      return this._isOffPath;
    }

    if (
      this._lastObservationAt === null
      || now < this._lastObservationAt
      || now - this._lastObservationAt > MAX_OBSERVATION_GAP_MS
    ) {
      this._outsideSince = null;
      this._insideSince = null;
    }
    this._lastObservationAt = now;

    if (distanceMeters > OFF_PATH_DISTANCE_METERS) {
      this._insideSince = null;
      if (this._isOffPath) return true;
      if (!this._isArmed) return false;
      if (this._outsideSince === null) {
        this._outsideSince = now;
        return false;
      }
      if (now - this._outsideSince >= OFF_PATH_SUSTAINED_MS) {
        this._isOffPath = true;
        this._isArmed = false;
        this._outsideSince = null;
      }
      return this._isOffPath;
    }

    this._outsideSince = null;
    if (this._isOffPath) this._isOffPath = false;
    if (!this._isArmed) {
      if (this._insideSince === null) {
        this._insideSince = now;
      } else if (now - this._insideSince >= REARM_INSIDE_MS) {
        this._isArmed = true;
        this._insideSince = null;
      }
    }
    return this._isOffPath;
  }

  dismiss() {
    this._isOffPath = false;
    this._outsideSince = null;
    this._insideSince = null;
    this._lastObservationAt = null;
  }

  resetEvidence() {
    this._outsideSince = null;
    this._insideSince = null;
    this._lastObservationAt = null;
  }
}
