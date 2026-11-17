// Lê o conteúdo de um comprovante (PDF ou imagem) e extrai quem pagou e quanto.
// PDF digital: o texto é extraído direto (sem IA). PDF escaneado e fotos: precisa de visão.
// Para visão, configure um destes segredos no Supabase: OPENAI_API_KEY ou GEMINI_API_KEY.
// Sem visão o robô não chuta: ele pergunta para a pessoa.

export type Comprovante = {
    nome: string | null
    valor: number | null
    data: string | null
    banco: string | null
    confianca: number | null
}

const b64de = (bytes: Uint8Array) => {
    let s = ''
    for (let i = 0; i < bytes.length; i += 0x8000) {
        s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    }
    return btoa(s)
}

async function textoPorVisao(bytes: Uint8Array, mime: string): Promise<string> {
    const b64 = b64de(bytes)
    const deepseek = Deno.env.get('DEEPSEEK_API_KEY') || Deno.env.get('DEEPSEEK_KEY')
    const openai = Deno.env.get('OPENAI_API_KEY')
    const gemini = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_API_KEY')
    const pedido = 'Transcreva TODO o texto visível desta imagem, linha por linha, sem comentar nada. ' +
        'Se for um comprovante de pagamento, mantenha os valores, nomes e datas exatamente como aparecem.'

    try {
        // A própria DeepSeek já lê imagens: usa a chave que o projeto já tem.
        if (deepseek) {
            const r = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deepseek}` },
                body: JSON.stringify({
                    model: Deno.env.get('VISION_MODEL') || 'deepseek-flash',
                    temperature: 0,
                    stream: false,
                    messages: [{
                        role: 'user',
                        content: [
                            { type: 'text', text: pedido },
                            { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } },
                        ],
                    }],
                }),
            })
            const d = await r.json()
            if (r.ok) return String(d.choices?.[0]?.message?.content || '')
            console.error('visao deepseek', r.status, JSON.stringify(d).slice(0, 300))
        }
        if (openai) {
            const r = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openai}` },
                body: JSON.stringify({
                    model: Deno.env.get('VISION_MODEL') || 'gpt-4o-mini',
                    temperature: 0,
                    messages: [{
                        role: 'user',
                        content: [
                            { type: 'text', text: pedido },
                            { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } },
                        ],
                    }],
                }),
            })
            const d = await r.json()
            if (r.ok) return String(d.choices?.[0]?.message?.content || '')
            console.error('visao openai', r.status, JSON.stringify(d).slice(0, 300))
        }
        if (gemini) {
            const modelo = Deno.env.get('VISION_MODEL') || 'gemini-2.0-flash'
            const r = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${gemini}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: pedido }, { inline_data: { mime_type: mime, data: b64 } }] }],
                        generationConfig: { temperature: 0 },
                    }),
                },
            )
            const d = await r.json()
            if (r.ok) {
                const partes = d.candidates?.[0]?.content?.parts || []
                return partes.map((p: any) => p.text || '').join('\n')
            }
            console.error('visao gemini', r.status, JSON.stringify(d).slice(0, 300))
        }
    } catch (e) {
        console.error('visao falhou', e)
    }
    return ''
}

/** Devolve o texto do comprovante. `origem` diz de onde veio (para log). */
export async function textoDoComprovante(
    bytes: Uint8Array,
    mime: string,
): Promise<{ texto: string; origem: 'pdf' | 'visao' | 'nenhuma' }> {
    if (/pdf/i.test(mime)) {
        try {
            const { extractText, getDocumentProxy } = await import('https://esm.sh/unpdf@2.2.1')
            const pdf = await getDocumentProxy(bytes)
            const { text } = await extractText(pdf, { mergePages: true })
            const t = Array.isArray(text) ? text.join('\n') : String(text || '')
            if (t.trim().length > 15) return { texto: t, origem: 'pdf' }
        } catch (e) {
            console.error('pdf falhou', e)
        }
    }
    const visao = await textoPorVisao(bytes, mime)
    if (visao.trim().length > 15) return { texto: visao, origem: 'visao' }
    return { texto: '', origem: 'nenhuma' }
}

// Plano B quando a IA não estiver disponível: expressões comuns de comprovante Pix.
function porRegex(texto: string): Comprovante {
    const linhas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    let nome: string | null = null
    let valor: number | null = null
    for (const l of linhas) {
        if (!nome && /pagador|nome|de\s*:/i.test(l) && l.length > 8) {
            const m = l.match(/(?:pagador|nome|de)\s*[:\-]\s*(.+)$/i)
            if (m && /[A-Za-zÀ-ÿ]{3,}/.test(m[1])) nome = m[1].trim()
        }
        if (valor === null) {
            const m = l.match(/R\$\s*([\d.]+,\d{2})/i) || l.match(/valor[^\d]*([\d.]+,\d{2})/i)
            if (m) valor = Number.parseFloat(m[1].replace(/\./g, '').replace(',', '.'))
        }
    }
    const confianca = nome && valor !== null ? 0.6 : 0.3
    return { nome, valor, data: null, banco: null, confianca }
}

/** Extrai nome/valor do texto do comprovante com a IA (DeepSeek), com plano B por regex. */
export async function extrairComprovante(texto: string): Promise<Comprovante | null> {
    const key = Deno.env.get('DEEPSEEK_API_KEY') || Deno.env.get('DEEPSEEK_KEY')
    if (!key) return porRegex(texto)

    const sistema = `Você lê comprovantes de pagamento brasileiros (Pix, transferência, depósito) e extrai dados.
Responda SOMENTE JSON:
{"nome": "nome de QUEM PAGOU (pagador)", "valor": 0.00, "data": "dd/mm/aaaa" ou null, "banco": "nome do banco" ou null, "confianca": 0.0-1.0}

Regras:
- "nome" é sempre o PAGADOR (quem enviou o dinheiro), nunca o recebedor/beneficiário.
- "valor" é o valor pago, só números com ponto decimal (ex.: 320.00).
- Se o documento não for um comprovante de pagamento, devolva {"nome":null,"valor":null,"data":null,"banco":null,"confianca":0}.
- Não invente: se não estiver escrito, use null.`

    try {
        const r = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
            body: JSON.stringify({
                model: 'deepseek-flash',
                temperature: 0,
                stream: false,
                messages: [
                    { role: 'system', content: sistema },
                    { role: 'user', content: texto.slice(0, 6000) },
                ],
            }),
        })
        const d = await r.json()
        if (!r.ok || d.error) throw new Error(d?.error?.message || `HTTP ${r.status}`)
        const bruto = String(d.choices?.[0]?.message?.content || '')
        const i = bruto.indexOf('{'), f = bruto.lastIndexOf('}')
        const obj = JSON.parse(bruto.slice(i, f + 1))
        const valor = obj.valor === null || obj.valor === undefined ? null : Number(String(obj.valor).replace(',', '.'))
        return {
            nome: obj.nome ? String(obj.nome).trim() : null,
            valor: Number.isFinite(valor as number) ? (valor as number) : null,
            data: obj.data ? String(obj.data) : null,
            banco: obj.banco ? String(obj.banco) : null,
            confianca: Number(obj.confianca) || 0.5,
        }
    } catch (e) {
        console.error('extrairComprovante', e)
        return porRegex(texto)
    }
}
