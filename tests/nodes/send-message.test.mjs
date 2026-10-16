import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getNode, evalExpr, cfg, ADMIN } from '../helpers/n8n.mjs';

const n = getNode('Send message');
const item = { channel: 'meta', kind: 'text', to: ADMIN, text: 'Olá "admin"\nlinha 2', cfg };

test('Send message: nó nativo WhatsApp Business Cloud, operação send', () => {
  assert.equal(n.type, 'n8n-nodes-base.whatsApp');
  assert.equal(n.parameters.operation, 'send');
});

test('Send message: usa phoneNumberId do cfg, destinatário e texto do item', () => {
  assert.equal(evalExpr(n.parameters.phoneNumberId, item), 'COLOQUE_PHONE_NUMBER_ID');
  assert.equal(evalExpr(n.parameters.recipientPhoneNumber, item), ADMIN);
  assert.equal(evalExpr(n.parameters.textBody, item), 'Olá "admin"\nlinha 2');
});
