/**
 * Módulo PDV Balcão - Balneário Rio Preto
 * Frente de Caixa Profissional, Lançamento de Itens Avulsos, Sangria/Suprimento e Impressão Elgin
 */
import { supabase } from './scripts.js';
import { getCurrentStaff, hasActionPermission } from './sistema_auth.js';
import { logAuditAction } from './audit_logger.js';

// ====== STATE ======
let catalogProducts = [];
let catalogCategories = [];
let activeCategoryFilter = 'all';
let pdvSearchQuery = '';

let pdvCart = []; // { id, name, price, qty, notes, destination, isCustom }
let pdvDiscountType = 'fixed'; // 'fixed' | 'percent'
let pdvDiscountValue = 0;
let pdvPaymentMethod = 'pix'; // 'pix' | 'dinheiro' | 'credito' | 'debito'
let pdvCashReceived = 0;

const STORAGE_SANGRIA_KEY = 'riopreto_pdv_sangrias';
const STORAGE_SUPRIMENTO_KEY = 'riopreto_pdv_suprimentos';

export async function renderPDV(container) {
    const staff = getCurrentStaff();
    if (!staff) return;

    container.innerHTML = `
        <div class="max-w-7xl mx-auto space-y-4 anim-fade">
            <!-- Header Bar -->
            <div class="bg-gradient-to-r from-emerald-900 via-stone-900 to-emerald-950 rounded-3xl p-4 md:p-5 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-emerald-800/40">
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 rounded-2xl bg-emerald-600/30 border border-emerald-400/30 flex items-center justify-center text-white text-2xl font-black backdrop-blur">
                        <i class="fa-solid fa-cash-register"></i>
                    </div>
                    <div>
                        <h2 class="text-xl md:text-2xl font-black tracking-tight flex items-center gap-2">
                            PDV Balcão <span class="text-emerald-400 text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 font-bold uppercase">Frente de Caixa</span>
                        </h2>
                        <p class="text-xs text-stone-300 font-medium">Operador: <strong>${staff.name}</strong> (${staff.role.toUpperCase()})</p>
                    </div>
                </div>

                <!-- Quick Action Buttons -->
                <div class="flex flex-wrap items-center gap-2 w-full md:w-auto">
                    <button onclick="window._pdvOpenItemAvulsoModal()" class="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs rounded-xl shadow-md transition flex items-center gap-1.5 active:scale-95">
                        <i class="fa-solid fa-plus-circle"></i> + Item Avulso
                    </button>
                    <button onclick="window._pdvOpenSangriaModal()" class="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1.5 active:scale-95">
                        <i class="fa-solid fa-hand-holding-dollar"></i> Sangria (Saída)
                    </button>
                    <button onclick="window._pdvOpenSuprimentoModal()" class="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1.5 active:scale-95">
                        <i class="fa-solid fa-piggy-bank"></i> Suprimento (Entrada)
                    </button>
                    <button onclick="window._pdvOpenResumoCaixaModal()" class="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 transition flex items-center gap-1.5 active:scale-95">
                        <i class="fa-solid fa-chart-line"></i> Resumo do Caixa
                    </button>
                </div>
            </div>

            <!-- Toast alert -->
            <div id="pdvToast" class="hidden"></div>

            <!-- Main Layout: Grid Catalog (Left) + Cart & Checkout (Right) -->
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <!-- Left Column: Catalog & Search (7 Cols) -->
                <div class="lg:col-span-7 bg-white rounded-3xl p-5 border border-gray-100 shadow-sm flex flex-col space-y-4">
                    <!-- Search & Filter Bar -->
                    <div class="space-y-3">
                        <div class="relative">
                            <i class="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                            <input type="text" id="pdvSearchInput" placeholder="Buscar produto por nome..." 
                                oninput="window._pdvOnSearch(this.value)"
                                class="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-gray-800 font-bold text-sm outline-none focus:bg-white focus:border-emerald-500 transition">
                        </div>

                        <!-- Category Filter Pills -->
                        <div id="pdvCategoriesPills" class="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                            <!-- Injected by JS -->
                        </div>
                    </div>

                    <!-- Products Grid -->
                    <div id="pdvProductsGrid" class="grid grid-cols-2 sm:grid-cols-3 gap-3 overflow-y-auto max-h-[calc(100vh-320px)] p-1 no-scrollbar">
                        <div class="col-span-full flex justify-center py-20"><i class="fa-solid fa-spinner fa-spin text-3xl text-emerald-600"></i></div>
                    </div>
                </div>

                <!-- Right Column: Cart & Checkout (5 Cols) -->
                <div class="lg:col-span-5 bg-white rounded-3xl p-5 border border-gray-100 shadow-sm flex flex-col justify-between space-y-4">
                    <div class="space-y-4 flex-1 overflow-y-auto no-scrollbar max-h-[calc(100vh-220px)]">
                        <!-- Cart Header -->
                        <div class="flex items-center justify-between pb-3 border-b border-gray-100">
                            <h3 class="font-black text-gray-800 text-lg flex items-center gap-2">
                                <i class="fa-solid fa-shopping-bag text-emerald-600"></i> Carrinho de Venda
                            </h3>
                            <button onclick="window._pdvClearCart()" class="text-xs font-bold text-rose-500 hover:text-rose-700 transition">
                                <i class="fa-solid fa-trash-can mr-1"></i> Limpar
                            </button>
                        </div>

                        <!-- Customer Identification (Mandatory) -->
                        <div class="bg-emerald-50/50 p-3.5 rounded-2xl border border-emerald-100 space-y-2">
                            <label class="text-[11px] font-black text-emerald-800 uppercase tracking-widest block">
                                Identificação do Cliente *
                            </label>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <input type="text" id="pdvCustomerName" placeholder="Nome do Cliente *" 
                                    class="w-full px-3 py-2 bg-white border border-emerald-200 rounded-xl text-gray-800 font-bold text-xs outline-none focus:border-emerald-500 transition" required>
                                <input type="tel" id="pdvCustomerPhone" placeholder="Telefone (Opcional)" 
                                    class="w-full px-3 py-2 bg-white border border-emerald-200 rounded-xl text-gray-800 font-medium text-xs outline-none focus:border-emerald-500 transition">
                            </div>
                        </div>

                        <!-- Cart Items List -->
                        <div id="pdvCartItemsList" class="space-y-2">
                            <!-- Injected by JS -->
                        </div>
                    </div>

                    <!-- Checkout & Totals Box -->
                    <div class="pt-3 border-t border-gray-100 space-y-3 bg-gray-50/80 p-4 rounded-2xl border">
                        <!-- Payment Method Selector -->
                        <div>
                            <label class="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">Forma de Pagamento</label>
                            <div class="grid grid-cols-4 gap-1.5">
                                <button onclick="window._pdvSelectPaymentMethod('pix')" id="pdvPay_pix" class="py-2 px-1 rounded-xl text-xs font-black border transition text-center bg-emerald-600 text-white border-emerald-600 shadow-sm">
                                    ⚡ PIX
                                </button>
                                <button onclick="window._pdvSelectPaymentMethod('dinheiro')" id="pdvPay_dinheiro" class="py-2 px-1 rounded-xl text-xs font-bold border transition text-center bg-white text-gray-700 border-gray-200 hover:bg-gray-100">
                                    💵 Dinheiro
                                </button>
                                <button onclick="window._pdvSelectPaymentMethod('credito')" id="pdvPay_credito" class="py-2 px-1 rounded-xl text-xs font-bold border transition text-center bg-white text-gray-700 border-gray-200 hover:bg-gray-100">
                                    💳 Crédito
                                </button>
                                <button onclick="window._pdvSelectPaymentMethod('debito')" id="pdvPay_debito" class="py-2 px-1 rounded-xl text-xs font-bold border transition text-center bg-white text-gray-700 border-gray-200 hover:bg-gray-100">
                                    💳 Débito
                                </button>
                            </div>
                        </div>

                        <!-- Cash Change Calculator (Visible only when Dinheiro selected) -->
                        <div id="pdvCashCalculatorBox" class="hidden bg-amber-50 border border-amber-200 p-3 rounded-xl space-y-2">
                            <div class="flex items-center justify-between gap-2">
                                <span class="text-xs font-bold text-amber-800">Valor Recebido (R$):</span>
                                <input type="number" step="0.01" id="pdvCashReceivedInput" value="0.00" 
                                    oninput="window._pdvUpdateCashChange(this.value)"
                                    class="w-28 px-2 py-1 bg-white border border-amber-300 rounded-lg text-right font-black text-amber-900 outline-none">
                            </div>
                            <div class="flex justify-between items-center text-xs font-black text-amber-900 border-t border-amber-200 pt-1.5">
                                <span>Troco a Devolver:</span>
                                <span id="pdvCashChangeDisplay" class="text-sm font-black text-emerald-700">R$ 0,00</span>
                            </div>
                        </div>

                        <!-- Discount Bar -->
                        <div class="flex items-center justify-between gap-2 text-xs font-bold">
                            <span class="text-gray-500">Desconto:</span>
                            <div class="flex items-center gap-1">
                                <input type="number" step="0.01" id="pdvDiscountInput" value="0" 
                                    oninput="window._pdvUpdateDiscount(this.value)"
                                    class="w-20 px-2 py-1 bg-white border border-gray-200 rounded-lg text-right font-bold text-gray-800 outline-none">
                                <select id="pdvDiscountTypeSelect" onchange="window._pdvSetDiscountType(this.value)" class="bg-white border border-gray-200 rounded-lg py-1 px-1.5 text-xs font-bold">
                                    <option value="fixed">R$</option>
                                    <option value="percent">%</option>
                                </select>
                            </div>
                        </div>

                        <!-- Totals Breakdown -->
                        <div class="space-y-1 text-xs font-bold text-gray-500 border-t border-gray-200 pt-2">
                            <div class="flex justify-between">
                                <span>Subtotal</span>
                                <span id="pdvSubtotalDisplay" class="text-gray-800">R$ 0,00</span>
                            </div>
                            <div class="flex justify-between text-emerald-600 hidden" id="pdvDiscountRow">
                                <span>Desconto Aplicado</span>
                                <span id="pdvDiscountDisplay">- R$ 0,00</span>
                            </div>
                            <div class="flex justify-between items-end pt-1 text-gray-900">
                                <span class="text-sm font-black uppercase tracking-wider">TOTAL DA VENDA</span>
                                <span id="pdvTotalDisplay" class="text-2xl font-black text-emerald-700">R$ 0,00</span>
                            </div>
                        </div>

                        <!-- Submit Order Button -->
                        <button onclick="window._pdvFinalizeSale()" id="pdvBtnFinalize" class="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm uppercase tracking-widest rounded-2xl shadow-lg shadow-emerald-500/30 transition flex items-center justify-center gap-2 active:scale-95">
                            <i class="fa-solid fa-check-circle text-lg"></i> FINALIZAR E IMPRIMIR
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    await loadPDVData();
}

// ====== DATA LOADING ======
async function loadPDVData() {
    try {
        const { data: prods, error: prodErr } = await supabase
            .from('products')
            .select('*, categories(name, destination)')
            .order('name');

        if (prodErr) throw prodErr;
        catalogProducts = prods || [];

        // Extract unique categories
        const catsMap = new Map();
        catalogProducts.forEach(p => {
            if (p.categories) {
                catsMap.set(p.category_id, p.categories.name);
            }
        });
        catalogCategories = Array.from(catsMap.entries()).map(([id, name]) => ({ id, name }));

        renderCategoriesPills();
        renderProductsGrid();
        renderCartUI();

    } catch (e) {
        console.error('Error loading PDV catalog:', e);
    }
}

function renderCategoriesPills() {
    const container = document.getElementById('pdvCategoriesPills');
    if (!container) return;

    container.innerHTML = `
        <button onclick="window._pdvSetCategory('all')" class="px-3 py-1.5 rounded-xl font-bold text-xs transition whitespace-nowrap ${activeCategoryFilter === 'all' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}">
            Todos
        </button>
        ${catalogCategories.map(c => `
            <button onclick="window._pdvSetCategory('${c.id}')" class="px-3 py-1.5 rounded-xl font-bold text-xs transition whitespace-nowrap ${activeCategoryFilter === c.id ? 'bg-emerald-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}">
                ${c.name}
            </button>
        `).join('')}
    `;
}

function renderProductsGrid() {
    const container = document.getElementById('pdvProductsGrid');
    if (!container) return;

    let filtered = catalogProducts;
    if (activeCategoryFilter !== 'all') {
        filtered = filtered.filter(p => p.category_id === activeCategoryFilter);
    }
    if (pdvSearchQuery.trim()) {
        const q = pdvSearchQuery.toLowerCase();
        filtered = filtered.filter(p => p.name.toLowerCase().includes(q));
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center py-16 opacity-50 text-gray-400">
                <i class="fa-solid fa-boxes-stacked text-5xl mb-3"></i>
                <p class="font-bold text-sm">Nenhum produto encontrado</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(p => {
        const hasStock = !p.is_stock_controlled || Number(p.stock_qty) > 0;
        const stockLabel = p.is_stock_controlled ? `${p.stock_qty} em estoque` : 'Estoque Livre';
        return `
            <div onclick="${hasStock ? `window._pdvAddToCart('${p.id}')` : ''}" class="bg-gray-50 rounded-2xl p-3 border border-gray-100 hover:border-emerald-300 hover:bg-emerald-50/20 transition cursor-pointer flex flex-col justify-between group ${!hasStock ? 'opacity-50 pointer-events-none' : ''}">
                <div>
                    <span class="text-[9px] font-black text-gray-400 uppercase block truncate">${p.categories?.name || 'Geral'}</span>
                    <h4 class="font-bold text-xs text-gray-800 group-hover:text-emerald-700 leading-tight mt-0.5 line-clamp-2">${p.name}</h4>
                </div>
                <div class="mt-3 flex items-center justify-between">
                    <div>
                        <span class="text-xs font-black text-emerald-600 block">R$ ${Number(p.price).toFixed(2).replace('.', ',')}</span>
                        <span class="text-[9px] font-bold ${p.is_stock_controlled && Number(p.stock_qty) <= 3 ? 'text-rose-500' : 'text-gray-400'} block">${stockLabel}</span>
                    </div>
                    <button class="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center text-xs font-black shadow group-hover:scale-110 transition">
                        <i class="fa-solid fa-plus"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// ====== CART UI & CALCULATIONS ======
function renderCartUI() {
    const list = document.getElementById('pdvCartItemsList');
    if (!list) return;

    if (pdvCart.length === 0) {
        list.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 text-gray-400 opacity-60">
                <i class="fa-solid fa-basket-shopping text-4xl mb-2"></i>
                <p class="font-bold text-xs">Carrinho vazio</p>
                <p class="text-[10px]">Clique nos produtos ao lado para adicionar</p>
            </div>
        `;
    } else {
        list.innerHTML = pdvCart.map((item, index) => `
            <div class="bg-gray-50 rounded-2xl p-3 border border-gray-100 space-y-2">
                <div class="flex items-start justify-between gap-2">
                    <div class="flex-1">
                        <div class="flex items-center gap-1.5">
                            ${item.isCustom ? '<span class="bg-amber-100 text-amber-800 text-[9px] font-black px-1.5 py-0.5 rounded uppercase">Avulso</span>' : ''}
                            <span class="font-bold text-xs text-gray-800">${item.name}</span>
                        </div>
                        <span class="text-xs font-black text-emerald-600">R$ ${(item.qty * item.price).toFixed(2).replace('.', ',')}</span>
                    </div>
                    <!-- Qty Controls -->
                    <div class="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-0.5">
                        <button onclick="window._pdvUpdateCartQty(${index}, -1)" class="w-6 h-6 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs flex items-center justify-center">-</button>
                        <span class="font-black text-xs text-gray-800 px-2">${item.qty}</span>
                        <button onclick="window._pdvUpdateCartQty(${index}, 1)" class="w-6 h-6 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs flex items-center justify-center">+</button>
                    </div>
                    <button onclick="window._pdvRemoveFromCart(${index})" class="text-gray-400 hover:text-rose-600 text-xs px-1"><i class="fa-solid fa-xmark"></i></button>
                </div>
            </div>
        `).join('');
    }

    calculateTotals();
}

function calculateTotals() {
    const subtotal = pdvCart.reduce((sum, item) => sum + (item.qty * item.price), 0);
    let discount = 0;

    if (pdvDiscountType === 'percent') {
        discount = (subtotal * pdvDiscountValue) / 100;
    } else {
        discount = pdvDiscountValue;
    }
    discount = Math.min(subtotal, Math.max(0, discount));

    const total = Math.max(0, subtotal - discount);

    const subEl = document.getElementById('pdvSubtotalDisplay');
    const discRow = document.getElementById('pdvDiscountRow');
    const discEl = document.getElementById('pdvDiscountDisplay');
    const totEl = document.getElementById('pdvTotalDisplay');

    if (subEl) subEl.textContent = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;
    if (discRow) {
        if (discount > 0) {
            discRow.classList.remove('hidden');
            if (discEl) discEl.textContent = `- R$ ${discount.toFixed(2).replace('.', ',')}`;
        } else {
            discRow.classList.add('hidden');
        }
    }
    if (totEl) totEl.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;

    updateCashChangeDisplay(total);
}

function updateCashChangeDisplay(totalVal) {
    if (pdvPaymentMethod !== 'dinheiro') return;
    const change = Math.max(0, pdvCashReceived - totalVal);
    const el = document.getElementById('pdvCashChangeDisplay');
    if (el) el.textContent = `R$ ${change.toFixed(2).replace('.', ',')}`;
}

// ====== GLOBAL EVENT HANDLERS ======
window._pdvSetCategory = (catId) => {
    activeCategoryFilter = catId;
    renderCategoriesPills();
    renderProductsGrid();
};

window._pdvOnSearch = (val) => {
    pdvSearchQuery = val;
    renderProductsGrid();
};

window._pdvAddToCart = (productId) => {
    const prod = catalogProducts.find(p => p.id === productId);
    if (!prod) return;

    const existingIndex = pdvCart.findIndex(i => i.id === prod.id && !i.isCustom);
    if (existingIndex >= 0) {
        pdvCart[existingIndex].qty += 1;
    } else {
        pdvCart.push({
            id: prod.id,
            name: prod.name,
            price: Number(prod.price),
            qty: 1,
            notes: '',
            destination: prod.categories?.destination || 'bar',
            isCustom: false,
            productObj: prod
        });
    }
    renderCartUI();
};

window._pdvUpdateCartQty = (index, delta) => {
    if (!pdvCart[index]) return;
    pdvCart[index].qty += delta;
    if (pdvCart[index].qty <= 0) {
        pdvCart.splice(index, 1);
    }
    renderCartUI();
};

window._pdvRemoveFromCart = (index) => {
    if (!pdvCart[index]) return;
    pdvCart.splice(index, 1);
    renderCartUI();
};

window._pdvClearCart = () => {
    pdvCart = [];
    pdvDiscountValue = 0;
    pdvCashReceived = 0;
    const discInput = document.getElementById('pdvDiscountInput');
    if (discInput) discInput.value = '0';
    renderCartUI();
};

window._pdvSelectPaymentMethod = (method) => {
    pdvPaymentMethod = method;
    ['pix', 'dinheiro', 'credito', 'debito'].forEach(m => {
        const btn = document.getElementById(`pdvPay_${m}`);
        if (!btn) return;
        if (m === method) {
            btn.className = "py-2 px-1 rounded-xl text-xs font-black border transition text-center bg-emerald-600 text-white border-emerald-600 shadow-sm";
        } else {
            btn.className = "py-2 px-1 rounded-xl text-xs font-bold border transition text-center bg-white text-gray-700 border-gray-200 hover:bg-gray-100";
        }
    });

    const cashBox = document.getElementById('pdvCashCalculatorBox');
    if (cashBox) {
        cashBox.classList.toggle('hidden', method !== 'dinheiro');
    }
    calculateTotals();
};

window._pdvUpdateDiscount = (val) => {
    pdvDiscountValue = parseFloat(val || 0);
    calculateTotals();
};

window._pdvSetDiscountType = (type) => {
    pdvDiscountType = type;
    calculateTotals();
};

window._pdvUpdateCashChange = (val) => {
    pdvCashReceived = parseFloat(val || 0);
    const subtotal = pdvCart.reduce((sum, item) => sum + (item.qty * item.price), 0);
    const discount = pdvDiscountType === 'percent' ? (subtotal * pdvDiscountValue) / 100 : pdvDiscountValue;
    const total = Math.max(0, subtotal - discount);
    updateCashChangeDisplay(total);
};

// ====== ITEM AVULSO MODAL ======
window._pdvOpenItemAvulsoModal = () => {
    const mc = document.getElementById('modalContainer');
    if (!mc) return;

    mc.innerHTML = `
        <div class="modal-overlay" onclick="if(event.target===this) window.closeMod()">
            <div class="modal-box anim-fade max-w-md">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-black text-gray-800 flex items-center gap-2">
                        <i class="fa-solid fa-plus-circle text-amber-500"></i> Adicionar Item Avulso
                    </h3>
                    <button onclick="window.closeMod()" class="text-gray-400 hover:text-gray-600"><i class="fa-solid fa-xmark text-xl"></i></button>
                </div>
                <form id="pdvCustomItemForm" class="space-y-4">
                    <div>
                        <label class="label-sys">Nome do Produto / Serviço *</label>
                        <input type="text" id="customItemName" required class="input-sys" placeholder="Ex: Gelo Saco 5kg, Aluguel Boia...">
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="label-sys">Preço Unitário (R$) *</label>
                            <input type="number" step="0.01" id="customItemPrice" required class="input-sys" placeholder="0,00">
                        </div>
                        <div>
                            <label class="label-sys">Quantidade *</label>
                            <input type="number" id="customItemQty" value="1" min="1" required class="input-sys">
                        </div>
                    </div>
                    <div>
                        <label class="label-sys">Destino do Pedido</label>
                        <select id="customItemDest" class="input-sys">
                            <option value="bar">Bar / Balcão 🍺</option>
                            <option value="cozinha">Cozinha 🍳</option>
                        </select>
                    </div>
                    <button type="submit" class="w-full bg-amber-500 text-white font-black py-3 rounded-xl shadow-lg hover:bg-amber-600 transition uppercase tracking-widest text-sm">
                        ADICIONAR AO CARRINHO
                    </button>
                </form>
            </div>
        </div>
    `;

    document.getElementById('pdvCustomItemForm').onsubmit = (e) => {
        e.preventDefault();
        const name = document.getElementById('customItemName').value.trim();
        const price = parseFloat(document.getElementById('customItemPrice').value || 0);
        const qty = parseInt(document.getElementById('customItemQty').value || 1);
        const dest = document.getElementById('customItemDest').value;

        if (!name || price <= 0) {
            alert('Por favor, informe um nome válido e um preço maior que zero.');
            return;
        }

        pdvCart.push({
            id: 'custom_' + Date.now(),
            name,
            price,
            qty,
            notes: 'Item Avulso',
            destination: dest,
            isCustom: true
        });

        window.closeMod();
        renderCartUI();
    };
};

// ====== SANGRIA & SUPRIMENTO MODALS ======
window._pdvOpenSangriaModal = () => {
    const mc = document.getElementById('modalContainer');
    if (!mc) return;

    mc.innerHTML = `
        <div class="modal-overlay" onclick="if(event.target===this) window.closeMod()">
            <div class="modal-box anim-fade max-w-md">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-black text-rose-700 flex items-center gap-2">
                        <i class="fa-solid fa-hand-holding-dollar"></i> Registar Sangria (Saída)
                    </h3>
                    <button onclick="window.closeMod()" class="text-gray-400 hover:text-gray-600"><i class="fa-solid fa-xmark text-xl"></i></button>
                </div>
                <form id="pdvSangriaForm" class="space-y-4">
                    <div>
                        <label class="label-sys">Valor da Retirada (R$) *</label>
                        <input type="number" step="0.01" id="sangriaValue" required class="input-sys text-rose-600 font-black text-lg" placeholder="0,00">
                    </div>
                    <div>
                        <label class="label-sys">Motivo / Justificativa *</label>
                        <textarea id="sangriaReason" required class="input-sys h-24" placeholder="Ex: Pagamento fornecedor de gelo, sangria de segurança..."></textarea>
                    </div>
                    <button type="submit" class="w-full bg-rose-600 text-white font-black py-3 rounded-xl shadow-lg hover:bg-rose-700 transition uppercase tracking-widest text-sm">
                        REGISTRAR SANGRIA DE CAIXA
                    </button>
                </form>
            </div>
        </div>
    `;

    document.getElementById('pdvSangriaForm').onsubmit = async (e) => {
        e.preventDefault();
        const val = parseFloat(document.getElementById('sangriaValue').value || 0);
        const reason = document.getElementById('sangriaReason').value.trim();

        if (val <= 0 || !reason) {
            alert('Informe um valor válido e a justificativa da sangria.');
            return;
        }

        const sangrias = JSON.parse(localStorage.getItem(STORAGE_SANGRIA_KEY) || '[]');
        const record = {
            id: Date.now(),
            value: val,
            reason,
            timestamp: new Date().toISOString(),
            operator: getCurrentStaff()?.name || 'Operador'
        };
        sangrias.push(record);
        localStorage.setItem(STORAGE_SANGRIA_KEY, JSON.stringify(sangrias));

        try {
            await logAuditAction('PDV_SANGRIA', record);
        } catch(e) {}

        alert(`Sangria de R$ ${val.toFixed(2).replace('.', ',')} registrada com sucesso!`);
        window.closeMod();
    };
};

window._pdvOpenSuprimentoModal = () => {
    const mc = document.getElementById('modalContainer');
    if (!mc) return;

    mc.innerHTML = `
        <div class="modal-overlay" onclick="if(event.target===this) window.closeMod()">
            <div class="modal-box anim-fade max-w-md">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-black text-blue-700 flex items-center gap-2">
                        <i class="fa-solid fa-piggy-bank"></i> Registrar Suprimento (Entrada)
                    </h3>
                    <button onclick="window.closeMod()" class="text-gray-400 hover:text-gray-600"><i class="fa-solid fa-xmark text-xl"></i></button>
                </div>
                <form id="pdvSuprimentoForm" class="space-y-4">
                    <div>
                        <label class="label-sys">Valor do Aporte (R$) *</label>
                        <input type="number" step="0.01" id="suprimentoValue" required class="input-sys text-blue-600 font-black text-lg" placeholder="0,00">
                    </div>
                    <div>
                        <label class="label-sys">Origem / Motivo *</label>
                        <input type="text" id="suprimentoReason" required class="input-sys" placeholder="Ex: Fundo de troco inicial, reforço caixa...">
                    </div>
                    <button type="submit" class="w-full bg-blue-600 text-white font-black py-3 rounded-xl shadow-lg hover:bg-blue-700 transition uppercase tracking-widest text-sm">
                        REGISTRAR SUPRIMENTO
                    </button>
                </form>
            </div>
        </div>
    `;

    document.getElementById('pdvSuprimentoForm').onsubmit = async (e) => {
        e.preventDefault();
        const val = parseFloat(document.getElementById('suprimentoValue').value || 0);
        const reason = document.getElementById('suprimentoReason').value.trim();

        if (val <= 0 || !reason) {
            alert('Informe um valor válido e o motivo do suprimento.');
            return;
        }

        const suprimentos = JSON.parse(localStorage.getItem(STORAGE_SUPRIMENTO_KEY) || '[]');
        const record = {
            id: Date.now(),
            value: val,
            reason,
            timestamp: new Date().toISOString(),
            operator: getCurrentStaff()?.name || 'Operador'
        };
        suprimentos.push(record);
        localStorage.setItem(STORAGE_SUPRIMENTO_KEY, JSON.stringify(suprimentos));

        try {
            await logAuditAction('PDV_SUPRIMENTO', record);
        } catch(e) {}

        alert(`Suprimento de R$ ${val.toFixed(2).replace('.', ',')} registrado com sucesso!`);
        window.closeMod();
    };
};

window._pdvOpenResumoCaixaModal = async () => {
    const mc = document.getElementById('modalContainer');
    if (!mc) return;

    const sangrias = JSON.parse(localStorage.getItem(STORAGE_SANGRIA_KEY) || '[]');
    const suprimentos = JSON.parse(localStorage.getItem(STORAGE_SUPRIMENTO_KEY) || '[]');

    const totalSangrias = sangrias.reduce((s, x) => s + Number(x.value), 0);
    const totalSuprimentos = suprimentos.reduce((s, x) => s + Number(x.value), 0);

    // Fetch today's PDV sales from DB
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();

    const { data: pdvOrders } = await supabase.from('orders')
        .select('*')
        .eq('location_type', 'balcao')
        .gte('created_at', startOfDay)
        .neq('status', 'cancelado');

    let totalPix = 0, totalDinheiro = 0, totalCredito = 0, totalDebito = 0;
    (pdvOrders || []).forEach(o => {
        const val = Number(o.total);
        if (o.notes?.includes('Dinheiro')) totalDinheiro += val;
        else if (o.notes?.includes('Crédito')) totalCredito += val;
        else if (o.notes?.includes('Débito')) totalDebito += val;
        else totalPix += val;
    });

    const expectedCashInDrawer = Math.max(0, totalDinheiro + totalSuprimentos - totalSangrias);

    mc.innerHTML = `
        <div class="modal-overlay" onclick="if(event.target===this) window.closeMod()">
            <div class="modal-box anim-fade max-w-lg">
                <div class="flex justify-between items-center mb-4 pb-3 border-b border-gray-100">
                    <div>
                        <h3 class="text-xl font-black text-gray-800 flex items-center gap-2">
                            <i class="fa-solid fa-chart-line text-emerald-600"></i> Resumo de Caixa (Balcão)
                        </h3>
                        <p class="text-xs font-bold text-gray-400">Indicadores e apuração da gaveta no dia de hoje</p>
                    </div>
                    <button onclick="window.closeMod()" class="text-gray-400 hover:text-gray-600"><i class="fa-solid fa-xmark text-xl"></i></button>
                </div>

                <div class="space-y-4 text-xs font-bold">
                    <div class="grid grid-cols-2 gap-3">
                        <div class="bg-emerald-50 p-3 rounded-2xl border border-emerald-100">
                            <span class="text-[10px] text-emerald-700 uppercase tracking-widest block">Vendas PIX</span>
                            <span class="text-lg font-black text-emerald-900">R$ ${totalPix.toFixed(2).replace('.', ',')}</span>
                        </div>
                        <div class="bg-amber-50 p-3 rounded-2xl border border-amber-100">
                            <span class="text-[10px] text-amber-800 uppercase tracking-widest block">Vendas Dinheiro</span>
                            <span class="text-lg font-black text-amber-900">R$ ${totalDinheiro.toFixed(2).replace('.', ',')}</span>
                        </div>
                        <div class="bg-blue-50 p-3 rounded-2xl border border-blue-100">
                            <span class="text-[10px] text-blue-700 uppercase tracking-widest block">Vendas Cartão Crédito</span>
                            <span class="text-lg font-black text-blue-900">R$ ${totalCredito.toFixed(2).replace('.', ',')}</span>
                        </div>
                        <div class="bg-purple-50 p-3 rounded-2xl border border-purple-100">
                            <span class="text-[10px] text-purple-700 uppercase tracking-widest block">Vendas Cartão Débito</span>
                            <span class="text-lg font-black text-purple-900">R$ ${totalDebito.toFixed(2).replace('.', ',')}</span>
                        </div>
                    </div>

                    <div class="bg-gray-50 p-4 rounded-2xl border border-gray-200 space-y-2">
                        <div class="flex justify-between text-blue-700">
                            <span>(+) Suprimentos (Aportes de Troco)</span>
                            <span>R$ ${totalSuprimentos.toFixed(2).replace('.', ',')}</span>
                        </div>
                        <div class="flex justify-between text-rose-600">
                            <span>(-) Sangrias (Retiradas)</span>
                            <span>R$ ${totalSangrias.toFixed(2).replace('.', ',')}</span>
                        </div>
                        <div class="pt-2 border-t border-gray-200 flex justify-between items-center text-sm font-black text-gray-900">
                            <span>DINHEIRO ESPERADO NA GAVETA</span>
                            <span class="text-emerald-700 text-xl font-black">R$ ${expectedCashInDrawer.toFixed(2).replace('.', ',')}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
};

// ====== FINALIZATION & PRINTING ======
window._pdvFinalizeSale = async () => {
    if (pdvCart.length === 0) {
        alert('Adicione produtos ao carrinho antes de finalizar a venda.');
        return;
    }

    const customerName = document.getElementById('pdvCustomerName')?.value?.trim();
    const customerPhone = document.getElementById('pdvCustomerPhone')?.value?.trim() || null;

    if (!customerName) {
        alert('Por favor, informe o Nome do Cliente para identificar a venda no recibo.');
        document.getElementById('pdvCustomerName')?.focus();
        return;
    }

    const subtotal = pdvCart.reduce((sum, item) => sum + (item.qty * item.price), 0);
    let discount = pdvDiscountType === 'percent' ? (subtotal * pdvDiscountValue) / 100 : pdvDiscountValue;
    discount = Math.min(subtotal, Math.max(0, discount));
    const total = Math.max(0, subtotal - discount);

    const payMethodLabels = { pix: 'PIX ⚡', dinheiro: 'Dinheiro 💵', credito: 'Cartão Crédito 💳', debito: 'Cartão Débito 💳' };
    const payLabel = payMethodLabels[pdvPaymentMethod] || 'PIX';

    const btn = document.getElementById('pdvBtnFinalize');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> REGISTRANDO VENDEDOR...';
    }

    try {
        const staff = getCurrentStaff();

        // 1. Group cart items by destination
        const cartByDest = { 'cozinha': [], 'bar': [] };
        pdvCart.forEach(c => {
            const d = c.destination === 'cozinha' ? 'cozinha' : 'bar';
            cartByDest[d].push(c);
        });

        const createdOrders = [];

        for (const dest of ['cozinha', 'bar']) {
            const destItems = cartByDest[dest];
            if (destItems.length === 0) continue;

            const destTotal = destItems.reduce((sum, c) => sum + (c.qty * c.price), 0);

            const { data: order, error: orderErr } = await supabase
                .from('orders')
                .insert({
                    location_type: 'balcao',
                    location_id: 'BALCÃO',
                    staff_id: staff?.id || null,
                    total: destTotal,
                    notes: `PDV Balcão • PG: ${payLabel} ${discount > 0 ? '• Desc: R$ ' + discount.toFixed(2) : ''}`,
                    customer_name: customerName,
                    customer_phone: customerPhone,
                    status: 'entregue',
                    payment_status: 'pago',
                    destination: dest
                })
                .select()
                .single();

            if (orderErr) throw orderErr;

            createdOrders.push(order);

            // Insert Items
            const itemsToInsert = destItems.map(c => ({
                order_id: order.id,
                product_id: c.isCustom ? null : c.id,
                product_name: c.name,
                quantity: c.qty,
                unit_price: c.price,
                destination: dest,
                status: 'entregue',
                notes: c.notes || (c.isCustom ? 'Item Avulso' : null)
            }));

            const { error: itemsErr } = await supabase.from('order_items').insert(itemsToInsert);
            if (itemsErr) throw itemsErr;

            // Deduct stock for catalog items
            for (const c of destItems) {
                if (!c.isCustom && c.productObj?.is_stock_controlled) {
                    try {
                        await supabase.rpc('deduct_stock', { p_product_id: c.id, p_qty: c.qty });
                    } catch (e) {
                        const newQty = Math.max(0, Number(c.productObj.stock_qty) - c.qty);
                        await supabase.from('products').update({ stock_qty: newQty }).eq('id', c.id);
                    }
                }
            }
        }

        // 2. Audit log
        await logAuditAction('PDV_SALE_COMPLETED', {
            total_amount: total,
            customer_name: customerName,
            payment_method: pdvPaymentMethod,
            discount: discount,
            items_count: pdvCart.reduce((s, i) => s + i.qty, 0)
        });

        // 3. Trigger thermal receipt print to Elgin server
        const printHtml = generatePDVReceiptHTML(customerName, pdvCart, total, subtotal, discount, payLabel, staff?.name || 'Operador');
        try {
            await fetch('http://localhost:3001/print_html', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ html: printHtml })
            });
        } catch (printErr) {
            console.warn('Servidor de impressão Elgin indisponível:', printErr);
        }

        // 4. Reset & Toast
        const toast = document.getElementById('pdvToast');
        if (toast) {
            toast.className = "bg-emerald-600 text-white font-bold p-4 rounded-2xl shadow-xl flex items-center justify-between text-sm anim-fade mb-4";
            toast.innerHTML = `<div class="flex items-center gap-3"><i class="fa-solid fa-circle-check text-2xl"></i> Venda encerrada com sucesso! Recibo impresso.</div>`;
            setTimeout(() => toast.classList.add('hidden'), 4000);
        }

        pdvCart = [];
        pdvDiscountValue = 0;
        pdvCashReceived = 0;
        document.getElementById('pdvCustomerName').value = '';
        document.getElementById('pdvCustomerPhone').value = '';
        document.getElementById('pdvDiscountInput').value = '0';
        renderCartUI();
        await loadPDVData();

    } catch (e) {
        console.error('Erro ao finalizar venda no PDV:', e);
        alert('Falha ao registrar venda: ' + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-check-circle text-lg"></i> FINALIZAR E IMPRIMIR';
        }
    }
};

function generatePDVReceiptHTML(customerName, items, total, subtotal, discount, payLabel, operatorName) {
    const nowStr = new Date().toLocaleString('pt-BR', { timeZone: 'America/Porto_Velho', dateStyle: 'short', timeStyle: 'short' });
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                * { box-sizing: border-box; }
                body { font-family: 'Inter', monospace; width: 576px; margin: 0; padding: 12px 16px 30px 16px; color: black; background: #ffffff; font-size: 18px; line-height: 1.35; overflow: hidden; }
                .header { text-align: center; border-bottom: 3px solid black; padding-bottom: 10px; margin-bottom: 12px; }
                .title { font-size: 26px; font-weight: 900; text-transform: uppercase; }
                .sub { font-size: 16px; font-weight: 800; }
                .item-row { display: flex; justify-content: space-between; border-bottom: 1px dashed #666; padding: 6px 0; font-size: 17px; }
                .tot-box { border: 3px solid black; padding: 10px; margin-top: 14px; font-size: 22px; font-weight: 900; display: flex; justify-content: space-between; border-radius: 8px; }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="title">Balneário Rio Preto</div>
                <div class="sub">COMPROVANTE DE VENDA • BALCÃO</div>
                <div style="font-size: 14px; margin-top: 4px;">Data/Hora: ${nowStr} • Op: ${operatorName}</div>
                <div style="font-size: 16px; font-weight: 900; margin-top: 4px;">CLIENTE: ${customerName.toUpperCase()}</div>
            </div>

            <div style="font-weight: 900; margin-bottom: 6px; font-size: 16px;">ITENS VENDIDOS:</div>
            ${items.map(i => `
                <div class="item-row">
                    <span>${i.qty}x ${i.name}</span>
                    <span style="font-weight: 900;">R$ ${(i.qty * i.price).toFixed(2).replace('.', ',')}</span>
                </div>
            `).join('')}

            ${discount > 0 ? `
                <div class="item-row" style="color: #444;">
                    <span>Desconto Concedido</span>
                    <span>- R$ ${discount.toFixed(2).replace('.', ',')}</span>
                </div>
            ` : ''}

            <div class="tot-box">
                <span>TOTAL PAGO (${payLabel})</span>
                <span>R$ ${total.toFixed(2).replace('.', ',')}</span>
            </div>

            <div style="text-align: center; margin-top: 20px; font-size: 14px; font-weight: 800;">
                Obrigado pela preferência! Volte Sempre 🍃
            </div>
        </body>
        </html>
    `;
}
