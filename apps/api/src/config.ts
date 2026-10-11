export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl || !/^postgres(ql)?:\/\//.test(databaseUrl))
    throw new Error('DATABASE_URL must be a PostgreSQL connection URL');
  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT must be between 1 and 65535');
  const webOrigin = env.WEB_ORIGIN ?? 'http://localhost:3000';
  const origin = new URL(webOrigin);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== webOrigin)
    throw new Error('WEB_ORIGIN must be an HTTP origin without a trailing slash');
  return { databaseUrl, port, host: env.HOST ?? '127.0.0.1', webOrigin };
}
