import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCode, cfg, DST } from '../helpers/n8n.mjs';

const pending = (over = {}) => ({ pending: { 1: { text: 'texto original', preco: 80000, ...over } } });
const run = (text, store = pending(), payload = '') => runCode('Handle Admin Reply', { json: { text, payload, cfg }, store });
const click = (payload, store = pending()) => run('botão', store, payload);
const toGroup = (out) => out.filter((o) => o.json.channel === 'evolution');
const toAdmin = (out) => out.filter((o) => o.json.channel === 'meta');

// ===== botões =====
test('Handle Admin Reply: ✅ Aprovar repassa o texto original ao grupo, sem feedback ao admin', () => {
  const store = pending();
  const out = click('approve:1', store);
  assert.deepEqual(out.map((o) => o.json), [{ channel: 'evolution', number: DST, text: 'texto original', cfg }]);
  assert.equal(store.pending[1], undefined);
});

test('Handle Admin Reply: Aprovar → 1 envio por grupo destino (nenhuma confirmação)', () => {
  const c = { ...cfg, destGroups: ['a@g.us', 'b@g.us'] };
  const out = runCode('Handle Admin Reply', { json: { text: '', payload: 'approve:1', cfg: c }, store: pending() });
  assert.deepEqual(toGroup(out).map((o) => o.json.number), c.destGroups);
  assert.equal(toAdmin(out).length, 0);
});

test('Handle Admin Reply: ❌ Passar descarta sem enviar aos grupos', () => {
  const store = pending();
  const out = click('skip:1', store);
  assert.equal(out.length, 1);
  assert.equal(out[0].json.channel, 'meta');
  assert.match(out[0].json.text, /#1 descartado/);
  assert.equal(store.pending[1], undefined);
});

test('Handle Admin Reply: 💰 Editar Preço responde "Informe o valor atualizado:" e fica aguardando', () => {
  const store = pending();
  const out = click('price:1', store);
  assert.equal(out.length, 1);
  assert.equal(out[0].json.channel, 'meta');
  assert.equal(out[0].json.text, 'Informe o valor atualizado:');
  assert.equal(store.awaiting, '1');
  assert.ok(store.pending[1], 'continua pendente até o valor chegar');
});

test('Handle Admin Reply: botão de anúncio inexistente/já tratado avisa', () => {
  for (const p of ['approve:9', 'skip:9', 'price:9']) assert.match(click(p)[0].json.text, /#9 não encontrado/);
});

test('Handle Admin Reply: aprovar duas vezes só repassa uma', () => {
  const store = pending();
  click('approve:1', store);
  const again = click('approve:1', store);
  assert.equal(again.length, 1);
  assert.match(again[0].json.text, /não encontrado/);
});

// ===== Editar Preço: valor enviado pelo admin segue direto para o grupo =====
const awaiting = () => ({ ...pending(), awaiting: '1' });

test('Handle Admin Reply: valor novo vai direto ao grupo com o preço na 1ª linha (sem confirmação)', () => {
  const store = awaiting();
  const out = run('85000', store);
  assert.deepEqual(out.map((o) => o.json), [{ channel: 'evolution', number: DST, text: '💰 R$ 85.000\ntexto original', cfg }]);
  assert.equal(store.pending[1], undefined);
  assert.equal(store.awaiting, null);
});

test('Handle Admin Reply: valor aceita várias formas (85000, R$ 82.500, 90k, 78 mil, 79,9 mil)', () => {
  for (const [t, v] of [['85000', '85.000'], ['R$ 82.500', '82.500'], ['90k', '90.000'], ['78 mil', '78.000'], ['79,9 mil', '79.900']]) {
    assert.equal(toGroup(run(t, awaiting()))[0].json.text, `💰 R$ ${v}\ntexto original`, t);
  }
});

test('Handle Admin Reply: valor igual ao pedido original não duplica a linha de preço', () => {
  assert.equal(toGroup(run('80000', awaiting()))[0].json.text, 'texto original');
});

test('Handle Admin Reply: texto sem valor → pede de novo e mantém aguardando', () => {
  const store = awaiting();
  for (const t of ['talvez', 'ok', 'sim']) {
    const out = run(t, store);
    assert.equal(out.length, 1);
    assert.equal(out[0].json.channel, 'meta');
    assert.match(out[0].json.text, /Informe o valor atualizado:/);
  }
  assert.equal(store.awaiting, '1');
  assert.ok(store.pending[1]);
});

test('Handle Admin Reply: aguardando, mas anúncio sumiu → limpa estado e ignora', () => {
  const store = { pending: {}, awaiting: '1' };
  assert.deepEqual(run('85000', store), []);
  assert.equal(store.awaiting, null);
});

test('Handle Admin Reply: aguardando, novo toque em Aprovar/Passar tem prioridade e limpa o estado', () => {
  const s1 = awaiting();
  assert.equal(toGroup(click('approve:1', s1)).length, 1);
  assert.equal(s1.awaiting, null);
  const s2 = awaiting();
  click('skip:1', s2);
  assert.equal(s2.awaiting, null);
});

test('Handle Admin Reply: sem "aguardando", texto solto é ignorado (não vira preço)', () => {
  assert.deepEqual(run('85000'), []);
});

// ===== comandos de texto (fallback) =====
for (const input of ['ok 1', 'sim 1', 'OK 1', '  ok  1  ', 'ok #1']) {
  test(`Handle Admin Reply: "${input.trim()}" aprova e repassa (sem confirmação)`, () => {
    const store = pending();
    const out = run(input, store);
    assert.equal(out.length, 1);
    assert.equal(toGroup(out)[0].json.text, 'texto original');
    assert.equal(store.pending[1], undefined);
  });
}

for (const cmd of ['nao', 'não', 'n']) {
  test(`Handle Admin Reply: "${cmd} 1" descarta sem enviar aos grupos`, () => {
    const store = pending();
    const out = run(`${cmd} 1`, store);
    assert.equal(out.length, 1);
    assert.match(out[0].json.text, /descartado/);
    assert.equal(store.pending[1], undefined);
  });
}

test('Handle Admin Reply: "editar 1 texto" repassa o texto novo (multilinha)', () => {
  assert.equal(toGroup(run('editar 1 Linha 1\nLinha 2'))[0].json.text, 'Linha 1\nLinha 2');
});

test('Handle Admin Reply: "editar 1" sem texto avisa uso e mantém pendente', () => {
  const store = pending();
  const out = run('editar 1', store);
  assert.equal(out.length, 1);
  assert.match(out[0].json.text, /Use: editar 1/);
  assert.ok(store.pending[1]);
});

test('Handle Admin Reply: id inexistente avisa o admin', () => {
  assert.match(run('ok 9')[0].json.text, /#9 não encontrado/);
});

test('Handle Admin Reply: comando com id vale mesmo aguardando preço', () => {
  assert.match(run('nao 1', awaiting())[0].json.text, /descartado/);
});

test('Handle Admin Reply: texto que não é comando é ignorado', () => {
  for (const t of ['oi', 'ok', 'ok abc', 'talvez 1', '']) assert.deepEqual(run(t), []);
});
