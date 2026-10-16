# whatsapp-triagem-ai
Sistema de IA para leitura, triagem e publicação automática de anúncios de veículos em grupos de repasse via WhatsApp.

## Fluxo
1. Evolution API (Baileys) recebe msgs dos grupos origem → webhook no n8n.
2. n8n manda texto ao Gemini → JSON `{is_ad, marca, modelo, ano, km, preco, contato}`. Não-anúncio é descartado.
3. n8n envia DM ao admin com anúncio + ID.
4. Admin responde por texto: `ok 3` | `nao 3` | `editar 3 novo texto`.
5. Aprovado → n8n repassa aos grupos destino e confirma ao admin.

## Setup
1. `copy .env.example .env` e preencha as chaves.
2. `docker compose up -d` (Evolution em http://localhost:8080).
3. Criar instância e ler QR (use chip dedicado — API não-oficial, risco de ban):
   ```bash
   curl -X POST http://localhost:8080/instance/create -H "apikey: $EVOLUTION_API_KEY" -H "Content-Type: application/json" -d '{"instanceName":"triagem","qrcode":true,"integration":"WHATSAPP-BAILEYS"}'
   ```
   QR/pairing: http://localhost:8080/manager
4. Apontar webhook da instância para o n8n:
   ```bash
   curl -X POST http://localhost:8080/webhook/set/triagem -H "apikey: $EVOLUTION_API_KEY" -H "Content-Type: application/json" -d '{"webhook":{"enabled":true,"url":"http://host.docker.internal:5678/webhook/evolution-wa","events":["MESSAGES_UPSERT"]}}'
   ```
5. `node n8n/build-workflow.mjs` → importar `n8n/workflow.json` no n8n.
6. No n8n criar 2 credenciais **Header Auth**:
   - Gemini: header `x-goog-api-key` = chave Gemini → nó **Gemini**.
   - Evolution: header `apikey` = `EVOLUTION_API_KEY` → nó **Send**.
7. Editar bloco CONFIG no nó **Route** (admin, grupos origem/destino). JIDs de grupo: `GET /group/fetchAllGroups/triagem?getParticipants=false`.
8. **Ativar (Publish)** o workflow — estado dos anúncios pendentes (static data) só persiste em produção.

## Limitações v1
- Só texto/legenda. Fotos não são repassadas.
- Pendentes ficam em static data do n8n (sem expiração).
- Admin com JID `@lid` (WhatsApp novo): ver JID real no payload do webhook e ajustar `admin`.
