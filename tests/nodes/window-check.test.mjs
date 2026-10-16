import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCode, cfg, ADMIN } from '../helpers/n8n.mjs';

const H = 3600 * 1000;
const check = (store) => runCode('Window Check', { json: {}, store });

test('Window Check: sem contato prévio do admin não manda nada', () => {
  assert.deepEqual(check({}), []);
});

test('Window Check: antes do limite (< 20h) não manda', () => {
  const store = { lastAdminAt: Date.now() - 19 * H };
  assert.deepEqual(check(store), []);
  assert.notEqual(store.windowReminded, true);
});

test('Window Check: a partir de 20h manda o template de lembrete ao admin', () => {
  const store = { lastAdminAt: Date.now() - 20 * H };
  const out = check(store);
  assert.equal(out.length, 1);
  assert.equal(out[0].json.to, ADMIN);
  assert.equal(out[0].json.template, cfg.reminderTemplate);
  assert.equal(store.windowReminded, true);
});

test('Window Check: só 1 lembrete por ciclo (não repete a cada hora)', () => {
  const store = { lastAdminAt: Date.now() - 22 * H };
  assert.equal(check(store).length, 1);
  assert.deepEqual(check(store), []);
});

test('Window Check: janela já fechada (> 24h) ainda manda o lembrete uma vez', () => {
  assert.equal(check({ lastAdminAt: Date.now() - 30 * H }).length, 1);
});

test('Window Check: nova msg do admin reabre o ciclo', () => {
  const store = { lastAdminAt: Date.now() - 22 * H };
  check(store);
  runCode('Route Meta', {
    json: { body: { entry: [{ changes: [{ value: { messages: [{ from: ADMIN, type: 'text', text: { body: 'oi' } }] } }] }] } }, store,
  });
  assert.deepEqual(check(store), []);
  store.lastAdminAt = Date.now() - 21 * H;
  assert.equal(check(store).length, 1);
});
