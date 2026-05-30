import { supabase } from './scripts.js';

// ====== EXTRATO (CONSUMO) ======
window.openExtrato = async () => {
    document.getElementById('extratoScreen').classList.remove('hidden');
    document.getElementById('extratoScreen').classList.add('flex');
    
    document.getElementById('extratoLocation').textContent = `${window.currentLocationType.toUpperCase()}: ${window.currentLocationId}`;
    const list = document.getElementById('extratoList');
    list.innerHTML = '<div class="flex justify-center py-10"><i class="fa-solid fa-spinner fa-spin text-3xl text-gray-300"></i></div>';
    document.getElementById('extratoTotal').textContent = 'R$ 0,00';
    
    // Fetch all non-canceled orders for this location today (last 12 hours)
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    
    const { data: orders } = await supabase.from('orders')
        .select('*, order_items(*)')
        .eq('location_type', window.currentLocationType)
        .eq('location_id', window.currentLocationId)
        .gte('created_at', twelveHoursAgo)
        .neq('status', 'cancelado')
        .order('created_at', { ascending: false });
        
    if(!orders || orders.length === 0) {
        list.innerHTML = `
            <div class="text-center py-10">
                <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400 text-2xl"><i class="fa-solid fa-receipt"></i></div>
                <p class="text-gray-500 font-bold text-sm">Nenhum consumo recente.</p>
            </div>`;
        return;
    }
    
    let grandTotal = 0;
    
    list.innerHTML = orders.map(o => {
        grandTotal += Number(o.total);
        const time = new Date(o.created_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
        
        let statusBadge = '';
        if(o.status === 'pendente') statusBadge = '<span class="bg-yellow-100 text-yellow-800 text-[10px] px-2 py-0.5 rounded font-black uppercase">Pendente</span>';
        else if(o.status === 'preparando') statusBadge = '<span class="bg-blue-100 text-blue-800 text-[10px] px-2 py-0.5 rounded font-black uppercase">Preparando</span>';
        else if(o.status === 'pronto') statusBadge = '<span class="bg-green-100 text-green-800 text-[10px] px-2 py-0.5 rounded font-black uppercase">Pronto</span>';
        else if(o.status === 'entregue') statusBadge = '<span class="bg-gray-100 text-gray-600 text-[10px] px-2 py-0.5 rounded font-black uppercase">Entregue</span>';
        
        let cancelBtn = '';
        if (o.payment_status !== 'pago' && o.status !== 'cancelado') {
            cancelBtn = `
                <button onclick="cancelarPedido('${o.id}', '${o.order_number}')" class="text-[10px] font-bold text-red-500 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg transition flex items-center gap-1 active:scale-95 border border-red-200">
                    <i class="fa-solid fa-ban"></i> Cancelar
                </button>
            `;
        }

        const itemsHtml = o.order_items.map(i => `
            <div class="flex justify-between items-start py-2 border-b border-gray-50 last:border-0">
                <div>
                    <p class="text-xs font-bold text-gray-800">${i.quantity}x ${i.product_name}</p>
                    ${i.notes ? `<p class="text-[10px] text-gray-500 font-medium italic mt-0.5">Obs: ${i.notes}</p>` : ''}
                </div>
                <p class="text-xs font-black text-gray-600">R$ ${(i.quantity * i.unit_price).toFixed(2).replace('.',',')}</p>
            </div>
        `).join('');
        
        return `
            <div class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-4 ml-2 relative">
                <div class="absolute -left-2 top-6 w-4 h-4 bg-gray-200 rounded-full border-4 border-gray-50"></div>
                
                <div class="flex justify-between items-center mb-3 border-b border-gray-100 pb-2">
                    <div class="flex items-center gap-2">
                        <span class="text-gray-400 font-mono text-xs font-bold">${time}</span>
                        <span class="text-gray-300">|</span>
                        <span class="text-xs font-black text-gray-500">#${o.order_number}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        ${cancelBtn}
                        ${statusBadge}
                    </div>
                </div>
                
                <div class="mb-3">${itemsHtml}</div>
                
                <div class="flex justify-between items-center bg-gray-50 p-2 rounded-lg mt-2">
                    <div class="flex flex-col">
                        <span class="text-[10px] font-bold text-gray-400 uppercase">Tempo de Espera</span>
                        <span class="font-mono text-xs font-bold text-amber-600 live-timer" data-time="${o.created_at}" data-status="${o.status}">00:00</span>
                    </div>
                    <div class="text-right">
                        <span class="text-[10px] font-bold text-gray-400 uppercase block">Subtotal</span>
                        <span class="font-black text-emerald-700 text-sm block">R$ ${Number(o.total).toFixed(2).replace('.',',')}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    document.getElementById('extratoTotal').textContent = `R$ ${grandTotal.toFixed(2).replace('.',',')}`;
    startLiveTimers();
};

let extratoTimerInterval = null;

function startLiveTimers() {
    if(extratoTimerInterval) clearInterval(extratoTimerInterval);
    
    const updateTimers = () => {
        document.querySelectorAll('.live-timer').forEach(el => {
            const status = el.getAttribute('data-status');
            if(status === 'entregue') {
                el.textContent = '--:--';
                el.className = 'font-mono text-xs font-bold text-gray-400';
                return;
            }
            
            const startStr = el.getAttribute('data-time');
            const elapsed = Date.now() - new Date(startStr).getTime();
            const mins = Math.floor(elapsed / 60000);
            const secs = Math.floor((elapsed % 60000) / 1000);
            el.textContent = `${mins}:${String(secs).padStart(2,'0')}`;
            
            if(elapsed > 30 * 60 * 1000) el.className = 'font-mono text-xs font-black text-red-500 live-timer';
            else if(elapsed > 10 * 60 * 1000) el.className = 'font-mono text-xs font-bold text-amber-600 live-timer';
            else el.className = 'font-mono text-xs font-bold text-green-600 live-timer';
        });
    };
    
    updateTimers();
    extratoTimerInterval = setInterval(updateTimers, 1000);
}

window.closeExtrato = () => {
    if(extratoTimerInterval) clearInterval(extratoTimerInterval);
    document.getElementById('extratoScreen').classList.add('hidden');
    document.getElementById('extratoScreen').classList.remove('flex');
};

// ====== REALTIME NOTIFICATIONS (ORDERS READY) ======
window.listenForReadyOrders = function() {
    if(window.orderSubscription) supabase.removeChannel(window.orderSubscription);
    
    window.orderSubscription = supabase.channel('garcom_ready_alerts')
        .on('postgres_changes', { 
            event: 'UPDATE', 
            schema: 'public', 
            table: 'orders',
            filter: `location_type=eq.${window.currentLocationType}` // Match type
        }, payload => {
            const order = payload.new;
            
            // Notification only if currently viewing same location ID, and status is 'pronto'
            if (order.location_id === window.currentLocationId && order.status === 'pronto') {
                if(!window.lastNotifiedIds.has(order.id)) {
                    showReadyToast(order);
                    window.lastNotifiedIds.add(order.id);
                }
            }
        })
        .subscribe();
};

function showReadyToast(order) {
    const toast = document.getElementById('notiToast');
    document.getElementById('notiMsg').textContent = `Mesa: ${order.location_id} • Pedido #${order.order_number}`;
    
    toast.style.transform = 'translateY(0)';
    setTimeout(() => { hideNoti(); }, 5000);
}

window.hideNoti = () => {
    const toast = document.getElementById('notiToast');
    if (toast) toast.style.transform = 'translateY(-150%)';
};

// ====== PAYMENT MODAL (GARÇOM) - SPLIT & SERVICE ======
let garcomServiceEnabled = false;
let garcomBaseTotal = 0;
let garcomOpenOrders = [];

window.openPaymentModalGarcom = async () => {
    if (!window.currentLocationType || !window.currentLocationId) return;

    // Fetch open orders
    const { data: openOrders } = await supabase
        .from('orders')
        .select('*')
        .eq('location_type', window.currentLocationType)
        .eq('location_id', window.currentLocationId)
        .eq('payment_status', 'aberto')
        .neq('status', 'cancelado');

    garcomOpenOrders = openOrders || [];
    if (garcomOpenOrders.length === 0) {
        alert('Nenhuma comanda em aberto para faturar.');
        return;
    }

    garcomBaseTotal = garcomOpenOrders.reduce((sum, o) => sum + Number(o.total), 0);
    garcomServiceEnabled = false;

    // Reset Inputs
    ['pix', 'dinheiro', 'credito', 'debito'].forEach(method => {
        const el = document.getElementById(`garcomPayVal_${method}`);
        if(el) el.value = '';
    });

    document.getElementById('garcomServiceToggle').style.transform = 'translateX(0)';
    document.getElementById('btnGarcomService').classList.remove('bg-emerald-500');
    document.getElementById('btnGarcomService').classList.add('bg-stone-300');

    document.getElementById('paymentModalGarcom').classList.remove('hidden');
    document.getElementById('paymentModalGarcom').classList.add('flex');

    window.calcGarcomSplit();
};

window.closePaymentModalGarcom = () => {
    document.getElementById('paymentModalGarcom').classList.add('hidden');
    document.getElementById('paymentModalGarcom').classList.remove('flex');
};

window.toggleGarcomServiceFee = () => {
    garcomServiceEnabled = !garcomServiceEnabled;
    const toggle = document.getElementById('garcomServiceToggle');
    const btnBox = document.getElementById('btnGarcomService');

    if (garcomServiceEnabled) {
        toggle.style.transform = 'translateX(100%)';
        btnBox.classList.remove('bg-stone-300');
        btnBox.classList.add('bg-emerald-500');
    } else {
        toggle.style.transform = 'translateX(0)';
        btnBox.classList.remove('bg-emerald-500');
        btnBox.classList.add('bg-stone-300');
    }
    
    window.calcGarcomSplit();
};

window.focusGarcomSplit = (method) => {
    // Optional: Auto-fill remaining into this focused field if it's empty
    const el = document.getElementById(`garcomPayVal_${method}`);
    if (!el.value || Number(el.value) === 0) {
        const serviceVal = garcomServiceEnabled ? garcomBaseTotal * 0.10 : 0;
        const targetTotal = garcomBaseTotal + serviceVal;

        const pPIX = Number(document.getElementById('garcomPayVal_pix').value) || 0;
        const pDIN = Number(document.getElementById('garcomPayVal_dinheiro').value) || 0;
        const pCRE = Number(document.getElementById('garcomPayVal_credito').value) || 0;
        const pDEB = Number(document.getElementById('garcomPayVal_debito').value) || 0;
        const currentSum = pPIX + pDIN + pCRE + pDEB;

        const remaining = targetTotal - currentSum;
        if (remaining > 0) {
            el.value = remaining.toFixed(2);
            window.calcGarcomSplit();
        }
    }
};

window.calcGarcomSplit = () => {
    const serviceVal = garcomServiceEnabled ? garcomBaseTotal * 0.10 : 0;
    const targetTotal = garcomBaseTotal + serviceVal;

    document.getElementById('garcomPaySubtotal').textContent = `R$ ${garcomBaseTotal.toFixed(2).replace('.', ',')}`;
    document.getElementById('garcomPayService').textContent = `R$ ${serviceVal.toFixed(2).replace('.', ',')}`;
    document.getElementById('garcomPayTotal').textContent = `R$ ${targetTotal.toFixed(2).replace('.', ',')}`;

    const pPIX = Number(document.getElementById('garcomPayVal_pix').value) || 0;
    const pDIN = Number(document.getElementById('garcomPayVal_dinheiro').value) || 0;
    const pCRE = Number(document.getElementById('garcomPayVal_credito').value) || 0;
    const pDEB = Number(document.getElementById('garcomPayVal_debito').value) || 0;

    const currentSum = pPIX + pDIN + pCRE + pDEB;
    const remaining = targetTotal - currentSum;

    const statusLabel = document.getElementById('garcomPayStatusLabel');
    const remainingVal = document.getElementById('garcomPayRemaining');
    const btnConfirm = document.getElementById('btnConfirmPaymentGarcom');

    if (remaining > 0.001) {
        // Needs more money
        statusLabel.textContent = "Falta Receber";
        statusLabel.className = "text-amber-600 font-bold text-sm uppercase tracking-wider";
        remainingVal.textContent = `R$ ${remaining.toFixed(2).replace('.', ',')}`;
        remainingVal.className = "font-black text-amber-500 text-xl";
        btnConfirm.disabled = true;
    } else if (remaining < -0.001) {
        // Overpaid (Troco)
        statusLabel.textContent = "Troco a Devolver";
        statusLabel.className = "text-blue-600 font-bold text-sm uppercase tracking-wider";
        remainingVal.textContent = `R$ ${Math.abs(remaining).toFixed(2).replace('.', ',')}`;
        remainingVal.className = "font-black text-blue-500 text-xl";
        btnConfirm.disabled = false;
    } else {
        // Exact
        statusLabel.textContent = "Valor Atingido";
        statusLabel.className = "text-emerald-600 font-bold text-sm uppercase tracking-wider";
        remainingVal.textContent = "R$ 0,00";
        remainingVal.className = "font-black text-emerald-500 text-xl";
        btnConfirm.disabled = false;
    }
};

window.confirmPaymentGarcom = async () => {
    if (garcomOpenOrders.length === 0) return;

    const btn = document.getElementById('btnConfirmPaymentGarcom');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processando...';

    const pPIX = Number(document.getElementById('garcomPayVal_pix').value) || 0;
    const pDIN = Number(document.getElementById('garcomPayVal_dinheiro').value) || 0;
    const pCRE = Number(document.getElementById('garcomPayVal_credito').value) || 0;
    const pDEB = Number(document.getElementById('garcomPayVal_debito').value) || 0;
    const totalPaid = pPIX + pDIN + pCRE + pDEB;
    const serviceVal = garcomServiceEnabled ? garcomBaseTotal * 0.10 : 0;
    const customerName = (document.getElementById('garcomPayCustomerName')?.value || '').trim();
    
    // Determine payment method — use specific name if only one method used, else 'SPLIT'
    const methodsUsed = [];
    if(pPIX > 0) methodsUsed.push('pix');
    if(pDIN > 0) methodsUsed.push('dinheiro');
    if(pCRE > 0) methodsUsed.push('credito');
    if(pDEB > 0) methodsUsed.push('debito');
    const payMethod = methodsUsed.length === 1 ? methodsUsed[0] : 'SPLIT';
    
    // Distribute paid values and service fee among the open orders proportionally based on order total
    const updates = garcomOpenOrders.map(o => {
        const ratio = Number(o.total) / garcomBaseTotal;
        return {
            ...o,
            payment_status: 'pago',
            payment_method: payMethod,
            customer_name: customerName || o.customer_name,
            service_fee: parseFloat((serviceVal * ratio).toFixed(2)),
            split_pix: parseFloat((pPIX * ratio).toFixed(2)),
            split_dinheiro: parseFloat((pDIN * ratio).toFixed(2)),
            split_credito: parseFloat((pCRE * ratio).toFixed(2)),
            split_debito: parseFloat((pDEB * ratio).toFixed(2))
        };
    });

    const { error } = await supabase.from('orders').upsert(updates);

    if (error) {
        console.error('Error closing garcom order:', error);
        alert('Erro ao fechar comanda. O painel deve estar desatualizado, verifique o banco de dados.');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-lock"></i> CONFIRMAR E FECHAR';
        return;
    }

    // Success
    window.closePaymentModalGarcom();
    window.closeExtrato();
    window.goBackToLocation();
    
    if (typeof window.setLocationType === 'function') {
        window.setLocationType(window.currentLocationType);
    }
    
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-lock"></i> CONFIRMAR E FECHAR';
};

// ====== CANCEL ORDER ======
window.cancelarPedido = async (orderId, orderNumber) => {
    if (!confirm(`Tem certeza que deseja cancelar o pedido #${orderNumber}?`)) return;

    try {
        // 1. Get the order items to restore stock if necessary
        const { data: items, error: itemsErr } = await supabase
            .from('order_items')
            .select('*, products(*)')
            .eq('order_id', orderId);

        if (itemsErr) throw itemsErr;

        // 2. Update order status to 'cancelado'
        const { error: orderErr } = await supabase
            .from('orders')
            .update({ status: 'cancelado', updated_at: new Date().toISOString() })
            .eq('id', orderId);

        if (orderErr) throw orderErr;

        // 3. Update order_items status to 'cancelado'
        await supabase
            .from('order_items')
            .update({ status: 'cancelado' })
            .eq('order_id', orderId);

        // 4. Restore stock
        const staff = window.currentStaff || { id: null };
        if (items) {
            for (const item of items) {
                const prod = item.products;
                if (prod && prod.is_stock_controlled) {
                    const newQty = Number(prod.stock_qty) + Number(item.quantity);
                    await supabase.from('products').update({ stock_qty: newQty }).eq('id', prod.id);
                    await supabase.from('stock_movements').insert({
                        product_id: prod.id,
                        type: 'entrada',
                        quantity: item.quantity,
                        previous_qty: prod.stock_qty,
                        new_qty: newQty,
                        reason: `Cancelamento - Pedido #${orderNumber}`,
                        order_id: orderId,
                        staff_id: staff.id
                    });
                }
            }
        }

        alert('Pedido cancelado com sucesso!');
        // Refresh extrato
        window.openExtrato();
    } catch (err) {
        console.error('Error cancelling order:', err);
        alert('Erro ao cancelar pedido: ' + err.message);
    }
};
