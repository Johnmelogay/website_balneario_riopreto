// Robô de reservas do grupo da equipe (Balneário Rio Preto).
// Roda no Android (Termux). Entra no WhatsApp do número do robô como "aparelho conectado"
// e SÓ olha mensagens de grupo em que ele foi marcado (ou respostas a mensagens dele).
// Todo o resto é ignorado e não é lido nem guardado.
// O "cérebro" fica no Supabase (função bot-assistente). Se este programa cair, o fluxo
// de sempre (tela do funcionário e mapa) continua funcionando normalmente.
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, downloadMediaMessage } from '@whiskeysockets/baileys'
import pino from 'pino'
import { readFileSync, appendFileSync, rmSync } from 'node:fs'

// --- Configuração (arquivo .env ao lado deste) ---
const env = Object.fromEntries(
    readFileSync(new URL('./.env', import.meta.url), 'utf8').split('\n')
        .map(l => l.trim()).filter(l => l && !l.startsWith('#') && l.includes('='))
        .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
)
const FUNC_URL = env.FUNC_URL || 'https://hihaipaslnpaqnqotrwm.supabase.co/functions/v1/bot-assistente'
const BOT_SECRET = env.BOT_SECRET
const PHONE = (env.PHONE || '').replace(/\D/g, '')             // número do robô, ex.: 5569999999999
const GRUPOS = (env.ALLOWED_GROUPS || '').split(',').map(s => s.trim()).filter(Boolean) // vazio = qualquer grupo

const log = (...a) => {
    const linha = `[${new Date().toLocaleString('pt-BR', { timeZone: 'America/Porto_Velho' })}] ${a.join(' ')}`
    console.log(linha)
    try { appendFileSync(new URL('./robo.log', import.meta.url), linha + '\n') } catch (_) { }
}

const soNumero = (jid = '') => String(jid).split('@')[0].split(':')[0]

function textoDeMsg(msg = {}) {
    const corpo = msg.ephemeralMessage?.message || msg.viewOnceMessage?.message || msg
    return corpo.conversation || corpo.extendedTextMessage?.text || corpo.imageMessage?.caption ||
        corpo.documentMessage?.caption || corpo.documentWithCaptionMessage?.message?.documentMessage?.caption || ''
}
function textoDa(m) {
    return textoDeMsg(m.message || {})
}
function contextoDa(m) {
    const msg = m.message || {}
    const corpo = msg.ephemeralMessage?.message || msg
    return corpo.extendedTextMessage?.contextInfo || corpo.imageMessage?.contextInfo || corpo.documentMessage?.contextInfo ||
        corpo.documentWithCaptionMessage?.message?.documentMessage?.contextInfo || {}
}

// --- Comprovantes (foto ou PDF) ---
function midiaDe(msg = {}) {
    const corpo = msg.ephemeralMessage?.message || msg.viewOnceMessage?.message || msg
    if (corpo.imageMessage) return { msg: corpo, mime: corpo.imageMessage.mimetype || 'image/jpeg' }
    const doc = corpo.documentMessage || corpo.documentWithCaptionMessage?.message?.documentMessage
    if (doc && /pdf|image/.test(doc.mimetype || '')) return { msg: corpo.documentMessage ? corpo : corpo.documentWithCaptionMessage.message, mime: doc.mimetype }
    return null
}
function textoDoc(m) {
    const msg = m.message || {}
    return msg.documentWithCaptionMessage?.message?.documentMessage?.caption || msg.documentMessage?.caption || ''
}
// --- Memória curta do grupo (só na memória do celular, nunca em disco) ---
// O robô só AGE quando é chamado, mas PRECISA ter visto a conversa para entender o contexto
// ("lança essa", "confirma", "o comprovante é esse"). Guardamos as últimas mensagens de cada
// grupo liberado e mandamos junto SÓ quando ele é chamado — assim o contexto não cresce à toa.
const HISTORICO = new Map()
const HIST_MAX = 40            // mensagens por grupo
const HIST_JANELA = 3 * 60 * 60 * 1000
const HIST_TEXTO_MAX = 900  // reservas costumam ter ~450 chars
const HIST_ENVIO_MAX = 25      // quantas vão junto na chamada

function horaCurta(ts) {
    return new Date(ts).toLocaleTimeString('pt-BR', { timeZone: 'America/Porto_Velho', hour: '2-digit', minute: '2-digit' })
}
function registrarNoHistorico(chat, item) {
    if (!GRUPOS.includes(chat)) return
    const arr = HISTORICO.get(chat) || []
    arr.push(item)
    const corte = Date.now() - HIST_JANELA
    while (arr.length > HIST_MAX || (arr.length && arr[0].ts < corte)) arr.shift()
    HISTORICO.set(chat, arr)
}
function resumoHistorico(chat) {
    if (!GRUPOS.includes(chat)) return []
    const arr = HISTORICO.get(chat) || []
    return arr.slice(-HIST_ENVIO_MAX).map(m => ({
        hora: horaCurta(m.ts), de: m.de, texto: m.texto, midia: m.midia, robo: m.robo,
    }))
}

// Última foto que cada pessoa mandou no grupo da equipe sem marcar o robô (fica só na memória, 10 min).
// Assim funciona também quando mandam a foto e logo depois o texto marcando o robô.
const ultimaFoto = new Map()
// Quando cada pessoa chamou o robô pela última vez (para ligar o PDF que vem logo depois).
const ultimoChamado = new Map()

// --- Janela de conversa ---
// Depois que ela é marcada (ou responde alguém), fica de "plantão" naquele grupo por 15 min.
// Nesse período, resposta sem marcar e réplica à mensagem dela também a acordam. Sem interação
// (dela ou dirigida a ela), a janela fecha — e volta a só responder quando for marcada.
const JANELA_MS = 15 * 60 * 1000
const JANELA_MAX_MSGS = 25          // teto de mensagens avaliadas por janela (custo)
const janelas = new Map()           // chat -> { ate, usados }

function abrirJanela(chat) {
    if (!GRUPOS.includes(chat)) return
    janelas.set(chat, { ate: Date.now() + JANELA_MS, usados: 0 })
}
function janelaAtiva(chat) {
    const j = janelas.get(chat)
    if (!j) return false
    if (Date.now() > j.ate || j.usados >= JANELA_MAX_MSGS) { janelas.delete(chat); return false }
    return true
}
function consumirJanela(chat) {
    if (!janelaAtiva(chat)) return false
    const j = janelas.get(chat)
    j.usados++
    return true
}
const DEZ_MIN = 10 * 60 * 1000
const QUINZE_MIN = 15 * 60 * 1000
async function baixar(sock, m, info) {
    const buf = await downloadMediaMessage({ key: m.key, message: info.msg }, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage })
    return { image_base64: Buffer.from(buf).toString('base64'), image_mime: info.mime }
}

// Quem é da equipe = quem está no(s) grupo(s) de ALLOWED_GROUPS. Lista guardada por 10 minutos.
let equipeCache = { ate: 0, numeros: new Set() }
let avisouSemGrupo = false
async function daEquipe(sock, ids) {
    if (!GRUPOS.length) {
        if (!avisouSemGrupo) { log('Privado desligado: falta ALLOWED_GROUPS (grupo da equipe) no .env.'); avisouSemGrupo = true }
        return false
    }
    if (Date.now() > equipeCache.ate) {
        const numeros = new Set()
        for (const g of GRUPOS) {
            try {
                const meta = await sock.groupMetadata(g)
                for (const p of meta.participants || []) {
                    for (const v of [p.id, p.jid, p.lid, p.phoneNumber]) if (v) numeros.add(soNumero(v))
                }
            } catch (e) { log('Não consegui ler os membros do grupo da equipe:', e.message) }
        }
        equipeCache = { ate: Date.now() + 10 * 60 * 1000, numeros }
    }
    return ids.some(j => equipeCache.numeros.has(soNumero(j)))
}

async function iniciar() {
    const { state, saveCreds } = await useMultiFileAuthState(new URL('./sessao', import.meta.url).pathname)
    const { version } = await fetchLatestBaileysVersion()
    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: Browsers.macOS('Chrome'),
        markOnlineOnConnect: false,
        syncFullHistory: false,
    })
    sock.ev.on('creds.update', saveCreds)

    // Primeira vez: gera o código de pareamento para digitar no WhatsApp do número do robô
    if (!sock.authState.creds.registered) {
        if (!PHONE) { log('Falta PHONE no .env (número do robô com DDI e DDD).'); process.exit(1) }
        await new Promise(r => setTimeout(r, 3000))
        const codigo = await sock.requestPairingCode(PHONE)
        log(`CODIGO DE PAREAMENTO: ${codigo}  (WhatsApp > Aparelhos conectados > Conectar com número de telefone)`)
    }

    let ultimaConexao = 0
    sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
        if (connection === 'open') {
            const agora = Date.now()
            const foraMin = ultimaConexao ? Math.round((agora - ultimaConexao) / 60000) : 0
            ultimaConexao = agora
            log(`Conectado ao WhatsApp como ${soNumero(sock.user?.id)}${foraMin > 2 ? ` (estável de novo depois de ~${foraMin} min fora)` : ''}`)
        }
        if (connection === 'close') {
            const codigo = lastDisconnect?.error?.output?.statusCode
            if (!sock.authState.creds.registered) {
                // Ainda pareando (código expirou ou foi recusado): limpa e gera um código novo.
                rmSync(new URL('./sessao', import.meta.url).pathname, { recursive: true, force: true })
                log('Pareamento não concluído, gerando novo código em 5s. Motivo:', codigo ?? '?')
                setTimeout(iniciar, 5000)
                return
            }
            if (codigo === DisconnectReason.loggedOut) {
                log('Desconectado pelo WhatsApp (aparelho removido). Apague a pasta sessao e pareie de novo.')
                process.exit(2)
            }
            log('Conexão caiu, reconectando em 5s. Motivo:', codigo ?? lastDisconnect?.error?.message ?? '?')
            setTimeout(iniciar, 5000)
        }
    })

    // --- Mensagens que chegaram enquanto o robô estava fora ---
    // O WhatsApp reentrega o que ficou pendente como 'append' quando a conexão volta.
    // Antes o programa só olhava 'notify', então o que chegava na queda era perdido para sempre.
    // Agora recuperamos só o que é recente (2h) e nunca tratamos a mesma mensagem duas vezes.
    const vistas = new Set()
    const JA_VISTAS_MAX = 800
    const JANELA_RECUPERACAO = 2 * 60 * 60 * 1000
    function jaTratada(id) {
        if (!id) return false
        if (vistas.has(id)) return true
        vistas.add(id)
        if (vistas.size > JA_VISTAS_MAX) vistas.clear()
        return false
    }

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify' && type !== 'append') return
        for (const m of messages) {
            let recenteSemMencao = false
            let acordadaPorMsg = ''
            try {
                const chat = m.key.remoteJid || ''
                if (!chat || chat === 'status@broadcast' || chat.endsWith('@newsletter') || chat.endsWith('@broadcast')) continue
                const recuperada = type === 'append'
                if (recuperada) {
                    const ts = Number(m.messageTimestamp || 0) * 1000
                    if (!ts || Date.now() - ts > JANELA_RECUPERACAO) continue
                }
                if (jaTratada(m.key.id)) continue
                const emGrupo = chat.endsWith('@g.us')

                // Contexto da conversa ATÉ AGORA (sem a mensagem atual), e só do grupo liberado
                const contextoGrupo = emGrupo ? resumoHistorico(chat) : []
                if (emGrupo && GRUPOS.includes(chat)) {
                    registrarNoHistorico(chat, {
                        ts: Date.now(),
                        de: m.key.fromMe ? 'Tainá' : (m.pushName || soNumero(m.key.participant || '')),
                        texto: String(textoDa(m) || textoDoc(m) || '').slice(0, HIST_TEXTO_MAX),
                        midia: !!midiaDe(m.message),
                        robo: !!m.key.fromMe,
                    })
                }
                if (m.key.fromMe) continue

                if (emGrupo) {
                    const ctx0 = contextoDa(m)
                    const eu = [soNumero(sock.user?.id), soNumero(sock.user?.lid)].filter(Boolean)
                    const marcado = (ctx0.mentionedJid || []).some(j => eu.includes(soNumero(j)))
                    // responder (arrastar) uma mensagem DELA também acorda
                    const respostaAoRobo = !!(ctx0.participant && eu.includes(soNumero(ctx0.participant)) && ctx0.quotedMessage)
                    const liberado = GRUPOS.includes(chat)

                    let acordadaPor = marcado ? 'tag' : (respostaAoRobo ? 'resposta' : '')
                    if (!acordadaPor && liberado && consumirJanela(chat)) acordadaPor = 'janela'
                    if (!acordadaPor) {
                        // não foi chamada: em regra, ignora. Exceções no grupo da equipe:
                        //  a) foto/PDF fica 10 min na memória para virar comprovante se a pessoa marcar o robô em seguida;
                        //  b) se a pessoa marcou o robô há pouco (15 min) e agora manda só o arquivo,
                        //     é quase certo que é o comprovante daquela reserva — repassa para o servidor decidir.
                        const info = liberado && midiaDe(m.message)
                        const chave = chat + '|' + (m.key.participant || '')
                        if (info) ultimaFoto.set(chave, { m, info, t: Date.now() })
                        const chamouHaPouco = Date.now() - (ultimoChamado.get(chave) || 0) < QUINZE_MIN
                        if (!(info && chamouHaPouco)) continue
                        acordadaPor = 'janela'
                    }

                    if (GRUPOS.length && !liberado) {
                        log('Marcado em grupo não autorizado:', chat, '(adicione em ALLOWED_GROUPS para liberar)')
                        continue
                    }
                    // marcada ou respondida = abre/renova a janela de plantão
                    if (acordadaPor === 'tag' || acordadaPor === 'resposta') abrirJanela(chat)
                    if (acordadaPor === 'janela') recenteSemMencao = true
                    acordadaPorMsg = acordadaPor
                } else {
                    // Privado: este número também recebe clientes. Só responde quem está no grupo da equipe;
                    // com qualquer outra pessoa fica quieto (a mensagem segue normal no WhatsApp Business).
                    const ids = [chat, m.key.remoteJidAlt, m.key.senderPn, m.key.participant].filter(Boolean)
                    if (!(await daEquipe(sock, ids))) continue
                }

                const chavePessoa = chat + '|' + (m.key.participant || '')
                if (!recenteSemMencao) { ultimoChamado.set(chavePessoa, Date.now()); ultimaFoto.delete(chavePessoa) }
                const texto = textoDa(m) || textoDoc(m)
                const quem = m.key.participant || chat
                const quemAlt = m.key.participantAlt || m.key.remoteJidAlt || m.key.senderPn || ''

                // Contexto: a mensagem que a pessoa respondeu/citou (como um humano leria a conversa)
                const ctx = contextoDa(m)
                const citado = ctx.quotedMessage ? textoDeMsg(ctx.quotedMessage) : ''
                const euAgora = [soNumero(sock.user?.id), soNumero(sock.user?.lid)].filter(Boolean)
                const citadoDoRobo = !!(ctx.participant && euAgora.includes(soNumero(ctx.participant)))

                // Comprovante: na própria mensagem, na mensagem respondida, ou arquivo recente da mesma pessoa
                let midia = null
                try {
                    const propria = midiaDe(m.message)
                    const citada = ctx.quotedMessage && midiaDe(ctx.quotedMessage)
                    const chave = chat + '|' + (m.key.participant || '')
                    const recente = ultimaFoto.get(chave)
                    if (propria) midia = await baixar(sock, m, propria)
                    else if (citada) midia = await baixar(sock, { key: { remoteJid: chat, id: ctx.stanzaId, participant: ctx.participant, fromMe: false } }, citada)
                    else if (recente && Date.now() - recente.t < QUINZE_MIN && /chal|reserva|entrada|comprovante|pix|paguei|pagamento|anex/i.test(texto)) midia = await baixar(sock, recente.m, recente.info)
                    if (midia) ultimaFoto.delete(chave)
                } catch (e) { log('Não consegui baixar o comprovante:', e.message) }
                for (const [k, v] of ultimaFoto) if (Date.now() - v.t > DEZ_MIN) ultimaFoto.delete(k)

                if (!texto.trim() && !midia) continue // sem texto e sem comprovante (áudio, figurinha): ignora
                const nome = m.pushName || ''
                log('Chamado por', nome || soNumero(quem), emGrupo ? `no grupo ${chat}` : 'no privado',
                    midia ? '(com comprovante)' : '',
                    acordadaPorMsg === 'janela' ? '(continuação de conversa)' : (acordadaPorMsg === 'resposta' ? '(respondeu mensagem dela)' : ''),
                    recuperada ? '(recuperada: chegou com o robô fora)' : '')
                await sock.sendPresenceUpdate('composing', chat).catch(() => { })

                let resposta = 'Tive um problema agora. Tente de novo em instantes ou use a tela de sempre.'
                try {
                    const r = await fetch(FUNC_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            secret: BOT_SECRET, chat, sender: quem, sender_alt: quemAlt, sender_name: nome, text: texto,
                            quoted_text: citado.slice(0, 2000),
                            contexto_grupo: contextoGrupo,
                            quoted_sender: ctx.participant || '',
                            quoted_from_bot: citadoDoRobo,
                            contexto_recente: recenteSemMencao,
                            acordada_por: acordadaPorMsg || undefined,
                            ...(midia || {}),
                        }),
                        signal: AbortSignal.timeout(90000),
                    })
                    const d = await r.json()
                    // silêncio proposital: o servidor viu o arquivo mas não tinha certeza de nada
                    if (d.silent) { await sock.sendPresenceUpdate('paused', chat).catch(() => { }); continue }
                    if (d.reply) resposta = d.reply
                } catch (e) { log('Erro ao falar com o servidor:', e.message) }

                await sock.sendMessage(chat, { text: resposta }, { quoted: m })
                // ela falou: a janela de plantão continua aberta por mais 15 min
                abrirJanela(chat)
                await sock.sendPresenceUpdate('paused', chat).catch(() => { })
            } catch (e) {
                log('Erro ao tratar mensagem:', e.message)
            }
        }
    })
}

process.on('unhandledRejection', e => log('Erro:', e?.message || e))
iniciar()
