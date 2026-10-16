import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getNode, wf } from '../helpers/n8n.mjs';

const n = getNode('WhatsApp Trigger');

test('WhatsApp Trigger: nó nativo, assinando o evento "messages"', () => {
  assert.equal(n.type, 'n8n-nodes-base.whatsAppTrigger');
  assert.deepEqual(n.parameters.updates, ['messages']);
});

test('WhatsApp Trigger: é gatilho (sem entrada) e liga em Route Meta', () => {
  const hasInput = Object.values(wf.connections).some((c) => c.main.flat().some((l) => l.node === n.name));
  assert.equal(hasInput, false);
  assert.equal(wf.connections[n.name].main[0][0].node, 'Route Meta');
});

test('WhatsApp Trigger: verificação da Meta é nativa (sem webhook GET/Respond manual)', () => {
  assert.equal(wf.nodes.some((x) => x.type === 'n8n-nodes-base.respondToWebhook'), false);
  assert.equal(wf.nodes.filter((x) => x.type === 'n8n-nodes-base.webhook').length, 1);
});
