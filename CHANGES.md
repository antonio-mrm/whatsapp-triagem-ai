# CHANGES

## Modelo híbrido: Evolution (grupos) + Cloud API oficial da Meta (admin)

- `n8n/code.mjs` (novo): código dos nós Code extraído do builder para ser testável. `routeEvolutionCode` (só grupos origem), `routeMetaCode` (texto do admin vindo da Meta, filtra pelo número), `prepareCode` e `adminCode` agora emitem itens com `channel` (`meta` | `evolution`).
- `n8n/build-workflow.mjs`: usa `code.mjs`; novos nós `Webhook Meta` (POST /meta-wa), `Webhook Meta Verify` (GET /meta-wa) + `Respond Challenge` (hub.challenge com `META_VERIFY_TOKEN`), `Is Meta Channel`, `Send Meta` (Graph API `/messages`) e `Send Evolution`. Removidos `Route`/`Is Group Msg`/`Send`.
- `n8n/workflow.json`: regenerado.
- `tests/workflow.test.mjs` (novo): 10 testes (`node --test tests/workflow.test.mjs`) cobrindo rotas, preparo, comandos do admin e integridade do workflow.
- `README.md`: fluxo híbrido, setup da Meta, 3 credenciais, testes, limitações (janela 24h, sem assinatura de webhook).
- `.env` / `.env.example`: `EVOLUTION_API_KEY`, `POSTGRES_PASSWORD`, `GEMINI_API_KEY` (`.env` ignorado pelo git).
- Sem pasta `.github`: nenhum CI para rodar.
