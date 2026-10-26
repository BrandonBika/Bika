export function waitForRouteStylesheet(stylesheet, timeoutMs = 3000) {
  return new Promise((resolve) => {
    let timeout;
    const finish = (result) => {
      clearTimeout(timeout);
      stylesheet.removeEventListener('load', onLoad);
      stylesheet.removeEventListener('error', onError);
      resolve(result);
    };
    const onLoad = () => finish('load');
    const onError = () => finish('error');

    stylesheet.addEventListener('load', onLoad, { once: true });
    stylesheet.addEventListener('error', onError, { once: true });
    timeout = setTimeout(() => finish('timeout'), timeoutMs);
  });
}
