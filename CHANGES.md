# CHANGES

## Regra contra duplicados
- `n8n/code.mjs`: nova função `dupKey(ad)` (`marca|modelo|ano|km` normalizados; `null` se faltar algum). Incluída no `prepareCode`.
- `prepareMain`: antes de gerar o id, se a chave já existe em `store.seen` devolve `[]` (sem card, sem FIPE, sem gastar contador). Chave nova é gravada em `store.seen[key] = { id, at }`. Preço não entra na chave; km diferente = carro distinto; km ausente = sempre gera card.
- Sem expiração de `seen` (decisão do usuário, anotado em Limitações do README).

## Janela de 24h da Cloud API
- `cfgBlock`: novos campos `reminderTemplate` (`lembrete_janela`) e `windowReminderAfterHours` (20).
- `routeMetaCode`: toda mensagem do admin grava `store.lastAdminAt` e zera `store.windowReminded`.
- Novo `windowCode` (nó **Window Check**): se há `lastAdminAt`, o lembrete ainda não saiu e passaram 20 h, marca `windowReminded` e emite o item com o template.
- `n8n/build-workflow.mjs`: 3 nós novos (Schedule Trigger a cada 1 h → Window Check → Send reminder, HTTP Graph API com o template e a credencial `whatsAppApi` do nó Send message). O workflow passa de 12 para 15 nós.

## Testes
- `prepare-admin-msg.test.mjs`: 8 testes de dedupe (km igual/diferente/null, acento e caixa, preço diferente, ano/modelo, descartado, sem marca). Dois testes existentes passaram a usar km distinto, pois reusavam o mesmo anúncio.
- `route-meta.test.mjs`: 3 testes de `lastAdminAt`/`windowReminded`.
- `window-check.test.mjs` (novo): 6 testes do ciclo do lembrete.
- `workflow-structure.test.mjs`: 15 nós, `scheduleTrigger` como gatilho, cadeia do lembrete.
- `e2e-flow.test.mjs`: mesmo carro em 2 grupos = 1 card; lembrete sai uma vez.
- `tests/helpers/n8n.mjs`: cfg com os novos campos; `simulate` aceita `scheduleTrigger`.
- Resultado: `npm test` com 135 testes passando.

## Documentação
- `README.md`: cadeia 3, `dupKey`, estado (`seen`, `lastAdminAt`, `windowReminded`), template `lembrete_janela`, CONFIG e limitações.

## Fora de escopo
- Filtro por marca/preço/região: descartado do planejamento.
- Expiração do dedupe: não implementada.
