# CHANGES

## Suíte de testes automatizados por bloco do workflow
- `package.json` (novo): `npm test` = rebuild do `n8n/workflow.json` + `node --test "tests/**/*.test.mjs"`.
- `.github/workflows/ci.yml` (novo): roda `npm test` no push/PR (Node 22).
- `tests/helpers/n8n.mjs` (novo): carrega o `workflow.json` gerado; `runCode` (nós Code com stubs de `$input`, `$`, static data e `this.helpers`), `evalExpr`, fixtures, `fakeHttp` (API FIPE) e `simulate` (executor do grafo com nós nativos, Gemini mockado).
- `tests/nodes/` (um arquivo por bloco, vários cenários): `webhook-evolution`, `route`, `is-group-msg`, `message-a-model`, `prepare-admin-msg` (inclui FIPE), `send-card`, `webhook-meta`, `route-meta`, `handle-admin-reply`, `is-meta-channel`, `send-message`, `send-evolution`, `webhook-meta-verify`, `respond-challenge`.
- `tests/workflow-structure.test.mjs` e `tests/e2e-flow.test.mjs` (novo): grafo e fluxo completo (aprovar, editar preço com valor válido/inválido, passar, não-admin, FIPE fora do ar). Total: 115 testes.
- `.env` / `.env.example`: `EVOLUTION_API_KEY`, `POSTGRES_PASSWORD`, `GEMINI_API_KEY` (`.env` ignorado pelo git).

## Nós nativos (Gemini + WhatsApp) e novo card ao admin
- `n8n/n8n-export.json` (novo): workflow do n8n do usuário com os nós nativos **Message a model** (`@n8n/n8n-nodes-langchain.googleGemini` v1.2) e **Send message** (`n8n-nodes-base.whatsApp` v1.1); fonte dos tipos/versões/credenciais/modelo.
- `n8n/build-workflow.mjs`: reescrito; usa o export para os nós nativos e gera 12 nós. Fluxo: `Webhook Evolution → Route → Is Group Msg → Message a model → Prepare Admin Msg → Send card`; ramo do admin: `WhatsApp Trigger → Route Meta → Handle Admin Reply → Is Meta Channel → Send message | Send Evolution`. O nó nativo **WhatsApp Trigger** substitui os webhooks manuais da Meta (POST + GET de verificação + Respond Challenge), então o workflow tem 2 cadeias. **Send card** é HTTP Request (Graph API, template com 3 botões quick-reply e payload `approve|price|skip:<id>`), pois o nó nativo só envia texto simples.
- `n8n/code.mjs`:
  - Prompt do Gemini: texto original inteiro (qualquer formatação) → JSON com `nome_carro, marca, modelo, ano, km, preco, ipva_pago, revisoes_em_dia, combustivel(+deduzido), cidade_uf, assumido[], loja, contato_*`.
  - `Route`: passa `ts` (timestamp) e só grupos de origem. `Route Meta`: aceita texto, botão de template e botão interativo, no formato do WhatsApp Trigger (`value` direto) ou do webhook cru.
  - `Prepare Admin Msg`: lê o JSON do Gemini (formato nativo, API crua, objeto ou com cercas ```json), consulta FIPE (Parallelum, com cache de marcas), região por UF/DDD, link Webmotors, "há X dias"; monta as 15 variáveis do template `novo_anuncio` (`—` quando falta; sem quebra de linha).
  - `Handle Admin Reply`: ✅ Aprovar repassa ao grupo sem feedback ao admin; ❌ Passar descarta (aviso "descartado"); 💰 Editar Preço responde "Informe o valor atualizado:" e o próximo valor (`85000`, `R$ 82.500`, `90k`) segue direto ao grupo com `💰 R$ <novo>` na 1ª linha (valor inválido → pede de novo); comandos de texto continuam como fallback.
  - `.item` trocado por `.first()` (indisponível em "Run Once for All Items").
- `README.md`: reescrito com diagramas Mermaid (visão geral, 2 cadeias, estados dos botões, sequência), tabela de cada nó e de cada função, card de exemplo, template, estado/dados, estrutura do repo, testes, limitações e seção **Como executar** (.env, docker compose, n8n em Docker, QR, webhook, `npm run build`, credenciais, CONFIG, ativação, comandos úteis e problemas comuns).
