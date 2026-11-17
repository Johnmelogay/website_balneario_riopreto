# Robô do WhatsApp (Tainá) — Balneário Rio Preto

Assistente de reservas que roda **no celular Android** (app Termux), pareado como "aparelho
conectado" ao WhatsApp do número **5511980911445** (World Link). O "cérebro" fica no Supabase
(`functions/bot-assistente`); este programa só repassa as mensagens em que o robô foi marcado.

```
index.mjs   -> conecta no WhatsApp (Baileys), filtra menções, fala com o Supabase
rodar.sh    -> mantém o index.mjs rodando (reinicia em 10s se cair)
.env        -> BOT_SECRET, PHONE, ALLOWED_GROUPS  (não versionar)
robo.log    -> o que o robô fez (é o arquivo que importa quando algo falha)
saida.log   -> saída bruta do processo (ruído do Baileys)
sessao/     -> credenciais do pareamento (não apagar; se apagar, precisa parear de novo)
```

## Checagem rápida (do Mac, com o celular acessível por adb)

```bash
taina            # processo, conexão, última atividade, últimas linhas do log
taina log 40     # mais linhas do log
taina restart    # reinicia o robô (~10s)
taina start      # sobe o robô se estiver parado
```

`taina` fala com o celular por adb (USB ou Wi-Fi — veja `android-mirror`). Se o celular estiver
inalcançável, abra o app Termux nele e rode `~/robo-whatsapp/rodar.sh`.

## Regras de funcionamento

- No **grupo** (só o de `ALLOWED_GROUPS`): responde apenas quando é **marcado** (@) ou quando
  **respondem uma mensagem dele**. Mensagem sem marcação é ignorada e não é guardada — exceto
  foto/PDF no grupo da equipe, que fica 10 min na memória para virar comprovante.
- No **privado**: responde somente quem está no grupo da equipe (este número também recebe
  clientes; cliente não recebe resposta automática).
- Fluxo de reserva: texto com cara de reserva → prévia → alguém responde **sim** → grava como
  pendente no mapa. **não** cancela.
- Comprovante: foto/PDF com a legenda da reserva vai anexado; ou "comprovante <nome>".

## Janela de conversa (fica de plantão)

Marcar o robô não é um evento isolado: depois que ele é **marcado** ou **respondido**, ele fica de
plantão naquele grupo por **15 min de inatividade**, e nesse período também acorda com:

- resposta **sem marcar** ("sim", "320", "é do Antônio");
- **arrastar/réplica** a uma mensagem dele (isso já funcionava e continua valendo);
- envio do comprovante sem texto.

A janela é renovada quando **ele responde** (ou quando é marcado/respondido de novo). Sem nenhuma
dessas interações por 15 min, fecha e volta ao normal: só responde quando for marcado.

Dentro da janela **ver ≠ agir**: o servidor só responde se a mensagem pedir algo (reserva,
confirmação, cancelamento, comprovante, pergunta). Conversa paralela do grupo — "kkk", "valeu",
"que calor" — fica em **silêncio**. Teto de 25 mensagens avaliadas por janela, para custo não
fugir do controle.

## O que ela vê do grupo (memória em 3 camadas)

O robô **não** manda cada mensagem do grupo para a IA (seria caro, lento e inútil). Ele separa:

| Camada | Onde vive | O que guarda | Prazo |
|---|---|---|---|
| **Memória curta** | RAM do celular | últimas 40 mensagens do grupo liberado (texto até 900 chars + "enviou arquivo") | 3 h |
| **Memória de trabalho** | `bot_pending` (Supabase) | prévias e comprovantes esperando um *sim*/*não* | 30 min (prévia) / 24 h (comprovante) |
| **Memória longa** | `bookings` | as reservas de verdade | sempre |

**Ver ≠ agir.** Ela continua só agindo quando é marcada ou respondida. A diferença é que agora,
quando é chamada, o celular manda junto as últimas mensagens da conversa — assim ela entende
"lança essa", "confirma pra mim", "o comprovante é esse" mesmo sem ninguém citar a reserva.

**Custo controlado em dois pontos:**
- celular: 25 mensagens, cada uma até 700 chars, só do grupo liberado, e **só quando ela é chamada**;
- servidor: corta em 3000 chars **mantendo o fim** (o mais recente), antes de ir para a IA.

Nada disso é gravado em disco: a memória curta morre quando o Termux reinicia (perde-se o
contexto de minutos, não de reservas). Só o grupo de `ALLOWED_GROUPS` é observado.

## Como ele entende a conversa

O celular repassa também **o texto da mensagem que a pessoa respondeu/citou** e, quando alguém
marca o robô e manda o arquivo logo depois (até 15 min), repassa o arquivo mesmo sem nova marcação.

No servidor (`bot-assistente`):

1. **Intenção** — uma chamada à IA diz o que a pessoa quer: nova reserva, "sim", "não",
   comprovante, pergunta, conversa. Se a IA falhar, o programa volta para as regras antigas.
2. **Leitura do comprovante** — PDF: texto extraído direto (funciona sem chave extra).
   Foto/print: precisa de visão (`OPENAI_API_KEY` ou `GEMINI_API_KEY` nos secrets).
3. **Conferência** — extrai nome do **pagador** e valor, e compara com a prévia aberta ou com as
   reservas dos últimos 7 dias sem comprovante (`valorEsperado` = adiantamento ou 50% do total).
4. **Só age com certeza**:
   - nome + valor batem → anexa sozinho e responde o que fez;
   - só o valor bate (ex.: marido pagando) ou nome bate e valor não → **pergunta** e espera *sim*;
   - nada bate → não mexe em nada (se o arquivo veio sem marcação, fica em silêncio).

Testes da conferência: `node --test supabase/functions/bot-assistente/verificacao.test.ts`

## Publicar as mudanças

O token de deploy fica no `.env` local (não versionado) e no Keychain do Mac, então não precisa
mais de `supabase login` a cada vez.

```bash
# função (servidor)
npx supabase functions deploy bot-assistente --project-ref hihaipaslnpaqnqotrwm --yes

# programa do celular
adb push robo-whatsapp/index.mjs /data/local/tmp/index.mjs
adb shell run-as com.termux cp /data/local/tmp/index.mjs /data/data/com.termux/files/home/robo-whatsapp/index.mjs
taina restart        # e confirma com: taina

# opcional: outro provedor de visão (o padrão já é a própria DeepSeek)
npx supabase secrets set OPENAI_API_KEY=sk-... --project-ref hihaipaslnpaqnqotrwm
```

## Limitações conhecidas (o que causou o problema de 17/11)

O robô **só existe enquanto o Termux está rodando no celular**. Se o Android mata o Termux (ou o
celular reinicia e o Termux:Boot não dispara), o robô fica mudo — sem avisar ninguém.

O que foi feito em 17/11/2026:

1. **Recuperação de mensagens**: o programa agora aceita `messages.upsert` do tipo `append` (o que
   o WhatsApp reentrega quando a conexão volta), limitado às últimas 2h e sem tratar a mesma
   mensagem duas vezes. Antes só `notify` era olhado, então o que chegava durante uma queda era
   perdido para sempre.
2. **Sem robô duplicado**: `rodar.sh` não sobe um segundo processo se já existe um rodando.
3. **Registro de reinício**: toda queda do processo agora aparece no `robo.log`.
4. **Bateria**: `com.termux` e `com.termux.boot` estão na lista de isenção de otimização.
5. Ferramenta `taina` (no Mac) para status/restart/start sem abrir o celular.

Ainda vale, no celular (Samsung): Configurações → Apps → Termux → Bateria → **Sem restrições**, e
Apps → Termux:Boot → **Autorun** ligado. Sem isso o Android pode impedir o start após reiniciar.
