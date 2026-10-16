import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getNode, evalExpr, cfg, ADMIN, wf } from '../helpers/n8n.mjs';

const n = getNode('Send card');
const vars = Array.from({ length: 15 }, (_, i) => `v${i + 1}`);
const item = { channel: 'meta', kind: 'template', id: 7, to: ADMIN, template: 'novo_anuncio', vars, payloads: ['approve:7', 'price:7', 'skip:7'], cfg };
const body = () => JSON.parse(evalExpr(n.parameters.jsonBody, item));

test('Send card: POST na Graph API com versão e phoneNumberId do cfg', () => {
  assert.equal(n.parameters.method, 'POST');
  assert.equal(evalExpr(n.parameters.url, item), 'https://graph.facebook.com/v21.0/COLOQUE_PHONE_NUMBER_ID/messages');
});

test('Send card: usa a credencial WhatsApp do n8n', () => {
  assert.equal(n.parameters.authentication, 'predefinedCredentialType');
  assert.equal(n.parameters.nodeCredentialType, 'whatsAppApi');
});

test('Send card: corpo é template pt_BR com as 15 variáveis de texto', () => {
  const b = body();
  assert.equal(b.messaging_product, 'whatsapp');
  assert.equal(b.to, ADMIN);
  assert.equal(b.type, 'template');
  assert.equal(b.template.name, 'novo_anuncio');
  assert.equal(b.template.language.code, 'pt_BR');
  const bodyComp = b.template.components.find((c) => c.type === 'body');
  assert.deepEqual(bodyComp.parameters, vars.map((text) => ({ type: 'text', text })));
});

test('Send card: 3 botões quick-reply (Aprovar, Editar Preço, Passar) com payload do anúncio', () => {
  const buttons = body().template.components.filter((c) => c.type === 'button');
  assert.equal(buttons.length, 3);
  assert.deepEqual(buttons.map((b) => [b.sub_type, b.index, b.parameters[0].type, b.parameters[0].payload]), [
    ['quick_reply', '0', 'payload', 'approve:7'],
    ['quick_reply', '1', 'payload', 'price:7'],
    ['quick_reply', '2', 'payload', 'skip:7'],
  ]);
});

test('Send card: recebe de Prepare Admin Msg e é o fim do ramo', () => {
  assert.equal(wf.connections['Prepare Admin Msg'].main[0][0].node, 'Send card');
  assert.equal(wf.connections['Send card'], undefined);
});
