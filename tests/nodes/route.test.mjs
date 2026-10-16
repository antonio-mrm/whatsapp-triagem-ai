import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCode, evoPayload, SRC, cfg } from '../helpers/n8n.mjs';

const run = (json) => runCode('Route', { json });

test('Route: texto em conversation passa com cfg, sender, pushName e timestamp', () => {
  const out = run(evoPayload({ messageTimestamp: 1700000000 }));
  assert.equal(out.length, 1);
  assert.equal(out[0].json.type, 'group_msg');
  assert.equal(out[0].json.jid, SRC);
  assert.equal(out[0].json.pushName, 'João');
  assert.equal(out[0].json.sender, '5511888888888@s.whatsapp.net');
  assert.equal(out[0].json.ts, 1700000000);
  assert.deepEqual(out[0].json.cfg, cfg);
});

test('Route: timestamp em formato Long ({ low }) ou ausente', () => {
  assert.equal(run(evoPayload({ messageTimestamp: { low: 1700000001, high: 0 } }))[0].json.ts, 1700000001);
  assert.equal(run(evoPayload({ messageTimestamp: undefined }))[0].json.ts, 0);
});

test('Route: extendedTextMessage, legenda de imagem e de vídeo passam', () => {
  assert.equal(run(evoPayload({ message: { extendedTextMessage: { text: 'ext' } } }))[0].json.text, 'ext');
  assert.equal(run(evoPayload({ message: { imageMessage: { caption: 'foto' } } }))[0].json.text, 'foto');
  assert.equal(run(evoPayload({ message: { videoMessage: { caption: 'vid' } } }))[0].json.text, 'vid');
});

test('Route: mensagem em qualquer formatação segue inalterada (texto original)', () => {
  const t = '🚗 CIVIC EXL 2018\n\n50.000KM\n*R$ 80 MIL*\n(19) 98888-7777';
  assert.equal(run(evoPayload({ message: { conversation: t } }))[0].json.text, t);
});

test('Route: payload sem "body" (corpo direto) também funciona', () => {
  assert.equal(run(evoPayload().body).length, 1);
});

test('Route: ignora mensagens enviadas por mim (fromMe)', () => {
  assert.deepEqual(run(evoPayload({ key: { remoteJid: SRC, fromMe: true } })), []);
});

test('Route: ignora grupo que não é de origem', () => {
  assert.deepEqual(run(evoPayload({ key: { remoteJid: '999@g.us', fromMe: false } })), []);
});

test('Route: ignora DM (admin agora fala pela Meta)', () => {
  assert.deepEqual(run(evoPayload({ key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false } })), []);
});

test('Route: ignora texto vazio, só espaços, sem remoteJid e mídia sem legenda', () => {
  assert.deepEqual(run(evoPayload({ message: {} })), []);
  assert.deepEqual(run(evoPayload({ message: { conversation: '   ' } })), []);
  assert.deepEqual(run(evoPayload({ key: { fromMe: false } })), []);
  assert.deepEqual(run(evoPayload({ message: { imageMessage: {} } })), []);
});

test('Route: pushName/participant ausentes viram string vazia', () => {
  const out = run(evoPayload({ pushName: undefined, key: { remoteJid: SRC, fromMe: false } }));
  assert.equal(out[0].json.pushName, '');
  assert.equal(out[0].json.sender, '');
});
