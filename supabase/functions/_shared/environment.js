function readEnv(env, name) {
  if (typeof env?.get === 'function') return env.get(name) || '';
  return env?.[name] || '';
}

export function getAppEnvironment(env) {
  const values = [readEnv(env, 'APP_ENV'), readEnv(env, 'NODE_ENV')]
    .map((value) => String(value).trim().toLowerCase())
    .filter(Boolean);

  if (values.some((value) => value !== 'development')) return 'production';
  return values.length > 0 ? 'development' : 'production';
}
