# whatsapp-triagem-ai
Sistema de IA para leitura, triagem e publicação automática de anúncios de veículos em grupos de repasse via WhatsApp.

## Fluxo
1. Evolution API (Baileys) recebe msgs dos grupos origem → webhook no n8n.
2. n8n manda texto ao Gemini → JSON `{is_ad, marca, modelo, ano, km, preco, contato}`. Não-anúncio é descartado.
3. n8n envia DM ao admin com anúncio + ID pela **Cloud API oficial da Meta**.
4. Admin responde por texto (webhook da Meta → n8n): `ok 3` | `nao 3` | `editar 3 novo texto`.
5. Aprovado → n8n repassa aos grupos destino (via Evolution) e confirma ao admin (via Meta).

Modelo híbrido: Evolution (não-oficial) só lê/publica nos grupos, pois a API oficial não entra em grupos existentes. Conversa com o admin é 100% oficial.

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
5. Meta (developers.facebook.com): criar app Business com produto WhatsApp, número **diferente** do chip do Evolution, anotar `Phone number ID` e gerar token permanente (System User). Webhook do app: `https://<url-publica-n8n>/webhook/meta-wa`, verify token = `META_VERIFY_TOKEN` usado no build, campo `messages` assinado. O admin deve iniciar a conversa com o número business.
6. `META_VERIFY_TOKEN=seu-token node n8n/build-workflow.mjs` → importar `n8n/workflow.json` no n8n.
7. No n8n criar 3 credenciais **Header Auth**:
   - Gemini: header `x-goog-api-key` = chave Gemini → nó **Gemini**.
   - Evolution: header `apikey` = `EVOLUTION_API_KEY` → nó **Send Evolution**.
   - Meta: header `Authorization` = `Bearer <token>` → nó **Send Meta**.
8. Editar bloco CONFIG nos nós **Route Evolution** e **Route Meta** (iguais): `phoneNumberId`, `admin` (só dígitos), grupos origem/destino. JIDs de grupo: `GET /group/fetchAllGroups/triagem?getParticipants=false`.
9. **Ativar (Publish)** o workflow — estado dos anúncios pendentes (static data) só persiste em produção.

## Testes
`node --test tests/workflow.test.mjs`

## Limitações v1
- Janela de 24h da Meta: DM livre ao admin só dentro de 24h após a última mensagem dele. Fora disso a Meta recusa (precisa template aprovado — não implementado). Admin deve mandar qualquer msg ao número business periodicamente.
- Webhook da Meta sem checagem de assinatura `X-Hub-Signature-256`; só filtra pelo número do admin.
- Só texto/legenda. Fotos não são repassadas.
- Pendentes ficam em static data do n8n (sem expiração).
