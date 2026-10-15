export const BEACON_PRECISE_ACCURACY_METERS = 50;
export const BEACON_MAX_REDUCED_ACCURACY_METERS = 150;
export const BEACON_MAX_UNUSABLE_ACCURACY_METERS = 5000;
export const BEACON_LOCATION_TIMEOUT_MS = 30000;

const LOCATION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: BEACON_LOCATION_TIMEOUT_MS,
  maximumAge: 0
};
export const MAX_BEACON_LOCATION_ACCURACY_METERS = 1000;
export const BEACON_ACCURACY_GUIDANCE_DELAY_MS = 60000;
export const MAX_BEACON_SHARING_ACCURACY_METERS = BEACON_PRECISE_ACCURACY_METERS;
export const MAX_BEACON_ROUTE_START_ACCURACY_METERS = MAX_BEACON_SHARING_ACCURACY_METERS;
const LOCATION_FIX_TARGET_METERS = BEACON_PRECISE_ACCURACY_METERS;
const ARRIVAL_RADIUS_METERS = 50;
const LOCATION_STALE_AFTER_MS = 30000;

export function getBeaconAccuracyState(accuracy) {
  if (!Number.isFinite(accuracy) || accuracy < 0) return 'searching';
  if (accuracy < BEACON_PRECISE_ACCURACY_METERS) return 'precise';
  if (accuracy <= BEACON_MAX_REDUCED_ACCURACY_METERS) return 'usable (confirm)';
  return 'too coarse';
}

export function getBeaconAccuracyTier(accuracy) {
  if (!Number.isFinite(accuracy) || accuracy < 0) return 'unavailable';
  if (accuracy < BEACON_PRECISE_ACCURACY_METERS) return 'precise';
  if (accuracy <= BEACON_MAX_REDUCED_ACCURACY_METERS) return 'reduced';
  return 'unavailable';
}

export function getBeaconStartDecision(accuracy, reducedAccuracyConfirmed = false) {
  const tier = getBeaconAccuracyTier(accuracy);
  if (tier === 'precise') return 'allow';
  if (tier === 'reduced') return reducedAccuracyConfirmed ? 'allow' : 'confirm';
  return 'retry';
}

export function shouldShowBeaconAccuracyGuidance(waitStartedAt, now, location) {
  const hasRecentPreciseFix = hasBeaconSharingAccuracy(location)
    && Number.isFinite(location.timestamp)
    && location.timestamp <= now
    && now - location.timestamp < BEACON_ACCURACY_GUIDANCE_DELAY_MS;
  return Number.isFinite(waitStartedAt)
    && Number.isFinite(now)
    && now - waitStartedAt >= BEACON_ACCURACY_GUIDANCE_DELAY_MS
    && !hasRecentPreciseFix;
}

function distanceMetersBetween(lat1, lon1, lat2, lon2) {
  const earthRadiusMeters = 6371000;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(lat2 - lat1);
  const longitudeDelta = toRadians(lon2 - lon1);
  const arc = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(lat1))
      * Math.cos(toRadians(lat2))
      * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

export function isWithinBeaconArrivalZone(location, destination, now = Date.now()) {
  if (
    !location
    || !destination
    || !Number.isFinite(location.lat)
    || !Number.isFinite(location.lng)
    || !Number.isFinite(location.accuracy)
    || !Number.isFinite(location.timestamp)
    || !Number.isFinite(destination.lat)
    || !Number.isFinite(destination.lng)
    || !Number.isFinite(now)
    || location.accuracy >= BEACON_PRECISE_ACCURACY_METERS
    || now - location.timestamp < 0
    || now - location.timestamp > LOCATION_STALE_AFTER_MS
  ) {
    return false;
  }
  return distanceMetersBetween(
    location.lat,
    location.lng,
    destination.lat,
    destination.lng
  ) <= ARRIVAL_RADIUS_METERS;
}

export function isValidBeaconRouteStart(location, routeStart, { allowReducedAccuracy = false } = {}) {
  if (
    !location
    || !routeStart
    || !Number.isFinite(location.lat)
    || !Number.isFinite(location.lng)
    || !Number.isFinite(location.accuracy)
    || !Number.isFinite(routeStart.lat)
    || !Number.isFinite(routeStart.lng)
    || getBeaconStartDecision(location.accuracy, allowReducedAccuracy) !== 'allow'
  ) {
    return false;
  }
  return distanceMetersBetween(
    location.lat,
    location.lng,
    routeStart.lat,
    routeStart.lng
  ) <= Math.max(MAX_BEACON_ROUTE_START_ACCURACY_METERS, location.accuracy);
}

let currentLocation = null;
let selectedRouteStart = null;
let pendingLocationRequest = null;
const listeners = new Set();
const locationDiagnostics = {
  permissionState: 'unknown',
  latestAccuracyMeters: null,
  latestFixTimestamp: null,
  fixesReceived: 0,
  bestAccuracyMeters: null,
  lastErrorCode: null,
  lastErrorMessage: null
};

function recordLocationFix(location) {
  locationDiagnostics.latestAccuracyMeters = location.accuracy;
  locationDiagnostics.latestFixTimestamp = location.timestamp;
  locationDiagnostics.fixesReceived += 1;
  if (
    locationDiagnostics.bestAccuracyMeters === null
    || location.accuracy < locationDiagnostics.bestAccuracyMeters
  ) {
    locationDiagnostics.bestAccuracyMeters = location.accuracy;
  }
}

function recordLocationError(error) {
  locationDiagnostics.lastErrorCode = Number.isFinite(error?.code) ? error.code : 'unknown';
  locationDiagnostics.lastErrorMessage = String(error?.message || 'Unknown location error');
}

export function setBeaconLocationPermissionState(permissionState) {
  locationDiagnostics.permissionState = permissionState;
}

export function getBeaconLocationDiagnostics(now = Date.now()) {
  return {
    ...locationDiagnostics,
    timeSinceLastFixMs: locationDiagnostics.latestFixTimestamp === null
      ? null
      : Math.max(0, now - locationDiagnostics.latestFixTimestamp)
  };
}

function notifyLocationListeners(location) {
  for (const listener of listeners) {
    try {
      listener(location);
    } catch (error) {
      console.error('Beacon location listener failed:', error);
    }
  }
}

export function getSelectedBeaconRouteStart() {
  return selectedRouteStart ? { ...selectedRouteStart } : null;
}

export function setSelectedBeaconRouteStart(position) {
  if (
    !position
    || !Number.isFinite(position.lat)
    || !Number.isFinite(position.lng)
    || position.lat < -90
    || position.lat > 90
    || position.lng < -180
    || position.lng > 180
  ) {
    throw new Error('Choose a valid starting point on the map.');
  }
  selectedRouteStart = { lat: position.lat, lng: position.lng };
  return getSelectedBeaconRouteStart();
}

export function clearSelectedBeaconRouteStart() {
  selectedRouteStart = null;
}

export function hasBeaconSharingAccuracy(location) {
  return Boolean(
    location
    && Number.isFinite(location.accuracy)
    && location.accuracy < MAX_BEACON_SHARING_ACCURACY_METERS
  );
}

function normalizePosition(position) {
  const { latitude, longitude, accuracy } = position.coords;
  if (
    !Number.isFinite(latitude)
    || !Number.isFinite(longitude)
    || latitude < -90
    || latitude > 90
    || longitude < -180
    || longitude > 180
    || !Number.isFinite(accuracy)
    || accuracy < 0
  ) {
    throw new Error('Your device returned an invalid location. Check your device location settings.');
  }
  return {
    lat: latitude,
    lng: longitude,
    accuracy,
    timestamp: Number.isFinite(position.timestamp) ? position.timestamp : Date.now()
  };
}

function publishLocation(position, record = true) {
  currentLocation = normalizePosition(position);
  if (record) recordLocationFix(currentLocation);
  notifyLocationListeners(currentLocation);
  return currentLocation;
}

function publishNormalizedLocation(location, record = false) {
  currentLocation = { ...location };
  if (record) recordLocationFix(currentLocation);
  notifyLocationListeners(currentLocation);
  return currentLocation;
}

export function getCurrentLocation() {
  return currentLocation;
}

export function resetCurrentLocation() {
  currentLocation = null;
  notifyLocationListeners(null);
}

export function subscribeCurrentLocation(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function createLocationTimeoutError(bestPosition) {
  const bestAccuracy = bestPosition
    ? ` The best reading was ±${Math.round(bestPosition.coords.accuracy)} m.`
    : '';
  const error = new Error(
    `Couldn't get a precise location.${bestAccuracy} Try again near a window or outdoors, or choose a route start on the map.`
  );
  error.code = 3;
  return error;
}

export function requestCurrentLocation({
  force = false,
  allowRecentReducedAccuracy = false,
  onAccuracyUpdate
} = {}) {
  if (!navigator.geolocation) {
    const error = new Error('Location services are not available in this browser.');
    recordLocationError(error);
    return Promise.reject(error);
  }

  if (
    !force
    && currentLocation
    && (
      currentLocation.accuracy < LOCATION_FIX_TARGET_METERS
      || (
        allowRecentReducedAccuracy
        && currentLocation.accuracy <= BEACON_MAX_REDUCED_ACCURACY_METERS
      )
    )
    && Date.now() - currentLocation.timestamp < 30000
  ) {
    return Promise.resolve(currentLocation);
  }

  if (pendingLocationRequest) return pendingLocationRequest;
  pendingLocationRequest = new Promise((resolve, reject) => {
    let watchId;
    let timeoutId;
    let bestPosition = null;
    let settled = false;

    const finish = (position, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
      if (error) {
        recordLocationError(error);
        reject(error);
        return;
      }
      try {
        resolve(publishLocation(position, false));
      } catch (publishError) {
        reject(publishError);
      }
    };

    try {
      timeoutId = setTimeout(() => {
        if (bestPosition && bestPosition.coords.accuracy <= BEACON_MAX_REDUCED_ACCURACY_METERS) {
          finish(bestPosition);
          return;
        }
        finish(null, createLocationTimeoutError(bestPosition));
      }, BEACON_LOCATION_TIMEOUT_MS);
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          try {
            const candidate = normalizePosition(position);
            recordLocationFix(candidate);
            onAccuracyUpdate?.(candidate, getBeaconAccuracyState(candidate.accuracy));
            if (
              candidate.accuracy <= BEACON_MAX_UNUSABLE_ACCURACY_METERS
              && (!bestPosition || candidate.accuracy < bestPosition.coords.accuracy)
            ) {
              bestPosition = position;
            }
            if (candidate.accuracy < LOCATION_FIX_TARGET_METERS) {
              finish(bestPosition);
            }
          } catch (error) {
            finish(null, error);
          }
        },
        (error) => {
          recordLocationError(error);
          if (error?.code === 1) {
            finish(null, error);
          } else if (error?.code === 3) {
            if (
              bestPosition
              && bestPosition.coords.accuracy <= BEACON_MAX_REDUCED_ACCURACY_METERS
            ) {
              finish(bestPosition);
            } else {
              finish(null, createLocationTimeoutError(bestPosition));
            }
          }
        },
        LOCATION_OPTIONS
      );
      if (settled) navigator.geolocation.clearWatch(watchId);
    } catch (error) {
      finish(null, error);
    }
  }).finally(() => {
    pendingLocationRequest = null;
  });
  return pendingLocationRequest;
}

export function watchCurrentLocation(onError, { onLocationFix, publishOnlyImproving = false } = {}) {
  if (!navigator.geolocation) {
    const error = new Error('Location services are not available in this browser.');
    recordLocationError(error);
    throw error;
  }

  let watchId;
  let bestPublishedAccuracy = Number.POSITIVE_INFINITY;
  try {
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        try {
          const location = normalizePosition(position);
          recordLocationFix(location);
          onLocationFix?.(location);
          if (
            location.accuracy <= BEACON_MAX_REDUCED_ACCURACY_METERS
            && (!publishOnlyImproving || location.accuracy < bestPublishedAccuracy)
          ) {
            bestPublishedAccuracy = location.accuracy;
            publishNormalizedLocation(location);
          }
        } catch (error) {
          recordLocationError(error);
          onError?.(error);
        }
      },
      (error) => {
        recordLocationError(error);
        onError?.(error);
      },
      LOCATION_OPTIONS
    );
  } catch (error) {
    recordLocationError(error);
    throw error;
  }

  return () => navigator.geolocation.clearWatch(watchId);
}

export function createBeaconLocationWatchController(onError, { onAccuracyUpdate, onTimeout } = {}) {
  let stopWatch = null;
  let timeoutId = null;
  let bestLocation = null;
  let stopRequested = false;

  const stop = () => {
    clearTimeout(timeoutId);
    timeoutId = null;
    const stopWatching = stopWatch;
    stopWatch = null;
    if (stopWatching) stopWatching();
    else stopRequested = true;
  };

  const finishTimedOut = () => {
    const location = bestLocation
      && bestLocation.accuracy <= BEACON_MAX_REDUCED_ACCURACY_METERS
      ? publishNormalizedLocation(bestLocation)
      : null;
    stop();
    onTimeout?.(location, bestLocation);
  };

  return {
    start() {
      if (stopWatch) return false;
      bestLocation = null;
      stopRequested = false;
      timeoutId = setTimeout(finishTimedOut, BEACON_LOCATION_TIMEOUT_MS);
      try {
        const stopWatching = watchCurrentLocation(
          (error) => {
            if (error?.code === 3) {
              finishTimedOut();
            } else if (error?.code === 1) {
              stop();
              onError?.(error);
            } else {
              onError?.(error);
            }
          },
          {
            publishOnlyImproving: true,
            onLocationFix: (location) => {
              if (
                location.accuracy <= BEACON_MAX_UNUSABLE_ACCURACY_METERS
                && (!bestLocation || location.accuracy < bestLocation.accuracy)
              ) {
                bestLocation = location;
              }
              onAccuracyUpdate?.(location, bestLocation, getBeaconAccuracyState(location.accuracy));
              if (location.accuracy < LOCATION_FIX_TARGET_METERS) stop();
            }
          }
        );
        if (stopRequested) stopWatching();
        else stopWatch = stopWatching;
      } catch (error) {
        stop();
        throw error;
      }
      return true;
    },
    stop() {
      if (!stopWatch && timeoutId === null) return false;
      stop();
      return true;
    },
    get isWatching() {
      return Boolean(stopWatch || timeoutId !== null);
    }
  };
}

export function getLocationErrorMessage(error) {
  if (error?.code === 1) return 'Location access is blocked. Allow location permission for Beacon, then tap Retry.';
  if (error?.code === 2) return 'Your device could not determine your location. Check that location access is allowed, then tap Retry.';
  if (error?.code === 3) return error.message || 'Location detection timed out. Tap Retry to request your location again.';
  return error?.message || 'Your location could not be detected.';
}
