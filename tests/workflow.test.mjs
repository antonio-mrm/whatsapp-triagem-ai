// Rodar: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routeEvolutionCode, routeMetaCode, prepareCode, adminCode } from '../n8n/code.mjs';

const ADMIN = '5511999999999';
const SRC = '120363000000000001@g.us';
const DST = '120363000000000002@g.us';

// Executa o corpo de um nó Code do n8n com stubs.
function run(code, { json, store = {}, route } = {}) {
  const fn = new Function('$input', '$getWorkflowStaticData', '$', `"use strict";\n${code}`);
  const input = { first: () => ({ json }), item: { json } };
  return fn(input, () => store, () => ({ item: { json: route } }));
}

const evoMsg = (over = {}) => ({
  body: { data: { key: { remoteJid: SRC, fromMe: false, participant: '5511888888888@s.whatsapp.net' }, pushName: 'João', message: { conversation: 'Civic 2018 50mil km R$ 80.000' }, ...over } },
});
const metaMsg = (from, body = 'ok 1', type = 'text') => ({
  body: { entry: [{ changes: [{ value: { messages: [{ from, type, text: { body } }] } }] }] },
});

test('Evolution route: mensagem de grupo origem passa', () => {
  const out = run(routeEvolutionCode, { json: evoMsg() });
  assert.equal(out.length, 1);
  assert.equal(out[0].json.type, 'group_msg');
  assert.equal(out[0].json.pushName, 'João');
});

test('Evolution route: ignora fromMe, grupo desconhecido, DM e texto vazio', () => {
  assert.deepEqual(run(routeEvolutionCode, { json: evoMsg({ key: { remoteJid: SRC, fromMe: true } }) }), []);
  assert.deepEqual(run(routeEvolutionCode, { json: evoMsg({ key: { remoteJid: '1203@g.us', fromMe: false } }) }), []);
  assert.deepEqual(run(routeEvolutionCode, { json: evoMsg({ key: { remoteJid: '5511@s.whatsapp.net', fromMe: false } }) }), []);
  assert.deepEqual(run(routeEvolutionCode, { json: evoMsg({ message: {} }) }), []);
});

test('Meta route: texto do admin passa', () => {
  const out = run(routeMetaCode, { json: metaMsg(ADMIN, 'ok 3') });
  assert.equal(out.length, 1);
  assert.equal(out[0].json.text, 'ok 3');
});

test('Meta route: ignora outro remetente, não-texto e payload de status', () => {
  assert.deepEqual(run(routeMetaCode, { json: metaMsg('5511000000000') }), []);
  assert.deepEqual(run(routeMetaCode, { json: metaMsg(ADMIN, '', 'image') }), []);
  assert.deepEqual(run(routeMetaCode, { json: { body: { entry: [{ changes: [{ value: { statuses: [{}] } }] }] } } }), []);
  assert.deepEqual(run(routeMetaCode, { json: { body: {} } }), []);
});

test('Prepare: anúncio vira pendente e DM ao admin pelo canal meta', () => {
  const store = {};
  const route = { text: 'Civic 2018', pushName: 'João', sender: 'x', cfg: { admin: ADMIN } };
  const json = { candidates: [{ content: { parts: [{ text: JSON.stringify({ is_ad: true, marca: 'Honda', modelo: 'Civic', ano: '2018', preco: '80000' }) }] } }] };
  const out = run(prepareCode, { json, store, route });
  assert.equal(out.length, 1);
  assert.equal(out[0].json.channel, 'meta');
  assert.equal(out[0].json.to, ADMIN);
  assert.match(out[0].json.text, /#1/);
  assert.equal(store.pending[1].text, 'Civic 2018');
});

test('Prepare: não-anúncio e JSON inválido são descartados', () => {
  const route = { text: 't', cfg: { admin: ADMIN } };
  const mk = (t) => ({ candidates: [{ content: { parts: [{ text: t }] } }] });
  assert.deepEqual(run(prepareCode, { json: mk('{"is_ad":false}'), store: {}, route }), []);
  assert.deepEqual(run(prepareCode, { json: mk('lixo'), store: {}, route }), []);
});

const cfg = { admin: ADMIN, destGroups: [DST, '120363000000000003@g.us'] };
const withPending = () => ({ pending: { 1: { text: 'texto original' } } });

test('Admin: ok repassa aos grupos via evolution e confirma via meta', () => {
  const store = withPending();
  const out = run(adminCode, { json: { text: 'ok 1', cfg }, store });
  assert.equal(out.length, 3);
  assert.deepEqual(out.slice(0, 2).map((o) => [o.json.channel, o.json.number, o.json.text]),
    cfg.destGroups.map((g) => ['evolution', g, 'texto original']));
  assert.equal(out[2].json.channel, 'meta');
  assert.equal(out[2].json.to, ADMIN);
  assert.equal(store.pending[1], undefined);
});

test('Admin: editar usa texto novo; sem texto pede uso correto', () => {
  const out = run(adminCode, { json: { text: 'editar 1 Novo texto', cfg }, store: withPending() });
  assert.equal(out[0].json.text, 'Novo texto');
  const err = run(adminCode, { json: { text: 'editar 1', cfg }, store: withPending() });
  assert.equal(err.length, 1);
  assert.equal(err[0].json.channel, 'meta');
});

test('Admin: nao descarta; id inexistente avisa; comando inválido ignora', () => {
  const store = withPending();
  const no = run(adminCode, { json: { text: 'nao 1', cfg }, store });
  assert.equal(no.length, 1);
  assert.equal(store.pending[1], undefined);
  assert.match(run(adminCode, { json: { text: 'ok 9', cfg }, store })[0].json.text, /não encontrado/);
  assert.deepEqual(run(adminCode, { json: { text: 'oi', cfg }, store }), []);
});

test('workflow.json: tem webhooks Evolution e Meta e envio pelos dois canais', () => {
  const wf = JSON.parse(readFileSync(new URL('../n8n/workflow.json', import.meta.url), 'utf8'));
  const names = wf.nodes.map((n) => n.name);
  for (const n of ['Webhook Evolution', 'Webhook Meta', 'Webhook Meta Verify', 'Send Meta', 'Send Evolution']) {
    assert.ok(names.includes(n), `falta nó ${n}`);
  }
  const meta = wf.nodes.find((n) => n.name === 'Send Meta');
  assert.match(meta.parameters.url, /graph\.facebook\.com/);
  // toda conexão aponta para nó existente
  for (const [from, c] of Object.entries(wf.connections)) {
    assert.ok(names.includes(from));
    for (const branch of c.main) for (const l of branch) assert.ok(names.includes(l.node), `conexão para ${l.node}`);
  }
});
