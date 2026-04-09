'use strict';

function normalizeDatabaseUrl(raw) {
  if (!raw) return raw;
  try {
    const u = new URL(raw);
    u.searchParams.delete('channel_binding');
    return u.toString();
  } catch {
    return raw;
  }
}

function getDatabaseUrl() {
  return normalizeDatabaseUrl(process.env.DATABASE_URL);
}

function getAuthDatabaseUrl() {
  if (!process.env.AUTH_DATABASE_URL) return null;
  return normalizeDatabaseUrl(process.env.AUTH_DATABASE_URL);
}

module.exports = { normalizeDatabaseUrl, getDatabaseUrl, getAuthDatabaseUrl };
