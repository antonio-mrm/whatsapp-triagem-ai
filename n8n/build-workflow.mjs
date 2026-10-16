// Gera n8n/workflow.json (importar no n8n: Workflow > Import from file).
// Uso: node n8n/build-workflow.mjs
import { writeFileSync } from 'node:fs';

const routeCode = `
// ===== CONFIG (edite aqui) =====
const cfg = {
  evolutionUrl: 'http://host.docker.internal:8080',
  instance: 'triagem',
  admin: '5511999999999@s.whatsapp.net',
  sourceGroups: ['120363000000000001@g.us'],
  destGroups: ['120363000000000002@g.us'],
};
// ===============================
const body = $input.first().json.body ?? $input.first().json;
const d = body.data ?? {};
const key = d.key ?? {};
if (key.fromMe || !key.remoteJid) return [];
const m = d.message ?? {};
const text = m.conversation ?? m.extendedTextMessage?.text ?? m.imageMessage?.caption ?? m.videoMessage?.caption ?? '';
if (!text.trim()) return [];
const jid = key.remoteJid;
if (jid === cfg.admin) return [{ json: { type: 'admin', text, cfg } }];
if (cfg.sourceGroups.includes(jid)) {
  return [{ json: { type: 'group_msg', text, jid, sender: key.participant ?? '', pushName: d.pushName ?? '', cfg } }];
}
return [];
`;

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

const prepareCode = `
const src = $('Route').item.json;
const raw = $input.item.json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
let ad; try { ad = JSON.parse(raw); } catch { return []; }
if (!ad.is_ad) return [];
const store = $getWorkflowStaticData('global');
store.pending = store.pending ?? {};
store.counter = (store.counter ?? 0) + 1;
const id = store.counter;
store.pending[id] = { text: src.text, ad, from: src.pushName || src.sender, at: Date.now() };
const msg = [
  '🚗 *Novo anúncio #' + id + '*',
  'De: ' + (src.pushName || src.sender),
  ad.marca || ad.modelo ? 'Veículo: ' + [ad.marca, ad.modelo, ad.ano].filter(Boolean).join(' ') : '',
  ad.km ? 'KM: ' + ad.km : '',
  ad.preco ? 'Preço: ' + ad.preco : '',
  ad.contato ? 'Contato: ' + ad.contato : '',
  '',
  '--- texto original ---',
  src.text,
  '',
  'Responda:',
  '*ok ' + id + '*  → repassar',
  '*nao ' + id + '*  → descartar',
  '*editar ' + id + ' novo texto*  → repassar com seu texto',
].filter((l) => l !== '').join('\\n');
return [{ json: { number: src.cfg.admin, text: msg, cfg: src.cfg } }];
`;

const adminCode = `
const { text, cfg } = $input.item.json;
const store = $getWorkflowStaticData('global');
store.pending = store.pending ?? {};
const toAdmin = (t) => ({ json: { number: cfg.admin, text: t, cfg } });
const mt = text.trim().match(/^(ok|sim|nao|não|n|editar)\\s+#?(\\d+)\\s*([\\s\\S]*)$/i);
if (!mt) return [];
const cmd = mt[1].toLowerCase();
const id = mt[2];
const item = store.pending[id];
if (!item) return [toAdmin('Anúncio #' + id + ' não encontrado (já tratado?).')];
if (['nao', 'não', 'n'].includes(cmd)) {
  delete store.pending[id];
  return [toAdmin('🗑️ #' + id + ' descartado.')];
}
let out = item.text;
if (cmd === 'editar') {
  if (!mt[3].trim()) return [toAdmin('Use: editar ' + id + ' <novo texto>')];
  out = mt[3].trim();
}
delete store.pending[id];
const sends = cfg.destGroups.map((g) => ({ json: { number: g, text: out, cfg } }));
sends.push(toAdmin('✅ #' + id + ' repassado para ' + cfg.destGroups.length + ' grupo(s).'));
return sends;
`;

const node = (name, type, typeVersion, position, parameters, extra = {}) => ({
  id: name.toLowerCase().replace(/\W+/g, '-'), name, type, typeVersion, position, parameters, ...extra,
});

const nodes = [
  node('Webhook Evolution', 'n8n-nodes-base.webhook', 2, [0, 0], { httpMethod: 'POST', path: 'evolution-wa', options: {} }, { webhookId: 'evolution-wa' }),
  node('Route', 'n8n-nodes-base.code', 2, [220, 0], { jsCode: routeCode }),
  node('Is Group Msg', 'n8n-nodes-base.if', 1, [440, 0], {
    conditions: { string: [{ value1: '={{ $json.type }}', value2: 'group_msg' }] },
  }),
  node('Gemini', 'n8n-nodes-base.httpRequest', 4.2, [660, -120], {
    method: 'POST',
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendBody: true,
    specifyBody: 'json',
    jsonBody: geminiBody,
    options: {},
  }, { retryOnFail: true, maxTries: 3 }),
  node('Prepare Admin Msg', 'n8n-nodes-base.code', 2, [880, -120], { jsCode: prepareCode }),
  node('Handle Admin Reply', 'n8n-nodes-base.code', 2, [660, 120], { jsCode: adminCode }),
  node('Send', 'n8n-nodes-base.httpRequest', 4.2, [1100, 0], {
    method: 'POST',
    url: '={{ $json.cfg.evolutionUrl }}/message/sendText/{{ $json.cfg.instance }}',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '={{ JSON.stringify({ number: $json.number, text: $json.text }) }}',
    options: { batching: { batch: { batchSize: 1, batchInterval: 3000 } } },
  }),
];

const link = (to) => [{ node: to, type: 'main', index: 0 }];
const connections = {
  'Webhook Evolution': { main: [link('Route')] },
  Route: { main: [link('Is Group Msg')] },
  'Is Group Msg': { main: [link('Gemini'), link('Handle Admin Reply')] },
  Gemini: { main: [link('Prepare Admin Msg')] },
  'Prepare Admin Msg': { main: [link('Send')] },
  'Handle Admin Reply': { main: [link('Send')] },
};

writeFileSync(new URL('./workflow.json', import.meta.url), JSON.stringify({
  name: 'WhatsApp Triagem AI', nodes, connections, settings: { executionOrder: 'v1' },
}, null, 2));
console.log('ok: n8n/workflow.json');
