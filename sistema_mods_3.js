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

window.cmdPromptClose = async (type, id) => {
    if(!confirm(`Confirmar recebimento do pagamento para ${type} ${id}? Todos os pedidos abertos serão marcados como PAGOS e movidos para o Histórico.`)) return;
    
    try {
        const staff = getCurrentStaff();
        const { error } = await supabase.from('orders')
            .update({ 
                payment_status: 'pago',
                updated_at: new Date().toISOString(),
                staff_id: staff?.id
            })
            .eq('location_type', type)
            .eq('location_id', id)
            .eq('payment_status', 'aberto');
            
        if(error) throw error;
        
        loadComandas(); // reload
    } catch(e) {
        alert("Erro ao fechar comanda: " + e.message);
    }
};

window.closeMod = () => {
    document.getElementById('modalContainer').innerHTML = '';
};
