// Utilitários para testar cada nó do n8n/workflow.json (artefato gerado) sem subir o n8n.
import { readFileSync } from 'node:fs';

export const wf = JSON.parse(readFileSync(new URL('../../n8n/workflow.json', import.meta.url), 'utf8'));

// Valores do bloco CONFIG padrão dos nós de rota.
export const ADMIN = '5511999999999';
export const SRC = '120363000000000001@g.us';
export const DST = '120363000000000002@g.us';
export const cfg = {
  evolutionUrl: 'http://host.docker.internal:8080',
  instance: 'triagem',
  phoneNumberId: 'COLOQUE_PHONE_NUMBER_ID',
  graphVersion: 'v21.0',
  template: 'novo_anuncio',
  admin: ADMIN,
  sourceGroups: [SRC],
  destGroups: [DST],
  fipeToken: '',
};

export const getNode = (name) => {
  const n = wf.nodes.find((x) => x.name === name);
  if (!n) throw new Error(`nó não existe: ${name}`);
  return n;
};

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

// Executa o jsCode de um nó Code. `prev` = saída de nós anteriores, por nome ($('Nome').first().json).
// `helpers` = this.helpers do n8n (ex.: httpRequest falso). Retorna Promise só se o nó usa await.
export function runCode(name, { json, store = {}, prev = {}, helpers = {} } = {}) {
  const code = getNode(name).parameters.jsCode;
  const Ctor = /\bawait\b/.test(code) ? AsyncFunction : Function;
  const fn = new Ctor('$input', '$getWorkflowStaticData', '$', `"use strict";\n${code}`);
  const input = { first: () => ({ json }) };
  const ref = (n) => ({ first: () => ({ json: prev[n] }) });
  return fn.call({ helpers }, input, () => store, ref);
}

// Avalia string de expressão n8n ("={{ ... }}" ou texto com {{ ... }}).
export function evalExpr(str, json) {
  if (typeof str !== 'string' || !str.startsWith('=')) return str;
  return str.slice(1).replace(/\{\{([\s\S]*?)\}\}\s*(?=$|[^}])/g, (_, e) => {
    const v = new Function('$json', `return (${e});`)(json);
    return typeof v === 'string' ? v : String(v);
  });
}

// Fixtures de payloads.
export const evoPayload = (data = {}) => ({
  body: { data: { key: { remoteJid: SRC, fromMe: false, participant: '5511888888888@s.whatsapp.net' }, pushName: 'João', messageTimestamp: Math.floor(Date.now() / 1000), message: { conversation: 'Civic 2018 50mil km R$ 80.000' }, ...data } },
});
export const metaPayload = (from = ADMIN, body = 'ok 1', type = 'text') => ({
  body: { entry: [{ changes: [{ value: { messages: [{ from, type, text: { body } }] } }] }] },
});
export const metaButton = (payload, text = 'botão') => ({
  body: { entry: [{ changes: [{ value: { messages: [{ from: ADMIN, type: 'button', button: { payload, text } }] } }] }] },
});
export const metaInteractive = (id, title = 'botão') => ({
  body: { entry: [{ changes: [{ value: { messages: [{ from: ADMIN, type: 'interactive', interactive: { type: 'button_reply', button_reply: { id, title } } }] } }] }] },
});

// O WhatsApp Trigger do n8n entrega só o "value" da Meta (sem entry/changes).
export const asTrigger = (p) => p.body.entry[0].changes[0].value;

// Saída do nó nativo "Message a model" (formato simplificado) e do formato cru da API.
export const geminiNative = (obj) => ({ content: { parts: [{ text: typeof obj === 'string' ? obj : JSON.stringify(obj) }], role: 'model' } });
export const geminiResp = (obj) => ({ candidates: [{ content: { parts: [{ text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] } }] });

// Anúncio típico devolvido pelo Gemini.
export const AD = {
  is_ad: true, nome_carro: 'Honda Civic EXL', marca: 'Honda', modelo: 'Civic', ano: 2018, km: 50000, preco: 80000,
  ipva_pago: true, revisoes_em_dia: true, combustivel: 'Flex', combustivel_deduzido: true, cidade_uf: 'Campinas/SP',
  assumido: ['Pneus 80%', 'Manual + Chave Reserva'], loja: 'Loja Exemplo', contato_nome: 'João', contato_telefone: '19988887777',
};

// httpRequest falso para a API FIPE: rotas por sufixo de URL (mais longo primeiro).
export function fakeHttp(routes) {
  const calls = [];
  const httpRequest = async ({ url, headers }) => {
    calls.push({ url, headers });
    const path = url.replace('https://fipe.parallelum.com.br/api/v2/cars', '');
    const hit = routes[path];
    if (hit instanceof Error) throw hit;
    if (hit === undefined) throw new Error(`sem rota: ${path}`);
    return hit;
  };
  return { helpers: { httpRequest }, calls };
}

export const FIPE_OK = {
  '/brands': [{ code: '1', name: 'Fiat' }, { code: '25', name: 'Honda' }],
  '/brands/25/models': [{ code: '500', name: 'Civic Sedan EXL 2.0 Flex 16V' }, { code: '501', name: 'Civic' }, { code: '502', name: 'City LX' }],
  '/brands/25/models/501/years': [{ code: '2018-1', name: '2018 Gasolina' }, { code: '2017-1', name: '2017 Gasolina' }],
  '/brands/25/models/501/years/2018-1': { price: 'R$ 75.000,00' },
};

// Executor mínimo do grafo: percorre conexões, roda Code/IF, simula Gemini e registra envios.
export async function simulate(startNode, json, { store = {}, gemini = geminiNative({ is_ad: false }), helpers = {} } = {}) {
  const calls = [];
  const visit = async (name, item, prev) => {
    const node = getNode(name);
    let outs; // array de saídas: cada uma = lista de itens
    switch (node.type) {
      case 'n8n-nodes-base.webhook':
      case 'n8n-nodes-base.whatsAppTrigger': outs = [[item]]; break;
      case 'n8n-nodes-base.code': outs = [((await runCode(name, { json: item, store, prev, helpers })) ?? []).map((i) => i.json)]; break;
      case 'n8n-nodes-base.if': {
        const c = node.parameters.conditions.string[0];
        const ok = evalExpr(c.value1, item) === c.value2;
        outs = ok ? [[item], []] : [[], [item]];
        break;
      }
      case 'n8n-nodes-base.respondToWebhook':
        calls.push({ node: name, body: evalExpr(node.parameters.responseBody, item) });
        return;
      case '@n8n/n8n-nodes-langchain.googleGemini':
        calls.push({ node: name, prompt: evalExpr(node.parameters.messages.values[0].content, item) });
        outs = [[gemini]];
        break;
      case 'n8n-nodes-base.whatsApp':
        calls.push({
          node: name,
          phoneNumberId: evalExpr(node.parameters.phoneNumberId, item),
          to: evalExpr(node.parameters.recipientPhoneNumber, item),
          text: evalExpr(node.parameters.textBody, item),
        });
        return;
      case 'n8n-nodes-base.httpRequest':
        calls.push({ node: name, url: evalExpr(node.parameters.url, item), body: JSON.parse(evalExpr(node.parameters.jsonBody, item)) });
        return;
      default: throw new Error(`tipo não suportado: ${node.type}`);
    }
    const next = { ...prev, [name]: item };
    for (const [idx, targets] of (wf.connections[name]?.main ?? []).entries()) {
      for (const t of targets) for (const it of outs[idx] ?? []) await visit(t.node, it, { ...next, [name]: it });
    }
  };
  await visit(startNode, json, {});
  return { calls, store };
}
