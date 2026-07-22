/**
 * Resumo do Dia / Gestão de Tickets de Comanda - Balneário Rio Preto
 * Trata cada comanda como um Ticket individual com data de abertura, encerramento e duração.
 */
import { supabase } from './scripts.js';

let currentResumoFilter = 'aberto'; // 'aberto' | 'pago'
let currentResumoScope = 'mine';   // 'mine' | 'all'

window.showResumoDia = async () => {
    // 1. Update Tabs
    document.querySelectorAll('.loc-tab').forEach(t => t.classList.remove('active', 'bg-emerald-600', 'text-white'));
    const tabResumo = document.getElementById('tab_resumo');
    if (tabResumo) tabResumo.classList.add('active', 'bg-emerald-600', 'text-white');

    // 2. Hide Dashboard Grid, Show Resumo
    const grid = document.getElementById('locationGrid');
    const resumo = document.getElementById('resumoContainer');
    
    if (grid) grid.classList.add('hidden');
    if (resumo) {
        resumo.classList.remove('hidden');
        resumo.classList.add('flex');
    }

    // Set Date Picker default to today if not set
    const datePicker = document.getElementById('resumoDatePicker');
    if (datePicker && !datePicker.value) {
        datePicker.value = new Date().toISOString().split('T')[0];
        datePicker.onchange = () => window.filterResumo(currentResumoFilter);
    }

    // 3. Load Data
    await window.filterResumo(currentResumoFilter);
};

window.setResumoScope = async (scope) => {
    currentResumoScope = scope;
    const btnMine = document.getElementById('btnScopeMine');
    const btnAll = document.getElementById('btnScopeAll');
    
    if (btnMine && btnAll) {
        if (scope === 'mine') {
            btnMine.className = "flex-1 py-1 rounded-lg text-xs font-bold bg-white text-emerald-800 shadow-sm transition";
            btnAll.className = "flex-1 py-1 rounded-lg text-xs font-bold text-stone-500 hover:text-stone-800 transition";
        } else {
            btnAll.className = "flex-1 py-1 rounded-lg text-xs font-bold bg-white text-emerald-800 shadow-sm transition";
            btnMine.className = "flex-1 py-1 rounded-lg text-xs font-bold text-stone-500 hover:text-stone-800 transition";
        }
    }
    await window.filterResumo(currentResumoFilter);
};

window.filterResumo = async (status) => {
    currentResumoFilter = status;
    
    // Update Filter Buttons
    const btnAberto = document.getElementById('btnResumoAberto');
    const btnPago = document.getElementById('btnResumoPago');
    
    if (btnAberto && btnPago) {
        btnAberto.className = "flex-1 py-2 rounded-xl text-xs font-bold border transition";
        btnPago.className = "flex-1 py-2 rounded-xl text-xs font-bold border transition";
        
        if (status === 'aberto') {
            btnAberto.classList.add('bg-amber-100', 'text-amber-800', 'border-amber-300', 'shadow-sm');
            btnPago.classList.add('bg-stone-200', 'text-stone-500', 'border-stone-300');
        } else {
            btnPago.classList.add('bg-emerald-100', 'text-emerald-800', 'border-emerald-300', 'shadow-sm');
            btnAberto.classList.add('bg-stone-200', 'text-stone-500', 'border-stone-300');
        }
    }

    const list = document.getElementById('resumoList');
    list.innerHTML = '<div class="flex justify-center py-10"><i class="fa-solid fa-spinner fa-spin text-stone-400 text-2xl"></i></div>';
    
    // Staff filtering
    let staffId = null;
    if (currentResumoScope === 'mine' && window.currentStaff && window.currentStaff.id) {
        staffId = window.currentStaff.id;
    }

    // Selected Date bounds
    const datePicker = document.getElementById('resumoDatePicker');
    const selectedDateStr = datePicker?.value || new Date().toISOString().split('T')[0];
    
    const startOfDay = new Date(`${selectedDateStr}T00:00:00`).toISOString();
    const endOfDay = new Date(`${selectedDateStr}T23:59:59.999`).toISOString();

    let query = supabase
        .from('orders')
        .select(`
            *,
            order_items(*),
            staff_users(name)
        `)
        .eq('payment_status', status)
        .neq('status', 'cancelado');

    if (status === 'pago') {
        // Closed tickets paid within the selected date
        query = query.gte('updated_at', startOfDay).lte('updated_at', endOfDay).order('updated_at', { ascending: false });
    } else {
        // Open tickets created within the selected date
        query = query.gte('created_at', startOfDay).lte('created_at', endOfDay).order('created_at', { ascending: false });
    }
        
    if (staffId) {
        query = query.eq('staff_id', staffId);
    }

    const { data: orders, error } = await query;

    if (error) {
        console.error('Erro Resumo:', error);
        list.innerHTML = '<p class="text-center text-red-500 text-xs font-bold py-8">Erro ao carregar tickets.</p>';
        return;
    }

    if (!orders || orders.length === 0) {
        list.innerHTML = `
            <div class="text-center py-12 text-stone-400">
                <i class="fa-solid fa-ticket text-3xl mb-2 opacity-30"></i>
                <p class="font-bold text-xs">Nenhum ticket ${status === 'pago' ? 'finalizado' : 'em aberto'} para esta data.</p>
            </div>`;
        
        document.getElementById('resumoTotalAmount').textContent = 'R$ 0,00';
        document.getElementById('resumoTicketCount').textContent = '0 tickets';
        return;
    }

    // Update Summary Header
    const totalSum = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    document.getElementById('resumoTotalAmount').textContent = `R$ ${totalSum.toFixed(2).replace('.', ',')}`;
    document.getElementById('resumoTicketCount').textContent = `${orders.length} ticket${orders.length > 1 ? 's' : ''}`;

    // Render individual Comanda Tickets
    list.innerHTML = orders.map(order => renderComandaTicket(order)).join('');
};

function renderComandaTicket(order) {
    const createdAt = new Date(order.created_at);
    const openTime = createdAt.toLocaleTimeString('pt-BR', { timeZone: 'America/Porto_Velho',  hour: '2-digit', minute: '2-digit' });
    const openDate = createdAt.toLocaleDateString('pt-BR', { timeZone: 'America/Porto_Velho',  day: '2-digit', month: '2-digit' });

    const isPaid = order.payment_status === 'pago';
    const updatedAt = order.updated_at ? new Date(order.updated_at) : new Date();
    const closeTime = isPaid ? updatedAt.toLocaleTimeString('pt-BR', { timeZone: 'America/Porto_Velho',  hour: '2-digit', minute: '2-digit' }) : null;

    // Calculate duration
    const elapsedMs = (isPaid ? updatedAt.getTime() : Date.now()) - createdAt.getTime();
    const totalMins = Math.floor(elapsedMs / 60000);
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    const durationStr = hrs > 0 ? `${hrs}h ${mins}min` : `${mins}min`;

    // Location label
    const locType = order.location_type;
    const locId = order.location_id;
    let locLabel = '';
    if (locType === 'chale') locLabel = '🏡 Chalé ' + locId;
    else if (locType === 'mesa') locLabel = '🪑 Mesa ' + locId.replace('M', '');
    else locLabel = '🏪 Balcão';

    // Staff & Customer info
    const staffName = order.staff_users?.name || 'Garçom';
    const customerInfo = order.customer_name ? ` • Cliente: ${order.customer_name}` : '';

    // Items summary
    const items = order.order_items || [];
    const itemsCount = items.reduce((s, i) => s + (i.quantity || 1), 0);

    // Payment Badge
    let paymentBadge = '';
    if (isPaid) {
        const method = order.payment_method ? order.payment_method.toUpperCase() : 'PAGO';
        paymentBadge = `<span class="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-black flex items-center gap-1">
            <i class="fa-solid fa-circle-check"></i> ${method}
        </span>`;
    } else {
        paymentBadge = `<span class="px-2.5 py-0.5 bg-amber-100 text-amber-800 rounded-full text-[10px] font-black flex items-center gap-1">
            <i class="fa-solid fa-clock"></i> EM ABERTO
        </span>`;
    }

    return `
        <div onclick="openLocationFromResumo('${locType}', '${locId}', '${locLabel}')" 
             class="bg-white rounded-2xl p-4 shadow-sm border border-stone-200 cursor-pointer hover:shadow-md transition active:scale-[0.98] space-y-3">
            
            <!-- Ticket Header -->
            <div class="flex items-center justify-between pb-2 border-b border-stone-100">
                <div class="flex items-center gap-2">
                    <span class="text-xs font-black text-stone-800 font-mono bg-stone-100 px-2 py-0.5 rounded-md">
                        #${order.order_number || order.id.slice(0, 5)}
                    </span>
                    <span class="text-xs font-bold text-stone-700">${locLabel}</span>
                </div>
                ${paymentBadge}
            </div>

            <!-- Time & Duration Ticket Section -->
            <div class="bg-stone-50 rounded-xl p-2.5 grid grid-cols-3 text-center text-xs">
                <div>
                    <span class="text-[9px] text-stone-400 font-bold uppercase block">Abertura</span>
                    <span class="font-bold text-stone-700 font-mono">${openTime}</span>
                </div>
                <div class="border-x border-stone-200">
                    <span class="text-[9px] text-stone-400 font-bold uppercase block">Encerramento</span>
                    <span class="font-bold text-stone-700 font-mono">${closeTime || 'Em andamento'}</span>
                </div>
                <div>
                    <span class="text-[9px] text-stone-400 font-bold uppercase block">Duração</span>
                    <span class="font-bold text-emerald-700 font-mono">${durationStr}</span>
                </div>
            </div>

            <!-- Items & Info -->
            <div class="flex items-center justify-between text-xs pt-1">
                <div class="min-w-0 flex-1">
                    <p class="text-stone-500 text-[11px] font-medium truncate">
                        <i class="fa-solid fa-user text-stone-400 mr-1"></i>${staffName}${customerInfo}
                    </p>
                    <p class="text-stone-400 text-[10px] font-bold mt-0.5">
                        ${itemsCount} item(s) no ticket
                    </p>
                </div>
                <div class="text-right shrink-0">
                    <span class="text-[9px] text-stone-400 font-bold uppercase block">Total</span>
                    <span class="text-base font-black text-emerald-700">R$ ${Number(order.total || 0).toFixed(2).replace('.', ',')}</span>
                </div>
            </div>
        </div>
    `;
}
