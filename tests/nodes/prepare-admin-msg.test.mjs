import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCode, geminiNative, geminiResp, fakeHttp, FIPE_OK, AD, cfg, ADMIN } from '../helpers/n8n.mjs';

const route = (over = {}) => ({ text: 'Civic 2018 80mil', pushName: 'Pedro', sender: '5511888888888@s.whatsapp.net', ts: Math.floor(Date.now() / 1000), cfg, ...over });
const ago = (days) => Math.floor(Date.now() / 1000) - days * 86400 - 60;

// Sem FIPE por padrão (httpRequest falha → "—"), salvo quando o teste passa `http`.
async function run(json, { store = {}, src = route(), http = fakeHttp({}) } = {}) {
  const out = await runCode('Prepare Admin Msg', { json, store, prev: { Route: src }, helpers: http.helpers });
  return { out, store };
}
const vars = async (ad, opts) => (await run(geminiNative({ ...AD, ...ad }), opts)).out[0].json.vars;

test('Prepare Admin Msg: anúncio gera card (template + 3 payloads) para o admin pela Meta', async () => {
  const { out, store } = await run(geminiNative(AD));
  assert.equal(out.length, 1);
  const j = out[0].json;
  assert.equal(j.channel, 'meta');
  assert.equal(j.kind, 'template');
  assert.equal(j.to, ADMIN);
  assert.equal(j.template, 'novo_anuncio');
  assert.deepEqual(j.payloads, ['approve:1', 'price:1', 'skip:1']);
  assert.equal(j.vars.length, 15);
  assert.deepEqual(j.cfg, cfg);
  assert.equal(store.pending[1].text, 'Civic 2018 80mil');
});

test('Prepare Admin Msg: 15 variáveis no molde do card', async () => {
  const v = await vars({}, { src: route({ ts: ago(3) }), http: fakeHttp(FIPE_OK) });
  assert.deepEqual(v, [
    'Honda Civic EXL', '2018', '50.000', '80.000', '75.000', 'pago', 'Revisões em dia', 'Flex (deduzido)',
    'Sudeste (SP)', 'Pneus 80%, Manual + Chave Reserva', 'https://www.webmotors.com.br/carros/estoque/honda/civic',
    'Loja Exemplo', 'João', '19988887777', '3',
  ]);
});

test('Prepare Admin Msg: variáveis nunca têm quebra de linha/tab (regra do template)', async () => {
  const v = await vars({ loja: 'Loja\nTop\t  X', assumido: ['a\nb'] });
  for (const s of v) assert.doesNotMatch(s, /[\n\t]| {4}/);
  assert.equal(v[11], 'Loja Top X');
});

test('Prepare Admin Msg: dados ausentes viram "—" (sem quebrar)', async () => {
  const v = await vars({ nome_carro: null, marca: null, modelo: null, ano: null, km: null, preco: null, ipva_pago: null, revisoes_em_dia: null,
    combustivel: null, cidade_uf: null, assumido: [], loja: null, contato_nome: null, contato_telefone: null }, { src: route({ sender: '', pushName: '', ts: 0 }) });
  assert.deepEqual(v, ['—', '—', '—', '—', '—', 'não informado', 'Revisões não informadas', '—', '—', '—', '—', '—', '—', '—', '0']);
});

test('Prepare Admin Msg: IPVA e revisões nos 3 estados', async () => {
  assert.equal((await vars({ ipva_pago: false, revisoes_em_dia: false }))[5], 'não pago');
  assert.equal((await vars({ ipva_pago: false, revisoes_em_dia: false }))[6], 'Revisões pendentes');
  assert.equal((await vars({ ipva_pago: null }))[5], 'não informado');
});

test('Prepare Admin Msg: combustível deduzido ou informado', async () => {
  assert.equal((await vars({ combustivel: 'Elétrico', combustivel_deduzido: true }))[7], 'Elétrico (deduzido)');
  assert.equal((await vars({ combustivel: 'Diesel', combustivel_deduzido: false }))[7], 'Diesel');
});

test('Prepare Admin Msg: preço/km aceitam número ou texto (80 mil, 80.000, 50k, 80,5 mil)', async () => {
  assert.deepEqual((await vars({ preco: '80 mil', km: '50.000' })).slice(2, 4), ['50.000', '80.000']);
  assert.deepEqual((await vars({ preco: 'R$ 80.000,00', km: '50k' })).slice(2, 4), ['50.000', '80.000']);
  assert.equal((await vars({ preco: '80,5 mil' }))[3], '80.500');
  assert.equal((await vars({ preco: 1234567 }))[3], '1.234.567');
});

test('Prepare Admin Msg: região pelo UF do anúncio, senão pelo DDD do telefone', async () => {
  assert.equal((await vars({ cidade_uf: 'Salvador - BA' }))[8], 'Nordeste (BA)');
  assert.equal((await vars({ cidade_uf: 'Curitiba/PR' }))[8], 'Sul (PR)');
  assert.equal((await vars({ cidade_uf: null, contato_telefone: '62999990000' }))[8], 'Centro-Oeste (GO)');
  assert.equal((await vars({ cidade_uf: null, contato_telefone: '5592999990000' }))[8], 'Norte (AM)');
  assert.equal((await vars({ cidade_uf: 'xx', contato_telefone: '21999990000' }))[8], 'Sudeste (RJ)');
});

test('Prepare Admin Msg: telefone cai para o do remetente; @lid é ignorado', async () => {
  assert.equal((await vars({ contato_telefone: null }))[13], '5511888888888');
  assert.equal((await vars({ contato_telefone: null }, { src: route({ sender: '123456@lid' }) }))[13], '—');
});

test('Prepare Admin Msg: nome do usuário cai para o pushName', async () => {
  assert.equal((await vars({ contato_nome: null }))[12], 'Pedro');
});

test('Prepare Admin Msg: "há X dias" a partir do timestamp da mensagem', async () => {
  assert.equal((await vars({}, { src: route({ ts: ago(0) }) }))[14], '0');
  assert.equal((await vars({}, { src: route({ ts: ago(7) }) }))[14], '7');
  assert.equal((await vars({}, { src: route({ ts: Math.floor(Date.now() / 1000) + 9999 }) }))[14], '0');
});

test('Prepare Admin Msg: link Webmotors por slug (acentos, espaços, caixa)', async () => {
  assert.equal((await vars({ marca: 'Volkswagen', modelo: 'Gol G6' }))[10], 'https://www.webmotors.com.br/carros/estoque/volkswagen/gol-g6');
  assert.equal((await vars({ marca: 'Citroën', modelo: 'C4 Cactus' }))[10], 'https://www.webmotors.com.br/carros/estoque/citroen/c4-cactus');
  assert.equal((await vars({ marca: null }))[10], '—');
});

test('Prepare Admin Msg: guarda pendente (texto original e preço) e incrementa contador', async () => {
  const store = {};
  await run(geminiNative(AD), { store });
  await run(geminiNative(AD), { store });
  assert.equal(store.counter, 2);
  assert.equal(store.pending[1].preco, 80000);
  assert.equal(store.pending[1].text, 'Civic 2018 80mil');
  assert.equal(store.pending[2].from, 'Pedro');
});

test('Prepare Admin Msg: lê as 3 formas de saída do Gemini (nativo, API crua, objeto, cercas ```json)', async () => {
  for (const g of [geminiNative(AD), geminiResp(AD), AD, geminiNative('```json\n' + JSON.stringify(AD) + '\n```'), { output: JSON.stringify(AD) }]) {
    assert.equal((await run(g)).out.length, 1);
  }
});

test('Prepare Admin Msg: não é anúncio → descarta e não guarda', async () => {
  const { out, store } = await run(geminiNative({ is_ad: false }));
  assert.deepEqual(out, []);
  assert.equal(store.pending, undefined);
});

test('Prepare Admin Msg: JSON inválido ou resposta vazia → descarta', async () => {
  assert.deepEqual((await run(geminiNative('lixo'))).out, []);
  assert.deepEqual((await run({})).out, []);
});

// ----- FIPE (API Parallelum) -----
test('FIPE: match exato marca/modelo/ano → preço da tabela', async () => {
  const http = fakeHttp(FIPE_OK);
  assert.equal((await vars({}, { http }))[4], '75.000');
  assert.equal(http.calls.length, 4);
});

test('FIPE: modelo aproximado escolhe o nome mais curto que contém todos os termos', async () => {
  const http = fakeHttp({ ...FIPE_OK, '/brands/25/models': [{ code: '500', name: 'Civic Sedan EXL 2.0' }, { code: '501', name: 'Civic' }] });
  assert.equal((await vars({}, { http }))[4], '75.000');
});

test('FIPE: marca com caixa/acento diferente ainda casa', async () => {
  const http = fakeHttp({ ...FIPE_OK, '/brands': [{ code: '25', name: 'HONDA' }] });
  assert.equal((await vars({ marca: 'honda' }, { http }))[4], '75.000');
});

test('FIPE: escolhe o ano com o combustível certo quando há mais de um', async () => {
  const http = fakeHttp({
    ...FIPE_OK,
    '/brands/25/models/501/years': [{ code: '2018-3', name: '2018 Diesel' }, { code: '2018-1', name: '2018 Gasolina' }],
    '/brands/25/models/501/years/2018-3': { price: 'R$ 99.000,00' },
  });
  assert.equal((await vars({ combustivel: 'Diesel' }, { http }))[4], '99.000');
  assert.equal((await vars({ combustivel: 'Flex' }, { http }))[4], '99.000'); // sem match de combustível → primeiro do ano
});

test('FIPE: sem match de marca, modelo ou ano → "—" e o fluxo segue', async () => {
  assert.equal((await vars({ marca: 'Tesla' }, { http: fakeHttp(FIPE_OK) }))[4], '—');
  assert.equal((await vars({ modelo: 'Ferrari' }, { http: fakeHttp(FIPE_OK) }))[4], '—');
  assert.equal((await vars({ ano: 1990 }, { http: fakeHttp(FIPE_OK) }))[4], '—');
});

test('FIPE: erro HTTP (limite, fora do ar) → "—" e o card ainda é gerado', async () => {
  const http = fakeHttp({ '/brands': new Error('429 Too Many Requests') });
  const { out } = await run(geminiNative(AD), { http });
  assert.equal(out.length, 1);
  assert.equal(out[0].json.vars[4], '—');
});

test('FIPE: sem marca/modelo/ano não chama a API', async () => {
  const http = fakeHttp(FIPE_OK);
  await vars({ ano: null }, { http });
  assert.equal(http.calls.length, 0);
});

test('FIPE: lista de marcas fica em cache (static data) entre anúncios', async () => {
  const store = {};
  const http = fakeHttp(FIPE_OK);
  await run(geminiNative(AD), { store, http });
  await run(geminiNative(AD), { store, http });
  assert.equal(http.calls.filter((c) => c.url.endsWith('/brands')).length, 1);
});

test('FIPE: token opcional vai no header', async () => {
  const http = fakeHttp(FIPE_OK);
  await run(geminiNative(AD), { http, src: route({ cfg: { ...cfg, fipeToken: 'abc' } }) });
  assert.equal(http.calls[0].headers['X-Subscription-Token'], 'abc');
});
