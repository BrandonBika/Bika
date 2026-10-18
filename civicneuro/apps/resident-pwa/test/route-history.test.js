import test from 'node:test';
import assert from 'node:assert/strict';
import { createRouteHistory } from '../src/route-history.js';

function createBrowser(initialHash = '#welcome') {
  const values = new Map();
  let hashValue = initialHash;
  const location = {
    pathname: '/resident/',
    search: '',
    replacedUrl: null,
    replace(url) {
      this.replacedUrl = url;
      hashValue = url.slice(url.indexOf('#'));
    }
  };
  Object.defineProperty(location, 'hash', {
    get() {
      return hashValue;
    },
    set(value) {
      hashValue = `#${value.replace(/^#/, '')}`;
    }
  });
  const browser = {
    location,
    sessionStorage: {
      getItem(key) {
        return values.get(key) ?? null;
      },
      setItem(key, value) {
        values.set(key, value);
      }
    },
    history: {
      backCalls: 0,
      back() {
        this.backCalls += 1;
      }
    }
  };
  return browser;
}

test('forward routes are pushed and browser Back pops the current route', () => {
  const browser = createBrowser();
  const history = createRouteHistory(browser);
  history.initialize();

  history.navigate('home');
  history.navigate('report-detail', { id: '42' });
  assert.deepEqual(history.getRoutes(), [
    'welcome',
    'home',
    'report-detail?id=42'
  ]);

  browser.location.hash = '#home';
  history.recordRouteChange();
  assert.deepEqual(history.getRoutes(), ['welcome', 'home']);
});

test('route history survives a refresh when the current hash matches', () => {
  const browser = createBrowser();
  const firstHistory = createRouteHistory(browser);
  firstHistory.initialize();
  firstHistory.navigate('menu');
  firstHistory.navigate('settings');

  const refreshedHistory = createRouteHistory(browser);
  refreshedHistory.initialize();
  assert.deepEqual(refreshedHistory.getRoutes(), ['welcome', 'menu', 'settings']);
});

test('goBack uses browser history when an in-app previous route exists', () => {
  const browser = createBrowser();
  const history = createRouteHistory(browser);
  history.initialize();
  history.navigate('menu');
  history.navigate('privacy-policy');

  history.goBack('menu');
  assert.equal(browser.history.backCalls, 1);
  assert.equal(browser.location.replacedUrl, null);
});

test('goBack to a previous sign-in route pops forgot-password without adding another entry', () => {
  const browser = createBrowser();
  const history = createRouteHistory(browser);
  history.initialize();
  history.navigate('sign-in');
  history.navigate('forgot-password');

  history.goBack('sign-in');
  browser.location.hash = '#sign-in';
  history.recordRouteChange();

  assert.deepEqual(history.getRoutes(), ['welcome', 'sign-in']);
  assert.equal(browser.history.backCalls, 1);
});

test('goBack replaces the current route with the fallback when history is empty', () => {
  const browser = createBrowser('#settings');
  const history = createRouteHistory(browser);
  history.initialize();

  history.goBack('menu', { source: 'direct' });
  assert.equal(browser.location.hash, '#menu?source=direct');
  assert.equal(browser.location.replacedUrl, '/resident/#menu?source=direct');
  assert.deepEqual(history.getRoutes(), ['menu?source=direct']);
  assert.equal(browser.history.backCalls, 0);
});

test('replace navigation replaces the current stack entry and URL', () => {
  const browser = createBrowser();
  const history = createRouteHistory(browser);
  history.initialize();
  history.navigate('menu');
  history.navigate('account');

  history.navigate('sign-in', {}, { replace: true });
  assert.equal(browser.location.hash, '#sign-in');
  assert.deepEqual(history.getRoutes(), ['welcome', 'menu', 'sign-in']);

  browser.location.hash = '#menu';
  history.recordRouteChange();
  assert.deepEqual(history.getRoutes(), ['welcome', 'menu']);
});

test('route history is capped at the configured number of entries', () => {
  const browser = createBrowser();
  const history = createRouteHistory(browser, 3);
  history.initialize();
  history.navigate('one');
  history.navigate('two');
  history.navigate('three');

  assert.deepEqual(history.getRoutes(), ['one', 'two', 'three']);
  assert.equal(history.canGoBack(), true);
});
