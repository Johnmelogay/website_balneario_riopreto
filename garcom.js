/**
 * Garçom - Comanda Mobile
 * Balneário Rio Preto
 */
import { supabase } from './scripts.js';
import { loginStaff, getCurrentStaff, logoutStaff } from './sistema_auth.js';
import { logAuditAction } from './audit_logger.js';

// ====== STATE ======
let currentPin = '';
let currentLocation = { type: 'chale', id: '' };
let categories = [];
let products = [];
let cart = []; // { product, qty, notes }
let activeCategory = null;

// Expose these state variables to window so garcom_mods_1.js can read/write them
window.currentLocationType = '';
window.currentLocationId = '';
window.currentStaff = null;
window.orderSubscription = null;
window.lastNotifiedIds = new Set(); // Prevent duplicate toasts

// ====== PIN INPUT ======
window.pinInput = async (digit) => {
    if (currentPin.length >= 4) return;
    currentPin += digit;
    updatePinDots();

    if (currentPin.length === 4) {
        const result = await loginStaff(currentPin);
        if (result.success) {
            document.getElementById('loginScreen').style.display = 'none';
            showLocationScreen();
        } else {
            document.getElementById('loginError').classList.remove('hidden');
            setTimeout(() => {
                currentPin = '';
                updatePinDots();
                document.getElementById('loginError').classList.add('hidden');
            }, 1000);
        }
    }
};

window.pinClear = () => { currentPin = ''; updatePinDots(); };
window.pinDelete = () => { currentPin = currentPin.slice(0, -1); updatePinDots(); };

function updatePinDots() {
    const dots = document.querySelectorAll('#pinDots .pin-dot');
    dots.forEach((dot, i) => {
        dot.classList.toggle('filled', i < currentPin.length);
    });
}

// ====== LOCATION ======
function showLocationScreen() {
    const staff = getCurrentStaff();
    document.getElementById('staffNameDisplay').textContent = staff?.name || '';
    document.getElementById('locationScreen').style.display = 'flex';
    setLocationType('chale');
}

// ====== LOCATION STATS ======
let locationStats = {};

async function fetchLocationStats() {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0).toISOString();
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).toISOString();

    // Query today's orders (both open created today and paid updated today)
    const { data: orders, error } = await supabase
        .from('orders')
        .select('location_type, location_id, status, payment_status, total, created_at, updated_at, staff_id')
        .or(`created_at.gte.${startOfDay},updated_at.gte.${startOfDay}`)
        .neq('status', 'cancelado');
        
    locationStats = {};
    let myTotalSales = 0;
    let totalPending = 0;
    
    const staffId = getCurrentStaff()?.id;
    
    if (orders) {
        orders.forEach(o => {
            const isTodayPaid = o.payment_status === 'pago' && o.updated_at >= startOfDay && o.updated_at <= endOfDay;
            const isTodayOpen = o.payment_status === 'aberto' && o.created_at >= startOfDay;

            if (o.staff_id === staffId && isTodayPaid) {
                myTotalSales += Number(o.total); // Only sum PAID sales for today's "Minhas Vendas"
            }
            if (isTodayOpen) {
                totalPending += Number(o.total); // Sum all pending for today's "Receber Pendente"
            }

            const key = o.location_type + '-' + o.location_id;
            if (!locationStats[key]) {
                locationStats[key] = { total_open_val: 0, open_orders: 0, delayed: false };
            }
            
            if (isTodayOpen) {
                locationStats[key].total_open_val += Number(o.total);
            }
            if (isTodayOpen && o.status !== 'entregue' && o.status !== 'pronto') {
                locationStats[key].open_orders++;
                const elapsed = Date.now() - new Date(o.created_at).getTime();
                if (elapsed > 30 * 60 * 1000) {
                    locationStats[key].delayed = true;
                }
            }
        });
    }

    const salesEl = document.getElementById('garcomTotalSales');
    const pendingEl = document.getElementById('garcomPendingAmount');
    if (salesEl) salesEl.textContent = `R$ ${myTotalSales.toFixed(2).replace('.', ',')}`;
    if (pendingEl) pendingEl.textContent = `R$ ${totalPending.toFixed(2).replace('.', ',')}`;
}

window.setLocationType = async (type) => {
    currentLocation.type = type;
    document.querySelectorAll('.loc-tab').forEach(t => t.classList.remove('active', 'bg-emerald-600', 'text-white'));
    const activeTab = document.getElementById(`tab_${type}`);
    if (activeTab) activeTab.classList.add('active', 'bg-emerald-600', 'text-white');

    const grid = document.getElementById('locationGrid');
    const resumo = document.getElementById('resumoContainer');
    if (resumo) {
        resumo.classList.add('hidden');
        resumo.classList.remove('flex');
    }
    grid.classList.remove('hidden');
    grid.innerHTML = '<div class="col-span-3 text-center py-10"><i class="fa-solid fa-spinner fa-spin text-stone-300 text-2xl"></i></div>';

    await fetchLocationStats();
    grid.innerHTML = '';

    if (type === 'balcao') {
        // Single option
        const key = type + '-B1';
        const btn = createLocationBtn('Balcão', 'B1', '🏪', locationStats[key]);
        grid.appendChild(btn);
        return;
    }

    const count = type === 'chale' ? 10 : 15;
    const prefix = type === 'chale' ? '' : 'M';
    const icon = type === 'chale' ? '🏡' : '🪑';

    for (let i = 1; i <= count; i++) {
        const label = type === 'chale' ? `Chalé ${i}` : `Mesa ${i}`;
        const id = `${prefix}${i}`;
        const key = type + '-' + id;
        grid.appendChild(createLocationBtn(label, id, icon, locationStats[key]));
    }
};

function createLocationBtn(label, id, icon, stats) {
    const btn = document.createElement('button');
    btn.className = 'bg-white border border-stone-200 shadow-sm rounded-2xl p-4 flex flex-col items-center gap-1 hover:bg-stone-50 active:scale-95 transition relative';
    
    let badgesHtml = '';
    let amountsHtml = '';

    if (stats) {
        if (stats.delayed) {
            badgesHtml += `<div class="absolute -top-2 -right-2 bg-red-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-sm animate-pulse flex items-center gap-1 border-2 border-white"><i class="fa-solid fa-clock"></i> ATRASO</div>`;
        } else if (stats.open_orders > 0) {
            badgesHtml += `<div class="absolute -top-2 -right-2 bg-amber-500 text-white text-[10px] font-black w-6 h-6 rounded-full flex items-center justify-center shadow-sm border-2 border-white">${stats.open_orders}</div>`;
        }

        if (stats.total_open_val > 0) {
            amountsHtml = `<div class="mt-2 pt-2 border-t border-stone-100 w-full text-center">
                <span class="text-[9px] font-bold text-stone-400 uppercase block leading-none mb-1">Pendente</span>
                <span class="text-xs font-black text-emerald-600 block leading-none">R$ ${stats.total_open_val.toFixed(2).replace('.', ',')}</span>
            </div>`;
        }
    }

    btn.innerHTML = `
        ${badgesHtml}
        <span class="text-3xl drop-shadow-sm">${icon}</span>
        <span class="text-stone-800 font-bold text-[13px] tracking-tight mt-1">${label}</span>
        ${amountsHtml}
    `;
    btn.onclick = () => {
        currentLocation.id = id;
        openMainApp(label);
    };
    return btn;
}

function openMainApp(label) {
    const staff = getCurrentStaff();
    window.currentStaff = staff; // Store current staff
    window.currentLocationType = currentLocation.type; // Store current location type
    window.currentLocationId = currentLocation.id; // Store current location ID

    document.getElementById('locationScreen').style.display = 'none';
    document.getElementById('mainApp').classList.remove('hidden');
    document.getElementById('mainApp').classList.add('flex');
    document.getElementById('staffNameBar').textContent = staff?.name || '';
    document.getElementById('cartLocation').textContent = label;
    loadCatalog();
    updateCartUI();
            
    // Header: Mudar botão de voltar para também permitir ver o extrato
    document.getElementById('locationLabel').innerHTML = `
        <div class="flex items-center justify-between">
            <span>${window.currentLocationType.toUpperCase()}: ${label}</span>
            <button onclick="openExtrato()" class="ml-2 bg-emerald-800 text-xs px-3 py-1 rounded-full text-emerald-100 font-bold hover:bg-emerald-700 active:scale-95 transition">
                <i class="fa-solid fa-list-ul mr-1"></i> Ver Consumo
            </button>
        </div>
    `;
            
    // Listen for ready orders
    if (typeof window.listenForReadyOrders === 'function') {
        window.listenForReadyOrders();
    }
}

window.openLocationFromResumo = (type, id, label) => {
    currentLocation = { type, id };
    openMainApp(label);
};

window.goBackToLocation = () => {
    // Hide Main App
    const mainApp = document.getElementById('mainApp');
    mainApp.classList.add('hidden');
    mainApp.classList.remove('flex');

    // Show Location Screen
    const locScreen = document.getElementById('locationScreen');
    if (locScreen) {
        locScreen.classList.remove('hidden');
        locScreen.style.display = 'flex';
    }

    // Un-subscribe from realtime if needed
    if (typeof window.unsubscribeToLocation === 'function') {
        window.unsubscribeToLocation();
    }

    // Refresh whichever tab is active (resumo or grid)
    if (document.getElementById('tab_resumo')?.classList.contains('active')) {
        if (typeof window.showResumoDia === 'function') window.showResumoDia();
    } else {
        if (typeof window.setLocationType === 'function') {
            window.setLocationType(currentLocation.type || 'chale');
        }
    }

    cart = [];
    updateCartUI();
    if(window.orderSubscription) {
        supabase.removeChannel(window.orderSubscription);
        window.orderSubscription = null;
    }
};

window.logoutAndGoLogin = () => {
    logoutStaff();
    document.getElementById('locationScreen').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    currentPin = '';
    updatePinDots();
};

// ====== CATALOG ======
async function loadCatalog() {
    // Load categories
    const { data: cats } = await supabase
        .from('categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

    categories = cats || [];

    // Load products
    const { data: prods } = await supabase
        .from('products')
        .select('*, categories(name, destination)')
        .eq('is_active', true)
        .order('name');

    products = prods || [];

    renderCategoryTabs();
    if (categories.length > 0) {
        selectCategory(categories[0].id);
    } else {
        renderProducts([]);
    }
}

function renderCategoryTabs() {
    const container = document.getElementById('categoryTabs');
    container.innerHTML = '';

    // "Todos" tab
    const allTab = document.createElement('button');
    allTab.textContent = 'Todos';
    allTab.dataset.catId = 'all';
    allTab.onclick = () => selectCategory('all');
    container.appendChild(allTab);

    categories.forEach(cat => {
        const tab = document.createElement('button');
        tab.textContent = cat.name;
        tab.dataset.catId = cat.id;
        tab.onclick = () => selectCategory(cat.id);
        container.appendChild(tab);
    });
}

function selectCategory(catId) {
    activeCategory = catId;
    document.querySelectorAll('.cat-tab').forEach(t => {
        const isActive = (t.dataset.catId === catId);
        t.className = isActive 
            ? 'cat-tab px-5 py-2 rounded-full text-xs font-bold transition-all bg-emerald-600 text-white shadow-md shadow-emerald-200 whitespace-nowrap'
            : 'cat-tab px-5 py-2 rounded-full text-xs font-bold transition-all bg-white text-stone-500 border border-stone-200 hover:bg-stone-50 whitespace-nowrap';
    });

    const filtered = catId === 'all'
        ? products
        : products.filter(p => p.category_id === catId);

    renderProducts(filtered);
}

function renderProducts(list) {
    const container = document.getElementById('productsContainer');

    if (list.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-16 text-gray-400">
                <i class="fa-solid fa-box-open text-4xl mb-3"></i>
                <p class="font-bold">Nenhum produto encontrado</p>
                <p class="text-xs mt-1">Cadastre produtos no painel admin</p>
            </div>`;
        return;
    }

    container.innerHTML = `<div class="grid grid-cols-2 gap-3">${list.map(p => productCard(p)).join('')}</div>`;
}

function productCard(product) {
    const inCart = cart.find(c => c.product.id === product.id);
    const qtyInCart = inCart ? inCart.qty : 0;
    const isControlled = product.is_stock_controlled;
    const stockQty = isControlled ? (product.stock_qty || 0) : null;
    const lowStock = isControlled && stockQty > 0 && stockQty <= (product.min_stock || 3);
    const outOfStock = isControlled && stockQty <= 0;
    const destination = product.categories?.destination || 'cozinha';
    const destIcon = destination === 'bar' ? '🍺' : '🍳';

    // Stock badge
    let stockBadge = '';
    if (outOfStock) {
        stockBadge = `<span class="bg-red-600 text-white font-black text-[10px] px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1 animate-pulse"><i class="fa-solid fa-ban"></i> ESGOTADO (0)</span>`;
    } else if (lowStock) {
        stockBadge = `<span class="bg-amber-500 text-white font-bold text-[10px] px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1"><i class="fa-solid fa-triangle-exclamation"></i> Restam ${stockQty}</span>`;
    } else if (isControlled) {
        stockBadge = `<span class="bg-emerald-100 text-emerald-800 font-bold text-[10px] px-2 py-0.5 rounded-full border border-emerald-200">${stockQty} un</span>`;
    } else {
        stockBadge = `<span class="bg-stone-100 text-stone-500 font-bold text-[10px] px-1.5 py-0.5 rounded-full">Livre</span>`;
    }

    // Card styling for outOfStock (prominent RED)
    const cardStyle = outOfStock 
        ? 'bg-red-50 border-2 border-red-500 shadow-md opacity-80 cursor-not-allowed' 
        : 'bg-white border border-stone-200 shadow-sm active:scale-95 hover:border-emerald-500';

    return `
        <div class="product-card rounded-2xl p-3 flex flex-col justify-between transition relative ${cardStyle}"
            onclick="${outOfStock ? `alert('⚠️ Item ESGOTADO no estoque! Fale com a cozinha.')` : `addToCart('${product.id}')`}">
            
            <div class="flex items-start justify-between gap-1 mb-1.5">
                <span class="text-base">${destIcon}</span>
                ${stockBadge}
            </div>

            <p class="font-bold text-stone-800 text-xs leading-tight mb-2 line-clamp-2">${product.name}</p>
            
            <div class="flex items-end justify-between mt-auto pt-1.5 border-t border-stone-100">
                <p class="font-black ${outOfStock ? 'text-red-600' : 'text-emerald-700'} text-sm">R$ ${Number(product.price).toFixed(2).replace('.', ',')}</p>
                ${qtyInCart > 0 ? `<span class="bg-emerald-600 text-white text-xs font-black w-6 h-6 rounded-full flex items-center justify-center shadow">${qtyInCart}</span>` : ''}
            </div>
        </div>
    `;
}

// ====== SEARCH ======
document.getElementById('searchInput')?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (!query) {
        selectCategory(activeCategory || 'all');
        return;
    }
    const filtered = products.filter(p =>
        p.name.toLowerCase().includes(query)
    );
    renderProducts(filtered);
});

// ====== CART ======
window.addToCart = (productId) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    if (product.is_stock_controlled && product.stock_qty <= 0) {
        alert(`⚠️ O item "${product.name}" está ESGOTADO no estoque!`);
        return;
    }

    const existing = cart.find(c => c.product.id === productId);
    const currentQtyInCart = existing ? existing.qty : 0;

    if (product.is_stock_controlled && (currentQtyInCart + 1) > product.stock_qty) {
        alert(`⚠️ Estoque insuficiente! Restam apenas ${product.stock_qty} unidade(s) de "${product.name}".`);
        return;
    }

    if (existing) {
        existing.qty++;
    } else {
        cart.push({ product, qty: 1, notes: '' });
    }

    updateCartUI();
    // Re-render products to show qty badge
    selectCategory(activeCategory || 'all');
};

window.removeFromCart = (productId) => {
    const idx = cart.findIndex(c => c.product.id === productId);
    if (idx === -1) return;

    if (cart[idx].qty > 1) {
        cart[idx].qty--;
    } else {
        cart.splice(idx, 1);
    }

    updateCartUI();
    renderCartItems();
    selectCategory(activeCategory || 'all');
};

window.deleteFromCart = (productId) => {
    cart = cart.filter(c => c.product.id !== productId);
    updateCartUI();
    renderCartItems();
    selectCategory(activeCategory || 'all');
};

window.setItemNotes = (productId, notes) => {
    const item = cart.find(c => c.product.id === productId);
    if (item) item.notes = notes;
};

function updateCartUI() {
    const totalItems = cart.reduce((sum, c) => sum + c.qty, 0);
    const totalPrice = cart.reduce((sum, c) => sum + (c.qty * Number(c.product.price)), 0);
    const priceStr = `R$ ${totalPrice.toFixed(2).replace('.', ',')}`;

    // Floating bar
    const floating = document.getElementById('floatingCart');
    floating.classList.toggle('hidden', totalItems === 0);
    document.getElementById('floatingCount').textContent = `${totalItems} ${totalItems === 1 ? 'item' : 'itens'}`;
    document.getElementById('floatingTotal').textContent = priceStr;

    // Cart total
    document.getElementById('cartTotal').textContent = priceStr;
}

function renderCartItems() {
    const container = document.getElementById('cartItems');

    if (cart.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400 text-sm py-8">Comanda vazia</p>';
        return;
    }

    container.innerHTML = cart.map(item => {
        const dest = item.product.categories?.destination || 'cozinha';
        const destLabel = dest === 'bar' ? '🍺 Bar' : '🍳 Cozinha';
        const subtotal = (item.qty * Number(item.product.price)).toFixed(2).replace('.', ',');

        return `
            <div class="bg-gray-50 rounded-2xl p-3 border border-gray-100 anim-slide">
                <div class="flex items-start justify-between mb-2">
                    <div class="flex-1 mr-3">
                        <p class="font-bold text-gray-800 text-sm">${item.product.name}</p>
                        <p class="text-[10px] text-gray-400 font-bold">${destLabel} • R$ ${Number(item.product.price).toFixed(2).replace('.', ',')} un</p>
                    </div>
                    <button onclick="deleteFromCart('${item.product.id}')" class="w-7 h-7 rounded-full bg-red-50 text-red-500 flex items-center justify-center text-xs">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>

                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <button onclick="removeFromCart('${item.product.id}')" class="qty-btn bg-gray-200 text-gray-600">−</button>
                        <span class="font-black text-gray-800 text-lg w-8 text-center">${item.qty}</span>
                        <button onclick="addToCart('${item.product.id}')" class="qty-btn bg-emerald-100 text-emerald-700">+</button>
                    </div>
                    <span class="font-black text-gray-800">R$ ${subtotal}</span>
                </div>

                <input type="text" placeholder="Obs: sem cebola, bem passado..."
                    value="${item.notes || ''}"
                    onchange="setItemNotes('${item.product.id}', this.value)"
                    class="w-full mt-2 px-3 py-2 bg-white rounded-xl border border-gray-200 text-xs font-medium text-gray-600 outline-none focus:border-emerald-400">
            </div>
        `;
    }).join('');
}

// ====== CART TOGGLE ======
window.toggleCart = () => {
    const drawer = document.getElementById('cartDrawer');
    const isHidden = drawer.classList.contains('hidden');
    drawer.classList.toggle('hidden', !isHidden);
    if (isHidden) renderCartItems();
};

// ====== SEND ORDER ======
let lastOrderMeta = null; // Store last order info for retry/WhatsApp

window.sendOrder = async () => {
    if (cart.length === 0) return;

    const staff = getCurrentStaff();
    if (!staff) {
        alert('Sessão expirada. Faça login novamente.');
        logoutAndGoLogin();
        return;
    }

    const btn = document.getElementById('btnSendOrder');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...';

    try {
        const total = cart.reduce((sum, c) => sum + (c.qty * Number(c.product.price)), 0);
        const orderNotes = document.getElementById('orderNotes').value;
        const customerName = document.getElementById('customerName').value || null;
        const customerPhone = document.getElementById('customerPhone').value || null;

        // 1. Group cart items by destination
        const cartByDest = { 'cozinha': [], 'bar': [] };
        cart.forEach(c => {
            const d = c.product.categories?.destination === 'bar' ? 'bar' : 'cozinha';
            cartByDest[d].push(c);
        });

        const createdOrders = []; // Track created order numbers

        // 2. Process each destination
        for (const dest of ['cozinha', 'bar']) {
            const destItems = cartByDest[dest];
            if (destItems.length === 0) continue;

            const destTotal = destItems.reduce((sum, c) => sum + (c.qty * Number(c.product.price)), 0);

            // Create Order
            const { data: order, error: orderError } = await supabase
                .from('orders')
                .insert({
                    location_type: currentLocation.type,
                    location_id: currentLocation.id,
                    staff_id: staff.id,
                    total: destTotal,
                    notes: orderNotes || null,
                    customer_name: customerName,
                    customer_phone: customerPhone,
                    status: 'pendente',
                    payment_status: 'aberto',
                    destination: dest
                })
                .select()
                .single();

            if (orderError) throw orderError;

            createdOrders.push({ number: order.order_number, dest, id: order.id });

            // Insert Order Items
            const items = destItems.map(c => ({
                order_id: order.id,
                product_id: c.product.id,
                product_name: c.product.name,
                quantity: c.qty,
                unit_price: Number(c.product.price),
                destination: dest,
                status: 'pendente',
                notes: c.notes || null
            }));

            const { error: itemsError } = await supabase
                .from('order_items')
                .insert(items);

            if (itemsError) throw itemsError;

            // Deduct Stock (atomic — prevents race conditions)
            for (const c of destItems) {
                if (c.product.is_stock_controlled) {
                    // Try atomic RPC first (prevents two waiters selling the last item)
                    let deducted = false;
                    try {
                        const { data: rpcResult, error: rpcError } = await supabase
                            .rpc('deduct_stock', { p_product_id: c.product.id, p_qty: c.qty });
                        
                        if (!rpcError && rpcResult === true) {
                            deducted = true;
                        } else if (!rpcError && rpcResult === false) {
                            // Stock insufficient — item sold out while order was being placed
                            console.warn(`Estoque insuficiente para ${c.product.name}`);
                        }
                    } catch (rpcErr) {
                        // RPC not available yet — fallback to old method
                        console.warn('deduct_stock RPC not available, using fallback:', rpcErr);
                        const newQty = Math.max(0, Number(c.product.stock_qty) - c.qty);
                        await supabase.from('products').update({ stock_qty: newQty }).eq('id', c.product.id);
                        deducted = true;
                    }

                    if (deducted) {
                        const newQty = Math.max(0, Number(c.product.stock_qty) - c.qty);
                        await supabase.from('stock_movements').insert({
                            product_id: c.product.id,
                            type: 'saida',
                            quantity: c.qty,
                            previous_qty: c.product.stock_qty,
                            new_qty: newQty,
                            reason: `Venda - Pedido #${order.order_number}`,
                            order_id: order.id,
                            staff_id: staff.id
                        });
                    }
                }
            }
        }

        // 3. Store order metadata for WhatsApp
        lastOrderMeta = {
            orders: createdOrders,
            locationType: currentLocation.type,
            locationId: currentLocation.id,
            customerName,
            customerPhone,
            total
        };

        // 4. Audit Log
        await logAuditAction('ORDER_CREATED', {
            orders: createdOrders.map(o => o.number),
            total_amount: total,
            items_count: cart.reduce((s, c) => s + c.qty, 0),
            customer_name: customerName,
            customer_phone: customerPhone
        }, currentLocation);

        // 5. Success!
        toggleCart();
        showSuccess(createdOrders);

        // Reset
        cart = [];
        document.getElementById('orderNotes').value = '';
        document.getElementById('customerName').value = '';
        document.getElementById('customerPhone').value = '';

        updateCartUI();
        await loadCatalog();

    } catch (err) {
        console.error('Order error:', err);
        showError(err.message || 'Erro de conexão. Verifique o Wi-Fi.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> ENVIAR PEDIDO';
    }
};

function showSuccess(createdOrders) {
    // Render order numbers
    const numbersContainer = document.getElementById('successOrderNumbers');
    numbersContainer.innerHTML = createdOrders.map(o => {
        const destLabel = o.dest === 'bar' ? '🍺 Bar' : '🍳 Cozinha';
        return `<div class="bg-white/20 rounded-xl px-4 py-2 inline-block mx-1">
            <span class="text-white/70 text-xs font-bold">${destLabel}</span>
            <span class="text-white font-black text-2xl block">#${o.number}</span>
        </div>`;
    }).join('');

    document.getElementById('successMsg').textContent = 
        `${currentLocation.type.toUpperCase()} ${currentLocation.id}`;

    // Generate QR Code for client tracking
    const qrContainer = document.getElementById('successQrCode');
    qrContainer.innerHTML = ''; // Clear previous
    const statusUrl = `https://balnearioriopreto.com.br/status.html?tipo=${currentLocation.type}&id=${currentLocation.id}`;
    
    try {
        new QRCode(qrContainer, {
            text: statusUrl,
            width: 140,
            height: 140,
            colorDark: '#064e3b',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });
    } catch(e) {
        console.warn('QR generation failed:', e);
        qrContainer.innerHTML = '<p class="text-sm text-stone-500 p-4">QR indisponível</p>';
    }

    // Show/hide WhatsApp button based on whether we have a phone number
    const whatsBtn = document.getElementById('btnWhatsAppLink');
    if (lastOrderMeta?.customerPhone) {
        whatsBtn.classList.remove('hidden');
    } else {
        whatsBtn.classList.add('hidden');
    }

    const overlay = document.getElementById('successOverlay');
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
}

window.sendWhatsAppLink = () => {
    if (!lastOrderMeta?.customerPhone) return;
    
    const phone = lastOrderMeta.customerPhone.replace(/\D/g, '');
    const fullPhone = phone.startsWith('55') ? phone : '55' + phone;
    const statusUrl = `https://balnearioriopreto.com.br/status.html?tipo=${lastOrderMeta.locationType}&id=${lastOrderMeta.locationId}`;
    const orderNums = lastOrderMeta.orders.map(o => `#${o.number}`).join(', ');
    const name = lastOrderMeta.customerName ? ` ${lastOrderMeta.customerName}` : '';
    
    const message = `Olá${name}! 🌿\n\nSeu pedido ${orderNums} foi enviado para a cozinha do Balneário Rio Preto.\n\n📱 Acompanhe em tempo real:\n${statusUrl}\n\nBom apetite! 🍽️`;
    
    const waUrl = `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');
};

window.closeSuccess = () => {
    const overlay = document.getElementById('successOverlay');
    overlay.classList.add('hidden');
    overlay.classList.remove('flex');
};

function showError(msg) {
    document.getElementById('errorMsg').textContent = msg;
    const overlay = document.getElementById('errorOverlay');
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
}

window.retryOrder = () => {
    closeError();
    window.sendOrder();
};

window.closeError = () => {
    const overlay = document.getElementById('errorOverlay');
    overlay.classList.add('hidden');
    overlay.classList.remove('flex');
};

// ====== INIT ======
document.addEventListener('DOMContentLoaded', () => {
    const staff = getCurrentStaff();
    if (staff) {
        document.getElementById('loginScreen').style.display = 'none';
        showLocationScreen();
    }
});
