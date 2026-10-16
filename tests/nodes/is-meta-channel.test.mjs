import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, getNode, wf, cfg, ADMIN, DST } from '../helpers/n8n.mjs';

test('Is Meta Channel: compara $json.channel com "meta"', () => {
  const c = getNode('Is Meta Channel').parameters.conditions.string[0];
  assert.equal(c.value1, '={{ $json.channel }}');
  assert.equal(c.value2, 'meta');
});

test('Is Meta Channel: true → Send message (WhatsApp), false → Send Evolution', () => {
  const [t, f] = wf.connections['Is Meta Channel'].main;
  assert.equal(t[0].node, 'Send message');
  assert.equal(f[0].node, 'Send Evolution');
});

test('Is Meta Channel: roteia item meta e evolution para o envio certo', async () => {
  const names = async (json) => (await simulate('Is Meta Channel', json)).calls.map((c) => c.node);
  assert.deepEqual(await names({ channel: 'meta', to: ADMIN, text: 'x', cfg }), ['Send message']);
  assert.deepEqual(await names({ channel: 'evolution', number: DST, text: 'x', cfg }), ['Send Evolution']);
});
