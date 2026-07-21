import { supabase } from './scripts.js';
import { getCurrentStaff } from './sistema_auth.js';

let currentTab = 'abertas'; // abertas | fechadas
let filterDate = new Date().toISOString().split('T')[0];

export async function renderComandas(container) {
    container.innerHTML = `
        <div class="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div class="flex bg-gray-100 p-1 rounded-xl">
                <button onclick="window.cmdTab('abertas')" id="btnCmdAbertas" class="px-6 py-2 rounded-lg text-sm font-bold transition ${currentTab === 'abertas' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}">Ativas/Abertas</button>
                <button onclick="window.cmdTab('fechadas')" id="btnCmdFechadas" class="px-6 py-2 rounded-lg text-sm font-bold transition ${currentTab === 'fechadas' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}">Fechadas/Histórico</button>
            </div>
            
            <div id="cmdDateFilterContainer" class="flex items-center gap-3 ${currentTab === 'abertas' ? 'hidden' : ''}">
                <label class="text-xs font-bold text-gray-400 uppercase tracking-widest">Filtrar Data</label>
                <input type="date" id="cmdFilterDate" value="${filterDate}" onchange="window.cmdDateChange(this.value)" class="input-sys w-auto py-2">
            </div>
        </div>

        <div id="cmdContent" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <div class="col-span-full flex justify-center py-20"><i class="fa-solid fa-spinner fa-spin text-4xl text-emerald-600"></i></div>
        </div>
    `;

    loadComandas();
}

window.cmdTab = (tab) => {
    currentTab = tab;
    // Update active tab styling
    document.getElementById('btnCmdAbertas').className = `px-6 py-2 rounded-lg text-sm font-bold transition ${currentTab === 'abertas' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`;
    document.getElementById('btnCmdFechadas').className = `px-6 py-2 rounded-lg text-sm font-bold transition ${currentTab === 'fechadas' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`;
    
    // Toggle date filter
    document.getElementById('cmdDateFilterContainer').classList.toggle('hidden', currentTab === 'abertas');
    
    document.getElementById('cmdContent').innerHTML = '<div class="col-span-full flex justify-center py-20"><i class="fa-solid fa-spinner fa-spin text-4xl text-emerald-600"></i></div>';
    loadComandas();
};

window.cmdDateChange = (date) => {
    filterDate = date;
    document.getElementById('cmdContent').innerHTML = '<div class="col-span-full flex justify-center py-20"><i class="fa-solid fa-spinner fa-spin text-4xl text-emerald-600"></i></div>';
    loadComandas();
};

async function loadComandas() {
    const staff = getCurrentStaff();
    if (!staff) return;

    // Se o garçom entra, ele só vê as dele (ou admin/caixa vê de todos)
    const isAdminOrCaixa = ['admin', 'caixa'].includes(staff.role);

    try {
        let query = supabase.from('orders')
            .select('*, order_items(*), staff_users(name)');

        if (currentTab === 'abertas') {
            query = query.eq('payment_status', 'aberto').neq('status', 'cancelado');
        } else {
            // Histórico (Fechadas) - Filter by updated_at to show when comandas were closed
            const [year, month, day] = filterDate.split('-').map(Number);
            const startOfDay = new Date(year, month - 1, day, 0, 0, 0).toISOString();
            const endOfDay = new Date(year, month - 1, day, 23, 59, 59).toISOString();
            query = query.eq('payment_status', 'pago')
                         .gte('updated_at', startOfDay)
                         .lte('updated_at', endOfDay);
        }

        // Garçom visualizando no sistema -> filtra pelos pedidos dele
        if (!isAdminOrCaixa && staff.role === 'garcom') {
            query = query.eq('staff_id', staff.id);
        }

        const { data: orders, error } = await query;
        
        if (error) throw error;

        // Group by location_type + location_id
        const comandas = {};
        let totalVal = 0;

        (orders || []).forEach(o => {
            const comandaId = `${o.location_type}_${o.location_id}`;
            if (!comandas[comandaId]) {
                comandas[comandaId] = {
                    type: o.location_type,
                    id: o.location_id,
                    total: 0,
                    orders: [],
                    staffNames: new Set()
                };
            }
            comandas[comandaId].total += Number(o.total);
            comandas[comandaId].orders.push(o);
            if(o.staff_users?.name) comandas[comandaId].staffNames.add(o.staff_users.name.split(' ')[0]);
            totalVal += Number(o.total);
        });

        renderComandasGrid(Object.values(comandas), isAdminOrCaixa, totalVal);

    } catch (e) {
        console.error(e);
        document.getElementById('cmdContent').innerHTML = `<div class="col-span-full text-center text-red-500 font-bold">${e.message}</div>`;
    }
}

function renderComandasGrid(comandas, canClose, totalGeral) {
    const content = document.getElementById('cmdContent');
    
    if (comandas.length === 0) {
        content.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center py-20 opacity-50">
                <i class="fa-solid fa-receipt text-6xl text-gray-300 mb-4"></i>
                <h3 class="text-xl font-black text-gray-400">Nenhuma comanda encontrada.</h3>
                ${currentTab === 'fechadas' ? '<p class="text-sm font-bold text-gray-400 mt-2">Nenhum pagamento registrado nesta data.</p>' : ''}
            </div>
        `;
        return;
    }

    let html = '';
    
    // Inject Total Summary Card if Caixa/Admin and Fechadas
    if (currentTab === 'fechadas') {
        html += `
            <div class="col-span-full mb-2 bg-emerald-50 border border-emerald-100 p-4 rounded-2xl flex justify-between items-center">
                <span class="text-sm font-bold text-emerald-700 uppercase tracking-widest">Total Fechado do Dia</span>
                <span class="text-2xl font-black text-emerald-800">R$ ${totalGeral.toFixed(2).replace('.', ',')}</span>
            </div>
        `;
    }

    html += comandas.map(c => {
        const staffTeam = Array.from(c.staffNames).join(', ') || 'Sem garçom';
        const typeLabel = c.type === 'chale' ? 'Chalé' : c.type === 'barraca' ? 'Barraca' : 'Mesa';
        
        // Item breakdown
        const allItems = c.orders.flatMap(o => o.order_items || []);
        
        return `
            <div class="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm hover:shadow-xl transition flex flex-col relative anim-fade group">
                ${currentTab === 'fechadas' 
                    ? '<div class="absolute -right-2 -top-2 bg-green-500 text-white text-[10px] font-black uppercase px-2 py-1 rounded-lg tracking-widest shadow-lg"><i class="fa-solid fa-check mr-1"></i>PAGA</div>'
                    : ''
                }
                
                <div class="flex justify-between items-start mb-4 border-b border-gray-50 pb-4">
                    <div>
                        <span class="bg-blue-50 text-blue-700 px-2 py-1 rounded-lg text-xs font-black uppercase tracking-widest flex items-center gap-1 w-fit">
                            <i class="fa-solid ${c.type === 'chale' ? 'fa-house' : c.type === 'barraca' ? 'fa-campground' : 'fa-chair'}"></i>
                            ${typeLabel} ${c.id}
                        </span>
                        <p class="text-[10px] font-bold text-gray-400 mt-2 truncate"><i class="fa-solid fa-user-tag mr-1"></i>${staffTeam}</p>
                    </div>
                </div>

                <div class="flex-1 space-y-2 mb-4">
                    ${allItems.slice(0, 3).map(i => `
                        <div class="flex justify-between text-xs">
                            <span class="font-bold text-gray-600 truncate mr-2">${i.quantity}x ${i.product_name}</span>
                        </div>
                    `).join('')}
                    ${allItems.length > 3 ? `<p class="text-[10px] font-bold text-gray-400 italic mt-1">+ ${allItems.length - 3} itens...</p>` : ''}
                </div>

                <div class="mt-auto border-t border-gray-50 pt-4">
                    <div class="flex justify-between items-end mb-4">
                        <span class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Subtotal</span>
                        <span class="text-xl font-black text-gray-800">R$ ${c.total.toFixed(2).replace('.', ',')}</span>
                    </div>

                    ${(currentTab === 'abertas') ? `
                         <button onclick="window.cmdViewDetails('${c.type}', '${c.id}')" class="w-full bg-gray-50 text-gray-600 hover:text-white hover:bg-gray-800 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition mb-2">
                             Ver Detalhes
                         </button>
                    ` : `
                         <button onclick="window.cmdViewDetails('${c.type}', '${c.id}')" class="w-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition mb-2">
                             Recibo
                         </button>
                    `}
                    
                    ${(canClose && currentTab === 'abertas') ? `
                        <button onclick="window.cmdPromptClose('${c.type}', '${c.id}')" class="w-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 py-3 rounded-xl font-black text-sm uppercase tracking-widest hover:bg-emerald-700 active:scale-95 transition">
                            <i class="fa-solid fa-cash-register mr-1"></i> Receber Pagamento
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');

    content.innerHTML = html;
}

window.cmdViewDetails = async (type, id) => {
    // Show modal with full receipt details
    const staff = getCurrentStaff();
    let query = supabase.from('orders').select('*, order_items(*)').eq('location_type', type).eq('location_id', id);
    if(currentTab === 'abertas') query = query.eq('payment_status', 'aberto').neq('status','cancelado');
    else {
        const [year, month, day] = filterDate.split('-').map(Number);
        const startOfDay = new Date(year, month - 1, day, 0, 0, 0).toISOString();
        const endOfDay = new Date(year, month - 1, day, 23, 59, 59).toISOString();
        query = query.eq('payment_status', 'pago').gte('updated_at', startOfDay).lte('updated_at', endOfDay);
    }
    
    // Garçom filter
    if(!['admin','caixa'].includes(staff.role)) query = query.eq('staff_id', staff.id);
    
    const { data: orders } = await query;
    if(!orders || orders.length === 0) return;
    
    const allItems = orders.flatMap(o => o.order_items);
    let total = 0;
    
    document.getElementById('modalContainer').innerHTML = `
        <div class="modal-overlay" onclick="if(event.target===this) window.closeMod()">
            <div class="modal-box anim-fade p-0 overflow-hidden max-w-md">
                <div class="bg-gray-800 p-6 text-center shadow-inner relative">
                    <button onclick="window.closeMod()" class="absolute top-4 right-4 text-gray-400 hover:text-white"><i class="fa-solid fa-xmark text-xl"></i></button>
                    <div class="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-3 text-white text-2xl border border-white/20"><i class="fa-solid fa-receipt"></i></div>
                    <h3 class="text-white font-black tracking-widest uppercase mb-1">Extrato de Consumo</h3>
                    <p class="text-emerald-400 font-bold text-xs uppercase tracking-widest">${type} ${id}</p>
                </div>
                
                <div class="p-6 bg-white overflow-y-auto max-h-[50vh]">
                    <div class="space-y-3">
                        ${allItems.map(i => {
                            total += (i.quantity * i.unit_price);
                            return `
                            <div class="flex justify-between items-start border-b border-gray-50 pb-2">
                                <div>
                                    <p class="font-bold text-sm text-gray-800">${i.quantity}x ${i.product_name}</p>
                                    ${i.notes ? `<p class="text-[10px] text-gray-400 italic font-bold">Obs: ${i.notes}</p>` : ''}
                                </div>
                                <p class="font-black text-gray-600">R$ ${(i.quantity * i.unit_price).toFixed(2).replace('.',',')}</p>
                            </div>
                            `;
                        }).join('')}
                    </div>
                </div>
                
                <div class="bg-gray-50 p-6 border-t border-gray-100 flex justify-between items-end">
                    <span class="text-xs font-bold text-gray-400 uppercase tracking-widest">Total a Pagar</span>
                    <span class="text-3xl font-black text-emerald-600">R$ ${total.toFixed(2).replace('.',',')}</span>
                </div>
            </div>
        </div>
    `;
};

import { logAuditAction } from './audit_logger.js';

let cashierActiveOrders = [];
let cashierBaseTotal = 0;
let cashierServiceEnabled = true;
let cashierPayMethod = 'pix';

window.cmdPromptClose = async (type, id) => {
    const staff = getCurrentStaff();
    const { data: openOrders, error } = await supabase
        .from('orders')
        .select('*, order_items(*), staff_users(name)')
        .eq('location_type', type)
        .eq('location_id', id)
        .eq('payment_status', 'aberto')
        .neq('status', 'cancelado');

    if (error || !openOrders || openOrders.length === 0) {
        alert('Nenhuma comanda em aberto para fechar.');
        return;
    }

    cashierActiveOrders = openOrders;
    cashierBaseTotal = openOrders.reduce((sum, o) => sum + Number(o.total), 0);
    cashierServiceEnabled = true;
    cashierPayMethod = 'pix';

    renderCashierModal(type, id);
};

function renderCashierModal(type, id) {
    const locLabel = type === 'chale' ? `CHALÉ ${id}` : type === 'mesa' ? `MESA ${id.replace('M','')}` : `BALCÃO ${id}`;
    const allItems = cashierActiveOrders.flatMap(o => o.order_items || []);
    const staffNames = Array.from(new Set(cashierActiveOrders.map(o => o.staff_users?.name).filter(Boolean)));
    const staffLabel = staffNames.length > 0 ? staffNames.join(', ') : 'Equipe Rio Preto';

    document.getElementById('modalContainer').innerHTML = `
        <div class="modal-overlay" onclick="if(event.target===this) window.closeMod()">
            <div class="modal-box anim-fade p-0 overflow-hidden max-w-lg">
                <!-- Header -->
                <div class="bg-emerald-900 p-5 text-white flex justify-between items-center relative">
                    <button onclick="window.closeMod()" class="absolute top-4 right-4 text-emerald-300 hover:text-white"><i class="fa-solid fa-xmark text-xl"></i></button>
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-white text-2xl border border-white/20"><i class="fa-solid fa-cash-register"></i></div>
                        <div>
                            <h3 class="font-black text-lg leading-tight">Caixa Central • Fechamento</h3>
                            <p class="text-emerald-300 text-xs font-bold uppercase tracking-wider">${locLabel} • Atendente: ${staffLabel}</p>
                        </div>
                    </div>
                </div>

                <!-- Financial Summary -->
                <div class="p-6 bg-white space-y-4 max-h-[75vh] overflow-y-auto">
                    <!-- Items Preview -->
                    <div class="bg-gray-50 rounded-2xl p-3.5 border border-gray-100 space-y-2 max-h-36 overflow-y-auto text-xs">
                        <span class="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Itens da Comanda (${allItems.length})</span>
                        ${allItems.map(i => `
                            <div class="flex justify-between font-medium text-gray-700">
                                <span>${i.quantity}x ${i.product_name}</span>
                                <span class="font-bold">R$ ${(i.quantity * i.unit_price).toFixed(2).replace('.',',')}</span>
                            </div>
                        `).join('')}
                    </div>

                    <!-- Values Calculation Card -->
                    <div class="bg-emerald-50/60 rounded-2xl p-4 border border-emerald-100 space-y-2">
                        <div class="flex justify-between items-center text-sm">
                            <span class="text-gray-600 font-bold">Consumo dos Produtos</span>
                            <span class="font-bold text-gray-800">R$ ${cashierBaseTotal.toFixed(2).replace('.',',')}</span>
                        </div>

                        <div class="flex justify-between items-center text-sm">
                            <div class="flex items-center gap-2">
                                <span class="text-emerald-800 font-bold">Taxa de Serviço 10% (Garçons)</span>
                                <input type="checkbox" id="chkCashier10" checked onchange="window.updateCashierTotals()" class="w-4 h-4 accent-emerald-600 cursor-pointer">
                            </div>
                            <span id="cashier10Val" class="font-bold text-emerald-700">R$ ${(cashierBaseTotal * 0.10).toFixed(2).replace('.',',')}</span>
                        </div>

                        <div class="pt-2 border-t border-emerald-200 flex justify-between items-center">
                            <span class="text-emerald-950 font-black text-base">TOTAL A RECEBER</span>
                            <span id="cashierTotalVal" class="text-2xl font-black text-emerald-700">R$ ${(cashierBaseTotal * 1.10).toFixed(2).replace('.',',')}</span>
                        </div>
                    </div>

                    <!-- Payment Method Selection -->
                    <div class="space-y-2">
                        <label class="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Forma de Pagamento</label>
                        <div class="grid grid-cols-4 gap-2" id="payMethodGrid">
                            <button onclick="window.selectCashierPay('pix')" id="btnPay_pix" class="py-2.5 rounded-xl font-bold text-xs border bg-emerald-600 text-white border-emerald-600 flex flex-col items-center gap-1 transition">
                                <i class="fa-brands fa-pix text-base"></i> PIX
                            </button>
                            <button onclick="window.selectCashierPay('dinheiro')" id="btnPay_dinheiro" class="py-2.5 rounded-xl font-bold text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 flex flex-col items-center gap-1 transition">
                                <i class="fa-solid fa-money-bill-wave text-base"></i> Dinheiro
                            </button>
                            <button onclick="window.selectCashierPay('credito')" id="btnPay_credito" class="py-2.5 rounded-xl font-bold text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 flex flex-col items-center gap-1 transition">
                                <i class="fa-solid fa-credit-card text-base"></i> Crédito
                            </button>
                            <button onclick="window.selectCashierPay('debito')" id="btnPay_debito" class="py-2.5 rounded-xl font-bold text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 flex flex-col items-center gap-1 transition">
                                <i class="fa-regular fa-credit-card text-base"></i> Débito
                            </button>
                        </div>
                    </div>

                    <!-- Cash Given / Troco (Only shown if Dinheiro is selected) -->
                    <div id="cashChangeContainer" class="hidden bg-amber-50 p-3.5 rounded-2xl border border-amber-200 space-y-2">
                        <div class="flex justify-between items-center">
                            <label class="text-xs font-bold text-amber-900">Valor Recebido em Dinheiro (R$)</label>
                            <input type="number" id="cashGivenInput" placeholder="0.00" oninput="window.calcCashChange()" class="w-32 px-3 py-1.5 bg-white border border-amber-300 rounded-xl font-black text-right text-stone-800 outline-none">
                        </div>
                        <div class="flex justify-between items-center pt-2 border-t border-amber-200/60">
                            <span class="text-xs font-bold text-amber-900">Troco a Devolver:</span>
                            <span id="cashChangeVal" class="font-black text-lg text-amber-700">R$ 0,00</span>
                        </div>
                    </div>

                    <!-- Customer Name (Optional) -->
                    <div>
                        <label class="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Nome do Cliente (Opcional)</label>
                        <input type="text" id="cashierCustomerName" placeholder="Ex: João da Silva" class="input-sys py-2">
                    </div>
                </div>

                <!-- Footer Actions -->
                <div class="bg-gray-50 p-4 border-t border-gray-100 flex flex-col gap-2">
                    <button onclick="window.printCashierReceipt('${type}', '${id}')" id="btnPrintCashierReceipt"
                        class="w-full py-3.5 bg-stone-800 hover:bg-stone-900 text-white font-black text-sm rounded-2xl shadow transition active:scale-[0.98] flex items-center justify-center gap-2 mb-1">
                        <i class="fa-solid fa-print text-emerald-400"></i> IMPRIMIR GUIA DO CLIENTE / CONFERÊNCIA (10%)
                    </button>

                    <button onclick="window.confirmCashierCheckout('${type}', '${id}')" id="btnConfirmCashier"
                        class="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-base rounded-2xl shadow-lg transition active:scale-[0.98] flex items-center justify-center gap-2">
                        <i class="fa-solid fa-lock"></i> CONFIRMAR RECEBIMENTO E MOVER PARA HISTÓRICO
                    </button>
                </div>
            </div>
        </div>
    `;
}

window.updateCashierTotals = () => {
    const chk = document.getElementById('chkCashier10');
    cashierServiceEnabled = chk ? chk.checked : true;

    const serviceVal = cashierServiceEnabled ? cashierBaseTotal * 0.10 : 0;
    const totalVal = cashierBaseTotal + serviceVal;

    document.getElementById('cashier10Val').textContent = `R$ ${serviceVal.toFixed(2).replace('.',',')}`;
    document.getElementById('cashierTotalVal').textContent = `R$ ${totalVal.toFixed(2).replace('.',',')}`;
    
    window.calcCashChange();
};

window.selectCashierPay = (method) => {
    cashierPayMethod = method;

    ['pix', 'dinheiro', 'credito', 'debito'].forEach(m => {
        const btn = document.getElementById(`btnPay_${m}`);
        if (!btn) return;
        if (m === method) {
            btn.className = "py-2.5 rounded-xl font-bold text-xs border bg-emerald-600 text-white border-emerald-600 flex flex-col items-center gap-1 transition shadow-sm";
        } else {
            btn.className = "py-2.5 rounded-xl font-bold text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 flex flex-col items-center gap-1 transition";
        }
    });

    const cashContainer = document.getElementById('cashChangeContainer');
    if (cashContainer) {
        cashContainer.classList.toggle('hidden', method !== 'dinheiro');
    }
};

window.calcCashChange = () => {
    if (cashierPayMethod !== 'dinheiro') return;
    const serviceVal = cashierServiceEnabled ? cashierBaseTotal * 0.10 : 0;
    const totalTarget = cashierBaseTotal + serviceVal;
    
    const given = Number(document.getElementById('cashGivenInput')?.value || 0);
    const change = Math.max(0, given - totalTarget);

    const el = document.getElementById('cashChangeVal');
    if (el) el.textContent = `R$ ${change.toFixed(2).replace('.',',')}`;
};

window.confirmCashierCheckout = async (type, id) => {
    if (cashierActiveOrders.length === 0) return;

    const btn = document.getElementById('btnConfirmCashier');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Processando Fechamento...';

    try {
        const staff = getCurrentStaff();
        const serviceVal = cashierServiceEnabled ? cashierBaseTotal * 0.10 : 0;
        const customerName = document.getElementById('cashierCustomerName')?.value?.trim() || null;

        // Update all active orders for this comanda
        for (const o of cashierActiveOrders) {
            const ratio = Number(o.total) / cashierBaseTotal;
            const { error: updateErr } = await supabase
                .from('orders')
                .update({
                    payment_status: 'pago',
                    payment_method: cashierPayMethod,
                    customer_name: customerName || o.customer_name,
                    service_fee: parseFloat((serviceVal * ratio).toFixed(2)),
                    updated_at: new Date().toISOString(),
                    staff_id: staff?.id || o.staff_id
                })
                .eq('id', o.id);

            if (updateErr) throw updateErr;
        }

        // Audit Log for Payment Closed
        try {
            await logAuditAction('PAYMENT_CLOSED', {
                comanda: `${type.toUpperCase()} ${id}`,
                orders_count: cashierActiveOrders.length,
                order_numbers: cashierActiveOrders.map(o => o.order_number),
                subtotal: cashierBaseTotal,
                service_fee: serviceVal,
                total_amount: cashierBaseTotal + serviceVal,
                payment_method: cashierPayMethod.toUpperCase(),
                cashier_staff: staff?.name || 'Caixa Central'
            }, { type, id });
        } catch (auditErr) {
            console.warn('Audit error:', auditErr);
        }

        window.closeMod();
        loadComandas(); // Reload dashboard comandas

    } catch (err) {
        console.error('Checkout error:', err);
        alert('Erro ao processar fechamento: ' + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-lock mr-2"></i> CONFIRMAR RECEBIMENTO E MOVER PARA HISTÓRICO';
        }
    }
};

window.closeMod = () => {
    document.getElementById('modalContainer').innerHTML = '';
};

// ====== THERMAL RECEIPT PRINTING (80mm) ======
window.printCashierReceipt = (type, id) => {
    if (!cashierActiveOrders || cashierActiveOrders.length === 0) return;

    const staff = getCurrentStaff();
    const staffName = staff?.name || 'Caixa Central';
    const customerInput = document.getElementById('cashierCustomerName')?.value?.trim();
    const customerName = customerInput || cashierActiveOrders[0]?.customer_name || 'Não Informado';

    const chk10 = document.getElementById('chkCashier10');
    const is10Enabled = chk10 ? chk10.checked : cashierServiceEnabled;

    const subtotal = cashierBaseTotal;
    const serviceFee = is10Enabled ? subtotal * 0.10 : 0;
    const total = subtotal + serviceFee;

    // Consolidate items by product name
    const itemMap = {};
    cashierActiveOrders.forEach(order => {
        (order.order_items || []).forEach(item => {
            const name = item.product_name || 'Produto';
            if (!itemMap[name]) {
                itemMap[name] = { qty: 0, price: Number(item.unit_price || 0), total: 0 };
            }
            itemMap[name].qty += Number(item.quantity || 1);
            itemMap[name].total += Number(item.unit_price || 0) * Number(item.quantity || 1);
        });
    });

    const nowStr = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

    let itemsHtml = '';
    Object.keys(itemMap).forEach(name => {
        const item = itemMap[name];
        itemsHtml += `
            <div style="display: flex; justify-content: space-between; margin: 3px 0; font-size: 11px;">
                <span style="flex: 1; padding-right: 5px;">${item.qty}x ${name}</span>
                <span style="font-weight: bold; white-space: nowrap;">R$ ${item.total.toFixed(2).replace('.', ',')}</span>
            </div>
        `;
    });

    const printWindow = window.open('', '', 'width=400,height=600');
    if (!printWindow) {
        alert('Por favor, permita pop-ups no seu navegador para imprimir a guia.');
        return;
    }

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Guia de Conferência - Balneário Rio Preto</title>
            <style>
                body {
                    font-family: 'Courier New', Courier, monospace;
                    font-size: 12px;
                    width: 280px;
                    margin: 0 auto;
                    padding: 8px;
                    color: #000;
                }
                .text-center { text-align: center; }
                .text-right { text-align: right; }
                .font-bold { font-weight: bold; }
                .divider { border-bottom: 1px dashed #000; margin: 6px 0; }
                .divider-thick { border-bottom: 2px solid #000; margin: 6px 0; }
                @media print {
                    body { width: 100%; margin: 0; padding: 0; }
                }
            </style>
        </head>
        <body onload="window.print(); setTimeout(() => window.close(), 1000);">
            <div class="text-center font-bold" style="font-size: 15px;">BALNEÁRIO RIO PRETO</div>
            <div class="text-center" style="font-size: 11px; margin-top: 2px;">CONFERÊNCIA DE CONSUMO</div>
            
            <div class="divider"></div>

            <div><strong>DATA:</strong> ${nowStr}</div>
            <div><strong>LOCAL:</strong> ${type.toUpperCase()}: ${id}</div>
            <div><strong>ATENDENTE:</strong> ${staffName}</div>
            <div><strong>CLIENTE:</strong> ${customerName}</div>

            <div class="divider"></div>

            <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 11px; margin-bottom: 4px;">
                <span>QTD ITEM</span>
                <span>VALOR</span>
            </div>

            ${itemsHtml}

            <div class="divider"></div>

            <div style="display: flex; justify-content: space-between; margin: 2px 0;">
                <span>CONSUMO DOS PRODUTOS:</span>
                <span>R$ ${subtotal.toFixed(2).replace('.', ',')}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin: 2px 0;">
                <span>TAXA DE SERVIÇO (10%):</span>
                <span>R$ ${serviceFee.toFixed(2).replace('.', ',')} ${is10Enabled ? '' : '(OPCIONAL ISENTA)'}</span>
            </div>

            <div class="divider-thick"></div>

            <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; margin: 4px 0;">
                <span>TOTAL A RECEBER:</span>
                <span>R$ ${total.toFixed(2).replace('.', ',')}</span>
            </div>

            <div class="divider"></div>

            <div class="text-center" style="font-size: 10px; margin-top: 12px; line-height: 1.4;">
                *** GUIA DE CONFERÊNCIA DO CLIENTE ***<br>
                Taxa de serviço 10% é opcional.<br>
                Obrigado pela preferência!<br>
                Balneário Rio Preto
            </div>
        </body>
        </html>
    `);

    printWindow.document.close();
};
