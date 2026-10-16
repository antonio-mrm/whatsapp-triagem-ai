import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getNode, wf } from '../helpers/n8n.mjs';

const n = getNode('Webhook Evolution');

test('Webhook Evolution: POST em /evolution-wa', () => {
  assert.equal(n.type, 'n8n-nodes-base.webhook');
  assert.equal(n.parameters.httpMethod, 'POST');
  assert.equal(n.parameters.path, 'evolution-wa');
});

test('Webhook Evolution: é gatilho (sem entrada) e liga em Route', () => {
  const hasInput = Object.values(wf.connections).some((c) => c.main.flat().some((l) => l.node === n.name));
  assert.equal(hasInput, false);
  assert.equal(wf.connections[n.name].main[0][0].node, 'Route');
});
