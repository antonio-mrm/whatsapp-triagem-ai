// Corpo (string) dos nós Code do n8n. Usado pelo build-workflow.mjs e pelos testes.

// Mantenha igual nos dois nós de rota.
const cfgBlock = `
// ===== CONFIG (edite aqui) =====
const cfg = {
  evolutionUrl: 'http://host.docker.internal:8080',
  instance: 'triagem',
  graphVersion: 'v21.0',
  phoneNumberId: 'COLOQUE_PHONE_NUMBER_ID',
  admin: '5511999999999', // número do admin, só dígitos (formato Cloud API)
  sourceGroups: ['120363000000000001@g.us'],
  destGroups: ['120363000000000002@g.us'],
};
// ===============================
`;

// Evolution (Baileys): só lê grupos de origem.
export const routeEvolutionCode = `${cfgBlock}
const body = $input.first().json.body ?? $input.first().json;
const d = body.data ?? {};
const key = d.key ?? {};
if (key.fromMe || !key.remoteJid) return [];
const m = d.message ?? {};
const text = m.conversation ?? m.extendedTextMessage?.text ?? m.imageMessage?.caption ?? m.videoMessage?.caption ?? '';
if (!text.trim()) return [];
const jid = key.remoteJid;
if (!cfg.sourceGroups.includes(jid)) return [];
return [{ json: { type: 'group_msg', text, jid, sender: key.participant ?? '', pushName: d.pushName ?? '', cfg } }];
`;

// Cloud API oficial da Meta: só aceita texto do admin.
export const routeMetaCode = `${cfgBlock}
const body = $input.first().json.body ?? $input.first().json;
const msg = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
if (!msg || msg.type !== 'text') return [];
if (String(msg.from).replace(/\\D/g, '') !== cfg.admin) return [];
const text = msg.text?.body ?? '';
if (!text.trim()) return [];
return [{ json: { text, cfg } }];
`;

export const prepareCode = `
const src = $('Route Evolution').item.json;
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
return [{ json: { channel: 'meta', to: src.cfg.admin, text: msg, cfg: src.cfg } }];
`;

export const adminCode = `
const { text, cfg } = $input.item.json;
const store = $getWorkflowStaticData('global');
store.pending = store.pending ?? {};
const toAdmin = (t) => ({ json: { channel: 'meta', to: cfg.admin, text: t, cfg } });
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
const sends = cfg.destGroups.map((g) => ({ json: { channel: 'evolution', number: g, text: out, cfg } }));
sends.push(toAdmin('✅ #' + id + ' repassado para ' + cfg.destGroups.length + ' grupo(s).'));
return sends;
`;
