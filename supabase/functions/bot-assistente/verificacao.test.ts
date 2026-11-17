// Testes da verificação de comprovante.  Rode:  node --test verificacao.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decidir, nomeBate, paraNumero, valorEsperado, type Candidato } from './verificacao.ts'

const pendente: Candidato = {
    tipo: 'pendente',
    guest_name: 'Antônio Delielton Silva Nascimento',
    valor_esperado: 320,
    valor_total: 640,
    chalet_id: 10,
}

test('nome com acento/caixa diferente bate', () => {
    assert.equal(nomeBate('ANTONIO DELIELTON SILVA NASCIMENTO', pendente.guest_name).ok, true)
    assert.equal(nomeBate('Antônio Delielton', pendente.guest_name).ok, true)
})

test('nome de outra pessoa não bate', () => {
    assert.equal(nomeBate('Wagner Whats', pendente.guest_name).ok, false)
    assert.equal(nomeBate('Maria Helena Arrais', pendente.guest_name).ok, false)
})

test('paraNumero entende formatos de Pix', () => {
    assert.equal(paraNumero('R$ 320,00'), 320)
    assert.equal(paraNumero('320.00'), 320)
    assert.equal(paraNumero('1.280,50'), 1280.5)
    assert.equal(paraNumero(320), 320)
    assert.equal(paraNumero(''), null)
})

test('valor esperado = adiantamento ou metade do total', () => {
    assert.equal(valorEsperado(640, 320), 320)
    assert.equal(valorEsperado(640, 0), 320)
    assert.equal(valorEsperado(null, 320), 320)
    assert.equal(valorEsperado(0, 0), 0)
})

test('nome exato + valor do sinal => anexa sozinho', () => {
    const d = decidir([pendente], { nome: 'Antônio Delielton Silva Nascimento', valor: 'R$ 320,00' })
    assert.equal(d.acao, 'anexar')
    assert.equal(d.motivo, 'nome_valor')
    assert.equal(d.candidato?.chalet_id, 10)
})

test('comprovante do valor cheio também vale', () => {
    const d = decidir([pendente], { nome: 'Antônio Delielton', valor: 640 })
    assert.equal(d.acao, 'anexar')
})

test('pagador diferente mas valor único => pergunta antes de anexar', () => {
    const d = decidir([pendente], { nome: 'Wagner Whats', valor: 320 })
    assert.equal(d.acao, 'confirmar')
    assert.equal(d.motivo, 'so_valor')
    assert.equal(d.candidato?.chalet_id, 10)
})

test('valor que não existe em nenhuma reserva => pergunta', () => {
    const d = decidir([pendente], { nome: 'Antônio Delielton', valor: 150 })
    assert.equal(d.acao, 'perguntar')
})

test('dois candidatos com o mesmo valor e sem nome => pergunta', () => {
    const outro: Candidato = { tipo: 'pendente', guest_name: 'Maria Helena', valor_esperado: 320, chalet_id: 3 }
    const d = decidir([pendente, outro], { nome: '', valor: 320 })
    assert.equal(d.acao, 'perguntar')
    assert.equal(d.motivo, 'ambiguo')
    assert.equal(d.opcoes?.length, 2)
})

test('dois candidatos, nome resolve => anexa no certo', () => {
    const outro: Candidato = { tipo: 'pendente', guest_name: 'Maria Helena', valor_esperado: 320, chalet_id: 3 }
    const d = decidir([pendente, outro], { nome: 'Maria Helena', valor: 320 })
    assert.equal(d.acao, 'anexar')
    assert.equal(d.candidato?.chalet_id, 3)
})

test('nada lido do arquivo => pergunta, nunca anexa', () => {
    const d = decidir([pendente], null)
    assert.equal(d.acao, 'perguntar')
    assert.equal(d.motivo, 'sem_leitura')
})

test('sem candidatos => pergunta', () => {
    const d = decidir([], { nome: 'Antônio', valor: 320 })
    assert.equal(d.acao, 'perguntar')
    assert.equal(d.motivo, 'nada')
})
