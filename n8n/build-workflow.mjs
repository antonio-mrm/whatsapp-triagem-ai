// Gera n8n/workflow.json (importar no n8n: Workflow > Import from file).
// Uso: node n8n/build-workflow.mjs
import { writeFileSync } from 'node:fs';
import { routeEvolutionCode, routeMetaCode, prepareCode, adminCode } from './code.mjs';

const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN ?? 'COLOQUE_VERIFY_TOKEN';

const geminiBody = `={{ JSON.stringify({
  contents: [{ parts: [{ text: 'Mensagem de grupo de repasse de veículos:\\n"""' + $json.text + '"""\\n\\nDecida se é um ANÚNCIO de veículo à venda/repasse. Se sim extraia os campos. Responda só JSON.' }] }],
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema: {
      type: 'OBJECT',
      properties: {
        is_ad: { type: 'BOOLEAN' },
        marca: { type: 'STRING' }, modelo: { type: 'STRING' }, ano: { type: 'STRING' },
        km: { type: 'STRING' }, preco: { type: 'STRING' }, contato: { type: 'STRING' },
        resumo: { type: 'STRING' }
      },
      required: ['is_ad']
    }
  }
}) }}`;

const node = (name, type, typeVersion, position, parameters, extra = {}) => ({
  id: name.toLowerCase().replace(/\W+/g, '-'), name, type, typeVersion, position, parameters, ...extra,
});

const header = { authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json' };

const nodes = [
  node('Webhook Evolution', 'n8n-nodes-base.webhook', 2, [0, 0], { httpMethod: 'POST', path: 'evolution-wa', options: {} }, { webhookId: 'evolution-wa' }),
  node('Route Evolution', 'n8n-nodes-base.code', 2, [220, 0], { jsCode: routeEvolutionCode }),
  node('Gemini', 'n8n-nodes-base.httpRequest', 4.2, [440, 0], {
    method: 'POST',
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    ...header,
    jsonBody: geminiBody,
    options: {},
  }, { retryOnFail: true, maxTries: 3 }),
  node('Prepare Admin Msg', 'n8n-nodes-base.code', 2, [660, 0], { jsCode: prepareCode }),

  node('Webhook Meta', 'n8n-nodes-base.webhook', 2, [0, 240], { httpMethod: 'POST', path: 'meta-wa', options: {} }, { webhookId: 'meta-wa' }),
  node('Route Meta', 'n8n-nodes-base.code', 2, [220, 240], { jsCode: routeMetaCode }),
  node('Handle Admin Reply', 'n8n-nodes-base.code', 2, [440, 240], { jsCode: adminCode }),

  node('Webhook Meta Verify', 'n8n-nodes-base.webhook', 2, [0, 480], { httpMethod: 'GET', path: 'meta-wa', responseMode: 'responseNode', options: {} }, { webhookId: 'meta-wa-verify' }),
  node('Respond Challenge', 'n8n-nodes-base.respondToWebhook', 1.1, [220, 480], {
    respondWith: 'text',
    responseBody: `={{ $json.query['hub.verify_token'] === '${VERIFY_TOKEN}' ? $json.query['hub.challenge'] : '' }}`,
    options: {},
  }),

  node('Is Meta Channel', 'n8n-nodes-base.if', 1, [900, 120], {
    conditions: { string: [{ value1: '={{ $json.channel }}', value2: 'meta' }] },
  }),
  node('Send Meta', 'n8n-nodes-base.httpRequest', 4.2, [1120, 40], {
    method: 'POST',
    url: '=https://graph.facebook.com/{{ $json.cfg.graphVersion }}/{{ $json.cfg.phoneNumberId }}/messages',
    ...header,
    jsonBody: '={{ JSON.stringify({ messaging_product: "whatsapp", to: $json.to, type: "text", text: { body: $json.text } }) }}',
    options: {},
  }),
  node('Send Evolution', 'n8n-nodes-base.httpRequest', 4.2, [1120, 220], {
    method: 'POST',
    url: '={{ $json.cfg.evolutionUrl }}/message/sendText/{{ $json.cfg.instance }}',
    ...header,
    jsonBody: '={{ JSON.stringify({ number: $json.number, text: $json.text }) }}',
    options: { batching: { batch: { batchSize: 1, batchInterval: 3000 } } },
  }),
];

const link = (to) => [{ node: to, type: 'main', index: 0 }];
const connections = {
  'Webhook Evolution': { main: [link('Route Evolution')] },
  'Route Evolution': { main: [link('Gemini')] },
  Gemini: { main: [link('Prepare Admin Msg')] },
  'Prepare Admin Msg': { main: [link('Is Meta Channel')] },
  'Webhook Meta': { main: [link('Route Meta')] },
  'Route Meta': { main: [link('Handle Admin Reply')] },
  'Handle Admin Reply': { main: [link('Is Meta Channel')] },
  'Webhook Meta Verify': { main: [link('Respond Challenge')] },
  'Is Meta Channel': { main: [link('Send Meta'), link('Send Evolution')] },
};

writeFileSync(new URL('./workflow.json', import.meta.url), JSON.stringify({
  name: 'WhatsApp Triagem AI', nodes, connections, settings: { executionOrder: 'v1' },
}, null, 2));
console.log('ok: n8n/workflow.json');
