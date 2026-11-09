// Robô de reservas do grupo da equipe (Balneário Rio Preto).
// Roda no Android (Termux). Entra no WhatsApp do número do robô como "aparelho conectado"
// e SÓ olha mensagens de grupo em que ele foi marcado (ou respostas a mensagens dele).
// Todo o resto é ignorado e não é lido nem guardado.
// O "cérebro" fica no Supabase (função bot-assistente). Se este programa cair, o fluxo
// de sempre (tela do funcionário e mapa) continua funcionando normalmente.
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } from '@whiskeysockets/baileys'
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

function textoDa(m) {
    const msg = m.message || {}
    const corpo = msg.ephemeralMessage?.message || msg
    return corpo.conversation || corpo.extendedTextMessage?.text || corpo.imageMessage?.caption || ''
}
function contextoDa(m) {
    const msg = m.message || {}
    const corpo = msg.ephemeralMessage?.message || msg
    return corpo.extendedTextMessage?.contextInfo || corpo.imageMessage?.contextInfo || {}
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

    sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
        if (connection === 'open') log('Conectado ao WhatsApp como', soNumero(sock.user?.id))
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

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return
        for (const m of messages) {
            try {
                const chat = m.key.remoteJid || ''
                if (m.key.fromMe || !chat || chat === 'status@broadcast' || chat.endsWith('@newsletter') || chat.endsWith('@broadcast')) continue
                const emGrupo = chat.endsWith('@g.us')

                if (emGrupo) {
                    const ctx = contextoDa(m)
                    const eu = [soNumero(sock.user?.id), soNumero(sock.user?.lid)].filter(Boolean)
                    const marcado = (ctx.mentionedJid || []).some(j => eu.includes(soNumero(j)))
                    const respostaAoRobo = ctx.participant && eu.includes(soNumero(ctx.participant)) && ctx.quotedMessage
                    if (!marcado && !respostaAoRobo) continue // não foi chamado: ignora sem ler

                    if (GRUPOS.length && !GRUPOS.includes(chat)) {
                        log('Marcado em grupo não autorizado:', chat, '(adicione em ALLOWED_GROUPS para liberar)')
                        continue
                    }
                } else {
                    // Privado: este número também recebe clientes. Só responde quem está no grupo da equipe;
                    // com qualquer outra pessoa fica quieto (a mensagem segue normal no WhatsApp Business).
                    const ids = [chat, m.key.remoteJidAlt, m.key.senderPn, m.key.participant].filter(Boolean)
                    if (!(await daEquipe(sock, ids))) continue
                }

                const texto = textoDa(m)
                if (!texto.trim() && !emGrupo) continue // privado sem texto (foto, áudio): ignora
                const nome = m.pushName || soNumero(m.key.participant || chat)
                log('Chamado por', nome, emGrupo ? `no grupo ${chat}` : 'no privado')
                await sock.sendPresenceUpdate('composing', chat).catch(() => { })

                let resposta = 'Tive um problema agora. Tente de novo em instantes ou use a tela de sempre.'
                try {
                    const r = await fetch(FUNC_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ secret: BOT_SECRET, chat, sender: m.key.participant || chat, sender_name: nome, text: texto }),
                        signal: AbortSignal.timeout(90000),
                    })
                    const d = await r.json()
                    if (d.reply) resposta = d.reply
                } catch (e) { log('Erro ao falar com o servidor:', e.message) }

                await sock.sendMessage(chat, { text: resposta }, { quoted: m })
                await sock.sendPresenceUpdate('paused', chat).catch(() => { })
            } catch (e) {
                log('Erro ao tratar mensagem:', e.message)
            }
        }
    })
}

process.on('unhandledRejection', e => log('Erro:', e?.message || e))
iniciar()
