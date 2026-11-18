// TABELA DE PREÇOS DO SIMULADOR — fonte única para a tela e para a mensagem do WhatsApp.
//
// Antes o cálculo ficava só dentro de reservas.js e a mensagem da pré-reserva não levava
// a quantidade de pessoas, então a equipe via "R$ 360,00" sem saber de onde vinha o valor
// (2 adultos inclusos + 2 adicionais, por exemplo). Qualquer mudança de preço agora é feita aqui.

export const PRECOS = {
    diariaCasal: 280,      // diária para o casal (2 adultos)
    adultoExtra: 40,       // cada adulto a partir do 3º
    crianca5a8: 20,        // cada criança de 5 a 8 anos (bebês de 0 a 4 são grátis)
    descontoServidor: 0.10 // Viaja Mais Servidor: 10% só na diária do casal
};

export function reais(valor) {
    const n = Number(valor) || 0;
    return 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Calcula a diária e o total, devolvendo também as parcelas que explicam o valor.
export function calcularValores({ adultos = 0, criancas5 = 0, noites = 0, servidor = false } = {}) {
    const adultosNum = Math.max(0, parseInt(adultos, 10) || 0);
    const criancas5Num = Math.max(0, parseInt(criancas5, 10) || 0);
    const noitesNum = Math.max(0, parseInt(noites, 10) || 0);

    const adultosExtras = Math.max(0, adultosNum - 2);
    const extrasAdultos = adultosExtras * PRECOS.adultoExtra;
    const extrasCriancas = criancas5Num * PRECOS.crianca5a8;
    const diaria = PRECOS.diariaCasal + extrasAdultos + extrasCriancas;
    const desconto = servidor ? PRECOS.diariaCasal * PRECOS.descontoServidor * noitesNum : 0;
    const total = diaria * noitesNum - desconto;

    return {
        noites: noitesNum, adultos: adultosNum, criancas5: criancas5Num, adultosExtras,
        diariaCasal: PRECOS.diariaCasal, extrasAdultos, extrasCriancas,
        diaria, desconto, total
    };
}

// Texto curto que explica o valor: "R$ 280,00 (diária do casal) + R$ 80,00 (2 adultos adicionais)"
export function detalheValores(v) {
    if (!v || !(v.noites > 0)) return '';
    const partes = [`${reais(v.diariaCasal)} (diária do casal)`];

    if (v.extrasAdultos > 0) {
        partes.push(`+ ${reais(v.extrasAdultos)} (${v.adultosExtras} ${v.adultosExtras === 1 ? 'adulto adicional' : 'adultos adicionais'})`);
    }
    if (v.extrasCriancas > 0) {
        partes.push(`+ ${reais(v.extrasCriancas)} (${v.criancas5} ${v.criancas5 === 1 ? 'criança de 5 a 8 anos' : 'crianças de 5 a 8 anos'})`);
    }
    if (v.noites > 1) {
        partes.push(`× ${v.noites} noites`);
    }
    if (v.desconto > 0) {
        partes.push(`− ${reais(v.desconto)} (desconto servidor 10%)`);
    }

    return partes.join(' ');
}
