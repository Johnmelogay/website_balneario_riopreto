import { supabase } from './scripts.js';
import { getCurrentStaff } from './sistema_auth.js';
import { logAuditAction } from './audit_logger.js';

// State
let products = [];
let categories = [];
let cart = [];
let activeCategory = 'all';
let searchQuery = '';

// Main Render Function
export async function renderPDV(container) {
    container.innerHTML = `
        <div class="h-full flex flex-col relative bg-stone-50 pb-20 md:pb-0">
            <!-- Header Mobile -->
            <div class="bg-white p-4 shadow-sm z-10 flex flex-col gap-3">
                <div class="flex items-center justify-between">
                    <h2 class="text-xl font-black text-gray-800">PDV Balcão</h2>
                    <button onclick="window.addCustomItem()" class="bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg text-sm font-bold active:scale-95 transition">
                        + Item Customizado
                    </button>
                </div>
                <!-- Search -->
                <div class="relative">
                    <i class="fa-solid fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
                    <input type="text" id="pdvSearch" placeholder="Buscar produtos..." 
                        class="w-full pl-10 pr-4 py-2.5 bg-gray-100 border-transparent rounded-xl outline-none focus:border-emerald-500 focus:bg-white border-2 transition-all">
                </div>
                <!-- Categories (Horizontal Scroll) -->
                <div class="flex overflow-x-auto pb-2 gap-2 snap-x hide-scrollbar" id="pdvCategories">
                    <!-- Loaded dynamically -->
                </div>
            </div>

            <!-- Products Grid -->
            <div class="flex-1 overflow-y-auto p-4" id="pdvProducts">
                <div class="flex justify-center mt-10"><i class="fa-solid fa-spinner fa-spin text-3xl text-gray-300"></i></div>
            </div>

            <!-- Floating Cart Bottom Bar (Mobile) -->
            <div class="fixed bottom-0 left-0 right-0 md:absolute md:bottom-auto md:top-0 md:left-auto md:w-[400px] md:h-full md:border-l md:border-gray-200 z-40 bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.1)] md:shadow-none transition-transform duration-300 transform translate-y-full md:translate-y-0" id="pdvCartSheet">
                
                <!-- Bottom Sheet Handle (Mobile Only) -->
                <div class="w-full flex justify-center py-2 md:hidden" onclick="window.togglePdvCart()">
                    <div class="w-12 h-1.5 bg-gray-300 rounded-full"></div>
                </div>

                <div class="h-full flex flex-col px-4 pb-4 pt-0 md:pt-4 max-h-[85vh] md:max-h-full">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-lg font-black text-gray-800">Carrinho</h3>
                        <button class="md:hidden text-gray-400" onclick="window.togglePdvCart()"><i class="fa-solid fa-times text-xl"></i></button>
                    </div>

                    <!-- Cart Items -->
                    <div class="flex-1 overflow-y-auto space-y-3 pr-2" id="pdvCartItems">
                        <!-- Loaded dynamically -->
                    </div>

                    <!-- Checkout Section -->
                    <div class="mt-4 pt-4 border-t border-gray-100">
                        <div class="flex justify-between items-center mb-3 text-sm font-bold text-gray-500">
                            <span>Total</span>
                            <span class="text-2xl font-black text-emerald-600" id="pdvCartTotal">R$ 0,00</span>
                        </div>

                        <select id="pdvDestination" class="w-full p-3 rounded-xl bg-gray-100 border border-gray-200 mb-3 font-bold text-gray-700 outline-none focus:border-emerald-500">
                            <option value="balcao">🏪 Venda Balcão (Pagar Agora)</option>
                            <optgroup label="Mesas">
                                ${Array.from({length: 15}, (_, i) => '<option value="mesa-'+(i+1)+'">🪑 Mesa '+(i+1)+'</option>').join('')}
                            </optgroup>
                            <optgroup label="Chalés">
                                ${Array.from({length: 10}, (_, i) => '<option value="chale-'+(i+1)+'">🏡 Chalé '+(i+1)+'</option>').join('')}
                            </optgroup>
                        </select>

                        <button id="btnCheckout" onclick="window.checkoutPDV()" class="w-full bg-emerald-600 text-white font-black text-lg py-4 rounded-xl shadow-lg shadow-emerald-600/30 active:scale-95 transition disabled:opacity-50 disabled:active:scale-100">
                            FINALIZAR VENDA
                        </button>
                    </div>
                </div>
            </div>

            <!-- Sticky Cart Summary Bar (When Sheet is closed on mobile) -->
            <div id="pdvCartSummary" onclick="window.togglePdvCart()" class="md:hidden fixed bottom-4 left-4 right-4 bg-emerald-600 text-white p-4 rounded-2xl shadow-xl flex justify-between items-center z-30 active:scale-95 transition cursor-pointer">
                <div class="flex items-center gap-3">
                    <div class="bg-emerald-800/50 w-10 h-10 rounded-full flex items-center justify-center font-black">
                        <i class="fa-solid fa-shopping-bag"></i>
                    </div>
                    <div>
                        <p class="text-xs font-bold text-emerald-200 uppercase tracking-wider">Carrinho</p>
                        <p class="font-black" id="pdvSummaryCount">0 itens</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="font-black text-xl" id="pdvSummaryTotal">R$ 0,00</p>
                </div>
            </div>

            <!-- MODAL DE PAGAMENTO (BALCÃO) -->
            <div id="pdvPaymentModal" class="fixed inset-0 bg-black/60 z-50 hidden flex-col items-center justify-end md:justify-center p-4">
                <div class="bg-white w-full max-w-md rounded-t-3xl md:rounded-3xl p-6 shadow-2xl animate-slide-up relative">
                    <button onclick="window.closePaymentModal()" class="absolute top-4 right-4 w-8 h-8 bg-gray-100 text-gray-500 rounded-full flex items-center justify-center hover:bg-gray-200">
                        <i class="fa-solid fa-times"></i>
                    </button>
                    
                    <h2 class="text-2xl font-black text-gray-800 mb-1">Pagamento</h2>
                    <p class="text-sm font-bold text-gray-500 mb-6">Total a receber: <span class="text-emerald-600 text-lg" id="payTotalAmount">R$ 0,00</span></p>

                    <div class="grid grid-cols-3 gap-2 mb-6">
                        <button onclick="window.selectPayment('dinheiro')" id="btnPayDinheiro" class="pay-method-btn border-2 border-gray-200 rounded-xl p-3 flex flex-col items-center gap-2 active:scale-95 transition text-gray-600 font-bold hover:border-emerald-500">
                            <i class="fa-solid fa-money-bill-wave text-2xl"></i>
                            <span class="text-xs">Dinheiro</span>
                        </button>
                        <button onclick="window.selectPayment('pix')" id="btnPayPix" class="pay-method-btn border-2 border-emerald-500 bg-emerald-50 text-emerald-700 rounded-xl p-3 flex flex-col items-center gap-2 active:scale-95 transition font-bold">
                            <i class="fa-brands fa-pix text-2xl"></i>
                            <span class="text-xs">PIX</span>
                        </button>
                        <button onclick="window.selectPayment('cartao')" id="btnPayCartao" class="pay-method-btn border-2 border-gray-200 rounded-xl p-3 flex flex-col items-center gap-2 active:scale-95 transition text-gray-600 font-bold hover:border-emerald-500">
                            <i class="fa-solid fa-credit-card text-2xl"></i>
                            <span class="text-xs">Cartão</span>
                        </button>
                    </div>

                    <!-- Dinheiro Input -->
                    <div id="dinheiroSection" class="hidden mb-6">
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Valor Recebido</label>
                        <div class="relative">
                            <span class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">R$</span>
                            <input type="number" id="dinheiroReceived" placeholder="0.00" step="0.01" class="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-lg font-black text-gray-800 outline-none focus:border-emerald-500">
                        </div>
                        <div id="trocoDisplay" class="mt-2 text-sm font-bold text-gray-500 hidden">Troco: <span class="text-emerald-600" id="trocoAmount">R$ 0,00</span></div>
                    </div>

                    <!-- Attachment Upload -->
                    <div id="attachmentSection" class="mb-6">
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Comprovante (Canhoto/PIX)</label>
                        <label class="border-2 border-dashed border-emerald-200 bg-emerald-50 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-emerald-100 transition relative">
                            <i class="fa-solid fa-camera text-2xl text-emerald-600"></i>
                            <span class="text-sm font-bold text-emerald-700 text-center">Tirar Foto ou Escolher Arquivo</span>
                            <input type="file" id="paymentAttachment" accept="image/*" capture="environment" class="hidden">
                            <!-- Preview Image -->
                            <img id="attachmentPreview" class="absolute inset-0 w-full h-full object-cover rounded-xl hidden" />
                            <div id="previewOverlay" class="absolute inset-0 bg-black/50 rounded-xl hidden flex items-center justify-center text-white font-bold opacity-0 hover:opacity-100 transition">Trocar Imagem</div>
                        </label>
                    </div>

                    <button id="btnConfirmPayment" onclick="window.confirmPayment()" class="w-full bg-emerald-600 text-white font-black text-lg py-4 rounded-xl shadow-lg shadow-emerald-600/30 active:scale-95 transition disabled:opacity-50">
                        CONFIRMAR RECEBIMENTO
                    </button>
                </div>
            </div>
            
            <style>
                .hide-scrollbar::-webkit-scrollbar { display: none; }
                .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                .snap-x { scroll-snap-type: x mandatory; }
                .snap-x > button { scroll-snap-align: start; }
            </style>
        </div>
    `;

    document.getElementById('pdvSearch').addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        renderProducts();
    });

    document.getElementById('dinheiroReceived').addEventListener('input', window.calculateTroco);
    document.getElementById('paymentAttachment').addEventListener('change', window.handleAttachmentPreview);

    await loadData();
    updateCartUI();
}

// Data Fetching
async function loadData() {
    // Fetch Categories
    const { data: cats } = await supabase.from('categories').select('*').eq('is_active', true).order('sort_order');
    categories = cats || [];

    // Fetch Products
    const { data: prods } = await supabase.from('products').select('*, categories(name, destination)').eq('is_active', true).order('name');
    products = prods || [];

    renderCategories();
    renderProducts();
}

function renderCategories() {
    const container = document.getElementById('pdvCategories');
    let html = `<button onclick="window.selectPdvCategory('all')" class="cat-tab ${activeCategory === 'all' ? 'bg-emerald-600 text-white' : 'bg-white text-gray-500'} px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm whitespace-nowrap active:scale-95 transition">Todos</button>`;
    
    categories.forEach(c => {
        const isActive = activeCategory === c.id;
        html += `<button onclick="window.selectPdvCategory('${c.id}')" class="cat-tab ${isActive ? 'bg-emerald-600 text-white' : 'bg-white text-gray-500 border border-gray-200'} px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm whitespace-nowrap active:scale-95 transition">${c.name}</button>`;
    });
    container.innerHTML = html;
}

window.selectPdvCategory = (id) => {
    activeCategory = id;
    renderCategories();
    renderProducts();
};

function renderProducts() {
    const container = document.getElementById('pdvProducts');
    
    let filtered = products;
    if (activeCategory !== 'all') filtered = filtered.filter(p => p.category_id === activeCategory);
    if (searchQuery) filtered = filtered.filter(p => p.name.toLowerCase().includes(searchQuery));

    if (filtered.length === 0) {
        container.innerHTML = '<div class="text-center py-20 text-gray-400 font-bold"><i class="fa-solid fa-box-open text-4xl mb-4"></i><br>Nenhum produto encontrado.</div>';
        return;
    }

    container.innerHTML = `<div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pb-32 md:pb-0">${filtered.map(p => {
        const lowStock = p.is_stock_controlled && p.stock_qty <= p.min_stock;
        const outOfStock = p.is_stock_controlled && p.stock_qty <= 0;
        
        return `
            <div onclick="${outOfStock ? '' : "window.addPdvCart('" + p.id + "')"}" class="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 flex flex-col h-full relative overflow-hidden active:scale-[0.98] transition ${outOfStock ? 'opacity-50 grayscale cursor-not-allowed' : 'cursor-pointer'}">
                ${outOfStock ? '<div class="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full z-10">ESGOTADO</div>' : ''}
                ${lowStock && !outOfStock ? '<div class="absolute top-2 right-2 bg-amber-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full z-10">BAIXO</div>' : ''}
                
                <div class="w-full h-24 bg-gray-50 rounded-xl mb-3 flex items-center justify-center text-3xl">
                    ${p.categories?.destination === 'bar' ? '🍺' : '🍳'}
                </div>
                <h3 class="font-bold text-gray-800 text-sm mb-1 line-clamp-2">${p.name}</h3>
                <div class="mt-auto pt-2 flex items-center justify-between">
                    <p class="font-black text-emerald-600 text-lg">R$ ${Number(p.price).toFixed(2).replace('.', ',')}</p>
                    <div class="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                        <i class="fa-solid fa-plus"></i>
                    </div>
                </div>
            </div>
        `;
    }).join('')}</div>`;
}

// ====== CART LOGIC ======
window.addPdvCart = (id) => {
    const p = products.find(x => x.id === id);
    if(!p) return;
    const ex = cart.findIndex(x => x.product.id === id && !x.is_custom);
    if(ex > -1) cart[ex].qty++;
    else cart.push({ product: p, qty: 1, is_custom: false, id: Date.now() });
    updateCartUI();
};

window.addCustomItem = () => {
    const name = prompt("Nome do Item Customizado (Ex: 25min de sinuca):");
    if(!name) return;
    const priceStr = prompt("Valor Unitário (Use ponto para centavos. Ex: 10.50):");
    const price = parseFloat(priceStr);
    if(!price || isNaN(price)) { alert("Valor inválido."); return; }
    
    cart.push({
        id: Date.now(),
        product: { id: null, name: name, price: price, categories: { destination: 'balcao' }, is_stock_controlled: false },
        qty: 1,
        is_custom: true
    });
    updateCartUI();
};

window.removePdvCart = (id) => {
    const idx = cart.findIndex(c => c.id === id);
    if(idx === -1) return;
    if(cart[idx].qty > 1) cart[idx].qty--;
    else cart.splice(idx, 1);
    updateCartUI();
};

window.addQtyPdvCart = (id) => {
    const idx = cart.findIndex(c => c.id === id);
    if(idx > -1) cart[idx].qty++;
    updateCartUI();
};

window.deletePdvCart = (id) => {
    cart = cart.filter(c => c.id !== id);
    updateCartUI();
};

function updateCartUI() {
    const totalItems = cart.reduce((s, c) => s + c.qty, 0);
    const totalVal = cart.reduce((s, c) => s + (c.qty * Number(c.product.price)), 0);
    const valStr = 'R$ ' + totalVal.toFixed(2).replace('.', ',');

    // Summary Bar (Mobile)
    const summary = document.getElementById('pdvCartSummary');
    if(totalItems > 0) {
        summary.classList.remove('hidden');
        summary.classList.add('flex');
    } else {
        summary.classList.add('hidden');
        summary.classList.remove('flex');
    }
    document.getElementById('pdvSummaryCount').textContent = totalItems + (totalItems === 1 ? ' item' : ' itens');
    document.getElementById('pdvSummaryTotal').textContent = valStr;
    
    // Bottom Sheet Total
    document.getElementById('pdvCartTotal').textContent = valStr;
    document.getElementById('payTotalAmount').textContent = valStr; // Modal total

    const btn = document.getElementById('btnCheckout');
    btn.disabled = cart.length === 0;

    renderCartItems();
}

function renderCartItems() {
    const container = document.getElementById('pdvCartItems');
    if(cart.length === 0) {
        container.innerHTML = '<div class="text-center py-10 text-gray-400 font-bold">Carrinho vazio</div>';
        return;
    }
    
    container.innerHTML = cart.map(c => `
        <div class="bg-gray-50 rounded-xl p-3 border border-gray-100 flex flex-col gap-2">
            <div class="flex justify-between items-start">
                <div class="flex-1 pr-2">
                    <p class="font-bold text-gray-800 text-sm leading-tight">${c.product.name} ${c.is_custom ? '<span class="text-[10px] bg-amber-100 text-amber-700 px-1 rounded ml-1">Custom</span>' : ''}</p>
                    <p class="text-xs text-gray-500 font-bold mt-0.5">R$ ${Number(c.product.price).toFixed(2).replace('.', ',')}</p>
                </div>
                <button onclick="window.deletePdvCart(${c.id})" class="text-red-400 hover:text-red-600"><i class="fa-solid fa-trash-can"></i></button>
            </div>
            <div class="flex items-center justify-between mt-1">
                <div class="flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <button onclick="window.removePdvCart(${c.id})" class="w-8 h-8 flex items-center justify-center text-gray-600 active:bg-gray-100">-</button>
                    <span class="w-8 text-center font-black text-sm flex items-center justify-center">${c.qty}</span>
                    <button onclick="window.addQtyPdvCart(${c.id})" class="w-8 h-8 flex items-center justify-center text-emerald-600 active:bg-emerald-50">+</button>
                </div>
                <p class="font-black text-gray-800">R$ ${(c.qty * Number(c.product.price)).toFixed(2).replace('.', ',')}</p>
            </div>
        </div>
    `).join('');
}

window.togglePdvCart = () => {
    const sheet = document.getElementById('pdvCartSheet');
    if(sheet.classList.contains('translate-y-full')) {
        sheet.classList.remove('translate-y-full'); // Open
    } else {
        sheet.classList.add('translate-y-full'); // Close
    }
};

// ====== CHECKOUT LOGIC ======
let paymentMethod = '';
let currentReceiptFile = null;

window.checkoutPDV = () => {
    if(cart.length === 0) return;
    const dest = document.getElementById('pdvDestination').value;
    
    if(dest === 'balcao') {
        openPaymentModal();
    } else {
        submitOrder(dest, 'aberto', 'pendente', null, null);
    }
};

function openPaymentModal() {
    document.getElementById('pdvPaymentModal').classList.remove('hidden');
    document.getElementById('pdvPaymentModal').classList.add('flex');
    window.selectPayment('pix'); // default
    document.getElementById('dinheiroReceived').value = '';
    document.getElementById('trocoDisplay').classList.add('hidden');
    currentReceiptFile = null;
    document.getElementById('paymentAttachment').value = '';
    document.getElementById('attachmentPreview').classList.add('hidden');
    document.getElementById('previewOverlay').classList.add('hidden');
    document.getElementById('attachmentPreview').src = '';
}

window.closePaymentModal = () => {
    document.getElementById('pdvPaymentModal').classList.add('hidden');
    document.getElementById('pdvPaymentModal').classList.remove('flex');
};

window.selectPayment = (method) => {
    paymentMethod = method;
    document.querySelectorAll('.pay-method-btn').forEach(btn => {
        btn.classList.remove('border-emerald-500', 'bg-emerald-50', 'text-emerald-700');
        btn.classList.add('border-gray-200', 'text-gray-600');
    });
    const active = document.getElementById('btnPay' + method.charAt(0).toUpperCase() + method.slice(1));
    active.classList.add('border-emerald-500', 'bg-emerald-50', 'text-emerald-700');
    active.classList.remove('border-gray-200', 'text-gray-600');

    if(method === 'dinheiro') {
        document.getElementById('dinheiroSection').classList.remove('hidden');
        document.getElementById('attachmentSection').classList.add('hidden');
    } else {
        document.getElementById('dinheiroSection').classList.add('hidden');
        document.getElementById('attachmentSection').classList.remove('hidden');
    }
    validatePaymentForm();
};

window.calculateTroco = () => {
    const total = cart.reduce((s, c) => s + (c.qty * Number(c.product.price)), 0);
    const received = parseFloat(document.getElementById('dinheiroReceived').value || 0);
    const troco = received - total;
    
    const display = document.getElementById('trocoDisplay');
    if(received > 0) {
        display.classList.remove('hidden');
        const span = document.getElementById('trocoAmount');
        if(troco < 0) {
            span.textContent = 'Faltando R$ ' + Math.abs(troco).toFixed(2).replace('.', ',');
            span.className = 'text-red-500';
        } else {
            span.textContent = 'R$ ' + troco.toFixed(2).replace('.', ',');
            span.className = 'text-emerald-600';
        }
    } else {
        display.classList.add('hidden');
    }
    validatePaymentForm();
};

window.handleAttachmentPreview = (e) => {
    const file = e.target.files[0];
    if(!file) return;
    currentReceiptFile = file;
    
    const reader = new FileReader();
    reader.onload = (ev) => {
        const img = document.getElementById('attachmentPreview');
        img.src = ev.target.result;
        img.classList.remove('hidden');
        document.getElementById('previewOverlay').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
    validatePaymentForm();
};

function validatePaymentForm() {
    const btn = document.getElementById('btnConfirmPayment');
    const total = cart.reduce((s, c) => s + (c.qty * Number(c.product.price)), 0);
    
    if(paymentMethod === 'dinheiro') {
        const received = parseFloat(document.getElementById('dinheiroReceived').value || 0);
        btn.disabled = received < total;
    } else {
        btn.disabled = !currentReceiptFile; // Must have photo for pix/cartao
    }
}

window.confirmPayment = async () => {
    const btn = document.getElementById('btnConfirmPayment');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processando...';
    
    try {
        let receiptUrl = null;
        if(paymentMethod !== 'dinheiro' && currentReceiptFile) {
            const ext = currentReceiptFile.name.split('.').pop();
            const fileName = `receipt_${Date.now()}.${ext}`;
            
            const { error } = await supabase.storage
                .from('receipts')
                .upload(fileName, currentReceiptFile);
                
            if(error) throw error;
            
            const { data: publicUrl } = supabase.storage.from('receipts').getPublicUrl(fileName);
            receiptUrl = publicUrl.publicUrl;
        }
        
        await submitOrder('balcao', 'pago', 'pendente', paymentMethod, receiptUrl);
        window.closePaymentModal();
        
    } catch (e) {
        alert("Erro ao processar pagamento: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'CONFIRMAR RECEBIMENTO';
    }
};

async function submitOrder(destination, paymentStatus, orderStatus, method, receiptUrl) {
    const staff = getCurrentStaff();
    const btn = document.getElementById('btnCheckout');
    btn.disabled = true;
    btn.innerHTML = 'Enviando...';
    
    try {
        const total = cart.reduce((s, c) => s + (c.qty * Number(c.product.price)), 0);
        
        // 1. Create Order
        const { data: order, error: errO } = await supabase.from('orders').insert({
            location_type: destination.split('-')[0], // balcao, mesa, chale
            location_id: destination.split('-')[1] || destination, 
            staff_id: staff.id,
            total: total,
            status: orderStatus,
            payment_status: paymentStatus,
            payment_method: method,
            receipt_url: receiptUrl,
            destination: 'pdv' // mixed cart origin
        }).select().single();
        
        if(errO) throw errO;
        
        // 2. Insert Items
        const items = cart.map(c => ({
            order_id: order.id,
            product_id: c.product.id,
            product_name: c.product.name,
            quantity: c.qty,
            unit_price: Number(c.product.price),
            destination: c.product.categories?.destination || 'balcao',
            status: orderStatus
        }));
        
        const { error: errI } = await supabase.from('order_items').insert(items);
        if(errI) throw errI;
        
        // 3. Stock update for non-custom items
        for(let c of cart) {
            if(!c.is_custom && c.product.is_stock_controlled) {
                const newQty = Math.max(0, Number(c.product.stock_qty) - c.qty);
                await supabase.from('products').update({stock_qty: newQty}).eq('id', c.product.id);
                await supabase.from('stock_movements').insert({
                    product_id: c.product.id,
                    type: 'saida',
                    quantity: c.qty,
                    previous_qty: c.product.stock_qty,
                    new_qty: newQty,
                    reason: `PDV - Pedido #${order.order_number}`,
                    order_id: order.id,
                    staff_id: staff.id
                });
            }
        }
        
        // Audit Log
        try {
            await logAuditAction('PAYMENT_CLOSED', {
                order_number: order.order_number,
                total_amount: total,
                payment_method: method,
                payment_status: paymentStatus,
                items_count: cart.reduce((s, c) => s + c.qty, 0)
            }, { type: destination.split('-')[0], id: destination.split('-')[1] || destination });
        } catch(e) {}

        alert("Pedido Finalizado com Sucesso!");
        
        // Reset
        cart = [];
        const sheet = document.getElementById('pdvCartSheet');
        if(!sheet.classList.contains('translate-y-full')) {
            sheet.classList.add('translate-y-full');
        }
        updateCartUI();
        await loadData(); // refresh stock
        
    } catch(e) {
        alert("Erro ao criar pedido: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'FINALIZAR VENDA';
    }
}
