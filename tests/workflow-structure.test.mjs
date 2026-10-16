import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { wf } from './helpers/n8n.mjs';

const names = wf.nodes.map((n) => n.name);
const exported = JSON.parse(readFileSync(new URL('../n8n/n8n-export.json', import.meta.url), 'utf8'));

test('Workflow: nomes de nós únicos', () => {
  assert.equal(new Set(names).size, names.length);
});

test('Workflow: contém os 12 blocos esperados', () => {
  const expected = ['Webhook Evolution', 'Route', 'Is Group Msg', 'Message a model', 'Prepare Admin Msg', 'Send card',
    'WhatsApp Trigger', 'Route Meta', 'Handle Admin Reply', 'Is Meta Channel', 'Send message', 'Send Evolution'];
  for (const n of expected) assert.ok(names.includes(n), `falta ${n}`);
  assert.equal(names.length, expected.length);
});

test('Workflow: fluxo principal segue o desenhado no n8n', () => {
  const chain = ['Webhook Evolution', 'Route', 'Is Group Msg', 'Message a model', 'Prepare Admin Msg', 'Send card'];
  for (let i = 0; i < chain.length - 1; i++) {
    assert.equal(wf.connections[chain[i]].main[0][0].node, chain[i + 1], `${chain[i]} → ${chain[i + 1]}`);
  }
});

test('Workflow: nós nativos preservam tipo, versão e modelo do export do n8n', () => {
  for (const name of ['Message a model', 'Send message']) {
    const a = wf.nodes.find((n) => n.name === name);
    const b = exported.nodes.find((n) => n.name === name);
    assert.equal(a.type, b.type);
    assert.equal(a.typeVersion, b.typeVersion);
    assert.deepEqual(a.credentials, b.credentials);
  }
  assert.deepEqual(wf.nodes.find((n) => n.name === 'Message a model').parameters.modelId,
    exported.nodes.find((n) => n.name === 'Message a model').parameters.modelId);
});

test('Workflow: toda conexão aponta para nós existentes', () => {
  for (const [from, c] of Object.entries(wf.connections)) {
    assert.ok(names.includes(from));
    for (const l of c.main.flat()) assert.ok(names.includes(l.node), `conexão para ${l.node}`);
  }
});

test('Workflow: nenhum nó órfão (todos têm entrada ou são gatilho)', () => {
  const targets = new Set(Object.values(wf.connections).flatMap((c) => c.main.flat().map((l) => l.node)));
  for (const n of wf.nodes) assert.ok(targets.has(n.name) || /\.(webhook|whatsAppTrigger)$/.test(n.type), `órfão: ${n.name}`);
});

test('Workflow: nós Code não usam .item (indisponível em "all items")', () => {
  for (const n of wf.nodes.filter((x) => x.type.endsWith('.code'))) assert.doesNotMatch(n.parameters.jsCode, /\$input\.item|\)\.item\b/);
});

test('Workflow: blocos CONFIG dos dois Route são idênticos', () => {
  const cfgOf = (n) => wf.nodes.find((x) => x.name === n).parameters.jsCode.match(/const cfg = \{[\s\S]*?\n\};/)[0];
  assert.equal(cfgOf('Route'), cfgOf('Route Meta'));
});

test('Workflow: todo código dos nós Code compila (sintaxe)', () => {
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  for (const n of wf.nodes.filter((x) => x.type.endsWith('.code'))) {
    assert.doesNotThrow(() => new AsyncFunction('$input', '$getWorkflowStaticData', '$', n.parameters.jsCode), n.name);
  }
});
