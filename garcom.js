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
    startGlobalGarcomRealtime();
}

let globalGarcomChannel = null;
function startGlobalGarcomRealtime() {
    if (globalGarcomChannel) return;

    // Polling fallback (3s) for dashboard counters
    setInterval(() => {
        const locScreen = document.getElementById('locationScreen');
        if (locScreen && locScreen.style.display !== 'none') {
            if (document.getElementById('tab_resumo')?.classList.contains('active')) {
                if (typeof window.filterResumo === 'function') window.filterResumo(window.currentResumoFilter || 'aberto');
            } else if (currentLocation?.type) {
                fetchLocationStats();
            }
        }
    }, 3000);

    // Supabase Realtime for instant updates
    globalGarcomChannel = supabase
        .channel('garcom-global-stats')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
            const locScreen = document.getElementById('locationScreen');
            if (locScreen && locScreen.style.display !== 'none') {
                if (document.getElementById('tab_resumo')?.classList.contains('active')) {
                    if (typeof window.filterResumo === 'function') window.filterResumo(window.currentResumoFilter || 'aberto');
                } else if (currentLocation?.type) {
                    if (typeof window.setLocationType === 'function') window.setLocationType(currentLocation.type);
                }
            }
        })
        .subscribe();
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

// ====== BOTTOM NAVBAR & TAB SWITCHING ======
let currentGarcomNavTab = 'fazer_pedido';

window.switchGarcomTab = (tabKey) => {
    currentGarcomNavTab = tabKey;

    const locGrid = document.getElementById('locationGrid');
    const liveFeed = document.getElementById('liveFeedContainer');
    const resumoCont = document.getElementById('resumoContainer');
    const tabsRow = document.querySelector('#locationScreen .flex-wrap');

    // Reset button styles
    ['fazerPedido', 'pedidosFeitos', 'resumoDia'].forEach(k => {
        const btn = document.getElementById(`navBtn_${k}`);
        if (!btn) return;
        const keyMatch = k.toLowerCase().replace(/[^a-z]/g, '');
        const targetMatch = tabKey.toLowerCase().replace(/[^a-z]/g, '');
        if (keyMatch.includes(targetMatch) || targetMatch.includes(keyMatch)) {
            btn.className = "flex flex-col items-center gap-1 text-emerald-700 font-black text-[10px] uppercase tracking-wider transition scale-105";
        } else {
            btn.className = "flex flex-col items-center gap-1 text-stone-400 font-bold text-[10px] uppercase tracking-wider transition";
        }
    });

    if (tabKey === 'fazer_pedido') {
        if (locGrid) locGrid.classList.remove('hidden');
        if (liveFeed) { liveFeed.classList.add('hidden'); liveFeed.classList.remove('flex'); }
        if (resumoCont) { resumoCont.classList.add('hidden'); resumoCont.classList.remove('flex'); }
        if (tabsRow) tabsRow.classList.remove('hidden');
        setLocationType(currentLocation.type || 'chale');
    } else if (tabKey === 'pedidos_feitos') {
        if (locGrid) locGrid.classList.add('hidden');
        if (liveFeed) { liveFeed.classList.remove('hidden'); liveFeed.classList.add('flex'); }
        if (resumoCont) { resumoCont.classList.add('hidden'); resumoCont.classList.remove('flex'); }
        if (tabsRow) tabsRow.classList.add('hidden');
        loadLiveOrdersFeed();
    } else if (tabKey === 'resumo_dia') {
        if (locGrid) locGrid.classList.add('hidden');
        if (liveFeed) { liveFeed.classList.add('hidden'); liveFeed.classList.remove('flex'); }
        if (resumoCont) { resumoCont.classList.remove('hidden'); resumoCont.classList.add('flex'); }
        if (tabsRow) tabsRow.classList.add('hidden');
        if (typeof window.showResumoDia === 'function') window.showResumoDia();
    }
};

// ====== LIVE ORDERS FEED (COLOR-CODED) ======
window.loadLiveOrdersFeed = async () => {
    const list = document.getElementById('liveFeedList');
    if (!list) return;

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0).toISOString();

    const { data: orders, error } = await supabase
        .from('orders')
        .select('*, order_items(*), staff_users(name)')
        .gte('created_at', startOfDay)
        .neq('status', 'cancelado')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error loading live orders feed:', error);
        return;
    }

    if (!orders || orders.length === 0) {
        list.innerHTML = `
            <div class="flex flex-col items-center justify-center py-16 text-stone-400">
                <i class="fa-solid fa-utensils text-4xl mb-3 opacity-30"></i>
                <p class="font-bold text-sm">Nenhum pedido feito hoje</p>
            </div>`;
        return;
    }

    list.innerHTML = orders.map(o => {
        const locLabel = o.location_type === 'chale' 
            ? `Chalé ${o.location_id}` 
            : o.location_type === 'mesa' 
                ? `Mesa ${o.location_id.replace('M','')}` 
                : `Balcão ${o.location_id}`;

        const items = o.order_items || [];
        const itemsSummary = items.map(i => `${i.quantity}x ${i.product_name}`).join(', ');
        const customerName = o.customer_name || 'Sem Nome';
        const destIcon = o.destination === 'bar' ? '🍺' : '🍳';
        const timeAgo = new Date(o.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        // Color-Coded Badges & Card Styles
        let statusBadge = '';
        let cardBorder = 'border-stone-200 bg-white';

        if (o.status === 'pendente') {
            statusBadge = `<span class="bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-black px-2.5 py-1 rounded-full uppercase flex items-center gap-1"><i class="fa-solid fa-clock"></i> Pendente</span>`;
            cardBorder = 'border-amber-200 bg-amber-50/30';
        } else if (o.status === 'preparando') {
            statusBadge = `<span class="bg-orange-500 text-white font-black text-[10px] px-2.5 py-1 rounded-full shadow-sm uppercase flex items-center gap-1 animate-pulse"><i class="fa-solid fa-fire-burner"></i> Fazendo</span>`;
            cardBorder = 'border-orange-300 bg-orange-50/40';
        } else if (o.status === 'pronto') {
            statusBadge = `<span class="bg-green-600 text-white font-black text-[10px] px-2.5 py-1 rounded-full shadow-md uppercase flex items-center gap-1"><i class="fa-solid fa-circle-check"></i> PRONTO!</span>`;
            cardBorder = 'border-green-400 bg-green-50/60 ring-2 ring-green-300';
        } else if (o.status === 'entregue') {
            statusBadge = `<span class="bg-stone-200 text-stone-600 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Entregue</span>`;
            cardBorder = 'border-stone-200 bg-white opacity-80';
        }

        return `
            <div class="rounded-2xl p-4 border shadow-sm transition space-y-2 ${cardBorder}">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span class="text-base">${destIcon}</span>
                        <span class="font-black text-stone-900 text-sm">#${o.order_number || o.id.slice(0, 5)}</span>
                        <span class="font-bold text-xs bg-stone-100 px-2 py-0.5 rounded-md text-stone-700">${locLabel}</span>
                    </div>
                    ${statusBadge}
                </div>

                <div class="flex justify-between items-center text-xs">
                    <span class="font-bold text-stone-700">Cliente: <strong class="text-stone-900">${customerName}</strong></span>
                    <span class="font-mono font-bold text-stone-400 text-[11px]">${timeAgo}</span>
                </div>

                <p class="text-xs font-medium text-stone-600 border-t border-stone-100 pt-2 truncate">
                    <i class="fa-solid fa-utensils mr-1.5 text-stone-400"></i>${itemsSummary || 'Sem itens'}
                </p>

                <div class="flex justify-between items-center pt-2 border-t border-stone-100">
                    <span class="font-black text-emerald-700 text-sm">R$ ${Number(o.total || 0).toFixed(2).replace('.',',')}</span>
                    <button onclick="window.openLocationFromResumo('${o.location_type}', '${o.location_id}', '${locLabel}')" class="text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 px-3 py-1 rounded-xl transition">
                        Ver Comanda
                    </button>
                </div>
            </div>
        `;
    }).join('');
};

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

    if (typeof window.switchGarcomTab === 'function') {
        window.switchGarcomTab(currentGarcomNavTab || 'fazer_pedido');
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
let productsChannel = null;

async function loadCatalog() {
    // Load categories
    const { data: cats } = await supabase
        .from('categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

    categories = cats || [];

    // Load products with stock
    const { data: prods } = await supabase
        .from('products')
        .select('*, categories(name, destination)')
        .eq('is_active', true)
        .order('name');

    products = prods || [];

    validateCartStock();

    renderCategoryTabs();
    if (categories.length > 0) {
        selectCategory(activeCategory || 'all');
    } else {
        renderProducts([]);
    }

    startProductsRealtime();
}

function validateCartStock() {
    let cartChanged = false;
    cart.forEach(c => {
        const freshP = products.find(p => p.id === c.product.id);
        if (freshP) {
            c.product = freshP; // keep reference fresh
            const freshQty = Number(freshP.stock_qty || 0);
            if (freshQty <= 0) {
                cart = cart.filter(item => item.product.id !== c.product.id);
                cartChanged = true;
                alert(`🚫 O produto "${freshP.name}" ESGOTOU no estoque e foi removido do seu carrinho.`);
            } else if (c.qty > freshQty) {
                c.qty = freshQty;
                cartChanged = true;
                alert(`⚠️ O estoque de "${freshP.name}" mudou! A quantidade no carrinho foi ajustada para ${freshQty}.`);
            }
        }
    });

    if (cartChanged) updateCartUI();
}

function startProductsRealtime() {
    if (productsChannel) return;

    // Fast 3s polling for real-time stock sync
    setInterval(() => {
        const mainApp = document.getElementById('mainApp');
        if (mainApp && !mainApp.classList.contains('hidden')) {
            refreshProductsSilent();
        }
    }, 3000);

    // Supabase Realtime channel for instant stock updates
    productsChannel = supabase
        .channel('garcom-products-stock')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
            refreshProductsSilent();
        })
        .subscribe();
}

async function refreshProductsSilent() {
    const { data: prods } = await supabase
        .from('products')
        .select('*, categories(name, destination)')
        .eq('is_active', true)
        .order('name');

    if (!prods) return;
    products = prods;

    validateCartStock();
    selectCategory(activeCategory || 'all');
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
    const stockQty = Number(product.stock_qty || 0);
    // STRICT RULE: Any item with stock_qty <= 0 is ALWAYS outOfStock (RED + BLOCKED)
    const outOfStock = stockQty <= 0;
    const isControlled = product.is_stock_controlled !== false;
    const lowStock = !outOfStock && isControlled && stockQty <= (product.min_stock || 3);
    const destination = product.categories?.destination || 'cozinha';
    const destIcon = destination === 'bar' ? '🍺' : '🍳';

    // Stock badge
    let stockBadge = '';
    if (outOfStock) {
        stockBadge = `<span class="bg-red-600 text-white font-black text-[10px] px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1 animate-pulse"><i class="fa-solid fa-ban"></i> ESGOTADO (0)</span>`;
    } else if (lowStock) {
        stockBadge = `<span class="bg-amber-500 text-white font-bold text-[10px] px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1"><i class="fa-solid fa-triangle-exclamation"></i> Restam ${stockQty}</span>`;
    } else {
        stockBadge = `<span class="bg-emerald-100 text-emerald-800 font-bold text-[10px] px-2 py-0.5 rounded-full border border-emerald-200">${stockQty} un</span>`;
    }

    // Card styling for outOfStock (prominent RED border and background)
    const cardStyle = outOfStock 
        ? 'bg-red-50 border-2 border-red-500 shadow-md opacity-80 cursor-not-allowed' 
        : 'bg-white border border-stone-200 shadow-sm active:scale-95 hover:border-emerald-500';

    return `
        <div class="product-card rounded-2xl p-3 flex flex-col justify-between transition relative ${cardStyle}"
            onclick="${outOfStock ? `alert('🚫 Item ESGOTADO (Estoque 0)! Não é possível adicionar este produto.')` : `addToCart('${product.id}')`}">
            
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

    const stockQty = Number(product.stock_qty || 0);
    if (stockQty <= 0) {
        alert(`🚫 O item "${product.name}" está ESGOTADO (Estoque 0) e não pode ser adicionado ao carrinho!`);
        return;
    }

    const existing = cart.find(c => c.product.id === productId);
    const currentQtyInCart = existing ? existing.qty : 0;

    if ((currentQtyInCart + 1) > stockQty) {
        alert(`⚠️ Estoque insuficiente! Restam apenas ${stockQty} unidade(s) de "${product.name}".`);
        return;
    }

    if (existing) {
        existing.qty++;
    } else {
        cart.push({ product, qty: 1, notes: '' });
    }

    updateCartUI();
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
        // 0. Pre-verify real-time DB stock levels right before sending order
        const cartProductIds = cart.map(c => c.product.id);
        const { data: freshStockProducts } = await supabase
            .from('products')
            .select('id, name, stock_qty, is_stock_controlled')
            .in('id', cartProductIds);

        if (freshStockProducts) {
            for (const c of cart) {
                const fresh = freshStockProducts.find(p => p.id === c.product.id);
                if (fresh && fresh.is_stock_controlled) {
                    if (fresh.stock_qty <= 0) {
                        alert(`🚫 ATENÇÃO: O item "${fresh.name}" ACABOU de esgotar no estoque!\n\nO pedido NÃO foi enviado. Remova este item do carrinho.`);
                        refreshProductsSilent();
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> CONFIRMAR E ENVIAR';
                        return;
                    } else if (c.qty > fresh.stock_qty) {
                        alert(`🚫 ATENÇÃO: Restam apenas ${fresh.stock_qty} unidade(s) de "${fresh.name}" no estoque!\n\nVocê selecionou ${c.qty}. O pedido NÃO foi enviado. Ajuste seu carrinho.`);
                        refreshProductsSilent();
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> CONFIRMAR E ENVIAR';
                        return;
                    }
                }
            }
        }

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

// ====== NOTIFICATIONS CENTER ======
let garcomNotifications = [];
let notiAudio = null;

function playNotiSound() {
    try {
        if (!notiAudio) {
            notiAudio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        }
        notiAudio.play().catch(() => {});
    } catch(e) {}
}

window.openNotificationsModal = () => {
    renderGarcomNotifications();
    const modal = document.getElementById('notificationsModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
    updateNotiBadges(0);
};

window.closeNotificationsModal = () => {
    const modal = document.getElementById('notificationsModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
};

window.clearGarcomNotifications = () => {
    garcomNotifications = [];
    renderGarcomNotifications();
    updateNotiBadges(0);
};

function updateNotiBadges(count) {
    const b1 = document.getElementById('notiBadgeLocation');
    const b2 = document.getElementById('notiBadgeMain');
    
    [b1, b2].forEach(b => {
        if (!b) return;
        if (count > 0) {
            b.textContent = count;
            b.classList.remove('hidden');
        } else {
            b.classList.add('hidden');
        }
    });
}

function addGarcomNotification(noti) {
    if (garcomNotifications.some(n => n.id === noti.id && n.status === noti.status)) return;

    garcomNotifications.unshift(noti);
    if (garcomNotifications.length > 30) garcomNotifications.pop();

    playNotiSound();
    showNotiToast(noti);

    const unreadCount = garcomNotifications.filter(n => !n.read).length;
    updateNotiBadges(unreadCount);
}

function showNotiToast(noti) {
    const msg = `Pedido #${noti.orderNumber} (${noti.locLabel}) de ${noti.customerName} está PRONTO!`;
    const toast = document.getElementById('notiToast');
    const msgEl = document.getElementById('notiMsg');
    if (toast && msgEl) {
        msgEl.textContent = msg;
        toast.style.transform = 'translateY(0)';
        setTimeout(() => {
            toast.style.transform = 'translateY(-150%)';
        }, 6000);
    }
}

window.hideNoti = () => {
    const toast = document.getElementById('notiToast');
    if (toast) toast.style.transform = 'translateY(-150%)';
};

function renderGarcomNotifications() {
    const container = document.getElementById('notificationsList');
    if (!container) return;

    if (garcomNotifications.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 text-stone-400">
                <i class="fa-solid fa-bell-slash text-4xl mb-3 opacity-30"></i>
                <p class="font-bold text-xs">Nenhuma notificação recente</p>
            </div>`;
        return;
    }

    container.innerHTML = garcomNotifications.map(n => {
        n.read = true;
        const timeAgo = new Date(n.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        return `
            <div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 flex items-start gap-3 shadow-sm">
                <div class="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center text-lg font-black shrink-0">
                    <i class="fa-solid fa-check-double"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between">
                        <span class="font-black text-emerald-900 text-xs uppercase tracking-wider">${n.locLabel}</span>
                        <span class="text-[10px] font-bold text-emerald-600">${timeAgo}</span>
                    </div>
                    <p class="font-bold text-stone-800 text-sm mt-0.5">Pedido #${n.orderNumber} • ${n.destLabel}</p>
                    <p class="text-xs text-stone-600 font-medium">Cliente: <strong class="text-stone-800">${n.customerName}</strong></p>
                    ${n.itemsSummary ? `<p class="text-[11px] text-stone-500 font-medium mt-1 truncate"><i class="fa-solid fa-utensils mr-1"></i>${n.itemsSummary}</p>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// ====== LISTEN FOR READY ORDERS ======
let readyOrdersChannel = null;
function listenForReadyOrders() {
    if (readyOrdersChannel) return;

    readyOrdersChannel = supabase
        .channel('garcom-ready-orders')
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'orders'
        }, async (payload) => {
            const newStatus = payload.new?.status;
            if (newStatus === 'pronto') {
                const { data: fullOrder } = await supabase
                    .from('orders')
                    .select('*, order_items(*)')
                    .eq('id', payload.new.id)
                    .single();

                if (fullOrder) {
                    const locLabel = fullOrder.location_type === 'chale' 
                        ? `Chalé ${fullOrder.location_id}` 
                        : fullOrder.location_type === 'mesa' 
                            ? `Mesa ${fullOrder.location_id.replace('M','')}` 
                            : `Balcão ${fullOrder.location_id}`;

                    const itemsSummary = (fullOrder.order_items || []).map(i => `${i.quantity}x ${i.product_name}`).join(', ');
                    const customerName = fullOrder.customer_name || 'Cliente Sem Nome';
                    const destLabel = fullOrder.destination === 'bar' ? 'Bar 🍺' : 'Cozinha 🍳';

                    addGarcomNotification({
                        id: fullOrder.id,
                        orderNumber: fullOrder.order_number,
                        status: 'pronto',
                        locLabel,
                        customerName,
                        destLabel,
                        itemsSummary,
                        timestamp: new Date().toISOString()
                    });
                }
            }
        })
        .subscribe();
}

window.listenForReadyOrders = listenForReadyOrders;

// ====== INIT ======
document.addEventListener('DOMContentLoaded', () => {
    const staff = getCurrentStaff();
    if (staff) {
        document.getElementById('loginScreen').style.display = 'none';
        showLocationScreen();
        listenForReadyOrders();
    }
});
