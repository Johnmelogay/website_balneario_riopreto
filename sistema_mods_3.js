import { supabase } from './scripts.js';
import { getCurrentStaff, hasActionPermission } from './sistema_auth.js';

let currentTab = 'abertas'; // abertas | fechadas
let filterDate = new Date().toISOString().split('T')[0];
let selectedStaffId = 'all';
let allStaffMembers = [];
let caixaChannel = null;
let caixaPollingInterval = null;


export async function renderComandas(container) {
    container.innerHTML = `
        <div class="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div class="flex bg-gray-100 p-1 rounded-xl">
                <button onclick="window.cmdTab('abertas')" id="btnCmdAbertas" class="px-6 py-2 rounded-lg text-sm font-bold transition ${currentTab === 'abertas' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}">Ativas/Abertas</button>
                <button onclick="window.cmdTab('fechadas')" id="btnCmdFechadas" class="px-6 py-2 rounded-lg text-sm font-bold transition ${currentTab === 'fechadas' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}">Fechadas/Histórico</button>
            </div>
            
            <div class="flex flex-wrap items-center gap-3">
                <!-- Filter by Staff/Garçom Dropdown -->
                <div id="cmdStaffFilterContainer" class="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-gray-200 shadow-sm">
                    <i class="fa-solid fa-user-tie text-gray-400 text-xs"></i>
                    <label class="text-xs font-bold text-gray-400 uppercase tracking-widest">Garçom:</label>
                    <select id="cmdFilterStaff" onchange="window.cmdStaffChange(this.value)" class="bg-transparent text-xs font-bold text-gray-800 outline-none cursor-pointer">
                        <option value="all" ${selectedStaffId === 'all' ? 'selected' : ''}>Todos os Garçons</option>
                        ${allStaffMembers.map(s => `<option value="${s.id}" ${selectedStaffId === s.id ? 'selected' : ''}>${s.name} (${s.role})</option>`).join('')}
                    </select>
                </div>

                <div id="cmdDateFilterContainer" class="flex items-center gap-2 ${currentTab === 'abertas' ? 'hidden' : ''}">
                    <label class="text-xs font-bold text-gray-400 uppercase tracking-widest">Filtrar Data</label>
                    <input type="date" id="cmdFilterDate" value="${filterDate}" onchange="window.cmdDateChange(this.value)" class="input-sys w-auto py-2">
                </div>
            </div>
        </div>

        <div id="cmdContent" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <div class="col-span-full flex justify-center py-20"><i class="fa-solid fa-spinner fa-spin text-4xl text-emerald-600"></i></div>
        </div>
    `;

    loadComandas();
    startCaixaRealtime();
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

window.cmdStaffChange = (staffId) => {
    selectedStaffId = staffId;
    document.getElementById('cmdContent').innerHTML = '<div class="col-span-full flex justify-center py-20"><i class="fa-solid fa-spinner fa-spin text-4xl text-emerald-600"></i></div>';
    loadComandas();
};

function startCaixaRealtime() {
    if (caixaChannel) return;
    
    // Polling fallback de 5s para segurança apenas na aba abertas
    if (caixaPollingInterval) clearInterval(caixaPollingInterval);
    caixaPollingInterval = setInterval(() => {
        if (currentTab === 'abertas' && document.getElementById('cmdContent')) {
            loadComandas(true); // silent refresh
        }
    }, 5000);

    caixaChannel = supabase.channel('caixa-comandas-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
            if (currentTab === 'abertas' && document.getElementById('cmdContent')) loadComandas(true);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => {
            if (currentTab === 'abertas' && document.getElementById('cmdContent')) loadComandas(true);
        })
        .subscribe();
}

async function loadComandas(silent = false) {
    const staff = getCurrentStaff();
    if (!staff) return;

    // Fetch staff list if empty
    if (allStaffMembers.length === 0) {
        try {
            const { data: staffData } = await supabase.from('staff_users').select('id, name, role').order('name');
            if (staffData && staffData.length > 0) {
                allStaffMembers = staffData;
                const selectEl = document.getElementById('cmdFilterStaff');
                if (selectEl) {
                    selectEl.innerHTML = `
                        <option value="all" ${selectedStaffId === 'all' ? 'selected' : ''}>Todos os Garçons</option>
                        ${allStaffMembers.map(s => `<option value="${s.id}" ${selectedStaffId === s.id ? 'selected' : ''}>${s.name} (${s.role})</option>`).join('')}
                    `;
                }
            }
        } catch(e) {
            console.warn('Error fetching staff members:', e);
        }
    }

    // Se o garçom entra, ele só vê as dele (ou admin/caixa/gerente/ceo vê de todos)
    const isAdminOrCaixa = ['admin', 'caixa', 'gerente', 'ceo'].includes(staff.role) || hasActionPermission(staff.role, 'close_cashier');


    try {
        let query = supabase.from('orders')
            .select('*, order_items(*), staff_users(name)');

        if (currentTab === 'abertas') {
            query = query.eq('payment_status', 'aberto').neq('status', 'cancelado');
        } else {
            // Histórico (Fechadas) - Query wide range around filterDate and filter by Porto Velho timezone in JS
            const [y, m, d] = filterDate.split('-').map(Number);
            const fetchStart = new Date(Date.UTC(y, m - 1, d - 1, 0, 0, 0)).toISOString();
            const fetchEnd = new Date(Date.UTC(y, m - 1, d + 2, 23, 59, 59)).toISOString();
            query = query.eq('payment_status', 'pago').gte('created_at', fetchStart).lte('created_at', fetchEnd);
        }

        // Apply staff filter
        if (selectedStaffId !== 'all') {
            query = query.eq('staff_id', selectedStaffId);
        } else if (!isAdminOrCaixa && staff.role === 'garcom') {
            query = query.eq('staff_id', staff.id);
        }

        const { data: rawOrders, error } = await query;
        
        if (error) throw error;

        let orders = rawOrders || [];
        if (currentTab === 'fechadas') {
            orders = orders.filter(o => {
                const orderLocalDate = new Date(o.created_at || o.updated_at).toLocaleDateString('sv-SE', { timeZone: 'America/Porto_Velho' });
                return orderLocalDate === filterDate;
            });
        }

        // Group by location_type + location_id
        const comandas = {};
        let totalVal = 0;

        orders.forEach(o => {
            const comandaId = `${o.location_type}_${o.location_id}`;
            if (!comandas[comandaId]) {
                comandas[comandaId] = {
                    type: o.location_type,
                    id: o.location_id,
                    total: 0,
                    orders: [],
                    staffNames: new Set(),
                    daily_seq: o.daily_seq || 999999
                };
            }
            comandas[comandaId].orders.push(o);
            comandas[comandaId].total += Number(o.total || 0);
            if (o.staff_users?.name) comandas[comandaId].staffNames.add(o.staff_users.name);
            totalVal += Number(o.total || 0);
        });

        renderComandasGrid(Object.values(comandas), isAdminOrCaixa, totalVal);

    } catch (e) {
        console.error(e);
        if (!silent) {
            document.getElementById('cmdContent').innerHTML = `<div class="col-span-full text-center text-red-500 font-bold">${e.message}</div>`;
        }
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
        const sortedOrders = [...c.orders].sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
        const donoDaMesa = sortedOrders.length > 0 && sortedOrders[0].staff_users?.name 
                           ? sortedOrders[0].staff_users.name.split(' ')[0] 
                           : 'Sem garçom';
        const customerName = sortedOrders.find(o => o.customer_name?.trim())?.customer_name?.trim() || '';
        const staffTeam = donoDaMesa;
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
                    <div class="w-full">
                        <div class="flex items-center justify-between gap-2 mb-2 w-full">
                            <span class="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-xl text-xs md:text-sm font-black uppercase tracking-tight flex items-center gap-1.5 truncate">
                                <i class="fa-solid ${c.type === 'chale' ? 'fa-house' : c.type === 'barraca' ? 'fa-campground' : 'fa-chair'}"></i>
                                ${typeLabel} ${c.id} ${customerName ? '• ' + customerName.toUpperCase() : ''}
                            </span>
                            <span class="text-xs font-black text-gray-500 bg-gray-100 px-2 py-1 rounded-lg border border-gray-200 shrink-0">#${c.daily_seq < 999999 ? c.daily_seq : '?'}</span>
                        </div>
                        <p class="text-[10px] font-bold text-gray-400 truncate"><i class="fa-solid fa-user-tag mr-1"></i>Garçom: ${staffTeam}</p>
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
    let query = supabase.from('orders').select('*, order_items(*), staff_users(name)').eq('location_type', type).eq('location_id', id);
    if(currentTab === 'abertas') query = query.eq('payment_status', 'aberto').neq('status','cancelado');
    else {
        const [year, month, day] = filterDate.split('-').map(Number);
        const startOfDay = new Date(year, month - 1, day, 0, 0, 0).toISOString();
        const endOfDay = new Date(year, month - 1, day, 23, 59, 59).toISOString();
        query = query.eq('payment_status', 'pago').gte('updated_at', startOfDay).lte('updated_at', endOfDay);
    }
    
    // Garçom filter
    if (!['admin', 'caixa', 'gerente', 'ceo'].includes(staff.role) && !hasActionPermission(staff.role, 'close_cashier')) query = query.eq('staff_id', staff.id);

    
    const { data: orders } = await query;
    if(!orders || orders.length === 0) return;
    
    const allItems = orders.flatMap(o => o.order_items);
    const customerName = orders.find(o => o.customer_name?.trim())?.customer_name?.trim() || '';
    const waiterNames = Array.from(new Set(orders.map(o => o.staff_users?.name).filter(Boolean)));
    const waiterLabel = waiterNames.length > 0 ? waiterNames.join(', ') : 'Sem Garçom';
    const typeLabel = type === 'chale' ? 'CHALÉ' : type === 'barraca' ? 'BARRACA' : 'MESA';
    let total = 0;
    
    document.getElementById('modalContainer').innerHTML = `
        <div class="modal-overlay" onclick="if(event.target===this) window.closeMod()">
            <div class="modal-box anim-fade p-0 overflow-hidden max-w-md">
                <div class="bg-gray-800 p-6 text-center shadow-inner relative">
                    <button onclick="window.closeMod()" class="absolute top-4 right-4 text-gray-400 hover:text-white"><i class="fa-solid fa-xmark text-xl"></i></button>
                    <div class="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-3 text-white text-2xl border border-white/20"><i class="fa-solid fa-receipt"></i></div>
                    <h3 class="text-white font-black tracking-widest uppercase mb-1">Extrato de Consumo</h3>
                    <p class="text-emerald-400 font-black text-sm uppercase tracking-widest">${typeLabel} ${id} ${customerName ? '• ' + customerName.toUpperCase() : ''}</p>
                    <div class="mt-3 flex flex-wrap justify-center gap-2 text-xs font-bold text-gray-300">
                        <span class="bg-white/10 px-2.5 py-1 rounded-lg border border-white/10"><i class="fa-solid fa-user-tag text-amber-400 mr-1.5"></i>Cliente: ${customerName || 'Não Informado'}</span>
                        <span class="bg-white/10 px-2.5 py-1 rounded-lg border border-white/10"><i class="fa-solid fa-user-tie text-emerald-400 mr-1.5"></i>Garçom: ${waiterLabel}</span>
                    </div>
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
    const customerName = cashierActiveOrders.find(o => o.customer_name?.trim())?.customer_name?.trim() || '';
    const staffNames = Array.from(new Set(cashierActiveOrders.map(o => o.staff_users?.name).filter(Boolean)));
    const staffLabel = staffNames.length > 0 ? staffNames.join(', ') : 'Equipe Rio Preto';

    document.getElementById('modalContainer').innerHTML = `
        <div class="modal-overlay" onclick="if(event.target===this) window.closeMod()">
            <div class="modal-box anim-fade p-0 overflow-hidden max-w-lg flex flex-col max-h-[95vh]">
                <!-- Header -->
                <div class="bg-emerald-900 p-5 text-white flex justify-between items-center relative">
                    <button onclick="window.closeMod()" class="absolute top-4 right-4 text-emerald-300 hover:text-white"><i class="fa-solid fa-xmark text-xl"></i></button>
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-white text-2xl border border-white/20"><i class="fa-solid fa-cash-register"></i></div>
                        <div>
                            <h3 class="font-black text-lg leading-tight">Caixa Central • Fechamento</h3>
                            <p class="text-emerald-300 text-xs font-black uppercase tracking-wider">${locLabel} ${customerName ? '• ' + customerName.toUpperCase() : ''} • Garçom: ${staffLabel}</p>
                        </div>
                    </div>
                </div>


                <!-- Financial Summary -->
                <div class="p-6 bg-white space-y-4 overflow-y-auto flex-1 min-h-0">
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

                    <!-- Split Payment Methods -->
                    <div class="space-y-2">
                        <div class="flex justify-between items-center mb-1">
                            <label class="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Pagamento (Opcional dividir)</label>
                            <button onclick="window.fillSplit('pix')" class="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded uppercase hover:bg-emerald-100">Pix Total</button>
                            <button onclick="window.fillSplit('dinheiro')" class="text-[10px] font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded uppercase hover:bg-gray-200">Din Total</button>
                            <button onclick="window.fillSplit('credito')" class="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase hover:bg-blue-100">Créd Total</button>
                            <button onclick="window.fillSplit('debito')" class="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded uppercase hover:bg-orange-100">Déb Total</button>
                        </div>
                        <div class="grid grid-cols-2 gap-2" id="splitPayGrid">
                            <div class="bg-gray-50 border border-gray-200 rounded-xl p-2 flex justify-between items-center">
                                <label class="text-xs font-bold text-gray-600"><i class="fa-brands fa-pix text-emerald-600"></i> PIX</label>
                                <input type="number" id="split_pix" placeholder="0.00" oninput="window.calcCashChange()" class="w-24 bg-white border border-gray-300 rounded-lg text-right font-black text-sm outline-none px-2 py-1 focus:border-emerald-500">
                            </div>
                            <div class="bg-gray-50 border border-gray-200 rounded-xl p-2 flex justify-between items-center">
                                <label class="text-xs font-bold text-gray-600"><i class="fa-solid fa-money-bill-wave text-green-600"></i> Dinheiro</label>
                                <input type="number" id="split_dinheiro" placeholder="0.00" oninput="window.calcCashChange()" class="w-24 bg-white border border-gray-300 rounded-lg text-right font-black text-sm outline-none px-2 py-1 focus:border-emerald-500">
                            </div>
                            <div class="bg-gray-50 border border-gray-200 rounded-xl p-2 flex justify-between items-center">
                                <label class="text-xs font-bold text-gray-600"><i class="fa-solid fa-credit-card text-blue-600"></i> Crédito</label>
                                <input type="number" id="split_credito" placeholder="0.00" oninput="window.calcCashChange()" class="w-24 bg-white border border-gray-300 rounded-lg text-right font-black text-sm outline-none px-2 py-1 focus:border-emerald-500">
                            </div>
                            <div class="bg-gray-50 border border-gray-200 rounded-xl p-2 flex justify-between items-center">
                                <label class="text-xs font-bold text-gray-600"><i class="fa-regular fa-credit-card text-orange-600"></i> Débito</label>
                                <input type="number" id="split_debito" placeholder="0.00" oninput="window.calcCashChange()" class="w-24 bg-white border border-gray-300 rounded-lg text-right font-black text-sm outline-none px-2 py-1 focus:border-emerald-500">
                            </div>
                        </div>
                    </div>

                    <!-- Pending / Troco -->
                    <div id="cashChangeContainer" class="bg-amber-50 p-3.5 rounded-2xl border border-amber-200 space-y-2 hidden">
                        <div class="flex justify-between items-center">
                            <span class="text-xs font-bold text-amber-900" id="pendingLabel">Falta Pagar / Troco:</span>
                            <span id="cashChangeVal" class="font-black text-lg text-amber-700">R$ 0,00</span>
                        </div>
                    </div>

                    <!-- Customer Name & Phone (Optional) -->
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Nome do Cliente</label>
                            <input type="text" id="cashierCustomerName" placeholder="Opcional" class="input-sys py-2 text-xs">
                        </div>
                        <div>
                            <label class="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Telefone / Whats</label>
                            <input type="text" id="cashierCustomerPhone" placeholder="Opcional" class="input-sys py-2 text-xs">
                        </div>
                    </div>
                </div>

                <!-- Footer Actions -->
                <div class="bg-gray-50 p-4 border-t border-gray-100 flex flex-col gap-2">
                    <button onclick="window.printCashierReceipt('${type}', '${id}')" id="btnPrintCashierReceipt"
                        class="w-full py-3.5 bg-stone-900 hover:bg-black text-white font-black text-sm rounded-2xl shadow transition active:scale-[0.98] flex items-center justify-center gap-2 mb-1">
                        <i class="fa-solid fa-print text-emerald-400 text-base"></i> IMPRIMIR GUIA DO CLIENTE (80mm)
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

window.fillSplit = (method) => {
    ['pix', 'dinheiro', 'credito', 'debito'].forEach(m => {
        const el = document.getElementById(`split_${m}`);
        if(el) el.value = '';
    });
    const target = document.getElementById(`split_${method}`);
    if (target) {
        const serviceVal = cashierServiceEnabled ? cashierBaseTotal * 0.10 : 0;
        const totalVal = cashierBaseTotal + serviceVal;
        target.value = totalVal.toFixed(2);
    }
    window.calcCashChange();
};

window.calcCashChange = () => {
    const serviceVal = cashierServiceEnabled ? cashierBaseTotal * 0.10 : 0;
    const totalTarget = cashierBaseTotal + serviceVal;
    
    const pix = Number(document.getElementById('split_pix')?.value || 0);
    const din = Number(document.getElementById('split_dinheiro')?.value || 0);
    const cre = Number(document.getElementById('split_credito')?.value || 0);
    const deb = Number(document.getElementById('split_debito')?.value || 0);
    
    const totalGiven = pix + din + cre + deb;
    const diff = totalGiven - totalTarget;

    const container = document.getElementById('cashChangeContainer');
    const label = document.getElementById('pendingLabel');
    const val = document.getElementById('cashChangeVal');

    if (container && label && val) {
        container.classList.remove('hidden');
        if (diff > 0.01) {
            label.textContent = "Troco a Devolver (Dinheiro):";
            val.textContent = `R$ ${diff.toFixed(2).replace('.',',')}`;
            val.className = "font-black text-lg text-emerald-600";
            container.className = "bg-emerald-50 p-3.5 rounded-2xl border border-emerald-200 space-y-2";
        } else if (diff < -0.01) {
            label.textContent = "Falta Pagar:";
            val.textContent = `R$ ${Math.abs(diff).toFixed(2).replace('.',',')}`;
            val.className = "font-black text-lg text-red-600";
            container.className = "bg-red-50 p-3.5 rounded-2xl border border-red-200 space-y-2";
        } else {
            label.textContent = "Pagamento Exato:";
            val.textContent = "R$ 0,00";
            val.className = "font-black text-lg text-emerald-600";
            container.className = "bg-emerald-50 p-3.5 rounded-2xl border border-emerald-200 space-y-2";
        }
    }
};

window.confirmCashierCheckout = async (type, id) => {
    if (cashierActiveOrders.length === 0) return;

    const btn = document.getElementById('btnConfirmCashier');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Processando Fechamento...';

    try {
        const staff = getCurrentStaff();
        const serviceVal = cashierServiceEnabled ? cashierBaseTotal * 0.10 : 0;
        const totalTarget = cashierBaseTotal + serviceVal;
        
        const customerName = document.getElementById('cashierCustomerName')?.value?.trim() || null;
        const customerPhone = document.getElementById('cashierCustomerPhone')?.value?.trim() || null;
        
        let pix = Number(document.getElementById('split_pix')?.value || 0);
        let din = Number(document.getElementById('split_dinheiro')?.value || 0);
        let cre = Number(document.getElementById('split_credito')?.value || 0);
        let deb = Number(document.getElementById('split_debito')?.value || 0);
        
        const totalGiven = pix + din + cre + deb;

        if (totalGiven < totalTarget - 0.01) {
            alert('Atenção: O valor pago (R$ ' + totalGiven.toFixed(2).replace('.',',') + ') é menor que o TOTAL A RECEBER (R$ ' + totalTarget.toFixed(2).replace('.',',') + '). Por favor, informe os valores recebidos antes de confirmar.');
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-lock"></i> CONFIRMAR RECEBIMENTO E MOVER PARA HISTÓRICO';
            return;
        }

        // Ensure total target is met or ask for confirmation? We allow underpay/overpay but troco is deducted from dinheiro
        if (totalGiven > totalTarget) {
            const troco = totalGiven - totalTarget;
            if (din >= troco) {
                din -= troco; // Troco is returned from physical cash
            }
        }

        // Determine primary payment method name just for simple tracking/reporting backwards compatibility
        let primaryMethod = 'múltiplo';
        if (pix > 0 && din === 0 && cre === 0 && deb === 0) primaryMethod = 'pix';
        else if (din > 0 && pix === 0 && cre === 0 && deb === 0) primaryMethod = 'dinheiro';
        else if (cre > 0 && pix === 0 && din === 0 && deb === 0) primaryMethod = 'credito';
        else if (deb > 0 && pix === 0 && din === 0 && cre === 0) primaryMethod = 'debito';

        // Option A: Primary Server (Dono da Mesa)
        // Find the oldest order which represents the owner of the table
        const sortedOrders = [...cashierActiveOrders].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        const ownerOrderId = sortedOrders.length > 0 ? sortedOrders[0].id : null;

        // Update all active orders for this comanda
        for (const o of cashierActiveOrders) {
            const ratio = Number(o.total) / cashierBaseTotal; // proportional split among sub-orders for payment methods
            
            // The 10% commission goes 100% to the Dono da Mesa (ownerOrderId)
            const myServiceFee = (o.id === ownerOrderId) ? serviceVal : 0;
            
            const { error: updateErr } = await supabase
                .from('orders')
                .update({
                    payment_status: 'pago',
                    payment_method: primaryMethod,
                    customer_name: customerName || o.customer_name,
                    customer_phone: customerPhone || o.customer_phone,
                    service_fee: parseFloat(myServiceFee.toFixed(2)),
                    split_pix: parseFloat((pix * ratio).toFixed(2)),
                    split_dinheiro: parseFloat((din * ratio).toFixed(2)),
                    split_credito: parseFloat((cre * ratio).toFixed(2)),
                    split_debito: parseFloat((deb * ratio).toFixed(2)),
                    updated_at: new Date().toISOString()
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
window.printCashierReceipt = async (type, id) => {
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
                itemMap[name] = { qty: 0, price: Number(item.unit_price || 0), total: 0, notes: item.notes };
            }
            itemMap[name].qty += Number(item.quantity || 1);
            itemMap[name].total += Number(item.unit_price || 0) * Number(item.quantity || 1);
        });
    });

    const itemList = Object.keys(itemMap).map(name => ({
        name: name,
        qty: itemMap[name].qty,
        total: itemMap[name].total,
        notes: itemMap[name].notes
    }));

    // ====== INSTANT DIRECT HARDWARE PRINTING (Node.js WebUSB Server Port 3001) ======
    try {
        const directRes = await fetch('http://localhost:3001/print', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                location: `${type.toUpperCase()}: ${id}`,
                customer: customerName,
                staff: staffName,
                subtotal: subtotal,
                serviceFee: serviceFee,
                total: total,
                items: itemList
            })
        });

        const resData = await directRes.json();
        if (resData && resData.success) {
            console.log('⚡ Cupom impresso e cortado instantaneamente via USB!');
            return;
        }
    } catch (err) {
        console.log('Servidor USB local não respondeu, abrindo janela do navegador...');
    }

    const nowStr = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    const locLabel = `${type.toUpperCase()}: ${id}`;

    let itemsHtml = '';
    Object.keys(itemMap).forEach(name => {
        const item = itemMap[name];
        itemsHtml += `
            <tr>
                <td style="padding: 5px 0; border-bottom: 1px dashed #e2e8f0; vertical-align: top;">
                    <span style="font-weight: 900; color: #047857; margin-right: 4px;">${item.qty}x</span>
                    <span style="font-weight: 600; color: #1e293b;">${name}</span>
                    ${item.notes ? `<div style="font-size: 9px; color: #d97706; font-style: italic; margin-top: 1px;">Obs: ${item.notes}</div>` : ''}
                </td>
                <td style="padding: 5px 0; border-bottom: 1px dashed #e2e8f0; vertical-align: top; text-align: right; font-weight: 700; color: #0f172a; white-space: nowrap;">
                    R$ ${item.total.toFixed(2).replace('.', ',')}
                </td>
            </tr>
        `;
    });

    const printWindow = window.open('', '', 'width=420,height=700');
    if (!printWindow) {
        alert('Por favor, permita pop-ups no seu navegador para imprimir a guia.');
        return;
    }

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Conferência de Consumo - Balneário Rio Preto</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Outfit:wght@600;800;900&display=swap" rel="stylesheet">
            <style>
                @page {
                    size: 80mm auto;
                    margin: 0;
                }
                * {
                    box-sizing: border-box;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                body {
                    font-family: 'Inter', -apple-system, sans-serif;
                    font-size: 11px;
                    color: #111827;
                    width: 280px;
                    margin: 0 auto;
                    padding: 12px 10px;
                    background: #ffffff;
                    line-height: 1.35;
                }
                .header {
                    text-align: center;
                    padding-bottom: 8px;
                }
                .logo {
                    width: 48px;
                    height: 48px;
                    border-radius: 12px;
                    margin: 0 auto 6px auto;
                    display: block;
                    object-fit: contain;
                }
                .brand-name {
                    font-family: 'Outfit', sans-serif;
                    font-weight: 900;
                    font-size: 16px;
                    color: #064e3b;
                    text-transform: uppercase;
                    letter-spacing: -0.3px;
                    margin: 0;
                }
                .receipt-subtitle {
                    font-size: 9px;
                    font-weight: 800;
                    color: #047857;
                    letter-spacing: 1.5px;
                    text-transform: uppercase;
                    margin-top: 2px;
                }
                .info-box {
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 10px;
                    padding: 8px 10px;
                    margin: 8px 0;
                    font-size: 10.5px;
                }
                .info-row {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 2.5px;
                }
                .info-row:last-child { margin-bottom: 0; }
                .info-label { color: #64748b; font-weight: 600; }
                .info-val { color: #0f172a; font-weight: 800; }

                .items-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 10px 0;
                }
                .items-table th {
                    font-family: 'Outfit', sans-serif;
                    font-size: 9.5px;
                    font-weight: 800;
                    color: #475569;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    border-bottom: 1.5px solid #cbd5e1;
                    padding-bottom: 4px;
                    text-align: left;
                }
                .items-table th.right { text-align: right; }

                .summary-box {
                    background: #f0fdf4;
                    border: 1.5px solid #bbf7d0;
                    border-radius: 12px;
                    padding: 10px;
                    margin: 10px 0;
                }
                .summary-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 4px;
                    font-size: 11px;
                }
                .summary-row.total {
                    border-top: 1.5px solid #86efac;
                    padding-top: 6px;
                    margin-top: 6px;
                    margin-bottom: 0;
                }
                .total-title {
                    font-family: 'Outfit', sans-serif;
                    font-weight: 900;
                    font-size: 13px;
                    color: #064e3b;
                }
                .total-amount {
                    font-family: 'Outfit', sans-serif;
                    font-weight: 900;
                    font-size: 17px;
                    color: #047857;
                }

                .footer {
                    text-align: center;
                    margin-top: 12px;
                    padding-top: 8px;
                    border-top: 1px dashed #cbd5e1;
                    font-size: 9.5px;
                    color: #64748b;
                }
                .footer-highlight {
                    font-weight: 800;
                    color: #064e3b;
                    margin-bottom: 2px;
                }
                @media print {
                    body { width: 100%; margin: 0; padding: 6px; }
                }
            </style>
        </head>
        <body onload="setTimeout(() => { window.print(); window.close(); }, 600);">
            <div class="header">
                <img src="https://balnearioriopreto.com.br/images/logo_opt.png" alt="Logo" class="logo" onerror="this.style.display='none'">
                <h1 class="brand-name">Balneário Rio Preto</h1>
                <div class="receipt-subtitle">Conferência de Consumo</div>
            </div>

            <div class="info-box">
                <div class="info-row">
                    <span class="info-label">LOCAL / COMANDA:</span>
                    <span class="info-val" style="color: #064e3b; font-size: 12px;">${locLabel}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">CLIENTE:</span>
                    <span class="info-val">${customerName}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">ATENDENTE:</span>
                    <span class="info-val">${staffName}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">DATA & HORA:</span>
                    <span class="info-val">${nowStr}</span>
                </div>
            </div>

            <table class="items-table">
                <thead>
                    <tr>
                        <th>Item / Descrição</th>
                        <th class="right">Valor</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>

            <div class="summary-box">
                <div class="summary-row">
                    <span style="color: #475569; font-weight: 600;">Consumo Produtos:</span>
                    <span style="font-weight: 800; color: #0f172a;">R$ ${subtotal.toFixed(2).replace('.', ',')}</span>
                </div>
                <div class="summary-row">
                    <span style="color: #475569; font-weight: 600;">Taxa de Serviço 10% (Garçons):</span>
                    <span style="font-weight: 800; color: #047857;">R$ ${serviceFee.toFixed(2).replace('.', ',')} ${is10Enabled ? '' : '<small style="color:#ef4444">(Isenta)</small>'}</span>
                </div>
                <div class="summary-row total">
                    <span class="total-title">TOTAL A RECEBER:</span>
                    <span class="total-amount">R$ ${total.toFixed(2).replace('.', ',')}</span>
                </div>
            </div>

            <div class="footer">
                <div class="footer-highlight">*** GUIA DE CONFERÊNCIA ***</div>
                <p style="margin: 2px 0;">A taxa de serviço de 10% é opcional.</p>
                <p style="margin: 2px 0; font-weight: 600; color: #334155;">Obrigado pela preferência e volte sempre! 🌿</p>
                <p style="margin-top: 4px; font-size: 8.5px; color: #94a3b8;">balnearioriopreto.com.br</p>
            </div>
        </body>
        </html>
    `);

    printWindow.document.close();
};

// ====== DIRECT WEB SERIAL USB DRIVER (ELGIN i8 / NO MAC DRIVER NEEDED) ======
window.printDirectUSB = async (type, id) => {
    if (!('serial' in navigator)) {
        alert('O seu navegador não suporta comunicação USB direta (Web Serial). Por favor, utilize o Google Chrome ou Microsoft Edge no Mac.');
        return;
    }

    if (!cashierActiveOrders || cashierActiveOrders.length === 0) return;

    try {
        // Request USB Serial port connection directly from browser
        const port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600 });

        const writer = port.writable.getWriter();
        const encoder = new TextEncoder();

        // ESC/POS Commands
        const RESET = new Uint8Array([0x1B, 0x40]);
        const CENTER = new Uint8Array([0x1B, 0x61, 0x01]);
        const LEFT = new Uint8Array([0x1B, 0x61, 0x00]);
        const BOLD_ON = new Uint8Array([0x1B, 0x45, 0x01]);
        const BOLD_OFF = new Uint8Array([0x1B, 0x45, 0x00]);
        const CUT_FULL = new Uint8Array([0x1D, 0x56, 0x00]); // Elgin Auto Cut

        const staff = getCurrentStaff();
        const staffName = staff?.name || 'Caixa Central';
        const customerInput = document.getElementById('cashierCustomerName')?.value?.trim();
        const customerName = customerInput || cashierActiveOrders[0]?.customer_name || 'Nao Informado';

        const chk10 = document.getElementById('chkCashier10');
        const is10Enabled = chk10 ? chk10.checked : cashierServiceEnabled;

        const subtotal = cashierBaseTotal;
        const serviceFee = is10Enabled ? subtotal * 0.10 : 0;
        const total = subtotal + serviceFee;
        const nowStr = new Date().toLocaleString('pt-BR');

        // Consolidate items
        const itemMap = {};
        cashierActiveOrders.forEach(order => {
            (order.order_items || []).forEach(item => {
                const name = (item.product_name || 'Produto').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                if (!itemMap[name]) {
                    itemMap[name] = { qty: 0, total: 0 };
                }
                itemMap[name].qty += Number(item.quantity || 1);
                itemMap[name].total += Number(item.unit_price || 0) * Number(item.quantity || 1);
            });
        });

        // 1. Header
        await writer.write(RESET);
        await writer.write(CENTER);
        await writer.write(BOLD_ON);
        await writer.write(encoder.encode("BALNEARIO RIO PRETO\n"));
        await writer.write(encoder.encode("CONFERENCIA DE CONSUMO\n"));
        await writer.write(BOLD_OFF);
        await writer.write(encoder.encode("================================\n"));

        // 2. Info
        await writer.write(LEFT);
        await writer.write(encoder.encode(`DATA: ${nowStr}\n`));
        await writer.write(encoder.encode(`LOCAL: ${type.toUpperCase()}: ${id}\n`));
        await writer.write(encoder.encode(`ATENDENTE: ${staffName}\n`));
        await writer.write(encoder.encode(`CLIENTE: ${customerName}\n`));
        await writer.write(encoder.encode("--------------------------------\n"));

        // 3. Items
        for (const name of Object.keys(itemMap)) {
            const item = itemMap[name];
            const line = `${item.qty}x ${name.padEnd(20).slice(0, 20)} R$ ${item.total.toFixed(2)}\n`;
            await writer.write(encoder.encode(line));
        }

        // 4. Totals
        await writer.write(encoder.encode("--------------------------------\n"));
        await writer.write(encoder.encode(`Subtotal: R$ ${subtotal.toFixed(2)}\n`));
        await writer.write(encoder.encode(`10% Garcons: R$ ${serviceFee.toFixed(2)}\n`));
        await writer.write(encoder.encode("================================\n"));
        await writer.write(BOLD_ON);
        await writer.write(encoder.encode(`TOTAL A PAGAR: R$ ${total.toFixed(2)}\n`));
        await writer.write(BOLD_OFF);
        await writer.write(encoder.encode("================================\n\n"));
        await writer.write(CENTER);
        await writer.write(encoder.encode("*** CONFERENCIA DE CONSUMO ***\n"));
        await writer.write(encoder.encode("Obrigado pela preferencia!\n\n\n\n"));

        // 5. Cut Paper
        await writer.write(CUT_FULL);

        writer.releaseLock();
        await port.close();

        alert('⚡ Cupom impresso e cortado na Elgin i8 com sucesso!');
    } catch(err) {
        console.error('Direct USB printing error:', err);
        if (err.name !== 'NotFoundError') {
            alert('Erro ao conectar via USB com a Elgin i8: ' + err.message);
        }
    }
};
