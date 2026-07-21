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
// ====== GUIA DE CONFERÊNCIA DO CLIENTE (PRE-BILL) ======
let currentGuiaData = null;

window.openGuiaClienteModal = async () => {
    // Fetch open orders for current location
    const { data: openOrders, error } = await supabase
        .from('orders')
        .select('*, order_items(*), staff_users(name)')
        .eq('location_type', window.currentLocationType)
        .eq('location_id', window.currentLocationId)
        .eq('payment_status', 'aberto')
        .neq('status', 'cancelado');

    if (error || !openOrders || openOrders.length === 0) {
        alert('Nenhuma comanda em aberto para este local.');
        return;
    }

    const subtotal = openOrders.reduce((sum, o) => sum + Number(o.total), 0);
    const serviceFee = subtotal * 0.10;
    const grandTotal = subtotal + serviceFee;

    const allItems = openOrders.flatMap(o => o.order_items || []);
    const staffNames = Array.from(new Set(openOrders.map(o => o.staff_users?.name).filter(Boolean)));

    currentGuiaData = {
        locationType: window.currentLocationType,
        locationId: window.currentLocationId,
        subtotal,
        serviceFee,
        grandTotal,
        items: allItems,
        orders: openOrders,
        staffNames
    };

    renderGuiaReceiptBody(currentGuiaData);

    const modal = document.getElementById('guiaClienteModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
};

window.closeGuiaClienteModal = () => {
    const modal = document.getElementById('guiaClienteModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
};

function renderGuiaReceiptBody(data) {
    const body = document.getElementById('guiaReceiptBody');
    if (!body) return;

    const now = new Date().toLocaleString('pt-BR');
    const locLabel = data.locationType === 'chale' ? `CHALÉ ${data.locationId}` : data.locationType === 'mesa' ? `MESA ${data.locationId.replace('M','')}` : `BALCÃO ${data.locationId}`;
    const staffLabel = data.staffNames.length > 0 ? data.staffNames.join(', ') : 'Equipe Rio Preto';

    body.innerHTML = `
        <div class="text-center border-b border-dashed border-stone-300 pb-3">
            <p class="font-black text-sm uppercase tracking-wider">BALNEÁRIO RIO PRETO</p>
            <p class="text-[10px] text-stone-500 font-bold uppercase">Guia de Conferência do Cliente</p>
            <p class="text-[10px] text-stone-400 mt-1">${now}</p>
            <p class="font-black text-emerald-800 text-xs mt-1 bg-emerald-50 py-1 rounded-md uppercase">${locLabel}</p>
        </div>

        <div class="py-2 border-b border-dashed border-stone-300">
            <p class="text-[10px] font-bold text-stone-500 uppercase mb-2">Atendimento: ${staffLabel}</p>
            <table class="w-full text-left text-xs">
                <thead>
                    <tr class="border-b border-stone-200 text-[10px] text-stone-400 font-bold uppercase">
                        <th class="py-1">Qtd</th>
                        <th class="py-1">Item</th>
                        <th class="py-1 text-right">R$ Total</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-stone-100">
                    ${data.items.map(i => `
                        <tr>
                            <td class="py-1 font-bold">${i.quantity}x</td>
                            <td class="py-1 font-medium">${i.product_name}</td>
                            <td class="py-1 text-right font-bold">R$ ${(i.quantity * i.unit_price).toFixed(2).replace('.',',')}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <div class="space-y-1 pt-1 text-xs">
            <div class="flex justify-between">
                <span class="text-stone-500 font-bold">Subtotal Consumo:</span>
                <span class="font-bold">R$ ${data.subtotal.toFixed(2).replace('.',',')}</span>
            </div>
            <div class="flex justify-between text-emerald-700 font-bold">
                <span>Taxa de Atendimento Garçons (10%):</span>
                <span>R$ ${data.serviceFee.toFixed(2).replace('.',',')}</span>
            </div>
            <div class="flex justify-between text-sm font-black pt-2 border-t border-stone-300 text-stone-900">
                <span>TOTAL A PAGAR:</span>
                <span class="text-emerald-700">R$ ${data.grandTotal.toFixed(2).replace('.',',')}</span>
            </div>
        </div>

        <div class="text-center pt-3 border-t border-dashed border-stone-300 text-[10px] text-stone-500">
            <p class="font-bold mb-1">⚠️ Pagamento realizado exclusivamente no Caixa Central.</p>
            <p class="italic">A taxa de 10% é destinada integralmente à equipe de atendimento. Obrigado!</p>
        </div>
    `;
}

window.printGuiaCliente = () => {
    if (!currentGuiaData) return;
    const bodyContent = document.getElementById('guiaReceiptBody')?.innerHTML || '';
    const win = window.open('', '', 'width=400,height=600');
    if (!win) return;
    win.document.write(`
        <html>
        <head>
            <title>Guia de Conferência - Balneário Rio Preto</title>
            <style>
                body { font-family: monospace; font-size: 12px; margin: 0; padding: 10px; }
                .text-center { text-align: center; }
                .text-right { text-align: right; }
                .font-bold { font-weight: bold; }
                .font-black { font-weight: 900; }
                .w-full { width: 100%; }
                .border-b { border-bottom: 1px dashed #000; }
                .py-1 { padding-top: 4px; padding-bottom: 4px; }
                .py-2 { padding-top: 8px; padding-bottom: 8px; }
                .flex { display: flex; }
                .justify-between { justify-content: space-between; }
                @media print { body { margin: 0; } }
            </style>
        </head>
        <body onload="window.print(); window.close();">
            ${bodyContent}
        </body>
        </html>
    `);
    win.document.close();
};
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
        const { error: itemsUpdateErr } = await supabase
            .from('order_items')
            .update({ status: 'cancelado' })
            .eq('order_id', orderId);
        if (itemsUpdateErr) throw itemsUpdateErr;

        // 4. Restore stock
        const staff = window.currentStaff || { id: null };
        if (items) {
            for (const item of items) {
                const prod = item.products;
                if (prod && prod.is_stock_controlled) {
                    const newQty = Number(prod.stock_qty) + Number(item.quantity);
                    const { error: prodUpdateErr } = await supabase.from('products').update({ stock_qty: newQty }).eq('id', prod.id);
                    if (prodUpdateErr) throw prodUpdateErr;
                    
                    const { error: movementErr } = await supabase.from('stock_movements').insert({
                        product_id: prod.id,
                        type: 'entrada',
                        quantity: item.quantity,
                        previous_qty: prod.stock_qty,
                        new_qty: newQty,
                        reason: `Cancelamento - Pedido #${orderNumber}`,
                        order_id: orderId,
                        staff_id: staff.id
                    });
                    if (movementErr) throw movementErr;
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
