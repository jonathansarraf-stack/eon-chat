'use strict';

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;

  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    cookies[key] = decodeURIComponent(value);
  }

  return cookies;
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.secure) parts.push('Secure');
  parts.push(`Path=${options.path || '/'}`);
  return parts.join('; ');
}

function clearCookie(name, options = {}) {
  return serializeCookie(name, '', {
    ...options,
    maxAge: 0
  });
}

module.exports = {
  parseCookies,
  serializeCookie,
  clearCookie
};
