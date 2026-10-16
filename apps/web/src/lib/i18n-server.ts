import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { backend, SESSION_COOKIE } from './api';
import { validLocale, translator } from './i18n';

export const serverLanguage = cache(async () => {
  const jar = await cookies();
  let locale = validLocale(jar.get('nicerp_locale')?.value);
  if (jar.has(SESSION_COOKIE)) {
    try {
      const response = await backend('auth/me');
      if (response.ok) locale = validLocale((await response.json()).locale);
    } catch {
      /* The login screen can still render during a service outage. */
    }
  }
  return { locale, t: translator(locale) };
});
