// Fluxo completo: simula o grafo do workflow.json de ponta a ponta (Gemini e FIPE mockados).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  simulate, evoPayload, metaPayload, metaButton, geminiNative, fakeHttp, FIPE_OK, AD, ADMIN, DST, asTrigger,
} from './helpers/n8n.mjs';

const GROUP_TEXT = '🚗 CIVIC EXL 2018 flex\n50.000KM\n80 MIL\nCampinas/SP\n(19) 98888-7777';
const ad = () => simulate('Webhook Evolution', evoPayload({ message: { conversation: GROUP_TEXT } }), {
  gemini: geminiNative(AD), helpers: fakeHttp(FIPE_OK).helpers, store: {},
});
const reply = (store, json) => simulate('WhatsApp Trigger', asTrigger(json), { store });

test('E2E: anúncio em grupo → Gemini (texto original) → card com 3 botões ao admin', async () => {
  const { calls, store } = await ad();
  assert.deepEqual(calls.map((c) => c.node), ['Message a model', 'Send card']);
  assert.ok(calls[0].prompt.includes(GROUP_TEXT));
  const card = calls[1].body;
  assert.equal(card.to, ADMIN);
  assert.equal(card.type, 'template');
  assert.equal(card.template.components.find((c) => c.type === 'body').parameters[0].text, 'Honda Civic EXL');
  assert.equal(card.template.components.filter((c) => c.type === 'button').length, 3);
  assert.equal(store.pending[1].text, GROUP_TEXT);
});

test('E2E: mensagem que não é anúncio → Gemini e nada mais', async () => {
  const { calls } = await simulate('Webhook Evolution', evoPayload(), { gemini: geminiNative({ is_ad: false }) });
  assert.deepEqual(calls.map((c) => c.node), ['Message a model']);
});

test('E2E: msg de grupo não monitorado nem chega no Gemini', async () => {
  const { calls } = await simulate('Webhook Evolution', evoPayload({ key: { remoteJid: 'x@g.us', fromMe: false } }));
  assert.deepEqual(calls, []);
});

test('E2E: ✅ Aprovar → repassa ao grupo via Evolution, sem feedback ao admin', async () => {
  const { store } = await ad();
  const { calls } = await reply(store, metaButton('approve:1', '✅ Aprovar'));
  assert.deepEqual(calls.map((c) => c.node), ['Send Evolution']);
  assert.deepEqual(calls[0].body, { number: DST, text: GROUP_TEXT });
  assert.equal(store.pending[1], undefined);
});

test('E2E: 💰 Editar Preço → "Informe o valor atualizado:" → valor → repassa direto ao grupo', async () => {
  const { store } = await ad();
  const step1 = await reply(store, metaButton('price:1', '💰 Editar Preço'));
  assert.deepEqual(step1.calls.map((c) => [c.node, c.to, c.text]), [['Send message', ADMIN, 'Informe o valor atualizado:']]);
  const step2 = await reply(store, metaPayload(ADMIN, 'R$ 82.500'));
  assert.deepEqual(step2.calls.map((c) => c.node), ['Send Evolution']);
  assert.deepEqual(step2.calls[0].body, { number: DST, text: `💰 R$ 82.500
${GROUP_TEXT}` });
  assert.equal(store.pending[1], undefined);
});

test('E2E: Editar Preço com valor inválido → pede de novo; depois valor válido repassa', async () => {
  const { store } = await ad();
  await reply(store, metaButton('price:1'));
  const bad = await reply(store, metaPayload(ADMIN, 'não sei'));
  assert.deepEqual(bad.calls.map((c) => c.node), ['Send message']);
  assert.match(bad.calls[0].text, /Informe o valor atualizado:/);
  const good = await reply(store, metaPayload(ADMIN, '90k'));
  assert.equal(good.calls[0].body.text, `💰 R$ 90.000
${GROUP_TEXT}`);
});

test('E2E: ❌ Passar → só aviso de descartado, nada vai aos grupos', async () => {
  const { store } = await ad();
  const { calls } = await reply(store, metaButton('skip:1', '❌ Passar'));
  assert.deepEqual(calls.map((c) => c.node), ['Send message']);
  assert.equal(store.pending[1], undefined);
});

test('E2E: dois anúncios seguidos, cada botão age no seu id', async () => {
  const store = {};
  const g = { gemini: geminiNative(AD), helpers: fakeHttp(FIPE_OK).helpers, store };
  await simulate('Webhook Evolution', evoPayload({ message: { conversation: 'anúncio A' } }), g);
  await simulate('Webhook Evolution', evoPayload({ message: { conversation: 'anúncio B' } }), g);
  const { calls } = await reply(store, metaButton('approve:2'));
  assert.equal(calls[0].body.text, 'anúncio B');
  assert.equal(store.pending[1].text, 'anúncio A');
});

test('E2E: resposta de quem não é admin é ignorada', async () => {
  const b = metaButton('approve:1');
  b.body.entry[0].changes[0].value.messages[0].from = '5511000000000';
  const { calls } = await reply({ pending: { 1: { text: 'x' } } }, b);
  assert.deepEqual(calls, []);
});

test('E2E: FIPE fora do ar não impede o card', async () => {
  const { calls } = await simulate('Webhook Evolution', evoPayload(), { gemini: geminiNative(AD), helpers: fakeHttp({}).helpers });
  assert.deepEqual(calls.map((c) => c.node), ['Message a model', 'Send card']);
  assert.equal(calls[1].body.template.components[0].parameters[4].text, '—');
});
