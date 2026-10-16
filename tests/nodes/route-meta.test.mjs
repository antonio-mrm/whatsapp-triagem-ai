import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCode, metaPayload, metaButton, metaInteractive, asTrigger, ADMIN } from '../helpers/n8n.mjs';

const run = (json) => runCode('Route Meta', { json });

test('Route Meta: texto do admin passa com cfg e payload vazio', () => {
  const out = run(metaPayload(ADMIN, 'ok 3'));
  assert.equal(out.length, 1);
  assert.equal(out[0].json.text, 'ok 3');
  assert.equal(out[0].json.payload, '');
  assert.equal(out[0].json.cfg.admin, ADMIN);
});

test('Route Meta: toque em botão do template vira payload + título', () => {
  const out = run(metaButton('approve:4', '✅ Aprovar'));
  assert.equal(out[0].json.payload, 'approve:4');
  assert.equal(out[0].json.text, '✅ Aprovar');
});

test('Route Meta: botão interativo (button_reply) também vira payload', () => {
  assert.equal(run(metaInteractive('skip:2', '❌ Passar'))[0].json.payload, 'skip:2');
});

test('Route Meta: número com formatação (+, espaços) é normalizado', () => {
  assert.equal(run(metaPayload('+55 11 99999-9999', 'nao 1')).length, 1);
});

test('Route Meta: ignora outro remetente (texto e botão)', () => {
  assert.deepEqual(run(metaPayload('5511000000000')), []);
  const b = metaButton('approve:1');
  b.body.entry[0].changes[0].value.messages[0].from = '5511000000000';
  assert.deepEqual(run(b), []);
});

test('Route Meta: ignora mídia (image) e texto vazio', () => {
  assert.deepEqual(run(metaPayload(ADMIN, '', 'image')), []);
  assert.deepEqual(run(metaPayload(ADMIN, '   ')), []);
});

test('Route Meta: ignora notificações de status (entregue/lida) e payload vazio', () => {
  assert.deepEqual(run({ body: { entry: [{ changes: [{ value: { statuses: [{ status: 'read' }] } }] }] } }), []);
  assert.deepEqual(run({ body: {} }), []);
});

test('Route Meta: formato do WhatsApp Trigger (value direto) — texto, botão e interativo', () => {
  assert.equal(run(asTrigger(metaPayload(ADMIN, 'ok 3')))[0].json.text, 'ok 3');
  assert.equal(run(asTrigger(metaButton('approve:4', '✅ Aprovar')))[0].json.payload, 'approve:4');
  assert.equal(run(asTrigger(metaInteractive('skip:2')))[0].json.payload, 'skip:2');
});

test('Route Meta: formato do WhatsApp Trigger ignora outro remetente e status', () => {
  assert.deepEqual(run(asTrigger(metaPayload('5511000000000'))), []);
  assert.deepEqual(run({ messaging_product: 'whatsapp', statuses: [{ status: 'read' }] }), []);
});

test('Route Meta: formato entry/changes sem "body" (webhook cru) também funciona', () => {
  assert.equal(run(metaPayload(ADMIN, 'nao 1').body)[0].json.text, 'nao 1');
});
