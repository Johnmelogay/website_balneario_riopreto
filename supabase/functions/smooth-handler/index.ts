import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status })

const ALL_CHALETS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

// ---------------------------------------------------------------------------
// Tabela de preço (mesma regra de antes): casal R$ 280; adulto extra (8+) R$ 40;
// criança 5-7 R$ 20; 0-4 grátis; entrada na sexta com 2+ noites: -R$ 40.
// Agora serve só para DIVIDIR totais de grupo e AVISAR diferenças:
// o valor escrito pelo funcionário nunca é trocado.
// ---------------------------------------------------------------------------
function nightsBetween(checkin: string, checkout: string) {
    const d1 = new Date(checkin + 'T12:00:00Z')
    const d2 = new Date(checkout + 'T12:00:00Z')
    return Math.round((d2.getTime() - d1.getTime()) / 86400000)
}

function tablePrice(b: any) {
    const nights = nightsBetween(b.checkin_date, b.checkout_date)
    if (!(nights > 0)) return 0
    let daily = 280
    if (b.adults > 2) daily += (b.adults - 2) * 40
    if (b.children_5_7 > 0) daily += b.children_5_7 * 20
    let total = daily * nights
    const checkinObj = new Date(b.checkin_date + 'T12:00:00')
    if (checkinObj.getDay() === 5 && nights >= 2) total -= 40
    return total
}

const num = (v: any) => {
    if (v === null || v === undefined || v === '') return null
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'))
    return Number.isFinite(n) ? n : null
}
const round2 = (n: number) => Math.round(n * 100) / 100
const brl = (n: number) => 'R$ ' + (Number(n) || 0).toFixed(2).replace('.', ',')

// Divide um valor entre os chalés proporcionalmente aos pesos; a soma bate exatamente.
function splitByWeight(amount: number, weights: number[]) {
    const sum = weights.reduce((a, b) => a + b, 0)
    const parts = weights.map(w => round2(sum > 0 ? amount * w / sum : amount / weights.length))
    const diff = round2(amount - parts.reduce((a, b) => a + b, 0))
    parts[parts.length - 1] = round2(parts[parts.length - 1] + diff)
    return parts
}

// Números de chalé citados no texto: "chalé 5", "chalés 4, 5 e 6", "chalés 4 a 10", "CHALÉ 06".
function chaletsInText(text: string) {
    // Cuidado: "CHALÉ 09 – 2 adultos" não é o chalé 2, e "3 chalés 1000,00" não é o chalé 10.
    // Por isso: número com no máximo 2 dígitos e sem dígito colado depois; travessão só
    // vale como faixa quando está colado ("4-7"); vírgula, "e", "/" e "a/até" separam a lista.
    const found = new Set<number>()
    const N = String.raw`\d{1,2}(?!\d|[,.]\d)`
    const SEP = String.raw`(?:\s*(?:,|\be\b|\/|&|\ba\b|\bao\b|\baté\b)\s*|-(?=\d))`
    const re = new RegExp(String.raw`chal[eéÉ]s?\s*(?:n[ºo°.]\s*)?:?\s*(${N}(?:${SEP}${N})*)`, 'gi')
    let m
    while ((m = re.exec(text)) !== null) {
        const block = m[1]
        const range = block.match(/^\s*(\d{1,2})\s*(?:a|ao|até|-)\s*(\d{1,2})\s*$/i)
        if (range && +range[1] < +range[2] && +range[2] <= 10) {
            for (let i = +range[1]; i <= +range[2]; i++) found.add(i)
        } else {
            for (const n of block.match(/\d{1,2}/g) || []) found.add(+n)
        }
    }
    return [...found].filter(n => n >= 1 && n <= 10).sort((a, b) => a - b)
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    let body: any = {}
    try { body = await req.json() } catch { return json({ success: false, message: 'Pedido inválido.' }, 400) }
    const { text, sender, image_url, madeby, device, location } = body
    const dryRun = body.dry_run === true // só para teste: calcula tudo e não grava nada

    // Guarda TODA tentativa (inclusive as que falham) para poder revisar depois.
    const logAttempt = async (success: boolean, message: string, result: unknown) => {
        if (madeby === 'teste-claude') return // testes técnicos não entram no histórico
        if (dryRun && result && typeof result === 'object') (result as any).preview = true
        try {
            await supabaseClient.from('booking_attempts').insert([{
                madeby: madeby || null, text: text || null, success, message, result
            }])
        } catch (_) { /* log nunca impede a reserva */ }
    }

    try {
        // --- CONFIRMAÇÃO HUMANA ---
        // A tela do funcionário primeiro pede uma prévia (dry_run), mostra um cartão por chalé,
        // deixa corrigir e só então manda as linhas confirmadas para cá. Aqui não há IA:
        // grava exatamente o que a pessoa confirmou, depois de conferir de novo os dados e a disponibilidade.
        if (Array.isArray(body.confirm_rows)) {
            const rows = body.confirm_rows
            const problems: string[] = []
            const isoOk = (s: any) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
            if (!rows.length || rows.length > 10) problems.push('Nenhuma reserva para gravar.')
            const seen = new Set<string>()
            const clean = rows.map((r: any, i: number) => {
                const chalet = num(r.chalet_id)
                const total = num(r.total_price), paid = num(r.advance_payment) ?? 0, adults = num(r.adults)
                const where = `Cartão ${i + 1}${chalet ? ` (chalé ${chalet})` : ''}`
                if (!chalet || !ALL_CHALETS.includes(chalet)) problems.push(`${where}: chalé inválido.`)
                if (!r.guest_name || !String(r.guest_name).trim()) problems.push(`${where}: faltou o nome.`)
                if (!isoOk(r.checkin_date) || !isoOk(r.checkout_date) || nightsBetween(r.checkin_date, r.checkout_date) <= 0) problems.push(`${where}: datas inválidas.`)
                if (total === null || total < 0) problems.push(`${where}: total inválido.`)
                if (paid < 0) problems.push(`${where}: valor pago inválido.`)
                if (!adults || adults < 1 || adults > 20) problems.push(`${where}: número de adultos inválido.`)
                const k = `${chalet}|${r.checkin_date}`
                if (seen.has(k)) problems.push(`Chalé ${chalet} aparece duas vezes na mesma data.`)
                seen.add(k)
                return { r, chalet, total: round2(total || 0), paid: round2(paid), adults }
            })
            if (!problems.length) {
                for (const c of clean) {
                    const { data, error } = await supabaseClient.from('bookings').select('chalet_id')
                        .eq('chalet_id', c.chalet).lt('checkin_date', c.r.checkout_date).gt('checkout_date', c.r.checkin_date)
                        .neq('status', 'cancelled')
                    if (error) throw error
                    if (data && data.length) problems.push(`Chalé ${c.chalet} já está ocupado de ${c.r.checkin_date} a ${c.r.checkout_date}.`)
                }
            }
            if (problems.length) {
                const message = `Nada foi gravado:\n- ${problems.join('\n- ')}`
                await logAttempt(false, message, { confirm_rows: rows })
                return json({ success: false, message })
            }

            // Recalcula o resumo do grupo com os valores confirmados.
            const parsedRaw = clean.map(c => { try { return JSON.parse(c.r.raw_message || '{}') } catch { return {} } })
            const byGroup = new Map<string, number[]>()
            parsedRaw.forEach((p, i) => { const g = p?.group?.id; if (g) { if (!byGroup.has(g)) byGroup.set(g, []); byGroup.get(g)!.push(i) } })

            const toSave = clean.map((c, i) => {
                const p = parsedRaw[i] || {}
                const ai = p.ai_parsed || {}
                const edited = ai.chalet_id !== undefined && (num(ai.chalet_id) !== c.chalet || num(ai.total_price) !== c.total || num(ai.advance_payment) !== c.paid || num(ai.adults) !== c.adults)
                const table = tablePrice({ ...ai, adults: c.adults, children_5_7: num(ai.children_5_7) || 0, checkin_date: c.r.checkin_date, checkout_date: c.r.checkout_date })
                const gIdx = p?.group?.id ? byGroup.get(p.group.id)! : null
                const group = gIdx && gIdx.length > 1 ? {
                    ...p.group,
                    chalets: gIdx.map(j => clean[j].chalet),
                    total: round2(gIdx.reduce((s, j) => s + clean[j].total, 0)),
                    paid: round2(gIdx.reduce((s, j) => s + clean[j].paid, 0)),
                } : null
                let isLate = false, lateFee = 0
                const at = c.r.arrival_time
                if (at && /^\d{1,2}:\d{2}$/.test(at)) { const [h, m] = at.split(':').map(Number); if (h > 17 || (h === 17 && m > 0)) { isLate = true; lateFee = 50 } }
                return {
                    chalet_id: c.chalet,
                    checkin_date: c.r.checkin_date,
                    checkout_date: c.r.checkout_date,
                    guest_name: String(c.r.guest_name).trim(),
                    contact_info: c.r.contact_info || null,
                    total_price: c.total,
                    advance_payment: c.paid,
                    arrival_time: at || '14:00',
                    adults: c.adults,
                    is_late_arrival: isLate,
                    late_fee: lateFee,
                    status: 'pending',
                    payment_proof_url: c.r.payment_proof_url || image_url || null,
                    auto_assigned: false,
                    madeby: madeby || 'AI/Unknown',
                    device: device || req.headers.get('user-agent') || 'Unknown Device',
                    location: location || req.headers.get('x-forwarded-for') || 'Unknown IP',
                    raw_message: JSON.stringify({
                        original: p.original ?? null,
                        ai_parsed: {
                            ...ai, chalet_id: c.chalet, adults: c.adults, total_price: c.total, advance_payment: c.paid, table_price: table,
                            price_warning: table && Math.abs(c.total - table) > 1 ? `Valor ${brl(c.total)} diferente da tabela (${brl(table)} para ${c.adults} adulto(s)).` : null,
                        },
                        group,
                        confirmed_by: madeby || null,
                        edited_by_human: edited,
                        version: 2,
                    }),
                }
            })

            const { data: insertedData, error } = await supabaseClient.from('bookings').insert(toSave).select()
            if (error) throw error
            const message = `Gravado: ${toSave.length} chalé(s) (${toSave.map(t => t.chalet_id).join(', ')}).`
            await logAttempt(true, message, { ids: (insertedData || []).map((r: any) => r.id), edited: toSave.some(t => JSON.parse(t.raw_message).edited_by_human) })
            return json({ success: true, data: insertedData, message })
        }

        if (!text || !String(text).trim()) return json({ success: false, message: 'Texto vazio.' })

        const deepseekApiKey = Deno.env.get('DEEPSEEK_API_KEY') || Deno.env.get('DEEPSEEK_KEY')
        if (!deepseekApiKey) {
            return json({
                success: false,
                message: "Chave DEEPSEEK_API_KEY não encontrada nos Segredos do Supabase. Configure 'DEEPSEEK_API_KEY' no painel Supabase (Project Settings -> Edge Functions -> Secrets)."
            }, 500)
        }

        const ipFromHeader = req.headers.get('x-forwarded-for') || "Unknown IP"
        const finalLocation = location || ipFromHeader
        const finalDevice = device || req.headers.get('user-agent') || "Unknown Device"
        const finalMadeBy = madeby || "AI/Unknown"

        console.log(`[DeepSeek Logic V2] Input: "${String(text).substring(0, 50)}..."`)

        // --- 1. LEITURA DO TEXTO PELA IA ---
        const today = new Date().toISOString().slice(0, 10)
        const systemPrompt = `You read reservation messages written in Portuguese by staff of a riverside resort with chalets numbered 1 to 10, and convert them to JSON.
Today is ${today}. If the year is missing, use the next occurrence of that date from today.

OUTPUT: a JSON ARRAY with ONE OBJECT PER CHALET.
- "Chalés 4, 5 e 6", "chalé 9 e 10", "Chalés 4 a 10", or chalets listed one per line => one object for EACH chalet number.
- Several different guests/reservations in the same message => one object per chalet for each of them, each with its own "group_ref".
- Chalets of the SAME reservation share the same "group_ref" (e.g. "g1"); a different reservation gets "g2", etc.

AGE RULES (per chalet):
1. "Casal" = 2 adults. "1 casal em cada chalé" => 2 adults in each chalet.
2. Age 8+ counts as 1 adult. Teenagers ("adolescentes") are adults.
3. Age 5-7 => "children_5_7".
4. Age 0-4 and babies ("bebê") are free: do not count them.
5. Words like "adicionais"/"extras" usually describe people ALREADY counted in the adults number. Do not add them again.
6. If the text gives the people of a specific chalet, put them in that chalet. If it only gives a total for the whole group (e.g. "28 pessoas") and not per chalet, set adults and children_5_7 to null and put the total in "people_total_group".

MONEY RULES:
- "chalet_total_price": the FINAL total written for THAT chalet only (after any discount, e.g. "Valor total: R$ 252" after a public-servant discount). If the text has no value specific to this chalet, null.
- "chalet_advance_payment": the amount paid written for THAT chalet only ("Pago", "Valor pago", "sinal", "adiantou"). Otherwise null.
- "group_total_price": a single total written for the whole reservation/group ("Valor total" when several chalets share it, "Total dos 5 chalés", "RESUMO ... Valor total"). Otherwise null.
- "group_advance_payment": a single paid amount for the whole group. Otherwise null.
- A "Diária" line is a daily rate, not the total, when a "Valor total" also exists.
- Never multiply or divide values yourself; copy them exactly as written.

Fields of each object:
{
  "group_ref": string,
  "chalet_id": number | null (null only if no chalet number is written),
  "guest_name": string,
  "contact_info": string | null (phone/email),
  "checkin_date": "YYYY-MM-DD",
  "checkout_date": "YYYY-MM-DD" | null,
  "arrival_time": "HH:MM" | null,
  "adults": number | null,
  "children_5_7": number | null,
  "people_total_group": number | null,
  "chalet_total_price": number | null,
  "chalet_advance_payment": number | null,
  "group_total_price": number | null,
  "group_advance_payment": number | null,
  "notes": string
}

Respond with ONLY the raw JSON array. No markdown, no explanations.`

        const deepseekResp = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekApiKey}` },
            body: JSON.stringify({
                model: 'deepseek-flash',
                messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: text }],
                temperature: 0.1,
                stream: false
            })
        })
        const deepseekData = await deepseekResp.json()
        if (!deepseekResp.ok || deepseekData.error) {
            const errDetail = deepseekData?.error?.message || `HTTP ${deepseekResp.status}: ${deepseekResp.statusText || 'Erro desconhecido'}`
            await logAttempt(false, `Erro na API do DeepSeek: ${errDetail}`, null)
            return json({ success: false, message: `Erro na API do DeepSeek: ${errDetail}` })
        }

        const aiText = deepseekData.choices?.[0]?.message?.content || "[]"
        let items: any[] = []
        try {
            const parsed = JSON.parse(aiText.replace(/```json/gi, '').replace(/```/g, '').trim())
            items = Array.isArray(parsed) ? parsed : (parsed.bookings || [parsed])
        } catch (_) {
            try {
                const s = aiText.indexOf('['), e = aiText.lastIndexOf(']')
                if (s !== -1 && e !== -1) items = JSON.parse(aiText.substring(s, e + 1))
                else {
                    const os = aiText.indexOf('{'), oe = aiText.lastIndexOf('}')
                    if (os !== -1 && oe !== -1) items = [JSON.parse(aiText.substring(os, oe + 1))]
                }
            } catch (e2) { console.error("JSON Parse Fail", e2) }
        }
        if (!Array.isArray(items)) items = [items]
        items = items.filter(x => x && typeof x === 'object')

        const reasons: string[] = []
        const warnings: string[] = []

        // --- 2. CONFERÊNCIA: todo chalé citado no texto precisa virar uma reserva ---
        const cited = chaletsInText(String(text))
        const groupsBefore = new Set(items.map(i => i.group_ref || `${i.guest_name}|${i.checkin_date}`))
        const understood = new Set(items.map(i => Number(i.chalet_id)).filter(Boolean))
        const missing = cited.filter(n => !understood.has(n))
        if (missing.length && items.length) {
            if (groupsBefore.size === 1) {
                // Uma reserva só: copia os dados para os chalés que a IA esqueceu.
                const tpl = items[0]
                for (const n of missing) {
                    items.push({ ...tpl, chalet_id: n, adults: null, children_5_7: null, chalet_total_price: null, chalet_advance_payment: null, _added_by_check: true })
                }
                // Se um chalé tinha recebido o valor do grupo inteiro, devolve para o grupo.
                for (const it of items) {
                    if (num(it.chalet_total_price) !== null && num(it.group_total_price) === null && items.length > 1) {
                        it.group_total_price = it.chalet_total_price; it.chalet_total_price = null
                    }
                    if (num(it.chalet_advance_payment) !== null && num(it.group_advance_payment) === null && items.length > 1) {
                        it.group_advance_payment = it.chalet_advance_payment; it.chalet_advance_payment = null
                    }
                }
                warnings.push(`Conferência: o texto cita os chalés ${cited.join(', ')}; incluí ${missing.join(', ')}.`)
            } else {
                reasons.push(`O texto cita o(s) chalé(s) ${missing.join(', ')}, mas não consegui entender a qual reserva pertencem. Separe cada reserva e mande de novo.`)
            }
        }

        // --- 3. MONTA CADA GRUPO (reserva) ---
        const groups = new Map<string, any[]>()
        for (const it of items) {
            const key = it.group_ref || `${it.guest_name}|${it.checkin_date}`
            if (!groups.has(key)) groups.set(key, [])
            groups.get(key)!.push(it)
        }

        // Ocupação atual (para conferir disponibilidade e sugerir chalés livres)
        const busyCache = new Map<string, number[]>()
        const busyFor = async (ci: string, co: string) => {
            const k = ci + '|' + co
            if (!busyCache.has(k)) {
                const { data, error } = await supabaseClient.from('bookings').select('chalet_id')
                    .lt('checkin_date', co).gt('checkout_date', ci).neq('status', 'cancelled')
                if (error) throw error
                busyCache.set(k, (data || []).map((r: any) => Number(r.chalet_id)))
            }
            return busyCache.get(k)!
        }

        const toInsert: any[] = []
        const usedInMessage = new Set<string>()

        for (const [gref, list] of groups) {
            const first = list[0]
            const groupId = crypto.randomUUID()
            const groupName = first.guest_name || list.find(x => x.guest_name)?.guest_name

            for (const b of list) {
                b.guest_name = b.guest_name || groupName
                b.checkin_date = b.checkin_date || first.checkin_date
                b.checkout_date = b.checkout_date || first.checkout_date
                b.contact_info = b.contact_info || first.contact_info || sender || null
                b.arrival_time = b.arrival_time || first.arrival_time || null
                if (b.checkin_date && !b.checkout_date) {
                    const d = new Date(b.checkin_date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)
                    b.checkout_date = d.toISOString().slice(0, 10)
                }
                b.chalet_id = num(b.chalet_id)
            }

            if (!groupName) reasons.push('Faltou o nome do hóspede.')
            if (!first.checkin_date) { reasons.push(`Faltou a data de entrada (${groupName || 'reserva'}).`); continue }
            if (nightsBetween(first.checkin_date, first.checkout_date) <= 0) { reasons.push(`Data de saída antes da entrada (${groupName}).`); continue }

            // Chalé obrigatório: não sorteia mais; avisa quais estão livres.
            const semNumero = list.filter(b => !b.chalet_id || !ALL_CHALETS.includes(b.chalet_id))
            if (semNumero.length) {
                const busy = await busyFor(first.checkin_date, first.checkout_date)
                const livres = ALL_CHALETS.filter(n => !busy.includes(n))
                reasons.push(`Faltou o número do chalé de ${groupName}. Livres nessas datas: ${livres.length ? livres.join(', ') : 'nenhum'}.`)
                continue
            }

            // Pessoas por chalé: completa quem ficou sem número.
            const groupPeople = num(list.find(b => num(b.people_total_group) !== null)?.people_total_group)
            const unknown = list.filter(b => num(b.adults) === null && num(b.children_5_7) === null)
            const known = list.filter(b => !unknown.includes(b))
            const knownPeople = known.reduce((s, b) => s + (num(b.adults) || 0) + (num(b.children_5_7) || 0), 0)
            if (unknown.length) {
                if (groupPeople && groupPeople > knownPeople) {
                    const rest = groupPeople - knownPeople
                    const base = Math.floor(rest / unknown.length)
                    unknown.forEach((b, i) => { b.adults = base + (i < rest % unknown.length ? 1 : 0); b.children_5_7 = 0 })
                } else {
                    unknown.forEach(b => { b.adults = 2; b.children_5_7 = 0 })
                }
            }
            for (const b of list) {
                b.adults = num(b.adults) ?? 2
                b.children_5_7 = num(b.children_5_7) ?? 0
                if (b.adults < 1) b.adults = 1
                if (b.adults > 8) warnings.push(`Chalé ${b.chalet_id}: ${b.adults} adultos em um chalé só. Confira.`)
            }

            // Valores: usa o que está escrito; só divide quando o texto deu um total do grupo.
            const table = list.map(b => tablePrice(b))
            const assign = (field: 'total' | 'paid') => {
                const perKey = field === 'total' ? 'chalet_total_price' : 'chalet_advance_payment'
                const grpKey = field === 'total' ? 'group_total_price' : 'group_advance_payment'
                const explicit = list.map(b => num(b[perKey]))
                const groupVal = num(list.find(b => num(b[grpKey]) !== null)?.[grpKey])
                const out = explicit.slice() as (number | null)[]
                const idxMissing = out.map((v, i) => v === null ? i : -1).filter(i => i >= 0)
                if (idxMissing.length) {
                    if (groupVal !== null) {
                        const sumExplicit = out.reduce((s, v) => s + (v || 0), 0)
                        let rest = round2(groupVal - sumExplicit)
                        if (rest < 0) {
                            warnings.push(`${groupName}: a soma dos valores por chalé passa do ${field === 'total' ? 'total' : 'pago'} do grupo (${brl(groupVal)}).`)
                            rest = 0
                        }
                        const parts = splitByWeight(rest, idxMissing.map(i => table[i] || 1))
                        idxMissing.forEach((i, k) => { out[i] = parts[k] })
                        if (idxMissing.length > 1 || list.length > 1) {
                            warnings.push(`${groupName}: ${field === 'total' ? 'total' : 'pago'} do grupo ${brl(groupVal)} dividido entre os chalés ${idxMissing.map(i => list[i].chalet_id).join(', ')} pela ocupação de cada um.`)
                        }
                    } else if (field === 'total') {
                        idxMissing.forEach(i => { out[i] = table[i] })
                        warnings.push(`${groupName}: valor não escrito para o(s) chalé(s) ${idxMissing.map(i => list[i].chalet_id).join(', ')}; usei a tabela.`)
                    } else {
                        idxMissing.forEach(i => { out[i] = 0 })
                    }
                } else if (groupVal !== null) {
                    const soma = round2(out.reduce((s, v) => s + (v || 0), 0))
                    if (Math.abs(soma - groupVal) > 1) {
                        warnings.push(`${groupName}: soma por chalé ${brl(soma)} diferente do ${field === 'total' ? 'total' : 'pago'} do grupo ${brl(groupVal)}.`)
                    }
                }
                return out as number[]
            }
            const totals = assign('total')
            const paids = assign('paid')

            const busy = await busyFor(first.checkin_date, first.checkout_date)
            const groupChalets = list.map(b => b.chalet_id)
            const groupTotal = round2(totals.reduce((a, b) => a + b, 0))
            const groupPaid = round2(paids.reduce((a, b) => a + b, 0))

            list.forEach((b, i) => {
                const key = `${b.chalet_id}|${b.checkin_date}`
                if (usedInMessage.has(key)) { reasons.push(`Chalé ${b.chalet_id} aparece duas vezes na mesma data.`); return }
                usedInMessage.add(key)
                if (busy.includes(b.chalet_id)) reasons.push(`Chalé ${b.chalet_id} indisponível de ${b.checkin_date} a ${b.checkout_date}.`)
                if (paids[i] > totals[i] + 0.01) warnings.push(`Chalé ${b.chalet_id}: pago (${brl(paids[i])}) maior que o total (${brl(totals[i])}).`)

                const priceWarning = table[i] && Math.abs(totals[i] - table[i]) > 1
                    ? `Valor ${brl(totals[i])} diferente da tabela (${brl(table[i])} para ${b.adults} adulto(s)${b.children_5_7 ? ` e ${b.children_5_7} criança(s) 5-7` : ''}).`
                    : null

                let isLate = false, lateFee = 0
                if (b.arrival_time && /^\d{1,2}:\d{2}$/.test(b.arrival_time)) {
                    const [h, m] = b.arrival_time.split(':').map(Number)
                    if (h > 17 || (h === 17 && m > 0)) { isLate = true; lateFee = 50 }
                }

                const parsed = {
                    ...b,
                    total_price: totals[i],
                    advance_payment: paids[i],
                    table_price: table[i],
                    price_warning: priceWarning,
                }
                toInsert.push({
                    chalet_id: b.chalet_id,
                    checkin_date: b.checkin_date,
                    checkout_date: b.checkout_date,
                    guest_name: b.guest_name,
                    contact_info: b.contact_info,
                    total_price: totals[i],
                    advance_payment: paids[i],
                    arrival_time: b.arrival_time || '14:00',
                    adults: b.adults,
                    is_late_arrival: isLate,
                    late_fee: lateFee,
                    status: 'pending',
                    payment_proof_url: image_url || null,
                    auto_assigned: false,
                    madeby: finalMadeBy,
                    device: finalDevice,
                    location: finalLocation,
                    raw_message: JSON.stringify({
                        original: text,
                        ai_parsed: parsed,
                        group: groupChalets.length > 1
                            ? { id: groupId, name: b.guest_name, chalets: groupChalets, total: groupTotal, paid: groupPaid }
                            : null,
                        version: 2,
                    })
                })
            })
        }

        if (!toInsert.length && !reasons.length) reasons.push('Não encontrei nenhuma reserva no texto.')

        // Tudo ou nada: se algo da mensagem está errado, nada é gravado (evita grupo pela metade).
        if (reasons.length) {
            const message = `Nada foi gravado. Corrija e mande de novo:\n- ${[...new Set(reasons)].join('\n- ')}`
            await logAttempt(false, message, { ai: items, warnings })
            return json({ success: false, message, warnings, ...(dryRun ? { preview: toInsert } : {}) })
        }

        if (dryRun) {
            await logAttempt(true, 'Prévia mostrada para conferência (ainda não gravado).', { ai: items, warnings })
            return json({ success: true, dry_run: true, data: toInsert, warnings, message: 'Prévia: nada foi gravado ainda.' })
        }

        const { data: insertedData, error } = await supabaseClient.from('bookings').insert(toInsert).select()
        if (error) throw error

        const fmt = (iso: string) => { const [y, m, d] = (iso || '').split('-'); return iso ? `${d}/${m}/${y}` : '' }
        const summary = toInsert.map(b =>
            `Chalé ${b.chalet_id} (PENDENTE)\nPessoas: ${b.adults} adulto(s)\n${fmt(b.checkin_date)} a ${fmt(b.checkout_date)}\nTotal: ${brl(b.total_price)} (Pago: ${brl(b.advance_payment)})` +
            (b.payment_proof_url ? `\nComprovante anexado` : '')
        ).join('\n---\n')
        const message = `Processado!\n\n${summary}` + (warnings.length ? `\n\nAvisos:\n- ${warnings.join('\n- ')}` : '')

        await logAttempt(true, message, { ai: items, warnings, ids: (insertedData || []).map((r: any) => r.id) })
        return json({ success: true, data: insertedData, warnings, message })

    } catch (error) {
        const message = (error as any)?.message || String(error)
        await logAttempt(false, message, null)
        return json({ success: false, message }, 500)
    }
})
