// Corpo (string) dos nós Code do n8n + prompt do Gemini. Usado pelo build-workflow.mjs e pelos testes.
// Funções são embutidas no nó via Function.prototype.toString: devem ser autocontidas
// (sem imports/closures; só UF_DDDS e UF_REGION, que são injetadas junto).

// Mantenha igual nos dois nós de rota.
export const cfgBlock = `
// ===== CONFIG (edite aqui) =====
const cfg = {
  evolutionUrl: 'http://host.docker.internal:8080',
  instance: 'triagem',
  phoneNumberId: 'COLOQUE_PHONE_NUMBER_ID',
  graphVersion: 'v21.0',
  template: 'novo_anuncio',
  admin: '5511999999999', // número do admin, só dígitos (formato Cloud API)
  sourceGroups: ['120363000000000001@g.us'],
  destGroups: ['120363000000000002@g.us'],
  fipeToken: '', // opcional (Parallelum), aumenta o limite diário
  reminderTemplate: 'lembrete_janela', // template aprovado na Meta (sem variáveis)
  windowReminderAfterHours: 20, // horas sem msg do admin até lembrar de reabrir a janela de 24h
};
// ===============================
`;

const asNode = (...fns) => fns.map((f) => f.toString()).join('\n\n');

// ---------- Prompt do Gemini (texto original entra intacto; Gemini devolve JSON) ----------
export const geminiPromptPrefix = [
  'Você recebe uma mensagem de WhatsApp de grupo de repasse de veículos, em QUALQUER formatação.',
  'Decida se é um ANÚNCIO de veículo à venda. Se for, associe cada dado ao seu valor e responda SOMENTE um JSON (sem markdown) com as chaves:',
  'is_ad (boolean); nome_carro (marca + modelo + versão); marca; modelo (sem a versão); ano (número, ano do modelo); km (número inteiro);',
  'preco (número em reais, ex.: 80000); ipva_pago (true/false/null); revisoes_em_dia (true/false/null); combustivel (texto);',
  'combustivel_deduzido (true se não estava escrito e você deduziu pelo modelo); cidade_uf (ex.: "Campinas/SP");',
  'assumido (lista de strings com itens de conservação NÃO citados que você presumiu, ex.: "Pneus 80%", "Manual + Chave Reserva");',
  'loja (nome da loja/anunciante); contato_nome; contato_telefone (só dígitos com DDD).',
  'Use null quando a informação não existir. Nunca invente preço, km ou ano. Se não for anúncio responda {"is_ad": false}.',
  'Mensagem:\n"""',
].join('\n') + '\n';
export const geminiPromptSuffix = '\n"""';

const UF_DDDS = {
  SP: [11, 12, 13, 14, 15, 16, 17, 18, 19], RJ: [21, 22, 24], ES: [27, 28], MG: [31, 32, 33, 34, 35, 37, 38],
  PR: [41, 42, 43, 44, 45, 46], SC: [47, 48, 49], RS: [51, 53, 54, 55], DF: [61], GO: [62, 64], TO: [63],
  MT: [65, 66], MS: [67], AC: [68], RO: [69], BA: [71, 73, 74, 75, 77], SE: [79], PE: [81, 87], AL: [82], PB: [83],
  RN: [84], CE: [85, 88], PI: [86, 89], MA: [98, 99], PA: [91, 93, 94], AP: [96], AM: [92, 97], RR: [95],
};
const UF_REGION = {
  Norte: ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO'],
  Nordeste: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
  'Centro-Oeste': ['DF', 'GO', 'MT', 'MS'],
  Sudeste: ['ES', 'MG', 'RJ', 'SP'],
  Sul: ['PR', 'RS', 'SC'],
};
const tables = `const UF_DDDS = ${JSON.stringify(UF_DDDS)};\nconst UF_REGION = ${JSON.stringify(UF_REGION)};`;

// ---------- Helpers compartilhados (embutidos nos nós) ----------
function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const m = v.toLowerCase().match(/(\d[\d.,]*)\s*(mil|k)?/);
  if (!m) return null;
  let n = m[1];
  if (n.includes('.') && n.includes(',')) n = n.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(n)) n = n.replace(/\./g, '');
  else n = n.replace(',', '.');
  const x = parseFloat(n) * (m[2] ? 1000 : 1);
  return Number.isFinite(x) ? Math.round(x) : null;
}

function fmtNum(n) {
  return n == null ? null : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// ---------- Route (Evolution) ----------
export const routeCode = `${cfgBlock}
const body = $input.first().json.body ?? $input.first().json;
const d = body.data ?? {};
const key = d.key ?? {};
if (key.fromMe || !key.remoteJid) return [];
const m = d.message ?? {};
const text = m.conversation ?? m.extendedTextMessage?.text ?? m.imageMessage?.caption ?? m.videoMessage?.caption ?? '';
if (!text.trim()) return [];
const jid = key.remoteJid;
if (!cfg.sourceGroups.includes(jid)) return [];
const ts = Number(d.messageTimestamp?.low ?? d.messageTimestamp) || 0;
return [{ json: { type: 'group_msg', text, jid, sender: key.participant ?? '', pushName: d.pushName ?? '', ts, cfg } }];
`;

// ---------- Route Meta (Cloud API): texto, botão de template ou botão interativo ----------
export const routeMetaCode = `${cfgBlock}
const j = $input.first().json;
// WhatsApp Trigger entrega o "value" da Meta direto; webhook cru entrega entry[0].changes[0].value
const value = j.entry?.[0]?.changes?.[0]?.value ?? j.body?.entry?.[0]?.changes?.[0]?.value ?? j;
const msg = value.messages?.[0];
if (!msg) return [];
if (String(msg.from).replace(/\\D/g, '') !== cfg.admin) return [];
// janela de 24h da Cloud API: toda msg do admin reabre a janela
const store = $getWorkflowStaticData('global');
store.lastAdminAt = Date.now();
store.windowReminded = false;
let text = '';
let payload = '';
if (msg.type === 'text') text = msg.text?.body ?? '';
else if (msg.type === 'button') { payload = msg.button?.payload ?? ''; text = msg.button?.text ?? ''; }
else if (msg.type === 'interactive') {
  const r = msg.interactive?.button_reply ?? msg.interactive?.list_reply;
  payload = r?.id ?? ''; text = r?.title ?? '';
} else return [];
if (!text.trim() && !payload) return [];
return [{ json: { text, payload, cfg } }];
`;

// ---------- Prepare Admin Msg ----------
function parseGemini(out) {
  let raw = out?.content?.parts?.[0]?.text ?? out?.candidates?.[0]?.content?.parts?.[0]?.text ?? out?.text ?? out?.output;
  if (raw === undefined && out && typeof out === 'object' && 'is_ad' in out) raw = out;
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  } catch {
    return null;
  }
}

function norm(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function slug(s) {
  return norm(s).replace(/ /g, '-');
}

function regionLabel(cidadeUf, phone) {
  let uf = String(cidadeUf ?? '').trim().toUpperCase().match(/([A-Z]{2})$/)?.[1];
  if (!uf || !Object.values(UF_REGION).some((l) => l.includes(uf))) {
    uf = null;
    let d = String(phone ?? '').replace(/\D/g, '');
    if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
    const ddd = Number(d.slice(0, 2));
    for (const [k, list] of Object.entries(UF_DDDS)) if (list.includes(ddd)) uf = k;
  }
  if (!uf) return null;
  const region = Object.keys(UF_REGION).find((r) => UF_REGION[r].includes(uf));
  return region + ' (' + uf + ')';
}

async function fipeLookup(helpers, store, ad, cfg) {
  try {
    const base = 'https://fipe.parallelum.com.br/api/v2/cars';
    const headers = cfg.fipeToken ? { 'X-Subscription-Token': cfg.fipeToken } : {};
    const get = (path) => helpers.httpRequest({ method: 'GET', url: base + path, headers, json: true });
    const pick = (list, wanted) => {
      const want = norm(wanted).split(' ').filter(Boolean);
      if (!want.length) return null;
      let best = null;
      for (const it of list) {
        const name = norm(it.name).split(' ');
        const hits = want.filter((w) => name.includes(w)).length;
        if (hits < want.length) continue;
        if (!best || name.length < best.len) best = { it, len: name.length };
      }
      return best ? best.it : null;
    };
    if (!ad.marca || !ad.modelo || !ad.ano) return null;
    store.fipeBrands = store.fipeBrands ?? (await get('/brands'));
    const brand = pick(store.fipeBrands, ad.marca);
    if (!brand) return null;
    const models = await get('/brands/' + brand.code + '/models');
    const model = pick(models, ad.modelo);
    if (!model) return null;
    const years = await get('/brands/' + brand.code + '/models/' + model.code + '/years');
    const cands = years.filter((y) => String(y.name).startsWith(String(ad.ano)));
    if (!cands.length) return null;
    const fuel = norm(ad.combustivel).split(' ')[0];
    const year = cands.find((y) => fuel && norm(y.name).includes(fuel)) ?? cands[0];
    const r = await get('/brands/' + brand.code + '/models/' + model.code + '/years/' + year.code);
    return toNumber(String(r.price ?? '').replace(/^R\$\s*/, ''));
  } catch {
    return null;
  }
}

// Chave do "mesmo carro": marca + modelo + ano + km. Sem algum deles não dá para provar igualdade (null).
function dupKey(ad) {
  const km = toNumber(ad.km);
  const ano = toNumber(ad.ano);
  const marca = norm(ad.marca);
  const modelo = norm(ad.modelo);
  if (km == null || ano == null || !marca || !modelo) return null;
  return [marca, modelo, ano, km].join('|');
}

async function prepareMain($input, $, $getWorkflowStaticData, helpers) {
  const src = $('Route').first().json;
  const cfg = src.cfg;
  const ad = parseGemini($input.first().json);
  if (!ad || !ad.is_ad) return [];
  const store = $getWorkflowStaticData('global');
  store.pending = store.pending ?? {};
  store.seen = store.seen ?? {};
  const key = dupKey(ad);
  if (key && store.seen[key]) return [];
  store.counter = (store.counter ?? 0) + 1;
  const id = store.counter;
  if (key) store.seen[key] = { id, at: Date.now() };

  const one = (v) => {
    const s = String(v ?? '').replace(/\s+/g, ' ').trim();
    return s && s !== 'null' ? s : '—';
  };
  const preco = toNumber(ad.preco);
  const km = toNumber(ad.km);
  const fipe = await fipeLookup(helpers, store, ad, cfg);
  const sender = String(src.sender ?? '');
  const senderPhone = sender.endsWith('@lid') ? '' : sender.split('@')[0].replace(/\D/g, '');
  const phone = String(ad.contato_telefone ?? '').replace(/\D/g, '') || senderPhone;
  const nome = ad.nome_carro || [ad.marca, ad.modelo].filter(Boolean).join(' ');
  const dias = src.ts ? Math.max(0, Math.floor((Date.now() / 1000 - src.ts) / 86400)) : 0;
  const link = ad.marca && ad.modelo
    ? 'https://www.webmotors.com.br/carros/estoque/' + slug(ad.marca) + '/' + slug(ad.modelo)
    : null;
  const combustivel = ad.combustivel ? ad.combustivel + (ad.combustivel_deduzido ? ' (deduzido)' : '') : null;

  const vars = [
    nome,
    ad.ano,
    fmtNum(km),
    fmtNum(preco),
    fmtNum(fipe),
    ad.ipva_pago === true ? 'pago' : ad.ipva_pago === false ? 'não pago' : 'não informado',
    ad.revisoes_em_dia === true ? 'Revisões em dia' : ad.revisoes_em_dia === false ? 'Revisões pendentes' : 'Revisões não informadas',
    combustivel,
    regionLabel(ad.cidade_uf, phone),
    Array.isArray(ad.assumido) && ad.assumido.length ? ad.assumido.join(', ') : null,
    link,
    ad.loja,
    ad.contato_nome || src.pushName,
    phone,
    String(dias),
  ].map(one);

  store.pending[id] = {
    text: src.text,
    ad,
    preco,
    from: src.pushName || src.sender,
    at: Date.now(),
  };
  return [{
    json: {
      channel: 'meta', kind: 'template', id, to: cfg.admin, template: cfg.template, vars,
      payloads: ['approve:' + id, 'price:' + id, 'skip:' + id], cfg,
    },
  }];
}

export const prepareCode = `${tables}
${asNode(toNumber, fmtNum, parseGemini, norm, slug, regionLabel, fipeLookup, dupKey, prepareMain)}
return await prepareMain($input, $, $getWorkflowStaticData, this.helpers);
`;

// ---------- Handle Admin Reply ----------
function adminMain($input, $getWorkflowStaticData) {
  const { text, payload, cfg } = $input.first().json;
  const store = $getWorkflowStaticData('global');
  store.pending = store.pending ?? {};
  const toAdmin = (t) => ({ json: { channel: 'meta', kind: 'text', to: cfg.admin, text: t, cfg } });
  // Repassa aos grupos (sem feedback ao admin). Preço novo vira a 1ª linha do post.
  const publish = (id, price) => {
    const item = store.pending[id];
    const changed = price != null && price !== item.preco;
    const out = changed ? '💰 R$ ' + fmtNum(price) + '\n' + item.text : item.text;
    delete store.pending[id];
    if (store.awaiting === String(id)) store.awaiting = null;
    return cfg.destGroups.map((g) => ({ json: { channel: 'evolution', number: g, text: out, cfg } }));
  };
  const notFound = (id) => [toAdmin('Anúncio #' + id + ' não encontrado (já tratado?).')];
  const t = String(text ?? '').trim();

  // 1) botões (template / interativo)
  const bm = String(payload ?? '').match(/^(approve|price|skip):(\d+)$/);
  if (bm) {
    const id = bm[2];
    if (!store.pending[id]) return notFound(id);
    if (bm[1] === 'approve') return publish(id, null);
    if (bm[1] === 'skip') {
      delete store.pending[id];
      if (store.awaiting === id) store.awaiting = null;
      return [toAdmin('🗑️ #' + id + ' descartado.')];
    }
    store.awaiting = id;
    return [toAdmin('Informe o valor atualizado:')];
  }

  // 2) aguardando o valor do "Editar Preço": o próximo número já segue direto para o grupo
  const isCommand = /^(ok|sim|nao|não|n|editar)\s+#?\d+/i.test(t);
  if (store.awaiting && !isCommand) {
    const id = store.awaiting;
    if (!store.pending[id]) store.awaiting = null;
    else {
      const price = toNumber(t);
      if (price == null) return [toAdmin('Não entendi o valor. Informe o valor atualizado:')];
      return publish(id, price);
    }
  }

  // 3) comandos de texto (fallback)
  const mt = t.match(/^(ok|sim|nao|não|n|editar)\s+#?(\d+)\s*([\s\S]*)$/i);
  if (!mt) return [];
  const cmd = mt[1].toLowerCase();
  const id = mt[2];
  const item = store.pending[id];
  if (!item) return notFound(id);
  if (['nao', 'não', 'n'].includes(cmd)) {
    delete store.pending[id];
    return [toAdmin('🗑️ #' + id + ' descartado.')];
  }
  if (cmd === 'editar') {
    if (!mt[3].trim()) return [toAdmin('Use: editar ' + id + ' <novo texto>')];
    item.text = mt[3].trim();
  }
  return publish(id, null);
}

export const adminCode = `${asNode(toNumber, fmtNum, adminMain)}
return adminMain($input, $getWorkflowStaticData);
`;

// ---------- Window Check (Schedule): lembra o admin de reabrir a janela de 24h ----------
export const windowCode = `${cfgBlock}
const store = $getWorkflowStaticData('global');
if (!store.lastAdminAt || store.windowReminded) return [];
if (Date.now() - store.lastAdminAt < cfg.windowReminderAfterHours * 3600 * 1000) return [];
store.windowReminded = true;
return [{ json: { to: cfg.admin, template: cfg.reminderTemplate, cfg } }];
`;
