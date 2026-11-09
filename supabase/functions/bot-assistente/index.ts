// Assistente de reservas do grupo da equipe no WhatsApp.
// O programa no celular (pasta robo-whatsapp) só repassa para cá as mensagens em que o robô
// foi marcado. Aqui decidimos:
//  - "sim"/"não" para uma prévia pendente  -> grava ou cancela (via smooth-handler, confirm_rows)
//  - texto com cara de reserva             -> prévia (smooth-handler, dry_run) e pede confirmação
//  - qualquer outra coisa                   -> pergunta sobre reservas, respondida com os dados do mapa
// Se este robô cair, nada muda no fluxo de sempre (tela do funcionário e mapa).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' }, status })

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const db = createClient(SUPABASE_URL, SERVICE_KEY)

const brl = (n: number) => 'R$ ' + (Number(n) || 0).toFixed(2).replace('.', ',')
const dataBr = (iso: string) => { const [y, m, d] = (iso || '').split('-'); return iso ? `${d}/${m}` : '' }
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

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

const AJUDA = `Oi! Sou o assistente de reservas do Balneário Rio Preto. Posso:

*1. Responder sobre reservas*
- "quantas reservas tem hoje?" / "quem chega amanhã?"
- "quais chalés estão livres de 20 a 22/12?"
- "detalhes da reserva da Edivanda"
- "quanto falta receber este fim de semana?"

*2. Lançar uma reserva*
Mande o texto como vocês já escrevem (nome, chalé ou chalés, entrada, saída, pessoas, total e pago).
Eu mostro como entendi, chalé por chalé, e só gravo quando alguém responder *sim*. Para cancelar, responda *não*.

*Como me chamar*
- No grupo: me marque (@) na mensagem ou responda uma mensagem minha.
- No privado: é só escrever (somente para quem é da equipe).

Mande *ajuda* a qualquer momento para ver esta lista.`

function pedeAjuda(t: string) {
    const s = t.trim().toLowerCase()
    return !s || /^(ajuda|help|menu|comandos|op[cç][oõ]es|oi|ol[aá]|bom dia|boa tarde|boa noite)[\s!?.]*$/.test(s) ||
        /o que (voc[eê]|vc|tu) (pode|sabe|consegue) fazer|quais (s[aã]o )?(suas )?fun[cç][oõ]es|como (te|voc[eê]) (uso|usar|funciona)|para que (voc[eê]|vc) serve/.test(s)
}

function pareceReserva(t: string) {
    const temChale = /chal[eéÉ]/i.test(t)
    const temData = /entrada|sa[ií]da|check.?in|\d{1,2}\s*\/\s*\d{1,2}|\d{1,2}\s+de\s+[a-zç]+/i.test(t)
    const temDetalhe = /pago|total|valor|casal|adult|pessoa|sinal/i.test(t)
    const pergunta = /\?\s*$|^(quant|qual|quais|quem|tem |existe|como|onde|me (diz|fala|mostra))/i.test(t.trim())
    return temChale && temData && temDetalhe && !pergunta && t.length > 40
}

function textoPrevia(rows: any[], warnings: string[]) {
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
    txt += `\n\nEstá correto? Me marque e responda *sim* para gravar ou *não* para cancelar. Para corrigir, mande o texto de novo.`
    return txt
}

async function responderPergunta(pergunta: string) {
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

Deno.serve(async (req) => {
    if (req.method !== 'POST') return json({ ok: false }, 405)
    let body: any = {}
    try { body = await req.json() } catch { return json({ ok: false, reply: 'Pedido inválido.' }, 400) }

    const secret = Deno.env.get('BOT_SECRET')
    if (!secret || body.secret !== secret) return json({ ok: false, reply: 'Não autorizado.' }, 401)

    const chat = String(body.chat || '')
    const sender = String(body.sender || '')
    const nome = String(body.sender_name || 'WhatsApp').slice(0, 60)
    const texto = String(body.text || '').replace(/@\d{6,}/g, '').trim()

    try {
        if (pedeAjuda(texto)) return json({ ok: true, reply: AJUDA })

        // Prévia pendente neste grupo (últimos 30 minutos)
        const limite = new Date(Date.now() - 30 * 60 * 1000).toISOString()
        const { data: pend } = await db.from('bot_pending').select('*').eq('chat', chat).gte('created_at', limite)
            .order('created_at', { ascending: false }).limit(1)
        const pendente = pend?.[0]

        if (pendente && /^(sim|s|isso|correto|confirmo|confirma|pode gravar|grava|ok)\b/i.test(texto)) {
            const d = await chamarLeitura({ confirm_rows: pendente.rows, madeby: `${nome} (WhatsApp)`, device: 'robo-whatsapp', location: 'grupo WhatsApp' })
            if (d.success) {
                await db.from('bot_pending').delete().eq('chat', chat)
                return json({ ok: true, reply: `Gravado por ${nome}: ${(d.data || []).map((r: any) => `chalé ${r.chalet_id}`).join(', ')}. Já aparece no mapa como *pendente*.` })
            }
            return json({ ok: true, reply: `Não gravei. ${d.message || ''}`.trim() })
        }
        if (pendente && /^(n[aã]o|cancela|cancelar|errado)\b/i.test(texto)) {
            await db.from('bot_pending').delete().eq('chat', chat)
            return json({ ok: true, reply: 'Cancelado, nada foi gravado. Pode mandar o texto corrigido me marcando.' })
        }

        if (pareceReserva(texto)) {
            const d = await chamarLeitura({ text: texto, madeby: `${nome} (WhatsApp)`, device: 'robo-whatsapp', location: 'grupo WhatsApp', dry_run: true })
            const rows = d.data || []
            if (d.success && rows.length) {
                await db.from('bot_pending').delete().eq('chat', chat)
                await db.from('bot_pending').insert([{ chat, sender, sender_name: nome, text: texto, rows }])
                return json({ ok: true, reply: textoPrevia(rows, d.warnings || []) })
            }
            return json({ ok: true, reply: `Não consegui montar a reserva:\n${String(d.message || 'erro desconhecido').replace(/^Nada foi gravado\. Corrija e mande de novo:\n?/, '')}\n\nCorrija e mande de novo me marcando.` })
        }

        return json({ ok: true, reply: await responderPergunta(texto) })
    } catch (e) {
        console.error(e)
        return json({ ok: false, reply: 'Tive um problema agora. Tente de novo em instantes ou use a tela de sempre.' }, 500)
    }
})
