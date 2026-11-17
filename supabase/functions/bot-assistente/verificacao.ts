// Compara o que foi lido do comprovante (nome de quem pagou + valor) com as reservas
// candidatas, e decide com segurança o que fazer. Sem I/O: dá para testar isolado.
//
// Regra de ouro: só anexa sozinho quando nome E valor batem. Qualquer dúvida vira pergunta.

export type Candidato = {
    tipo: 'pendente' | 'reserva'
    id?: string
    guest_name: string
    valor_esperado: number
    /** total da reserva: um comprovante do valor cheio também vale */
    valor_total?: number | null
    chalet_id?: number | null
    checkin_date?: string | null
}

export type Extraido = {
    nome?: string | null
    valor?: number | string | null
    data?: string | null
    banco?: string | null
    confianca?: number | null
}

export type Decisao = {
    acao: 'anexar' | 'confirmar' | 'perguntar'
    motivo: 'nome_valor' | 'so_valor' | 'so_nome' | 'ambiguo' | 'nada' | 'sem_leitura'
    candidato?: Candidato
    opcoes?: Candidato[]
    valor: number | null
    nome: string
}

const PARTICULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e'])

const semAcento = (s: string) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')

export function tokensNome(nome: string): string[] {
    return semAcento(nome)
        .toLowerCase()
        .replace(/[^a-z ]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length >= 3 && !PARTICULAS.has(t))
}

/** Dois nomes "batem" quando compartilham pelo menos 2 nomes e boa parte do nome mais curto. */
export function nomeBate(a: string, b: string): { ok: boolean; comuns: string[] } {
    const A = tokensNome(a)
    const B = new Set(tokensNome(b))
    if (!A.length || !B.size) return { ok: false, comuns: [] }
    const comuns = A.filter(t => B.has(t))
    const menor = Math.min(A.length, B.size)
    const precisa = Math.min(2, menor)
    const ok = comuns.length >= precisa && comuns.length / menor >= 0.5
    return { ok, comuns }
}

/** Aceita 320, "320,00", "R$ 320.00", 320.0 */
export function paraNumero(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null
    if (typeof v === 'number') return Number.isFinite(v) ? v : null
    const limpo = String(v).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')
    const n = Number.parseFloat(limpo)
    return Number.isFinite(n) ? n : null
}

export function valorBate(valor: number | null, esperado: number | null, tolerancia = 0.05): boolean {
    if (valor === null || esperado === null) return false
    return Math.abs(valor - esperado) <= tolerancia
}

/** Vale o adiantamento combinado (50%) ou o total cheio. */
export function candidatoBateValor(c: Candidato, valor: number | null): boolean {
    return valorBate(valor, c.valor_esperado) || valorBate(valor, paraNumero(c.valor_total))
}

/** O valor que o comprovante deveria ter: o adiantamento combinado ou metade do total. */
export function valorEsperado(total: unknown, pago: unknown): number {
    const t = paraNumero(total) || 0
    const p = paraNumero(pago) || 0
    if (p > 0) return p
    return t > 0 ? Math.round((t / 2) * 100) / 100 : 0
}

export function decidir(candidatos: Candidato[], extraido: Extraido | null): Decisao {
    const valor = paraNumero(extraido?.valor ?? null)
    const nome = String(extraido?.nome || '').trim()

    if (!extraido || (valor === null && !nome)) {
        return { acao: 'perguntar', motivo: 'sem_leitura', valor: null, nome }
    }
    if (!candidatos.length) {
        return { acao: 'perguntar', motivo: 'nada', valor, nome }
    }

    const comValor = valor === null ? [] : candidatos.filter(c => candidatoBateValor(c, valor))
    if (valor !== null && comValor.length === 0) {
        // valor não corresponde a nenhuma reserva em aberto
        const porNome = nome ? candidatos.filter(c => nomeBate(nome, c.guest_name).ok) : []
        return { acao: 'perguntar', motivo: porNome.length ? 'so_nome' : 'nada', valor, nome, opcoes: porNome }
    }

    const base = valor !== null ? comValor : candidatos
    const porNome = nome ? base.filter(c => nomeBate(nome, c.guest_name).ok) : []

    if (porNome.length === 1 && valor !== null) {
        return { acao: 'anexar', motivo: 'nome_valor', candidato: porNome[0], valor, nome }
    }
    if (porNome.length > 1) {
        return { acao: 'perguntar', motivo: 'ambiguo', valor, nome, opcoes: porNome }
    }
    if (nome && porNome.length === 0) {
        // nome diferente, mas o valor achou exatamente uma reserva (ex.: marido pagando pela esposa)
        if (base.length === 1) return { acao: 'confirmar', motivo: 'so_valor', candidato: base[0], valor, nome }
        return { acao: 'perguntar', motivo: 'ambiguo', valor, nome, opcoes: base }
    }
    // sem nome legível
    if (base.length === 1) return { acao: 'confirmar', motivo: 'so_valor', candidato: base[0], valor, nome }
    return { acao: 'perguntar', motivo: 'ambiguo', valor, nome, opcoes: base }
}
