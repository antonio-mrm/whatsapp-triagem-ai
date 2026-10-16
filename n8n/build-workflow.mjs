// Gera n8n/workflow.json (importar no n8n: Workflow > Import from file).
// Uso: node n8n/build-workflow.mjs
// Os nós nativos (Gemini e WhatsApp) partem de n8n/n8n-export.json (export do n8n do usuário):
// preserva type, typeVersion, posição, ids, credenciais e modelo; só sobrescreve os parâmetros.
import { readFileSync, writeFileSync } from 'node:fs';
import { routeCode, routeMetaCode, prepareCode, adminCode, windowCode, geminiPromptPrefix, geminiPromptSuffix } from './code.mjs';

const exported = JSON.parse(readFileSync(new URL('./n8n-export.json', import.meta.url), 'utf8'));
const fromExport = (name) => {
  const n = exported.nodes.find((x) => x.name === name);
  if (!n) throw new Error(`n8n-export.json não tem o nó "${name}"`);
  return structuredClone(n);
};

// Nó nativo: mantém tudo do export, troca/mescla só os parâmetros.
const native = (name, parameters) => {
  const n = fromExport(name);
  n.parameters = { ...n.parameters, ...parameters };
  return n;
};
const node = (name, type, typeVersion, position, parameters, extra = {}) => ({
  id: name.toLowerCase().replace(/\W+/g, '-'), name, type, typeVersion, position, parameters, ...extra,
});
const withCode = (name, jsCode) => ({ ...fromExport(name), parameters: { jsCode } });

// ---- Gemini nativo: texto original entra intacto; resposta é JSON ----
const geminiContent = `={{ ${JSON.stringify(geminiPromptPrefix)} + $json.text + ${JSON.stringify(geminiPromptSuffix)} }}`;

// ---- Card com 3 botões (template quick-reply, payload dinâmico com o id do anúncio) ----
const cardBody = '={{ JSON.stringify({ messaging_product: "whatsapp", to: $json.to, type: "template", '
  + 'template: { name: $json.template, language: { code: "pt_BR" }, components: [ '
  + '{ type: "body", parameters: $json.vars.map((v) => ({ type: "text", text: v })) }, '
  + '...$json.payloads.map((p, i) => ({ type: "button", sub_type: "quick_reply", index: String(i), parameters: [ { type: "payload", payload: p } ] })) '
  + '] } }) }}';

const sendMessage = native('Send message', {
  resource: 'message',
  operation: 'send',
  phoneNumberId: '={{ $json.cfg.phoneNumberId }}',
  recipientPhoneNumber: '={{ $json.to }}',
  textBody: '={{ $json.text }}',
});
sendMessage.position = [400, 240]; // ramo do admin (texto); o card usa "Send card"

const nodes = [
  // ----- Ramo 1: grupos (Evolution) → Gemini → card ao admin -----
  fromExport('Webhook Evolution'),
  withCode('Route', routeCode),
  fromExport('Is Group Msg'),
  native('Message a model', { messages: { values: [{ content: geminiContent }] } }),
  withCode('Prepare Admin Msg', prepareCode),
  node('Send card', 'n8n-nodes-base.httpRequest', 4.2, [608, -96], {
    method: 'POST',
    url: '=https://graph.facebook.com/{{ $json.cfg.graphVersion }}/{{ $json.cfg.phoneNumberId }}/messages',
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'whatsAppApi',
    sendBody: true,
    specifyBody: 'json',
    jsonBody: cardBody,
    options: {},
  }),

  // ----- Ramo 2: respostas do admin (WhatsApp Trigger nativo, já trata a verificação da Meta) -----
  node('WhatsApp Trigger', 'n8n-nodes-base.whatsAppTrigger', 1, [-544, 320], { updates: ['messages'], options: {} }, { webhookId: 'whatsapp-trigger' }),
  node('Route Meta', 'n8n-nodes-base.code', 2, [-320, 320], { jsCode: routeMetaCode }),
  node('Handle Admin Reply', 'n8n-nodes-base.code', 2, [-96, 320], { jsCode: adminCode }),
  node('Is Meta Channel', 'n8n-nodes-base.if', 1, [128, 320], {
    conditions: { string: [{ value1: '={{ $json.channel }}', value2: 'meta' }] },
  }),
  sendMessage,
  node('Send Evolution', 'n8n-nodes-base.httpRequest', 4.2, [400, 440], {
    method: 'POST',
    url: '={{ $json.cfg.evolutionUrl }}/message/sendText/{{ $json.cfg.instance }}',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '={{ JSON.stringify({ number: $json.number, text: $json.text }) }}',
    options: { batching: { batch: { batchSize: 1, batchInterval: 3000 } } },
  }),

  // ----- Ramo 3: lembrete para manter a janela de 24h da Cloud API aberta -----
  node('Schedule Trigger', 'n8n-nodes-base.scheduleTrigger', 1.2, [-544, 640], {
    rule: { interval: [{ field: 'hours', hoursInterval: 1 }] },
  }),
  node('Window Check', 'n8n-nodes-base.code', 2, [-320, 640], { jsCode: windowCode }),
  node('Send reminder', 'n8n-nodes-base.httpRequest', 4.2, [-96, 640], {
    method: 'POST',
    url: '=https://graph.facebook.com/{{ $json.cfg.graphVersion }}/{{ $json.cfg.phoneNumberId }}/messages',
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'whatsAppApi',
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '={{ JSON.stringify({ messaging_product: "whatsapp", to: $json.to, type: "template", '
      + 'template: { name: $json.template, language: { code: "pt_BR" } } }) }}',
    options: {},
  }, { credentials: fromExport('Send message').credentials }),
];

const link = (to) => [{ node: to, type: 'main', index: 0 }];
const connections = {
  'Webhook Evolution': { main: [link('Route')] },
  Route: { main: [link('Is Group Msg')] },
  'Is Group Msg': { main: [link('Message a model'), []] },
  'Message a model': { main: [link('Prepare Admin Msg')] },
  'Prepare Admin Msg': { main: [link('Send card')] },
  'WhatsApp Trigger': { main: [link('Route Meta')] },
  'Route Meta': { main: [link('Handle Admin Reply')] },
  'Handle Admin Reply': { main: [link('Is Meta Channel')] },
  'Is Meta Channel': { main: [link('Send message'), link('Send Evolution')] },
  'Schedule Trigger': { main: [link('Window Check')] },
  'Window Check': { main: [link('Send reminder')] },
};

writeFileSync(new URL('./workflow.json', import.meta.url), JSON.stringify({
  name: exported.name ?? 'WhatsApp Triagem AI', nodes, connections, settings: exported.settings ?? { executionOrder: 'v1' },
}, null, 2));
console.log('ok: n8n/workflow.json');
