import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getNode, evalExpr } from '../helpers/n8n.mjs';

const n = getNode('Message a model');
const prompt = (text) => evalExpr(n.parameters.messages.values[0].content, { text });

test('Message a model: nó nativo do Google Gemini com modelo configurado', () => {
  assert.equal(n.type, '@n8n/n8n-nodes-langchain.googleGemini');
  assert.match(n.parameters.modelId.value, /^models\/gemini/);
});

test('Message a model: texto original entra intacto no prompt, em qualquer formatação', () => {
  for (const t of [
    'Civic 2018 50mil km R$ 80.000',
    '🚗 *CIVIC EXL*\n\n• Ano: 2018\n• KM: 50.000\n• R$ 80 MIL\n📍 Campinas/SP',
    'VENDO GOL "G6" 2015 -- 30K -- ZAP (11) 98888-7777\n"aspas" e \\ barra',
  ]) {
    assert.ok(prompt(t).includes(t), `perdeu o texto: ${t}`);
  }
});

test('Message a model: prompt pede JSON com todos os campos do card', () => {
  const p = prompt('x');
  for (const k of ['is_ad', 'nome_carro', 'marca', 'modelo', 'ano', 'km', 'preco', 'ipva_pago', 'revisoes_em_dia', 'combustivel',
    'combustivel_deduzido', 'cidade_uf', 'assumido', 'loja', 'contato_nome', 'contato_telefone']) {
    assert.ok(p.includes(k), `prompt sem ${k}`);
  }
  assert.match(p, /SOMENTE um JSON/);
  assert.match(p, /Nunca invente/);
});

test('Message a model: texto entre delimitadores para evitar injeção', () => {
  assert.match(prompt('abc'), /"""\nabc\n"""$/);
});
