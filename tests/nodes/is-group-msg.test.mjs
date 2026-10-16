import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getNode, wf } from '../helpers/n8n.mjs';

test('Is Group Msg: compara $json.type com "group_msg"', () => {
  const c = getNode('Is Group Msg').parameters.conditions.string[0];
  assert.equal(c.value1, '={{ $json.type }}');
  assert.equal(c.value2, 'group_msg');
});

test('Is Group Msg: true → Message a model; false não tem destino', () => {
  const [t, f] = wf.connections['Is Group Msg'].main;
  assert.equal(t[0].node, 'Message a model');
  assert.deepEqual(f, []);
});
