import { supabase } from './scripts.js';

let currentResumoFilter = 'aberto';

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

    // 3. Load Data
    await window.filterResumo(currentResumoFilter);
};

window.filterResumo = async (status) => {
    currentResumoFilter = status;
    
    // Update Filter Buttons
    const btnAberto = document.getElementById('btnResumoAberto');
    const btnPago = document.getElementById('btnResumoPago');
    
    if (!btnAberto || !btnPago) return;
    
    // Reset classes
    btnAberto.className = "flex-1 py-1.5 rounded-lg text-xs font-bold border transition";
    btnPago.className = "flex-1 py-1.5 rounded-lg text-xs font-bold border transition";
    
    if (status === 'aberto') {
        btnAberto.classList.add('bg-amber-100', 'text-amber-700', 'border-amber-200');
        btnPago.classList.add('bg-stone-200', 'text-stone-500', 'border-stone-300', 'hover:bg-stone-300');
    } else {
        btnPago.classList.add('bg-emerald-100', 'text-emerald-700', 'border-emerald-200');
        btnAberto.classList.add('bg-stone-200', 'text-stone-500', 'border-stone-300', 'hover:bg-stone-300');
    }

    const list = document.getElementById('resumoList');
    list.innerHTML = '<div class="flex justify-center py-10"><i class="fa-solid fa-spinner fa-spin text-stone-300 text-2xl"></i></div>';
    
    // Import current staff from window
    // (fallback just in case)
    let staffId = null;
    if (window.currentStaff && window.currentStaff.id) {
        staffId = window.currentStaff.id;
    }

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();

    let query = supabase
        .from('orders')
        .select('*')
        .eq('payment_status', status)
        .neq('status', 'cancelado');

    if (status === 'pago') {
        query = query.gte('updated_at', startOfDay).order('updated_at', { ascending: false });
    } else {
        query = query.gte('created_at', startOfDay).order('created_at', { ascending: false });
    }
        
    // Optionally filter by this garcom if staffId is true
    if (staffId) {
        query = query.eq('staff_id', staffId);
    }

    const { data: orders, error } = await query;

    if (error) {
        console.error('Erro Resumo:', error);
        list.innerHTML = '<p class="text-center text-red-500 text-sm">Erro ao carregar dados.</p>';
        return;
    }

    if (!orders || orders.length === 0) {
        list.innerHTML = '<p class="text-center text-stone-400 text-sm py-10 font-bold">Nenhuma comanda encontrada.</p>';
        return;
    }

    // Group by location
    const grouped = {};
    orders.forEach(o => {
        const key = `${o.location_type.toUpperCase()}: ${o.location_id}`;
        if (!grouped[key]) grouped[key] = { total: 0, orders: [] };
        grouped[key].total += Number(o.total);
        grouped[key].orders.push(o);
    });

    list.innerHTML = Object.keys(grouped).map(key => {
        const group = grouped[key];
        const valStr = `R$ ${group.total.toFixed(2).replace('.', ',')}`;
        
        const firstOrder = group.orders[0];
        const locType = firstOrder.location_type;
        const locId = firstOrder.location_id;
        
        // Assemble proper label (e.g., 'Chalé 7', 'Mesa 3', 'Balcão')
        let label = '';
        if (locType === 'chale') label = 'Chalé ' + locId;
        else if (locType === 'mesa') label = 'Mesa ' + locId.replace('M', '');
        else label = 'Balcão';
        
        let paymentBadge = '';
        if (status === 'pago') {
            const pMethod = firstOrder.payment_method ? firstOrder.payment_method.toUpperCase() : 'PAGO';
            let icon = 'fa-check';
            if (pMethod === 'PIX') icon = 'fa-pix text-teal-600';
            else if (pMethod === 'DINHEIRO') icon = 'fa-money-bill-wave text-emerald-600';
            else if (pMethod === 'CREDITO' || pMethod === 'DEBITO') icon = 'fa-credit-card text-blue-600';
            
            paymentBadge = `<span class="flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-black"><i class="fa-solid ${icon}"></i> ${pMethod}</span>`;
        } else {
            paymentBadge = `<span class="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-black">PENDENTE</span>`;
        }

        return `
            <div onclick="openLocationFromResumo('${locType}', '${locId}', '${label}')" class="bg-white p-4 rounded-xl shadow-sm border border-stone-200 cursor-pointer hover:shadow-md transition active:scale-[0.98]">
                <div class="flex justify-between items-center mb-2">
                    <h4 class="font-black text-stone-800 text-sm">${key}</h4>
                    ${paymentBadge}
                </div>
                <div class="flex flex-col gap-1 mt-3 pt-3 border-t border-stone-100">
                    <div class="flex justify-between items-end">
                        <span class="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Total Consumido</span>
                        <p class="text-[#10b981] font-black text-lg">${valStr}</p>
                    </div>
                    <div class="flex justify-between items-end">
                        <span class="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Lançamentos</span>
                        <p class="text-xs text-stone-500 font-bold">${group.orders.length} pedido(s)</p>
                    </div>
                </div>
            </div>
        `;
    }).join('');
};
