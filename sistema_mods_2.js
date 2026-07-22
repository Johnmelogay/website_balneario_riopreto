import { supabase } from './scripts.js';
import { getCurrentStaff } from './sistema_auth.js';
import { mountPortaria } from './portaria.js';

// ====== MODULE: PORTARIA (Simplificada) ======
// Day Use: R$20/pessoa | Camping: R$40/pessoa/pernoite | Churrasqueira/Quiosque: R$45/diária (família)
async function renderPortaria(container) {
    if (!container.id) container.id = 'portaria-admin-container';
    container.innerHTML = '<div id="portaria-admin-inner" class="w-full h-full"></div>';
    
    mountPortaria('portaria-admin-inner', {
        mode: 'embedded',
        staffMode: true
    });
}


// ====== MODULE: CAIXA (Sessões) ======
async function renderCaixa(container) {
    const { data: openSess } = await supabase.from('cash_sessions').select('*').eq('status', 'open').limit(1).single();
    
    if(openSess) {
        renderFechamentoCaixa(container, openSess);
    } else {
        container.innerHTML = `
            <div class="max-w-md mx-auto bg-white p-8 rounded-3xl border border-gray-100 text-center anim-fade mt-10 shadow-xl shadow-emerald-900/5">
                <div class="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 text-3xl mx-auto mb-6">
                    <i class="fa-solid fa-vault"></i>
                </div>
                <h2 class="text-2xl font-black text-gray-800 mb-2">Caixa Fechado</h2>
                <p class="text-gray-500 text-sm font-medium mb-8">Nenhum turno em andamento.</p>
                
                <div class="text-left mb-6">
                    <label class="label-sys">Valor em Dinheiro na Gaveta (Fundo / Troco)</label>
                    <input type="number" id="aberturaValor" class="input-sys text-center text-3xl font-black py-4" placeholder="R$ 0,00" value="0.00">
                </div>
                
                <button onclick="abrirCaixa()" id="btnAbrirCaixa" class="w-full bg-emerald-600 text-white font-black text-lg py-4 rounded-2xl shadow-lg hover:bg-emerald-700 active:scale-95 transition">
                    ABRIR CAIXA E INICIAR TURNO
                </button>
            </div>
        `;
    }
}

window.abrirCaixa = async () => {
    const val = parseFloat(document.getElementById('aberturaValor').value || 0);
    const staff = getCurrentStaff();
    
    const btn = document.getElementById('btnAbrirCaixa');
    btn.disabled = true; btn.innerHTML = 'Abrindo...';
    
    const { error } = await supabase.from('cash_sessions').insert({
        opened_by: staff.id,
        opening_amount: val,
        status: 'open'
    });
    
    if(error){ alert(error.message); btn.disabled = false; btn.innerHTML = 'ABRIR CAIXA'; }
    else loadModule('caixa');
};

async function renderFechamentoCaixa(container, sess) {
    const openedAt = new Date(sess.opened_at).toLocaleString('pt-BR');
    
    const { data: orders } = await supabase.from('orders')
        .select('total, payment_status').gte('created_at', sess.opened_at).eq('payment_status', 'pago');
        
    const { data: portaria } = await supabase.from('gate_entries')
        .select('amount_paid, payment_method, payment_status')
        .gte('created_at', sess.opened_at)
        .not('payment_status', 'in', '("cancelled", "refunded")');
        
    let salesTotal = 0;
    (orders||[]).forEach(o => salesTotal += Number(o.total));
    (portaria||[]).forEach(p => salesTotal += Number(p.amount_paid));
    
    const expected = Number(sess.opening_amount) + salesTotal;
    
    container.innerHTML = `
        <div class="max-w-2xl mx-auto bg-white p-8 rounded-3xl border border-gray-100 anim-fade mt-6 shadow-xl shadow-gray-200/50">
            <div class="flex items-center justify-between border-b border-gray-100 pb-6 mb-6">
                <div>
                    <h2 class="text-2xl font-black text-gray-800">Turno Aberto</h2>
                    <p class="text-emerald-600 text-sm font-bold mt-1"><i class="fa-solid fa-clock mr-1"></i> Desde ${openedAt}</p>
                </div>
                <div class="text-right">
                    <p class="text-xs text-gray-400 font-bold uppercase">Fundo Inicial</p>
                    <p class="text-xl font-black text-gray-600">R$ ${Number(sess.opening_amount).toFixed(2).replace('.',',')}</p>
                </div>
            </div>
            
            <div class="bg-gray-50 rounded-2xl p-6 mb-8 border border-gray-200 text-center">
                <p class="text-sm text-gray-500 font-bold uppercase tracking-widest mb-2">Total de Vendas / Entradas</p>
                <p class="text-4xl font-black text-emerald-600 mb-2">+ R$ ${salesTotal.toFixed(2).replace('.',',')}</p>
                <div class="w-16 h-1 bg-gray-200 mx-auto my-4 rounded-full"></div>
                <p class="text-xs text-gray-400 font-bold uppercase">O sistema espera (Fundo + Vendas):</p>
                <p class="text-2xl font-black text-gray-800 mt-1" id="caixaExpected" data-val="${expected}">R$ ${expected.toFixed(2).replace('.',',')}</p>
            </div>
            
            <div class="grid grid-cols-2 gap-6 mb-8">
                <div>
                    <label class="label-sys mb-2"><i class="fa-solid fa-money-bill-1-wave mr-1 text-green-500"></i> Dinheiro + Fundo Real</label>
                    <input type="number" step="0.01" id="fDinheiro" class="input-sys font-black text-lg py-3" placeholder="R$ 0,00" onkeyup="checkBreakdown()">
                </div>
                <div>
                    <label class="label-sys mb-2"><i class="fa-solid fa-credit-card mr-1 text-blue-500"></i> Máquina Cartão</label>
                    <input type="number" step="0.01" id="fCartao" class="input-sys font-black text-lg py-3" placeholder="R$ 0,00" onkeyup="checkBreakdown()">
                </div>
                 <div class="col-span-2">
                    <label class="label-sys mb-2"><i class="fa-brands fa-pix mr-1 text-emerald-500"></i> PIX</label>
                    <input type="number" step="0.01" id="fPix" class="input-sys font-black text-lg py-3" placeholder="R$ 0,00" onkeyup="checkBreakdown()">
                </div>
            </div>
            
            <div class="flex items-center justify-between p-4 rounded-xl mb-8 bg-gray-100" id="diffAlert">
                <span class="font-bold text-gray-500 text-sm">Diferença de Caixa:</span>
                <span class="font-black text-gray-500 text-lg" id="diffVal">Preencha os valores</span>
            </div>
            
            <button onclick="fecharCaixa('${sess.id}')" id="btnFechar" disabled class="w-full bg-red-600 text-white font-black text-lg py-4 rounded-2xl shadow-lg shadow-red-200 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition">
                ENCERRAR TURNO
            </button>
        </div>
    `;
}

window.checkBreakdown = () => {
    const din = parseFloat(document.getElementById('fDinheiro').value || 0);
    const car = parseFloat(document.getElementById('fCartao').value || 0);
    const pix = parseFloat(document.getElementById('fPix').value || 0);
    const exp = parseFloat(document.getElementById('caixaExpected').getAttribute('data-val'));
    
    const currTotal = din + car + pix;
    const diff = currTotal - exp;
    
    const diffEl = document.getElementById('diffVal');
    const alertEl = document.getElementById('diffAlert');
    const btn = document.getElementById('btnFechar');
    
    btn.disabled = false;
    
    if(diff === 0) {
        alertEl.className = 'flex items-center justify-between p-4 rounded-xl mb-8 bg-green-50 border border-green-200';
        diffEl.className = 'font-black text-green-600 text-lg';
        diffEl.textContent = 'Caixa Bateu Exato! ✅';
    } else if (diff < 0) {
        alertEl.className = 'flex items-center justify-between p-4 rounded-xl mb-8 bg-red-50 border border-red-200';
        diffEl.className = 'font-black text-red-600 text-lg';
        diffEl.textContent = `Quebra Negativa: R$ ${diff.toFixed(2).replace('.',',')} ⚠️`;
    } else {
        alertEl.className = 'flex items-center justify-between p-4 rounded-xl mb-8 bg-yellow-50 border border-yellow-200';
        diffEl.className = 'font-black text-yellow-600 text-lg';
        diffEl.textContent = `Sobra: R$ +${diff.toFixed(2).replace('.',',')} ⚠️`;
    }
};

window.fecharCaixa = async (sessId) => {
    if(!confirm("Atenção: Ao encerrar o turno o caixa será fechado. Deseja continuar?")) return;
    
    const din = parseFloat(document.getElementById('fDinheiro').value || 0);
    const car = parseFloat(document.getElementById('fCartao').value || 0);
    const pix = parseFloat(document.getElementById('fPix').value || 0);
    const exp = parseFloat(document.getElementById('caixaExpected').getAttribute('data-val'));
    const closingTotal = din + car + pix;
    
    const staff = getCurrentStaff();
    
    const btn = document.getElementById('btnFechar');
    btn.disabled = true; btn.innerHTML = 'Fechando...';
    
    const { error } = await supabase.from('cash_sessions').update({
        status: 'closed',
        closed_by: staff.id,
        closed_at: new Date().toISOString(),
        expected_amount: exp,
        closing_amount: closingTotal,
        difference: closingTotal - exp,
        revenue_breakdown: { dinheiro: din, cartao: car, pix: pix }
    }).eq('id', sessId);
    
    if(error){ alert(error.message); btn.disabled=false; btn.innerHTML='ENCERRAR TURNO'; }
    else loadModule('fechamento');
};



// ====== MODULE: FECHAMENTO (Relatório Geral do Dia) ======
async function renderFechamento(container) {
    container.innerHTML = `
        <div class="p-10 text-center bg-white rounded-2xl border border-gray-100 anim-fade">
            <i class="fa-solid fa-spinner fa-spin text-4xl text-gray-300 mb-4"></i>
            <p class="text-gray-500 font-bold">Processando fechamento do dia...</p>
        </div>
    `;

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();

    // Fetch orders (all statuses for reporting, not just 'pago')
    const { data: orders } = await supabase.from('orders')
        .select('total, staff_id, destination, status, created_at')
        .gte('created_at', startOfDay);

    // Fetch staff list for name resolution
    const { data: staffList } = await supabase.from('staff_users').select('id, name');
    const staffMap = {};
    (staffList || []).forEach(s => { staffMap[s.id] = s.name; });

    const { data: portaria } = await supabase.from('gate_entries')
        .select('amount_paid, payment_method, staff_id, entry_type, qty_adults, payment_status')
        .gte('created_at', startOfDay);

    // Aggregate Data
    let totalRestaurante = 0;
    let totalPortaria = 0;
    let totalPessoas = 0;
    let totalCancelado = 0;
    let totalEstornado = 0;
    const paymentMethods = { dinheiro: 0, cartao_cred: 0, cartao_deb: 0, pix: 0 };
    const staffSales = {};

    // Process Portaria
    (portaria || []).forEach(p => {
        const val = Number(p.amount_paid);

        if (p.payment_status === 'cancelled') {
            totalCancelado += val;
            return;
        }
        if (p.payment_status === 'refunded') {
            totalEstornado += val;
            return;
        }

        totalPortaria += val;
        totalPessoas += (p.qty_adults || 0);
        
        const method = p.payment_method || 'dinheiro';
        paymentMethods[method] = (paymentMethods[method] || 0) + val;

        if (p.staff_id) {
            if (!staffSales[p.staff_id]) staffSales[p.staff_id] = { name: staffMap[p.staff_id] || 'Sistema', total: 0 };
            staffSales[p.staff_id].total += val;
        }
    });

    // Process Orders
    (orders || []).forEach(o => {
        const val = Number(o.total);
        totalRestaurante += val;

        if (o.staff_id) {
            if (!staffSales[o.staff_id]) staffSales[o.staff_id] = { name: staffMap[o.staff_id] || 'Sistema', total: 0 };
            staffSales[o.staff_id].total += val;
        }
    });

    const grossTotal = totalRestaurante + totalPortaria;
    const staffArr = Object.values(staffSales).sort((a,b) => b.total - a.total);

    container.innerHTML = `
        <div class="max-w-5xl mx-auto anim-fade pb-10">
            <div class="flex items-center justify-between mb-8">
                <div>
                    <h2 class="text-3xl font-black text-gray-800">Fechamento do Dia</h2>
                    <p class="text-gray-500 font-bold mt-1">${today.toLocaleDateString('pt-BR', { timeZone: 'America/Porto_Velho',  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </div>
                <button onclick="window.print()" class="bg-gray-100 text-gray-700 px-4 py-2 rounded-xl font-bold hover:bg-gray-200 transition">
                    <i class="fa-solid fa-print mr-1"></i> Imprimir
                </button>
            </div>

            <!-- Total Cards -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div class="bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-3xl p-6 text-white shadow-xl shadow-emerald-900/20 relative">
                    <p class="text-emerald-100 text-sm font-bold uppercase tracking-wider mb-1">Faturamento Bruto</p>
                    <p class="text-4xl font-black">R$ ${grossTotal.toFixed(2).replace('.', ',')}</p>
                    
                    ${(totalCancelado > 0 || totalEstornado > 0) ? `
                    <div class="mt-3 text-[10px] font-bold text-red-500 bg-red-100 rounded inline-block">
                        <span class="bg-red-200/50 block px-2 py-0.5 border-b border-red-200">Cancelado: R$ ${totalCancelado.toFixed(2).replace('.',',')}</span>
                        <span class="block px-2 py-0.5">Estornado: R$ ${totalEstornado.toFixed(2).replace('.',',')}</span>
                    </div>
                    ` : ''}

                    <div class="mt-4 flex flex-wrap gap-4 text-emerald-100 bg-emerald-900/40 p-3 rounded-xl text-xs font-bold">
                        <span>🍽️ Restaurante: R$ ${totalRestaurante.toFixed(2).replace('.',',')}</span>
                        <span>🚪 Portaria: R$ ${totalPortaria.toFixed(2).replace('.',',')}</span>
                    </div>
                </div>
                <div class="bg-white rounded-3xl p-6 border border-gray-100 flex flex-col justify-center items-center">
                    <i class="fa-solid fa-users text-blue-400 text-3xl mb-2"></i>
                    <p class="text-[10px] font-bold text-gray-400 uppercase">Total de Visitantes</p>
                    <p class="font-black text-gray-800 text-3xl">${totalPessoas}</p>
                </div>
                <div class="bg-white rounded-3xl p-6 border border-gray-100 flex flex-col justify-center items-center">
                    <i class="fa-solid fa-receipt text-amber-400 text-3xl mb-2"></i>
                    <p class="text-[10px] font-bold text-gray-400 uppercase">Total de Pedidos</p>
                    <p class="font-black text-gray-800 text-3xl">${(orders || []).length}</p>
                </div>
            </div>

            <!-- Payment Method Breakdown -->
            <div class="bg-white rounded-3xl p-6 border border-gray-100 grid grid-cols-4 gap-4 items-center mb-8">
                <div class="text-center border-r border-gray-100">
                    <i class="fa-solid fa-money-bill-1-wave text-green-500 text-2xl mb-2"></i>
                    <p class="text-[10px] font-bold text-gray-400 uppercase">Dinheiro</p>
                    <p class="font-black text-gray-800 text-lg">R$ ${paymentMethods.dinheiro.toFixed(2).replace('.', ',')}</p>
                </div>
                <div class="text-center border-r border-gray-100">
                    <i class="fa-brands fa-pix text-emerald-500 text-2xl mb-2"></i>
                    <p class="text-[10px] font-bold text-gray-400 uppercase">PIX</p>
                    <p class="font-black text-gray-800 text-lg">R$ ${paymentMethods.pix.toFixed(2).replace('.', ',')}</p>
                </div>
                <div class="text-center border-r border-gray-100">
                    <i class="fa-solid fa-credit-card text-blue-500 text-2xl mb-2"></i>
                    <p class="text-[10px] font-bold text-gray-400 uppercase">Débito</p>
                    <p class="font-black text-gray-800 text-lg">R$ ${paymentMethods.cartao_deb.toFixed(2).replace('.', ',')}</p>
                </div>
                <div class="text-center">
                    <i class="fa-solid fa-credit-card text-purple-500 text-2xl mb-2"></i>
                    <p class="text-[10px] font-bold text-gray-400 uppercase">Crédito</p>
                    <p class="font-black text-gray-800 text-lg">R$ ${paymentMethods.cartao_cred.toFixed(2).replace('.', ',')}</p>
                </div>
            </div>

            <!-- Staff Performance -->
            <div class="bg-white rounded-3xl border border-gray-100 overflow-hidden">
                <div class="p-6 border-b border-gray-100 bg-gray-50/50">
                    <h3 class="font-black text-gray-800"><i class="fa-solid fa-ranking-star mr-2 text-amber-400"></i> Ranking da Equipe</h3>
                </div>
                <div class="p-6">
                    ${staffArr.length === 0 ? '<p class="text-center text-gray-400 py-8 font-bold">Nenhuma venda registrada ainda.</p>' : ''}
                    <div class="space-y-4">
                        ${staffArr.map((st, i) => `
                            <div class="flex items-center justify-between p-4 bg-gray-50 rounded-2xl hover:bg-white border border-transparent hover:border-gray-200 transition">
                                <div class="flex items-center gap-4">
                                    <div class="w-10 h-10 rounded-full ${i===0?'bg-yellow-100 text-yellow-600':'bg-blue-100 text-blue-600'} flex items-center justify-center font-black">
                                        ${i === 0 ? '<i class="fa-solid fa-trophy"></i>' : `#${i+1}`}
                                    </div>
                                    <div>
                                        <p class="font-black text-gray-800 text-lg">${st.name}</p>
                                        <p class="text-xs font-bold text-gray-400">Vendas & Serviços</p>
                                    </div>
                                </div>
                                <p class="text-xl font-black text-emerald-600">
                                    R$ ${st.total.toFixed(2).replace('.', ',')}
                                </p>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
    `;
}

export { renderPortaria, renderCaixa, renderFechamento };
