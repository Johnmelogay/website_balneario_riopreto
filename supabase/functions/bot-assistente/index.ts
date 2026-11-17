// Assistente de reservas do grupo da equipe no WhatsApp.
// O programa no celular (pasta robo-whatsapp) só repassa para cá as mensagens em que o robô
// foi marcado (ou respondeu/citou), mais o arquivo que chega logo depois de uma chamada.
//
// O que ele faz aqui:
//  - lê o contexto (a mensagem citada/respondida), como uma pessoa leria a conversa;
//  - entende a intenção: nova reserva, "sim", "não", comprovante, pergunta, conversa;
//  - lê o conteúdo de comprovantes (PDF com texto, ou imagem quando há visão configurada);
//  - confere nome do pagador + valor contra a reserva/prévia, e SÓ anexa sozinho quando bate;
//  - em qualquer dúvida, faz uma pergunta curta em vez de agir.
// Se este robô cair, nada muda no fluxo de sempre (tela do funcionário e mapa).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { decidir, valorEsperado, nomeBate, type Candidato } from './verificacao.ts'
import { textoDoComprovante, extrairComprovante, type Comprovante } from './comprovante.ts'

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' }, status })

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const db = createClient(SUPABASE_URL, SERVICE_KEY)

const brl = (n: number) => 'R$ ' + (Number(n) || 0).toFixed(2).replace('.', ',')
const dataBr = (iso: string) => { const [y, m, d] = (iso || '').split('-'); return iso ? `${d}/${m}` : '' }
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

// Marca usada em bot_pending quando um comprovante está esperando um "sim"/"não".
const MARCA_COMPROVANTE = 'comprovante:aguardando'

// Data de hoje no fuso de Porto Velho (UTC-4)
function hojePVH() {
    const d = new Date(Date.now() - 4 * 3600 * 1000)
    return d.toISOString().slice(0, 10)
}
function somaDias(iso: string, n: number) {
    const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}

async function chamarLeitura(payload: Record<string, unknown>) {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/smooth-handler`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify(payload),
    })
    return r.json()
}

const soNumero = (jid = '') => String(jid).split('@')[0].split(':')[0].replace(/\D/g, '')

// Memória curta do grupo: chega do celular só quando o robô é chamado.
// Orçamento fixo (25 linhas / 400 chars por linha / 4500 no total) para o contexto não explodir.
const CTX_LINHAS = 25
const CTX_LINHA_MAX = 700   // uma reserva inteira cabe numa linha
const CTX_TOTAL_MAX = 3000

function formatarContexto(ctx: unknown): string {
    if (!Array.isArray(ctx) || !ctx.length) return ''
    const linhas = ctx.slice(-CTX_LINHAS).map((m: any) => {
        const hora = String(m?.hora || '').slice(0, 5)
        const de = String(m?.de || '?').slice(0, 40)
        const robo = m?.robo ? ' (Tainá)' : ''
        const txt = String(m?.texto || '').replace(/\s+/g, ' ').slice(0, CTX_LINHA_MAX)
        const midia = m?.midia ? ' [enviou arquivo]' : ''
        if (!txt && !midia) return ''
        return `[${hora}] ${de}${robo}: ${txt}${midia}`.trim()
    }).filter(Boolean)
    let texto = linhas.join('\n')
    if (texto.length > CTX_TOTAL_MAX) texto = texto.slice(-CTX_TOTAL_MAX)
    return texto
}

// Reserva que já está na conversa: usado quando a pessoa só diz "lança essa" citando nada.
function reservaDaConversa(conversa: string): string {
    if (!conversa) return ''
    for (const linha of conversa.split('\n').reverse()) {
        if (/chal[eé]/i.test(linha) && /(entrada|sa[ií]da|total|pago|valor)/i.test(linha) && linha.length > 60) {
            return linha.replace(/^\[[^\]]*\]\s*[^:]{1,40}:\s*/, '')
        }
    }
    return ''
}

// Salva a foto/PDF no mesmo lugar dos comprovantes do mapa (bucket "receipts") e devolve o link
async function subirComprovante(bytes: Uint8Array, mime: string) {
    if (bytes.length > 15 * 1024 * 1024) throw new Error('arquivo grande demais')
    const ext = mime.includes('pdf') ? 'pdf' : mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg'
    const path = `whatsapp/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`
    const { error } = await db.storage.from('receipts').upload(path, bytes, { contentType: mime, upsert: false })
    if (error) throw error
    return db.storage.from('receipts').getPublicUrl(path).data.publicUrl
}

const AJUDA = `Oi! Sou o assistente de reservas do Balneário Rio Preto. Posso:

*1. Responder sobre reservas*
- "quantas reservas tem hoje?" / "quem chega amanhã?"
- "quais chalés estão livres de 20 a 22/12?"
- "detalhes da reserva da Edivanda"
- "quanto falta receber este fim de semana?"

*2. Lançar uma reserva*
Mande o texto como vocês já escrevem (nome, chalé ou chalés, entrada, saída, pessoas, total e pago).
Se tiver comprovante, mande a foto/PDF com o texto na legenda: ele fica anexado à reserva no mapa.
Eu mostro como entendi, chalé por chalé, e só gravo quando alguém responder *sim*. Para cancelar, responda *não*.

*3. Anexar comprovante a uma reserva já gravada*
Mande o comprovante me marcando (ou respondendo a mensagem da reserva). Eu leio o nome do pagador e
o valor, confiro com a reserva e só anexo quando tenho certeza — se ficar em dúvida, eu pergunto.

*Como me chamar*
- No grupo: me marque (@) na mensagem ou responda uma mensagem minha.
- No privado: é só escrever (somente para quem é da equipe).

Mande *ajuda* a qualquer momento para ver esta lista.`

const SAUDACAO = 'Oi! 👋 Sou o assistente de reservas do Balneário. Me marque com a reserva ou com a pergunta que eu resolvo — e mande *ajuda* para ver tudo o que eu faço.'

// manual completo: só quando pedem de verdade
function pedeManual(t: string) {
    const s = t.trim().toLowerCase()
    return /^(ajuda|help|menu|comandos|op[cç][oõ]es)[\s!?.]*$/.test(s) ||
        /o que (voc[eê]|vc|tu) (pode|sabe|consegue) fazer|quais (s[aã]o )?(suas )?fun[cç][oõ]es|como (te|voc[eê]) (uso|usar|funciona)|para que (voc[eê]|vc) serve/.test(s)
}

// cumprimento solto: resposta curta, não o manual inteiro
function eSaudacao(t: string) {
    const s = t.trim().toLowerCase()
    return !s || /^(oi|ol[aá]|bom dia|boa tarde|boa noite)[\s!?.]*$/.test(s)
}

function pareceReserva(t: string) {
    const temChale = /chal[eéÉ]/i.test(t)
    const temData = /entrada|sa[ií]da|check.?in|\d{1,2}\s*\/\s*\d{1,2}|\d{1,2}\s+de\s+[a-zç]+/i.test(t)
    const temDetalhe = /pago|total|valor|casal|adult|pessoa|sinal/i.test(t)
    const pergunta = /\?\s*$|^(quant|qual|quais|quem|tem |existe|como|onde|me (diz|fala|mostra))/i.test(t.trim())
    return temChale && temData && temDetalhe && !pergunta && t.length > 40
}

function textoPrevia(rows: any[], warnings: string[], extra: { comprovante?: boolean; avisoComprovante?: string } = {}) {
    const linhas = rows.map((r: any) => {
        const falta = (Number(r.total_price) || 0) - (Number(r.advance_payment) || 0)
        return `*Chalé ${r.chalet_id}*: ${r.guest_name}\n${dataBr(r.checkin_date)} a ${dataBr(r.checkout_date)} • ${r.adults} adulto(s)\nTotal ${brl(r.total_price)} • pago ${brl(r.advance_payment)}${falta > 0 ? ` • falta ${brl(falta)}` : ''}`
    })
    let txt = `Entendi assim:\n\n${linhas.join('\n\n')}`
    if (rows.length > 1) {
        const t = rows.reduce((s: number, r: any) => s + Number(r.total_price || 0), 0)
        const p = rows.reduce((s: number, r: any) => s + Number(r.advance_payment || 0), 0)
        txt += `\n\n*Grupo*: ${rows.length} chalés • total ${brl(t)} • pago ${brl(p)}`
    }
    if (warnings?.length) txt += `\n\nAvisos:\n- ${warnings.join('\n- ')}`
    txt += extra.comprovante ? `\n\nComprovante: *anexado* (vai aparecer na reserva, no mapa).` : `\n\nComprovante: nenhum. Se tiver, mande a foto me marcando antes de confirmar.`
    if (extra.avisoComprovante) txt += `\n\n⚠️ ${extra.avisoComprovante}`
    txt += `\n\nEstá correto? Me marque e responda *sim* para gravar ou *não* para cancelar. Para corrigir, mande o texto de novo.`
    return txt
}

async function responderPergunta(pergunta: string, conversa = '') {
    const hoje = hojePVH()
    const ini = somaDias(hoje, -15), fim = somaDias(hoje, 120)
    const { data: reservas, error } = await db.from('bookings')
        .select('chalet_id, checkin_date, checkout_date, guest_name, contact_info, adults, total_price, advance_payment, arrival_time, status, raw_message')
        .lte('checkin_date', fim).gte('checkout_date', ini).neq('status', 'cancelled')
        .order('checkin_date')
    if (error) throw error
    const { data: bloqueios } = await db.from('blocked_chalets').select('chalet_id')

    const linhas = (reservas || []).map((b: any) => {
        let grupo = ''
        try { const g = JSON.parse(b.raw_message || '{}').group; if (g?.chalets?.length > 1) grupo = ` | grupo chalés ${g.chalets.join(',')} total ${g.total}` } catch (_) { }
        return `chalé ${b.chalet_id} | ${b.checkin_date} a ${b.checkout_date} | ${b.guest_name} | tel ${b.contact_info || '-'} | ${b.adults} adultos | total ${b.total_price} | pago ${b.advance_payment} | chegada ${b.arrival_time || '-'} | ${b.status === 'pending' ? 'pendente' : 'confirmada'}${grupo}`
    })
    const diaSemana = DIAS[new Date(hoje + 'T12:00:00Z').getUTCDay()]
    const system = `Você é o assistente de reservas do Balneário Rio Preto (chalés 1 a 10, perto de Porto Velho), respondendo no grupo de WhatsApp da equipe.
Hoje é ${diaSemana}, ${hoje} (horário de Porto Velho).
Regras do lugar: entrada a partir das 12h (14h quando outro hóspede sai no mesmo dia); saída até 12h, aos domingos até 16h30.
Uma reserva ocupa o chalé da data de entrada até a véspera da saída (quem sai dia 10 libera o chalé para quem entra dia 10).
Chalés bloqueados pela administração: ${(bloqueios || []).map((b: any) => b.chalet_id).join(', ') || 'nenhum'}.

Responda em português simples e curto, como uma pessoa da equipe. Use *negrito* do WhatsApp para destacar. Sem tabelas.
Use SOMENTE os dados abaixo (reservas de ${ini} a ${fim}). Se a resposta não estiver nos dados, diga que não encontrou.
${conversa ? `\nCONVERSA RECENTE DO GRUPO (mais antiga primeiro; só a última é dirigida a você):\n${conversa}\n` : ''}
Valores em reais no formato R$ 280,00. Datas no formato dd/mm.
Você responde perguntas sobre as reservas. Para lançar uma reserva, a pessoa manda o texto da reserva (nome, chalés, datas, pessoas, total, pago) e você mostra uma prévia para ela confirmar com "sim". Se perguntarem o que você faz, diga para mandar "ajuda".

RESERVAS:
${linhas.join('\n') || '(nenhuma)'}`

    const key = Deno.env.get('DEEPSEEK_API_KEY') || Deno.env.get('DEEPSEEK_KEY')
    const r = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
            model: 'deepseek-flash', temperature: 0.2, stream: false,
            messages: [{ role: 'system', content: system }, { role: 'user', content: pergunta }],
        }),
    })
    const d = await r.json()
    if (!r.ok || d.error) throw new Error(d?.error?.message || `IA indisponível (HTTP ${r.status})`)
    return (d.choices?.[0]?.message?.content || 'Não consegui responder agora.').trim()
}

// ---------------------------------------------------------------------------
// Entender a mensagem como um humano: o que a pessoa quer, lendo também o que
// ela respondeu/citou e o texto do arquivo que veio junto.
// ---------------------------------------------------------------------------
type Leitura = { intencao: string; confianca: number; reserva_texto: string | null; motivo?: string }

async function interpretar(p: {
    texto: string; citado: string; conversa: string; temArquivo: boolean; temPrevia: boolean; textoArquivo: string
}): Promise<Leitura | null> {
    const key = Deno.env.get('DEEPSEEK_API_KEY') || Deno.env.get('DEEPSEEK_KEY')
    if (!key) return null

    const sistema = `Você interpreta mensagens do grupo de WhatsApp da equipe de um balneário com chalés 1 a 10.
A pessoa está falando com o assistente de reservas (chamado Tainá). Sua tarefa é dizer o que ela quer.

Você recebe JSON com:
- "mensagem": o texto que a pessoa mandou agora
- "citada": o texto da mensagem que ela respondeu/citou (pode estar vazio)
- "tem_arquivo": true se veio foto ou PDF junto
- "previa_aberta": true se existe uma prévia de reserva esperando confirmação
- "texto_arquivo": texto lido do arquivo (pode estar vazio)
- "conversa_recente": as últimas mensagens do grupo, mais antigas primeiro (só a "mensagem" é dirigida a você)

Responda SOMENTE JSON:
{"intencao":"nova_reserva|confirmar|cancelar|comprovante|pergunta|ajuda|conversa","confianca":0.0,"reserva_texto":null,"motivo":"curto"}

Regras:
- "confirmar": a pessoa concorda com uma prévia ("sim", "pode gravar", "isso", "confirmado", "beleza", "tá bom").
- "cancelar": desiste ("não", "cancela", "deixa pra depois").
- "comprovante": manda ou fala de comprovante/pagamento/pix ("segue o comprovante", "paguei os 50%", ou só o arquivo).
  Se respondeu a uma reserva dizendo que pagou, também é comprovante.
- "nova_reserva": traz nome, chalé(s), datas e valores de uma reserva. Nesse caso, junte em "reserva_texto"
  o texto da mensagem com "citada" (se a mensagem citada for a própria reserva, ela é o texto principal).
  Se a pessoa só aponta para uma reserva que já está na "conversa_recente" ("lança essa", "essa aqui",
  "confirma pra mim"), use o texto dessa reserva em "reserva_texto". Nunca invente dados que não estejam lá.
- "pergunta": quer saber algo sobre reservas, disponibilidade, valores, hóspedes.
- "ajuda": pede instruções ou cumprimenta.
- "conversa": qualquer outra coisa.
- A conversa pode estar em andamento: uma mensagem sem marcação pode ser continuação do que você
  acabou de perguntar (ex.: "sim", "320", "é do Antônio", "pode ser"). Nesse caso, use a
  "conversa_recente" para entender e responda com a intenção correspondente.
- Se estiver em dúvida entre "nova_reserva" e "conversa", responda "conversa" com confiança baixa.
- "confianca" é o quanto você tem certeza (0 a 1). Seja honesto: prefira confiança baixa a errar.`

    const usuario = JSON.stringify({
        mensagem: p.texto.slice(0, 3000),
        citada: p.citado.slice(0, 2000),
        tem_arquivo: p.temArquivo,
        previa_aberta: p.temPrevia,
        texto_arquivo: p.textoArquivo.slice(0, 1500),
        conversa_recente: p.conversa.slice(-3000),
    })

    try {
        const r = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify({
                model: 'deepseek-flash', temperature: 0, stream: false,
                messages: [{ role: 'system', content: sistema }, { role: 'user', content: usuario }],
            }),
        })
        const d = await r.json()
        if (!r.ok || d.error) throw new Error(d?.error?.message || `HTTP ${r.status}`)
        const bruto = String(d.choices?.[0]?.message?.content || '')
        const i = bruto.indexOf('{'), f = bruto.lastIndexOf('}')
        if (i < 0 || f < 0) return null
        const o = JSON.parse(bruto.slice(i, f + 1))
        return {
            intencao: String(o.intencao || 'conversa'),
            confianca: Math.max(0, Math.min(1, Number(o.confianca) || 0)),
            reserva_texto: o.reserva_texto ? String(o.reserva_texto) : null,
            motivo: o.motivo ? String(o.motivo) : '',
        }
    } catch (e) {
        console.error('interpretar', e)
        return null
    }
}

// ---------------------------------------------------------------------------
// Comprovantes: candidatos, decisão e anexo
// ---------------------------------------------------------------------------
async function candidatosDoComprovante(chat: string, pendente: any): Promise<Candidato[]> {
    // 1) se existe prévia aberta neste grupo, o comprovante é quase certamente dela
    if (pendente && pendente.text !== MARCA_COMPROVANTE && Array.isArray(pendente.rows) && pendente.rows.length) {
        return pendente.rows.map((r: any) => ({
            tipo: 'pendente' as const,
            id: pendente.id,
            guest_name: r.guest_name,
            valor_esperado: valorEsperado(r.total_price, r.advance_payment),
            valor_total: r.total_price ?? null,
            chalet_id: r.chalet_id,
            checkin_date: r.checkin_date,
        }))
    }
    // 2) senão, reservas dos últimos 7 dias que ainda não têm comprovante
    const desde = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
    const { data } = await db.from('bookings')
        .select('id, chalet_id, guest_name, checkin_date, total_price, advance_payment')
        .gte('created_at', desde).is('payment_proof_url', null).neq('status', 'cancelled')
        .order('created_at', { ascending: false })
    return (data || []).map((b: any) => ({
        tipo: 'reserva' as const,
        id: b.id,
        guest_name: b.guest_name,
        valor_esperado: valorEsperado(b.total_price, b.advance_payment),
        valor_total: b.total_price ?? null,
        chalet_id: b.chalet_id,
        checkin_date: b.checkin_date,
    }))
}

// Durante a recuperação, alguém pode ter lançado a reserva à mão (foi o que aconteceu em 17/11).
// Antes de criar prévia, confere se já existe reserva do mesmo hóspede, mesmo chalé e mesma entrada.
async function jaExisteReserva(rows: any[]) {
    const chalets = [...new Set(rows.map((r: any) => r.chalet_id).filter(Boolean))]
    const datas = [...new Set(rows.map((r: any) => r.checkin_date).filter(Boolean))]
    if (!chalets.length || !datas.length) return null
    const { data } = await db.from('bookings')
        .select('id, guest_name, chalet_id, checkin_date, status')
        .in('chalet_id', chalets).in('checkin_date', datas).neq('status', 'cancelled')
    for (const b of data || []) {
        const igual = rows.some((r: any) => r.chalet_id === b.chalet_id && r.checkin_date === b.checkin_date && nomeBate(r.guest_name || '', b.guest_name || '').ok)
        if (igual) return b
    }
    return null
}

async function anexarComprovante(c: Candidato, imageUrl: string) {
    if (c.tipo === 'pendente') {
        await db.from('bot_pending').update({ image_url: imageUrl }).eq('id', c.id)
    } else if (c.tipo === 'reserva' && c.id) {
        await db.from('bookings').update({ payment_proof_url: imageUrl }).eq('id', c.id)
    }
}

const descreve = (c: Candidato) => `*${c.guest_name}* (chalé ${c.chalet_id}${c.checkin_date ? `, entrada ${dataBr(c.checkin_date)}` : ''})`

async function tratarComprovante(args: {
    chat: string; sender: string; senderAlt: string; nomeWhats: string
    pendente: any; comprovante: Comprovante | null; imageUrl: string | null; passivo: boolean
}): Promise<any> {
    const { chat, sender, senderAlt, nomeWhats, pendente, comprovante, imageUrl, passivo } = args

    if (!imageUrl) return { ok: true, silent: true }
    if (!comprovante || (comprovante.nome === null && comprovante.valor === null)) {
        if (passivo) return { ok: true, silent: true }
        return {
            ok: true,
            reply: 'Recebi o arquivo, mas não consegui ler o valor nem o nome do pagador. Me diga o valor pago e de quem é, ou mande uma foto mais nítida.',
        }
    }

    const candidatos = await candidatosDoComprovante(chat, pendente)
    const d = decidir(candidatos, comprovante)
    const valorTxt = d.valor !== null ? brl(d.valor) : '?'

    if (d.acao === 'anexar' && d.candidato) {
        await anexarComprovante(d.candidato, imageUrl)
        if (d.candidato.tipo === 'pendente') {
            return {
                ok: true,
                reply: `Comprovante anexado à prévia do chalé ${d.candidato.chalet_id} — *${d.candidato.guest_name}*, ${valorTxt} ✅\n\nFalta alguém responder *sim* para gravar a reserva.`,
            }
        }
        return {
            ok: true,
            reply: `Comprovante anexado ✅ *${d.candidato.guest_name}* — chalé ${d.candidato.chalet_id}${d.candidato.checkin_date ? `, entrada ${dataBr(d.candidato.checkin_date)}` : ''}, ${valorTxt}.\nJá aparece no mapa.`,
        }
    }

    if (d.acao === 'confirmar' && d.candidato) {
        const c = d.candidato
        await db.from('bot_pending').delete().eq('chat', chat)
        await db.from('bot_pending').insert([{
            chat, sender, sender_alt: senderAlt || null, sender_name: nomeWhats,
            text: MARCA_COMPROVANTE, rows: [c], image_url: imageUrl,
        }])
        const pagador = d.nome ? ` (pagador: ${d.nome})` : ''
        return {
            ok: true,
            reply: `O comprovante é de ${valorTxt}${pagador}. Pelo valor, parece ser da reserva de ${descreve(c)}.\n\nConfirma que é essa? Responda *sim* para anexar ou *não* para eu não mexer em nada.`,
        }
    }

    // dúvida: nunca age, só pergunta
    if (d.motivo === 'nada') {
        if (passivo) return { ok: true, silent: true }
        return {
            ok: true,
            reply: `Li um comprovante de ${valorTxt}${d.nome ? ` (pagador ${d.nome})` : ''}, mas não achei reserva em aberto que combine com esse valor.\n\nMe diga o nome do hóspede ou o chalé e eu anexo.`,
        }
    }
    if (d.motivo === 'sem_leitura') {
        if (passivo) return { ok: true, silent: true }
        return { ok: true, reply: 'Não consegui ler o comprovante. Pode mandar de novo (foto mais nítida ou o PDF) ou escrever o valor pago?' }
    }
    if (d.motivo === 'ambiguo' && d.opcoes?.length) {
        const lista = d.opcoes.slice(0, 5).map(c => `- ${descreve(c)}`).join('\n')
        return {
            ok: true,
            reply: `Achei mais de uma reserva em aberto com esse valor:\n\n${lista}\n\nQual é? Responda o nome do hóspede ou o número do chalé.`,
        }
    }
    // so_nome: nome confere mas valor não
    if (d.motivo === 'so_nome' && d.opcoes?.length) {
        const c = d.opcoes[0]
        return {
            ok: true,
            reply: `O comprovante é de ${valorTxt}, mas a reserva de ${descreve(c)} tem ${brl(c.valor_esperado)} combinado.\n\nÉ esse comprovante mesmo? Se for, responda *sim* que eu anexo; se não, me diga o nome certo.`,
        }
    }
    return { ok: true, reply: `Não consegui ter certeza sobre esse comprovante (${valorTxt}). Me diga o nome do hóspede e eu anexo.` }
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
    if (req.method !== 'POST') return json({ ok: false }, 405)
    let body: any = {}
    try { body = await req.json() } catch { return json({ ok: false, reply: 'Pedido inválido.' }, 400) }

    const secret = Deno.env.get('BOT_SECRET')
    if (!secret || body.secret !== secret) return json({ ok: false, reply: 'Não autorizado.' }, 401)

    const chat = String(body.chat || '')
    const sender = String(body.sender || '')
    const senderAlt = String(body.sender_alt || '')
    const nomeWhats = String(body.sender_name || '').slice(0, 60)
    const mime = String(body.image_mime || 'image/jpeg')
    const texto = String(body.text || '').replace(/@\d{6,}/g, '').trim()
    const citado = String(body.quoted_text || '').replace(/@\d{6,}/g, '').trim()
    const citadoDoRobo = body.quoted_from_bot === true
    const contextoRecente = body.contexto_recente === true
    const janela = body.acordada_por === 'janela'   // continuação de conversa, sem marcação
    const recuperada = body.recuperada === true     // chegou atrasada: ficou fora e voltou
    const conversa = formatarContexto(body.contexto_grupo)

    try {
        // --- Quem é: pelo número de quem escreveu (lista da equipe na tabela bot_equipe) ---
        const ids = [...new Set([sender, senderAlt].map(soNumero).filter(Boolean))]
        const { data: cad } = ids.length ? await db.from('bot_equipe').select('numero, nome').in('numero', ids) : { data: [] }
        const nomeEquipe = (cad || [])[0]?.nome || ''
        // sem cadastro: nome do perfil, a não ser que seja o da empresa; aí fica o número
        const quemE = nomeEquipe || (nomeWhats && !/balne[aá]rio|rio preto/i.test(nomeWhats) ? nomeWhats : (ids.find(i => i.length >= 10 && i.length <= 13) || 'WhatsApp'))

        if (!body.image_base64) {
            if (pedeManual(texto)) return json({ ok: true, reply: AJUDA })
            if (eSaudacao(texto)) return json({ ok: true, reply: SAUDACAO })
        }

        // --- Arquivo: guarda, lê o conteúdo e extrai nome/valor do pagador ---
        let imageUrl: string | null = null
        let comprovante: Comprovante | null = null
        let textoArquivo = ''
        if (body.image_base64) {
            try {
                const bytes = Uint8Array.from(atob(String(body.image_base64)), c => c.charCodeAt(0))
                imageUrl = await subirComprovante(bytes, mime)
                const lido = await textoDoComprovante(bytes, mime)
                textoArquivo = lido.texto
                if (textoArquivo.trim()) comprovante = await extrairComprovante(textoArquivo)
                console.log('arquivo', lido.origem, JSON.stringify(comprovante), 'chars:', textoArquivo.length)
            } catch (e) {
                console.error('arquivo', e)
            }
        }

        // --- Prévia pendente neste grupo (últimos 30 minutos) ---
        const limite = new Date(Date.now() - 30 * 60 * 1000).toISOString()
        const { data: pend } = await db.from('bot_pending').select('*').eq('chat', chat).gte('created_at', limite)
            .order('created_at', { ascending: false }).limit(1)
        let pendente = pend?.[0]
        // comprovante esperando "sim"/"não" tem prazo maior (a equipe pode demorar a conferir)
        if (!pendente) {
            const limiteLongo = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
            const { data: pendLongo } = await db.from('bot_pending').select('*').eq('chat', chat)
                .eq('text', MARCA_COMPROVANTE).gte('created_at', limiteLongo)
                .order('created_at', { ascending: false }).limit(1)
            pendente = pendLongo?.[0]
        }
        const previaDeComprovante = pendente?.text === MARCA_COMPROVANTE

        // --- O que a pessoa quer ---
        const leitura = await interpretar({
            texto, citado, conversa, temArquivo: !!body.image_base64, temPrevia: !!pendente, textoArquivo,
        })
        const intencao = leitura?.intencao || ''
        const conf = Number(leitura?.confianca || 0)

        // Janela de conversa: só responde se a mensagem realmente pede algo.
        // Conversa paralela do grupo (ou baixa confiança) fica em silêncio.
        if (janela) {
            // só "acorda" para algo que pede ação dela — conversa nunca é acionável
            const acionavel = !!leitura && (
                (intencao === 'pergunta' && conf >= 0.7) ||
                (['confirmar', 'cancelar', 'comprovante', 'nova_reserva', 'ajuda'].includes(intencao) && conf >= 0.6)
            )
            const reservaNaCara = !leitura && pareceReserva(texto)
            if (!acionavel && !reservaNaCara && !body.image_base64) {
                return json({ ok: true, silent: true })
            }
        }

        // Confirmação/cancelamento de um comprovante que ficou em dúvida
        if (previaDeComprovante && /^(sim|s|isso|correto|confirmo|confirma|pode|ok)\b/i.test(texto)) {
            const c = (pendente.rows || [])[0]
            if (c) {
                await anexarComprovante(c, pendente.image_url)
                await db.from('bot_pending').delete().eq('chat', chat)
                return json({ ok: true, reply: `Anexado ✅ ${descreve(c)}. Já aparece no mapa.` })
            }
        }
        if (previaDeComprovante && /^(n[aã]o|cancela|cancelar|errado)\b/i.test(texto)) {
            await db.from('bot_pending').delete().eq('chat', chat)
            return json({ ok: true, reply: 'Ok, não anexei nada.' })
        }

        // --- Confirmação de reserva (prévia de reserva normal) ---
        const confirmaReserva = intencao === 'confirmar'
            ? conf >= 0.5
            : (!leitura && pendente && !previaDeComprovante && /^(sim|s|isso|correto|confirmo|confirma|pode gravar|grava|ok)\b/i.test(texto))
        if (confirmaReserva && pendente && !previaDeComprovante) {
            const nome = quemE
            const comprovanteFinal = imageUrl || pendente.image_url || null
            const rows = (pendente.rows || []).map((r: any) => ({ ...r, payment_proof_url: r.payment_proof_url || comprovanteFinal }))
            const d = await chamarLeitura({ confirm_rows: rows, image_url: comprovanteFinal, madeby: `${nome} (WhatsApp)`, device: 'robo-whatsapp', location: 'grupo WhatsApp' })
            if (d.success) {
                await db.from('bot_pending').delete().eq('chat', chat)
                return json({ ok: true, reply: `Gravado por *${nome}*: ${(d.data || []).map((r: any) => `chalé ${r.chalet_id}`).join(', ')}. Já aparece no mapa como *pendente*.${comprovanteFinal ? ' Comprovante anexado.' : ''}` })
            }
            return json({ ok: true, reply: `Não gravei. ${d.message || ''}`.trim() })
        }

        // Diz "sim"/"não" mas não existe prévia em aberto: avisa em vez de responder qualquer coisa
        if ((intencao === 'confirmar' || intencao === 'cancelar') && conf >= 0.55 && !pendente) {
            return json({ ok: true, reply: 'Não tenho nenhuma prévia aberta esperando confirmação agora. Mande o texto da reserva me marcando que eu monto.' })
        }

        // --- Cancelamento ---
        const cancela = intencao === 'cancelar'
            ? conf >= 0.5
            : (!leitura && pendente && /^(n[aã]o|cancela|cancelar|errado)\b/i.test(texto))
        if (cancela && pendente) {
            await db.from('bot_pending').delete().eq('chat', chat)
            return json({ ok: true, reply: 'Cancelado, nada foi gravado. Pode mandar o texto corrigido me marcando.' })
        }

        // --- Nova reserva ---
        const daConversa = texto.trim().length <= 80 ? reservaDaConversa(conversa) : ''
        const textoReserva = leitura?.intencao === 'nova_reserva' && leitura.reserva_texto
            ? leitura.reserva_texto
            : (daConversa && (leitura?.intencao === 'nova_reserva' || conf >= 0.5) ? `${daConversa}\n${texto}` : (citado && !pareceReserva(texto) ? `${citado}\n${texto}` : texto))
        const querReserva = (intencao === 'nova_reserva' && conf >= 0.55) || pareceReserva(texto)

        if (querReserva) {
            const d = await chamarLeitura({
                text: textoReserva, image_url: imageUrl, madeby: `${quemE} (WhatsApp)`,
                device: 'robo-whatsapp', location: 'grupo WhatsApp', dry_run: true,
            })
            const rows = d.data || []
            if (d.success && rows.length) {
                if (recuperada) {
                    const dup = await jaExisteReserva(rows)
                    if (dup) {
                        return json({ ok: true, reply: `⏪ Isso já está no mapa: *${dup.guest_name}* (chalé ${dup.chalet_id}, entrada ${dataBr(dup.checkin_date)}). Não fiz nada.` })
                    }
                }
                // O comprovante que veio junto confere com a prévia?
                let avisoComprovante = ''
                if (comprovante && rows.length) {
                    const alvo: Candidato[] = rows.map((r: any) => ({
                        tipo: 'reserva' as const,
                        guest_name: r.guest_name,
                        valor_esperado: valorEsperado(r.total_price, r.advance_payment),
                        valor_total: r.total_price ?? null,
                        chalet_id: r.chalet_id,
                        checkin_date: r.checkin_date,
                    }))
                    const v = decidir(alvo, comprovante)
                    if (v.acao !== 'anexar') {
                        avisoComprovante = `o comprovante lido é de ${v.valor !== null ? brl(v.valor) : 'valor não identificado'}${comprovante.nome ? ` (pagador ${comprovante.nome})` : ''} e não confere com esta prévia. Confira antes de gravar.`
                    }
                }
                await db.from('bot_pending').delete().eq('chat', chat)
                await db.from('bot_pending').insert([{
                    chat, sender, sender_alt: senderAlt || null, sender_name: nomeWhats, text: textoReserva, rows, image_url: imageUrl,
                }])
                const previa = textoPrevia(rows, d.warnings || [], { comprovante: !!imageUrl, avisoComprovante })
                return json({ ok: true, reply: recuperada ? `⏪ Recuperando o que passou enquanto eu estava fora:\n\n${previa}` : previa })
            }
            if (intencao === 'nova_reserva' && conf >= 0.55) {
                return json({ ok: true, reply: `Não consegui montar a reserva:\n${String(d.message || 'erro desconhecido').replace(/^Nada foi gravado\. Corrija e mande de novo:\n?/, '')}\n\nCorrija e mande de novo me marcando.` })
            }
        }

        // --- Comprovante ---
        const pareceComprovante = intencao === 'comprovante'
            || (!!body.image_base64 && (contextoRecente || !texto))
            || (!!body.image_base64 && /comprovante|pix|paguei|pagamento|transfer/i.test(texto) && !pareceReserva(texto))
        if (pareceComprovante) {
            if (!body.image_base64) {
                return json({ ok: true, reply: 'Manda o comprovante aqui (foto ou PDF) que eu leio o valor e o nome do pagador, confiro com a reserva e anexo. 📎' })
            }
            const respostaComprovante = await tratarComprovante({
                chat, sender, senderAlt, nomeWhats, pendente, comprovante, imageUrl, passivo: contextoRecente,
            })
            if (recuperada && respostaComprovante?.reply) respostaComprovante.reply = '⏪ ' + respostaComprovante.reply
            return json(respostaComprovante)
        }

        // --- Pergunta ---
        if (intencao === 'pergunta' || intencao === 'ajuda' || /[?]/.test(texto)) {
            if (recuperada) return json({ ok: true, silent: true })   // pergunta velha: não vale responder
            return json({ ok: true, reply: await responderPergunta(texto, conversa) })
        }

        // --- Conversa solta (ou nada identificado) ---
        if (leitura && intencao === 'conversa' && conf >= 0.6 && !recuperada) {
            return json({ ok: true, reply: 'Tô por aqui 👋 Me mande a reserva ou pergunte algo que eu resolvo. (Mande *ajuda* para ver o que eu faço.)' })
        }

        if (recuperada) return json({ ok: true, silent: true })
        return json({ ok: true, reply: await responderPergunta(texto, conversa) })
    } catch (e) {
        console.error(e)
        return json({ ok: false, reply: 'Tive um problema agora. Tente de novo em instantes ou use a tela de sempre.' }, 500)
    }
})
