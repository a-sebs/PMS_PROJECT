import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import request from 'supertest';

import { createApp } from '#src/app.js';
import { loadConfig } from '#src/config/env.js';
import { createContainer } from '#src/container.js';
import { createLogger } from '#src/core/logger.js';
import { createDatabase } from '#src/db/database.js';
import { migrate } from '#src/db/migrator.js';
import { seedDemoData } from '#src/db/seed.js';
import { startServer } from '#src/server.js';

export const TEST_PASSWORD = 'Prueba-2026!';
export const USERS = Object.freeze({
  admin: 'admin@aurora.test',
  frontDesk: 'recepcion@aurora.test',
  housekeeping: 'limpieza@aurora.test',
  housekeeping2: 'limpieza2@aurora.test',
  maintenance: 'mantenimiento@aurora.test',
});

/**
 * URL de la base de datos de pruebas: variable de entorno, luego .env, luego el valor por defecto
 * de docker-compose. NUNCA se usa DATABASE_URL: las pruebas vacían las tablas.
 */
function testDatabaseUrl() {
  const fileEnv = existsSync('.env') ? parseEnv(readFileSync('.env', 'utf8')) : {};
  const url =
    process.env.TEST_DATABASE_URL ??
    fileEnv.TEST_DATABASE_URL ??
    'postgres://pms:pms@localhost:5432/pms_test';
  const databaseName = new URL(url).pathname.slice(1);
  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `Por seguridad, la base de datos de pruebas debe terminar en "_test" (recibí "${databaseName}").`,
    );
  }
  return url;
}

export function testConfig() {
  return loadConfig({
    NODE_ENV: 'test',
    PORT: '0',
    DATABASE_URL: testDatabaseUrl(),
    SESSION_SECRET: 'secreto-de-pruebas-con-mas-de-32-caracteres',
    APP_TIMEZONE: 'America/Guayaquil',
    LOG_LEVEL: process.env.LOG_LEVEL ?? 'silent',
  });
}

/** Migra, vacía todas las tablas y carga los datos de demostración con TEST_PASSWORD. */
export async function resetDatabase(databaseUrl) {
  const db = createDatabase(databaseUrl);
  try {
    await migrate(db);
    const { rows } = await db.query(
      `SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`,
    );
    if (rows.length > 0) {
      const tables = rows.map((row) => `"${row.tablename}"`).join(', ');
      await db.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
    }
    await seedDemoData(db, { password: TEST_PASSWORD, chat: false });
  } finally {
    await db.close();
  }
}

/**
 * App de Express lista para Supertest (sin escuchar puertos ni Socket.IO).
 * Base de datos reiniciada con datos de demostración.
 */
export async function createTestApp() {
  const config = testConfig();
  await resetDatabase(config.databaseUrl);
  const logger = createLogger({ level: config.logLevel });
  const container = createContainer({ config, logger });
  const { app, sessionStore } = createApp(container);
  return {
    app,
    container,
    db: container.db,
    async close() {
      sessionStore.close();
      await container.close();
    },
  };
}

/**
 * Servidor real (HTTP + Socket.IO) en un puerto libre, para pruebas de tiempo real.
 * El margen de presencia es corto para no esperar segundos en las pruebas de desconexión.
 */
export async function createTestServer({ presenceGraceMs = 100 } = {}) {
  const config = testConfig();
  await resetDatabase(config.databaseUrl);
  const logger = createLogger({ level: config.logLevel });
  const server = await startServer({ config, logger, presenceGraceMs });
  return { ...server, db: server.container.db, baseUrl: `http://127.0.0.1:${server.port}` };
}

/** Extrae el token CSRF de la etiqueta <meta> de una página. */
export function csrfFrom(html) {
  const match = /<meta name="csrf-token" content="([^"]*)">/.exec(html);
  assert.ok(match, 'la página debería incluir <meta name="csrf-token">');
  return match[1];
}

/**
 * Inicia sesión con Supertest y devuelve el agente (guarda cookies) y el token CSRF vigente.
 * @param {import('express').Express | string} appOrUrl
 */
export async function loginAs(appOrUrl, email) {
  const agent = request.agent(appOrUrl);
  const loginPage = await agent.get('/login');
  const response = await agent
    .post('/login')
    .type('form')
    .send({ email, password: TEST_PASSWORD, _csrf: csrfFrom(loginPage.text) });
  assert.equal(response.status, 303, `el login de ${email} debería redirigir`);
  // La sesión se regenera al iniciar sesión: el token CSRF útil es el de la página siguiente.
  const home = await agent.get('/dashboard');
  return { agent, csrf: csrfFrom(home.text) };
}

const cookieHeaderFrom = (response) =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');

/**
 * Inicia sesión contra un servidor real usando fetch y devuelve la cabecera Cookie y el token
 * CSRF. Sirve para las pruebas de tiempo real, donde el cliente de Socket.IO necesita la cookie.
 * @param {string} baseUrl
 * @param {string} email
 */
export async function loginWithFetch(baseUrl, email) {
  const loginPage = await fetch(`${baseUrl}/login`);
  const anonymousCookie = cookieHeaderFrom(loginPage);
  const response = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: anonymousCookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      email,
      password: TEST_PASSWORD,
      _csrf: csrfFrom(await loginPage.text()),
    }),
  });
  assert.equal(response.status, 303, `el login de ${email} debería redirigir`);
  const cookie = cookieHeaderFrom(response);
  const home = await fetch(`${baseUrl}/dashboard`, { headers: { cookie } });
  return { cookie, csrf: csrfFrom(await home.text()) };
}

/**
 * Envía un comando como lo hace el JavaScript del navegador (fetch + CSRF + JSON).
 * @param {string} baseUrl
 * @param {{ cookie: string, csrf: string }} session
 */
export async function postCommand(baseUrl, session, path, fields) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      cookie: session.cookie,
      'x-csrf-token': session.csrf,
      'x-requested-with': 'fetch',
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(fields),
  });
  return { status: response.status, body: await response.json() };
}
