/**
 * Estoque do Dia - Balneário Rio Preto
 * Página para a cozinha ajustar quantidades de estoque antes de abrir o expediente.
 * Todos os produtos são listados com campo numérico editável.
 */
import { supabase } from './scripts.js';
import { loginStaff, getCurrentStaff, logoutStaff } from './sistema_auth.js';

// ====== STATE ======
let currentPin = '';
let products = [];
let categories = [];
let activeCategory = 'all';
let pendingChanges = new Map(); // productId -> { stock_qty, is_stock_controlled }

// ====== PIN INPUT ======
window.pinInput = async (digit) => {
    if (currentPin.length >= 4) return;
    currentPin += digit;
    updatePinDots();

    if (currentPin.length === 4) {
        const result = await loginStaff(currentPin);
        if (result.success) {
            document.getElementById('loginScreen').style.display = 'none';
            startApp();
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
    document.querySelectorAll('#pinDots .pin-dot').forEach((d, i) => {
        d.classList.toggle('filled', i < currentPin.length);
    });
}

// ====== APP START ======
async function startApp() {
    const staff = getCurrentStaff();
    document.getElementById('staffName').textContent = staff?.name || '';
    document.getElementById('mainScreen').classList.remove('hidden');
    document.getElementById('mainScreen').classList.add('flex');

    await loadData();
}

// ====== LOAD DATA ======
async function loadData() {
    // Load categories
    const { data: cats } = await supabase
        .from('categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

    categories = cats || [];

    // Load ALL products (including inactive for stock management)
    const { data: prods } = await supabase
        .from('products')
        .select('*, categories(name, destination)')
        .eq('is_active', true)
        .order('name');

    products = prods || [];
    pendingChanges.clear();

    renderCategoryTabs();
    renderProducts();
    updateCounters();
}

// ====== CATEGORY TABS ======
function renderCategoryTabs() {
    const container = document.getElementById('categoryTabs');
    container.innerHTML = '';

    const allTab = createTab('Todos', 'all');
    container.appendChild(allTab);

    categories.forEach(cat => {
        container.appendChild(createTab(cat.name, cat.id));
    });
}

function createTab(label, id) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.className = id === activeCategory
        ? 'px-4 py-1.5 rounded-full text-xs font-bold bg-amber-500 text-stone-900 whitespace-nowrap shrink-0 transition'
        : 'px-4 py-1.5 rounded-full text-xs font-bold bg-stone-800 text-stone-400 border border-stone-700 whitespace-nowrap shrink-0 transition hover:bg-stone-700';
    btn.onclick = () => {
        activeCategory = id;
        renderCategoryTabs();
        renderProducts();
    };
    return btn;
}

// ====== RENDER PRODUCTS ======
function renderProducts() {
    const container = document.getElementById('productsContainer');
    const searchQuery = document.getElementById('searchInput')?.value?.toLowerCase()?.trim() || '';

    let filtered = products;

    if (activeCategory !== 'all') {
        filtered = filtered.filter(p => p.category_id === activeCategory);
    }

    if (searchQuery) {
        filtered = filtered.filter(p => p.name.toLowerCase().includes(searchQuery));
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-16 text-stone-600">
                <i class="fa-solid fa-box-open text-4xl mb-3 opacity-30"></i>
                <p class="font-bold">Nenhum produto encontrado</p>
            </div>`;
        return;
    }

    container.innerHTML = filtered.map(p => productRow(p)).join('');
}

function productRow(product) {
    const pending = pendingChanges.get(product.id);
    const currentQty = pending ? pending.stock_qty : (product.stock_qty || 0);
    const isControlled = pending ? pending.is_stock_controlled : product.is_stock_controlled;
    const isZero = isControlled && currentQty <= 0;
    const isLow = isControlled && currentQty > 0 && currentQty <= (product.min_stock || 3);
    const dest = product.categories?.destination || 'cozinha';
    const destIcon = dest === 'bar' ? '🍺' : '🍳';
    const hasChanges = pendingChanges.has(product.id);

    return `
        <div class="bg-stone-800/60 rounded-xl p-3 flex items-center gap-3 border ${isZero ? 'border-red-500/30' : isLow ? 'border-amber-500/30' : 'border-stone-700/50'} ${hasChanges ? 'ring-1 ring-amber-500/30' : ''}" 
             id="row-${product.id}">
            
            <!-- Product Info -->
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-0.5">
                    <span class="text-sm">${destIcon}</span>
                    <p class="text-white font-bold text-sm truncate">${product.name}</p>
                </div>
                <p class="text-stone-500 text-[10px] font-bold">
                    R$ ${Number(product.price).toFixed(2).replace('.', ',')}
                    ${isZero ? ' • <span class="text-red-400">ESGOTADO</span>' : ''}
                    ${isLow ? ' • <span class="text-amber-400">BAIXO</span>' : ''}
                    ${hasChanges ? ' • <span class="text-amber-300">modificado</span>' : ''}
                </p>
            </div>

            <!-- Stock Controls -->
            <div class="flex items-center gap-2 shrink-0">
                <!-- Toggle Control -->
                <button onclick="toggleStockControl('${product.id}')" 
                    class="w-8 h-8 rounded-lg flex items-center justify-center text-xs transition ${isControlled ? 'bg-amber-500/20 text-amber-400' : 'bg-stone-700 text-stone-500'}"
                    title="${isControlled ? 'Estoque controlado' : 'Sem controle de estoque'}">
                    <i class="fa-solid ${isControlled ? 'fa-lock' : 'fa-lock-open'}"></i>
                </button>

                <!-- Minus -->
                <button onclick="adjustStock('${product.id}', -1)" 
                    class="w-9 h-9 rounded-lg bg-stone-700 text-stone-300 flex items-center justify-center font-black text-lg hover:bg-stone-600 active:scale-90 transition ${!isControlled ? 'opacity-30 pointer-events-none' : ''}">
                    −
                </button>

                <!-- Quantity Input -->
                <input type="number" min="0" value="${currentQty}"
                    onchange="setStock('${product.id}', this.value)"
                    class="stock-input w-16 h-9 bg-stone-900 border border-stone-600 rounded-lg text-center text-white font-black text-sm ${!isControlled ? 'opacity-30 pointer-events-none' : ''}"
                    ${!isControlled ? 'disabled' : ''}>

                <!-- Plus -->
                <button onclick="adjustStock('${product.id}', 1)" 
                    class="w-9 h-9 rounded-lg bg-stone-700 text-stone-300 flex items-center justify-center font-black text-lg hover:bg-stone-600 active:scale-90 transition ${!isControlled ? 'opacity-30 pointer-events-none' : ''}">
                    +
                </button>
            </div>
        </div>
    `;
}

// ====== STOCK ACTIONS ======
window.toggleStockControl = (productId) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const pending = pendingChanges.get(productId);
    const currentControlled = pending ? pending.is_stock_controlled : product.is_stock_controlled;
    const currentQty = pending ? pending.stock_qty : (product.stock_qty || 0);

    pendingChanges.set(productId, {
        stock_qty: currentQty,
        is_stock_controlled: !currentControlled
    });

    renderProducts();
    updateCounters();
};

window.adjustStock = (productId, delta) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const pending = pendingChanges.get(productId);
    const currentQty = pending ? pending.stock_qty : (product.stock_qty || 0);
    const isControlled = pending ? pending.is_stock_controlled : product.is_stock_controlled;
    const newQty = Math.max(0, currentQty + delta);

    pendingChanges.set(productId, {
        stock_qty: newQty,
        is_stock_controlled: isControlled
    });

    renderProducts();
    updateCounters();
};

window.setStock = (productId, value) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const pending = pendingChanges.get(productId);
    const isControlled = pending ? pending.is_stock_controlled : product.is_stock_controlled;
    const newQty = Math.max(0, parseInt(value) || 0);

    pendingChanges.set(productId, {
        stock_qty: newQty,
        is_stock_controlled: isControlled
    });

    updateCounters();
};

// ====== SAVE ALL ======
window.saveAllStock = async () => {
    if (pendingChanges.size === 0) {
        setStatus('Nenhuma alteração para salvar', 'text-stone-400');
        return;
    }

    const btn = document.getElementById('btnSaveAll');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';

    try {
        let saved = 0;
        for (const [productId, changes] of pendingChanges) {
            const { error } = await supabase
                .from('products')
                .update({
                    stock_qty: changes.stock_qty,
                    is_stock_controlled: changes.is_stock_controlled
                })
                .eq('id', productId);

            if (error) throw error;

            // Update local state
            const product = products.find(p => p.id === productId);
            if (product) {
                product.stock_qty = changes.stock_qty;
                product.is_stock_controlled = changes.is_stock_controlled;
            }
            saved++;
        }

        pendingChanges.clear();
        renderProducts();
        updateCounters();
        setStatus(`✅ ${saved} produto${saved > 1 ? 's' : ''} atualizado${saved > 1 ? 's' : ''}`, 'text-green-400');

    } catch (err) {
        console.error('Save error:', err);
        setStatus(`❌ Erro: ${err.message}`, 'text-red-400');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> SALVAR TUDO';
    }
};

function setStatus(msg, colorClass) {
    const el = document.getElementById('saveStatus');
    el.textContent = msg;
    el.className = `text-xs font-bold ${colorClass}`;
    setTimeout(() => { el.textContent = ''; }, 5000);
}

// ====== COUNTERS ======
function updateCounters() {
    let controlled = 0, zero = 0, ready = 0;

    products.forEach(p => {
        const pending = pendingChanges.get(p.id);
        const isControlled = pending ? pending.is_stock_controlled : p.is_stock_controlled;
        const qty = pending ? pending.stock_qty : (p.stock_qty || 0);

        if (isControlled) {
            controlled++;
            if (qty <= 0) zero++;
            else ready++;
        }
    });

    document.getElementById('countControlled').textContent = controlled;
    document.getElementById('countZero').textContent = zero;
    document.getElementById('countReady').textContent = ready;
}

// ====== SEARCH ======
document.getElementById('searchInput')?.addEventListener('input', () => {
    renderProducts();
});

// ====== INIT ======
document.addEventListener('DOMContentLoaded', () => {
    const staff = getCurrentStaff();
    if (staff) {
        document.getElementById('loginScreen').style.display = 'none';
        startApp();
    }
});
