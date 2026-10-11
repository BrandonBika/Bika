import assert from 'node:assert/strict';
import test from 'node:test';

function setGeolocation(geolocation) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { geolocation }
  });
}

function position(latitude, longitude, accuracy) {
  return {
    coords: { latitude, longitude, accuracy },
    timestamp: Date.now()
  };
}

test('Beacon accuracy tiers and explicit reduced-accuracy confirmation are exact at boundaries', async () => {
  const {
    getBeaconAccuracyState,
    getBeaconAccuracyTier,
    getBeaconStartDecision
  } = await import(
    '../../apps/resident-pwa/src/features/beacon/beacon-location.js?test=accuracy-tiers'
  );

  assert.equal(getBeaconAccuracyTier(49.9), 'precise');
  assert.equal(getBeaconAccuracyTier(50), 'reduced');
  assert.equal(getBeaconAccuracyTier(150), 'reduced');
  assert.equal(getBeaconAccuracyTier(150.1), 'unavailable');
  assert.equal(getBeaconAccuracyTier(5000), 'unavailable');
  assert.equal(getBeaconAccuracyTier(Number.NaN), 'unavailable');
  assert.equal(getBeaconAccuracyState(49.9), 'precise');
  assert.equal(getBeaconAccuracyState(120), 'usable (confirm)');
  assert.equal(getBeaconAccuracyState(500), 'too coarse');
  assert.equal(getBeaconAccuracyState(200000), 'too coarse');
  assert.equal(getBeaconAccuracyState(null), 'searching');
  assert.equal(getBeaconStartDecision(49.9), 'allow');
  assert.equal(getBeaconStartDecision(50), 'confirm');
  assert.equal(getBeaconStartDecision(150), 'confirm');
  assert.equal(getBeaconStartDecision(150, true), 'allow');
  assert.equal(getBeaconStartDecision(150.1, true), 'retry');
});

test('reduced-accuracy guidance begins after 60 seconds without a precise fix', async () => {
  const { shouldShowBeaconAccuracyGuidance } = await import(
    '../../apps/resident-pwa/src/features/beacon/beacon-location.js?test=accuracy-guidance'
  );
  const start = 100000;
  const approximateLocation = { accuracy: 50 };
  const preciseLocation = { accuracy: 49.9, timestamp: start + 60000 };

  assert.equal(shouldShowBeaconAccuracyGuidance(start, start + 59999, approximateLocation), false);
  assert.equal(shouldShowBeaconAccuracyGuidance(start, start + 60000, approximateLocation), true);
  assert.equal(shouldShowBeaconAccuracyGuidance(start, start + 60000, preciseLocation), false);
  assert.equal(
    shouldShowBeaconAccuracyGuidance(start, start + 60000, { accuracy: 49.9, timestamp: start }),
    true
  );
  assert.equal(shouldShowBeaconAccuracyGuidance(null, start + 60000, approximateLocation), false);
});

test('watch controller replaces its one watch and clears it on stop', async () => {
  const watchIds = [];
  const clearedWatchIds = [];
  setGeolocation({
    watchPosition() {
      const watchId = watchIds.length + 1;
      watchIds.push(watchId);
      return watchId;
    },
    clearWatch(watchId) {
      clearedWatchIds.push(watchId);
    }
  });
  const { createBeaconLocationWatchController } = await import(
    '../../apps/resident-pwa/src/features/beacon/beacon-location.js?test=watch-controller'
  );
  const controller = createBeaconLocationWatchController();

  assert.equal(controller.start(), true);
  assert.equal(controller.start(), false);
  assert.equal(watchIds.length, 1);
  assert.equal(controller.isWatching, true);
  assert.equal(controller.stop(), true);
  assert.equal(controller.stop(), false);
  assert.deepEqual(clearedWatchIds, [1]);
  assert.equal(controller.start(), true);
  assert.equal(watchIds.length, 2);
  controller.stop();
  assert.deepEqual(clearedWatchIds, [1, 2]);
});

test('watch controller stops on a precise fix and clears its timeout', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let publishPosition;
  let clearedWatchId;
  let timeoutCount = 0;
  setGeolocation({
    watchPosition(success) {
      publishPosition = success;
      return 91;
    },
    clearWatch(watchId) {
      clearedWatchId = watchId;
    }
  });
  const { createBeaconLocationWatchController } = await import(
    '../../apps/resident-pwa/src/features/beacon/beacon-location.js?test=controller-timeout-cleanup'
  );
  const controller = createBeaconLocationWatchController(null, {
    onTimeout: () => { timeoutCount += 1; }
  });

  controller.start();
  publishPosition(position(-29.8, 31.1, 30));
  assert.equal(controller.isWatching, false);
  assert.equal(clearedWatchId, 91);
  t.mock.timers.tick(30000);
  assert.equal(timeoutCount, 0);
});

test('location diagnostics track accuracy and errors without recording coordinates', async () => {
  let publishPosition;
  let publishError;
  setGeolocation({
    watchPosition(success, error) {
      publishPosition = success;
      publishError = error;
      return 90;
    },
    clearWatch() {}
  });
  const {
    getBeaconLocationDiagnostics,
    setBeaconLocationPermissionState,
    watchCurrentLocation
  } = await import(
    '../../apps/resident-pwa/src/features/beacon/beacon-location.js?test=location-diagnostics'
  );
  setBeaconLocationPermissionState('granted');
  const stopWatching = watchCurrentLocation();
  publishPosition(position(-29.86, 31.02, 120));
  publishPosition(position(-29.85, 31.03, 42));
  publishError({ code: 2, message: 'Position unavailable' });

  const diagnostics = getBeaconLocationDiagnostics();
  assert.equal(diagnostics.permissionState, 'granted');
  assert.equal(diagnostics.latestAccuracyMeters, 42);
  assert.equal(diagnostics.fixesReceived, 2);
  assert.equal(diagnostics.bestAccuracyMeters, 42);
  assert.equal(diagnostics.lastErrorCode, 2);
  assert.equal(diagnostics.lastErrorMessage, 'Position unavailable');
  assert.equal('lat' in diagnostics, false);
  assert.equal('lng' in diagnostics, false);
  stopWatching();
});

test('location request chooses the best fix received and clears its watch', async () => {
  const clearedWatchIds = [];
  let publishPosition;
  setGeolocation({
    watchPosition(success, error, options) {
      publishPosition = success;
      assert.equal(options.enableHighAccuracy, true);
      assert.equal(options.maximumAge, 0);
      assert.equal(options.timeout, 30000);
      return 27;
    },
    clearWatch(watchId) {
      clearedWatchIds.push(watchId);
    }
  });

  const { requestCurrentLocation } = await import(
    '../../apps/resident-pwa/src/features/beacon/beacon-location.js?test=best-fix'
  );
  const request = requestCurrentLocation({ force: true });
  publishPosition(position(-29.86, 31.02, 12000));
  publishPosition(position(-29.857, 31.0247, 80));
  publishPosition(position(-29.857, 31.0247, 24));

  const result = await request;
  assert.equal(result.lat, -29.857);
  assert.equal(result.lng, 31.0247);
  assert.equal(result.accuracy, 24);
  assert.ok(Number.isFinite(result.timestamp));
  assert.deepEqual(clearedWatchIds, [27]);
});

test('location request rejects when geolocation is unavailable', async () => {
  setGeolocation(undefined);
  const { requestCurrentLocation } = await import(
    '../../apps/resident-pwa/src/features/beacon/beacon-location.js?test=unavailable'
  );
  await assert.rejects(
    requestCurrentLocation(),
    /Location services are not available/
  );
});

test('a geolocation error rejects when no location fix was received', async () => {
  let publishError;
  setGeolocation({
    watchPosition(success, error) {
      publishError = error;
      return 34;
    },
    clearWatch() {}
  });
  const { requestCurrentLocation } = await import(
    '../../apps/resident-pwa/src/features/beacon/beacon-location.js?test=permission-error'
  );

  const request = requestCurrentLocation({ force: true });
  publishError({ code: 1, message: 'Permission denied' });
  await assert.rejects(request, (error) => error.code === 1);
});

test('a ±200 km fix is rejected and never stored as the current location', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let publishPosition;
  let cleared = false;
  setGeolocation({
    watchPosition(success) {
      publishPosition = success;
      return 52;
    },
    clearWatch(watchId) {
      cleared = watchId === 52;
    }
  });
  const { getCurrentLocation, requestCurrentLocation } = await import(
    '../../apps/resident-pwa/src/features/beacon/beacon-location.js?test=reject-ip-fix'
  );

  const request = requestCurrentLocation({ force: true });
  publishPosition(position(-29.8, 31.1, 200000));
  assert.equal(getCurrentLocation(), null);
  t.mock.timers.tick(30000);
  await assert.rejects(request, /Couldn't get a precise location/);
  assert.equal(cleared, true);
});

test('a 120 m fix is returned for confirmation only after the timeout', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let publishPosition;
  const clearedWatchIds = [];
  setGeolocation({
    watchPosition(success, error, options) {
      publishPosition = success;
      assert.equal(options.timeout, 30000);
      return 52;
    },
    clearWatch(watchId) {
      clearedWatchIds.push(watchId);
    }
  });
  const { requestCurrentLocation } = await import(
    '../../apps/resident-pwa/src/features/beacon/beacon-location.js?test=confirm-at-timeout'
  );

  const request = requestCurrentLocation({ force: true });
  publishPosition(position(-29.8, 31.1, 120));
  let settled = false;
  request.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  t.mock.timers.tick(30000);

  const result = await request;
  assert.equal(result.accuracy, 120);
  assert.deepEqual(clearedWatchIds, [52]);
});

test('a temporary position error does not end the timed accuracy search', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let publishPosition;
  let publishError;
  setGeolocation({
    watchPosition(success, error) {
      publishPosition = success;
      publishError = error;
      return 56;
    },
    clearWatch() {}
  });
  const { requestCurrentLocation } = await import(
    '../../apps/resident-pwa/src/features/beacon/beacon-location.js?test=temporary-position-error'
  );

  const request = requestCurrentLocation({ force: true });
  publishPosition(position(-29.8, 31.1, 120));
  publishError({ code: 2, message: 'Position unavailable' });
  let settled = false;
  request.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  t.mock.timers.tick(30000);
  assert.equal((await request).accuracy, 120);
});

test('a 30 m fix is accepted immediately as precise', async () => {
  let publishPosition;
  let clearedWatchId;
  setGeolocation({
    watchPosition(success) {
      publishPosition = success;
      return 53;
    },
    clearWatch(watchId) {
      clearedWatchId = watchId;
    }
  });
  const { requestCurrentLocation } = await import(
    '../../apps/resident-pwa/src/features/beacon/beacon-location.js?test=precise-fix'
  );

  const request = requestCurrentLocation({ force: true });
  publishPosition(position(-29.8, 31.1, 30));
  const result = await request;
  assert.equal(result.accuracy, 30);
  assert.equal(clearedWatchId, 53);
});

test('the best fix is retained across readings until the timeout', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let publishPosition;
  setGeolocation({
    watchPosition(success) {
      publishPosition = success;
      return 54;
    },
    clearWatch() {}
  });
  const { requestCurrentLocation } = await import(
    '../../apps/resident-pwa/src/features/beacon/beacon-location.js?test=best-fix-timeout'
  );

  const request = requestCurrentLocation({ force: true });
  publishPosition(position(-29.8, 31.1, 120));
  publishPosition(position(-29.7, 31.2, 80));
  publishPosition(position(-29.6, 31.3, 110));
  t.mock.timers.tick(30000);

  const result = await request;
  assert.equal(result.lat, -29.7);
  assert.equal(result.lng, 31.2);
  assert.equal(result.accuracy, 80);
});

test('too-coarse readings time out with a retryable error and clean up the watch', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let publishPosition;
  let clearedWatchId;
  setGeolocation({
    watchPosition(success) {
      publishPosition = success;
      return 55;
    },
    clearWatch(watchId) {
      clearedWatchId = watchId;
    }
  });
  const { getCurrentLocation, requestCurrentLocation } = await import(
    '../../apps/resident-pwa/src/features/beacon/beacon-location.js?test=too-coarse-timeout'
  );

  const request = requestCurrentLocation({ force: true });
  publishPosition(position(-29.8, 31.1, 4000));
  t.mock.timers.tick(30000);

  await assert.rejects(
    request,
    (error) => /Couldn't get a precise location.*4000 m/.test(error.message)
  );
  assert.equal(getCurrentLocation(), null);
  assert.equal(clearedWatchId, 55);
});

test('continuous location watch publishes subsequent fixes and stops its watch', async () => {
  let publishPosition;
  let clearedWatchId;
  const received = [];
  setGeolocation({
    watchPosition(success, error, options) {
      publishPosition = success;
      assert.equal(options.enableHighAccuracy, true);
      assert.equal(options.maximumAge, 0);
      assert.equal(options.timeout, 30000);
      return 63;
    },
    clearWatch(watchId) {
      clearedWatchId = watchId;
    }
  });
  const { watchCurrentLocation } = await import(
    '../../apps/resident-pwa/src/features/beacon/beacon-location.js?test=continuous-watch-updates'
  );
  const { getCurrentLocation, subscribeCurrentLocation } = await import(
    '../../apps/resident-pwa/src/features/beacon/beacon-location.js?test=continuous-watch-updates'
  );
  const unsubscribe = subscribeCurrentLocation((location) => received.push(location));
  const stopWatching = watchCurrentLocation();
  publishPosition(position(-29.86, 31.02, 12000));
  publishPosition(position(-29.86, 31.02, 4000));
  publishPosition(position(-29.86, 31.02, 120));
  publishPosition(position(-29.857, 31.0247, 24));
  assert.deepEqual(received.map((location) => location.accuracy), [120, 24]);
  assert.equal(getCurrentLocation().accuracy, 24);
  stopWatching();
  unsubscribe();
  assert.equal(clearedWatchId, 63);
});

test('continuous location watch reports invalid coordinates instead of throwing', async () => {
  let publishPosition;
  let reportedError;
  setGeolocation({
    watchPosition(success) {
      publishPosition = success;
      return 63;
    },
    clearWatch() {}
  });
  const { watchCurrentLocation } = await import(
    '../../apps/resident-pwa/src/features/beacon/beacon-location.js?test=invalid-watch-position'
  );
  watchCurrentLocation((error) => {
    reportedError = error;
  });

  assert.doesNotThrow(() => publishPosition(position(120, 31, 15)));
  assert.match(reportedError.message, /invalid location/i);
});

test('arrival detection requires a fresh, precise fix within 50 m of the destination', async () => {
  const { isWithinBeaconArrivalZone } = await import(
    '../../apps/resident-pwa/src/features/beacon/beacon-location.js?test=arrival-zone'
  );
  const now = 100000;
  const baseLocation = {
    lat: 0,
    lng: 0,
    accuracy: 10,
    timestamp: now
  };
  const destination = { lat: 0, lng: 0 };

  assert.equal(isWithinBeaconArrivalZone(baseLocation, destination, now), true);
  assert.equal(isWithinBeaconArrivalZone({ ...baseLocation, lat: 0.0004 }, destination, now), true);
  assert.equal(isWithinBeaconArrivalZone({ ...baseLocation, lat: 0.0005 }, destination, now), false);
  assert.equal(isWithinBeaconArrivalZone({ ...baseLocation, accuracy: 50 }, destination, now), false);
  assert.equal(isWithinBeaconArrivalZone({ ...baseLocation, timestamp: now - 30001 }, destination, now), false);
  assert.equal(isWithinBeaconArrivalZone({ ...baseLocation, timestamp: now + 1 }, destination, now), false);
});

test('route sharing requires a precise fix close to the selected route start', async () => {
  const { isValidBeaconRouteStart } = await import(
    '../../apps/resident-pwa/src/features/beacon/beacon-location.js?test=route-start'
  );
  const start = { lat: 0, lng: 0 };

  assert.equal(isValidBeaconRouteStart({ lat: 0.0004, lng: 0, accuracy: 49 }, start), true);
  assert.equal(isValidBeaconRouteStart({ lat: 0.0011, lng: 0, accuracy: 50 }, start), false);
  assert.equal(isValidBeaconRouteStart({ lat: 0, lng: 0, accuracy: 50 }, start), false);
  assert.equal(
    isValidBeaconRouteStart({ lat: 0.0008, lng: 0, accuracy: 100 }, start, { allowReducedAccuracy: true }),
    true
  );
  assert.equal(
    isValidBeaconRouteStart({ lat: 0.002, lng: 0, accuracy: 100 }, start, { allowReducedAccuracy: true }),
    false
  );
});

test('starting a Beacon share requires GPS accuracy strictly better than 50 m', async () => {
  const { hasBeaconSharingAccuracy } = await import(
    '../../apps/resident-pwa/src/features/beacon/beacon-location.js?test=share-accuracy'
  );

  assert.equal(hasBeaconSharingAccuracy({ accuracy: 49.9 }), true);
  assert.equal(hasBeaconSharingAccuracy({ accuracy: 50 }), false);
  assert.equal(hasBeaconSharingAccuracy({ accuracy: 200000 }), false);
  assert.equal(hasBeaconSharingAccuracy(null), false);
});

test('selected route start is validated, copied, and clearable', async () => {
  const {
    clearSelectedBeaconRouteStart,
    getSelectedBeaconRouteStart,
    setSelectedBeaconRouteStart
  } = await import(
    '../../apps/resident-pwa/src/features/beacon/beacon-location.js?test=selected-route-start'
  );

  const selected = setSelectedBeaconRouteStart({ lat: -29.86, lng: 31.02 });
  assert.deepEqual(selected, { lat: -29.86, lng: 31.02 });
  selected.lat = 0;
  assert.deepEqual(getSelectedBeaconRouteStart(), { lat: -29.86, lng: 31.02 });
  assert.throws(
    () => setSelectedBeaconRouteStart({ lat: 91, lng: 31 }),
    /valid starting point/
  );
  clearSelectedBeaconRouteStart();
  assert.equal(getSelectedBeaconRouteStart(), null);
});

test('clearing current location notifies subscribers and removes the cached fix', async () => {
  const {
    getCurrentLocation,
    resetCurrentLocation,
    subscribeCurrentLocation,
    watchCurrentLocation
  } = await import(
    '../../apps/resident-pwa/src/features/beacon/beacon-location.js?test=reset-current-location'
  );
  let publishPosition;
  setGeolocation({
    watchPosition(success) {
      publishPosition = success;
      return 78;
    },
    clearWatch() {}
  });
  const updates = [];
  const unsubscribe = subscribeCurrentLocation((location) => updates.push(location));
  const stopWatching = watchCurrentLocation();
  publishPosition(position(-29.86, 31.02, 400));
  resetCurrentLocation();

  assert.equal(getCurrentLocation(), null);
  assert.equal(updates.at(-1), null);
  stopWatching();
  unsubscribe();
});
