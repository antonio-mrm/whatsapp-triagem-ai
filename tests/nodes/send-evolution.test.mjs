import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getNode, evalExpr, cfg, DST } from '../helpers/n8n.mjs';

const n = getNode('Send Evolution');
const item = { channel: 'evolution', number: DST, text: 'Civic 2018\n"top"', cfg };

test('Send Evolution: POST em /message/sendText/<instância>', () => {
  assert.equal(n.parameters.method, 'POST');
  assert.equal(evalExpr(n.parameters.url, item), 'http://host.docker.internal:8080/message/sendText/triagem');
});

test('Send Evolution: corpo com number do grupo e text', () => {
  assert.deepEqual(JSON.parse(evalExpr(n.parameters.jsonBody, item)), { number: DST, text: 'Civic 2018\n"top"' });
});

test('Send Evolution: envia 1 por vez com intervalo de 3s (anti-ban)', () => {
  assert.deepEqual(n.parameters.options.batching.batch, { batchSize: 1, batchInterval: 3000 });
});

test('Send Evolution: autenticação Header Auth (apikey)', () => {
  assert.equal(n.parameters.genericAuthType, 'httpHeaderAuth');
});
