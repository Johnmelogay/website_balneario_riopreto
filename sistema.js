/**
 * Sistema Admin - Balneário Rio Preto
 * Routing and Core Logic
 */
import { supabase } from './scripts.js';
import { loginStaff, getCurrentStaff, logoutStaff, ROLE_LABELS, ROLE_COLORS, ALLOWED_SISTEMA_ROLES } from './sistema_auth.js';

// ====== STATE ======
let currentPin = '';
let activeModule = 'dashboard';

// ====== APP INIT ======
document.addEventListener('DOMContentLoaded', () => {
    setInterval(updateClock, 1000);
    updateClock();
    
    // Set date
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('todayDate').textContent = new Date().toLocaleDateString('pt-BR', options);

    const staff = getCurrentStaff();
    if (staff) {
        initDashboard(staff);
    }
});

// ====== TIME ======
function updateClock() {
    const el = document.getElementById('clockDisplay');
    if (el) el.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ====== PIN AUTENTICACAO ======
window.pinInput = async (digit) => {
    if (currentPin.length >= 4) return;
    currentPin += digit;
    updatePinDots();

    if (currentPin.length === 4) {
        const result = await loginStaff(currentPin);
        if (result.success && ALLOWED_SISTEMA_ROLES.includes(result.user.role)) {
            initDashboard(result.user);
        } else {
            showLoginError();
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

function showLoginError() {
    logoutStaff(); // Prevent invalid roles from sticking
    document.getElementById('loginError').classList.remove('hidden');
    setTimeout(() => {
        currentPin = '';
        updatePinDots();
        document.getElementById('loginError').classList.add('hidden');
    }, 1500);
}

window.doLogout = () => {
    logoutStaff();
    window.location.reload();
};

// ====== INIT DASHBOARD ======
function initDashboard(staff) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainLayout').classList.remove('hidden');
    
    // Populate Sidebar Staff Info
    document.getElementById('staffDisplayName').textContent = staff.name;
    document.getElementById('staffDisplayRole').textContent = ROLE_LABELS[staff.role] || staff.role;
    document.getElementById('staffAvatar').textContent = staff.name.charAt(0).toUpperCase();

    renderSidebar(staff.role);
    loadModule(activeModule);
}

// ====== ROUTING & SIDEBAR ======
const MODULES = {
    dashboard:          { icon: 'chart-pie',       label: 'Visão Geral',           roles: ['admin', 'gerente', 'ceo'] },
    comandas:           { icon: 'receipt',          label: 'Comandas (Mesas)',       roles: ['admin', 'gerente', 'ceo', 'caixa', 'garcom'] },
    pdv:                { icon: 'cash-register',    label: 'PDV (Balcão)',           roles: ['admin', 'gerente', 'ceo', 'caixa', 'balcao', 'bar'] },
    portaria:           { icon: 'door-open',        label: 'Portaria',               roles: ['admin', 'gerente', 'ceo', 'portaria'] },
    estoque:            { icon: 'boxes-stacked',    label: 'Estoque',                roles: ['admin', 'gerente', 'ceo'] },
    funcionarios:       { icon: 'users',            label: 'Gestão de Equipe (Staff)', roles: ['admin', 'gerente', 'ceo'] },
    fechamento_semanal: { icon: 'file-csv',         label: 'Gerar Relatório (Fechamento)', roles: ['admin', 'gerente', 'ceo'] }
};

function renderSidebar(role) {
    const nav = document.getElementById('sidebarNav');
    nav.innerHTML = '';

    Object.entries(MODULES).forEach(([key, mod]) => {
        if (mod.roles.includes(role)) {
            const btn = document.createElement('button');
            btn.className = `sidebar-btn w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-gray-500 hover:bg-emerald-50 hover:text-emerald-700 text-left ${key === activeModule ? 'active' : ''}`;
            btn.innerHTML = `<i class="fa-solid fa-${mod.icon} w-5 text-center"></i> ${mod.label}`;
            btn.onclick = () => loadModule(key);
            nav.appendChild(btn);
            
            // Auto-select first available if current is not allowed
            if(activeModule === 'dashboard' && key !== 'dashboard' && !MODULES.dashboard.roles.includes(role)) {
                activeModule = key;
            }
        }
    });
}

window.loadModule = (key) => {
    activeModule = key;
    
    // Update active state in sidebar
    document.querySelectorAll('.sidebar-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.includes(MODULES[key].label));
    });

    const titleEl = document.getElementById('pageTitle');
    const subEl = document.getElementById('pageSubtitle');
    const content = document.getElementById('pageContent');
    
    content.innerHTML = '<div class="flex justify-center p-20"><i class="fa-solid fa-spinner fa-spin text-4xl text-emerald-600"></i></div>';

    titleEl.textContent = MODULES[key].label;
    
    switch(key) {
        case 'dashboard':
            subEl.textContent = 'Indicadores em tempo real';
            renderDashboard(content);
            break;
        case 'estoque':
            subEl.textContent = 'Gerenciamento de produtos e insumos';
            import('./sistema_mods_1.js').then(m => m.renderEstoque(content));
            break;
        case 'comandas':
            subEl.textContent = 'Gestão de mesas, chalés e barracas';
            import('./sistema_mods_3.js').then(m => m.renderComandas(content));
            break;
        case 'funcionarios':
            subEl.textContent = 'Controle de acessos, cargos e pagamentos';
            import('./sistema_mods_func.js').then(m => m.renderFuncionarios(content));
            break;
        case 'pdv':
            subEl.textContent = 'Lançamento rápido (Balcão)';
            import('./sistema_mods_pdv.js').then(m => m.renderPDV(content));
            break;
        case 'portaria':
            subEl.textContent = 'Registro de visitantes e Day Use';
            import('./sistema_mods_2.js').then(m => m.renderPortaria(content));
            break;
        case 'fechamento_semanal':
            subEl.textContent = 'Relatório Geral com Exportação e Impressão';
            import('./sistema_mods_fechamento.js').then(m => m.renderFechamentoSemanal(content));
            break;
        default:
            content.innerHTML = '<p class="text-gray-500 p-10 text-center">Módulo em desenvolvimento</p>';
    }
    // Auto-close sidebar on mobile after clicking a link
    const sidebar = document.getElementById('sysSidebar');
    if(sidebar && !sidebar.classList.contains('-translate-x-full')) {
        window.toggleSidebar();
    }
};

window.toggleSidebar = () => {
    const sidebar = document.getElementById('sysSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if(sidebar.classList.contains('-translate-x-full')) {
        sidebar.classList.remove('-translate-x-full');
        overlay.classList.remove('hidden');
    } else {
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('hidden');
    }
};

// ====== MODULE: DASHBOARD ======
async function renderDashboard(container) {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();

    // Fetch Today's Orders
    const { data: orders } = await supabase.from('orders').select('*').gte('created_at', startOfDay);
    
    const totalVendas = (orders || []).reduce((sum, o) => sum + Number(o.total), 0);
    const qtdPedidos = (orders || []).length;
    
    // Fetch Portaria
    const { data: portaria } = await supabase.from('gate_entries').select('*').gte('created_at', startOfDay);
    const totalAdults = (portaria || []).reduce((sum, p) => sum + p.qty_adults, 0);
    const totalPortaria = (portaria || []).reduce((sum, p) => sum + Number(p.total_amount), 0);

    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 anim-fade">
            <div class="stat-card bg-white p-6 rounded-2xl border border-gray-100 flex flex-col justify-between">
                <div class="flex items-center justify-between mb-4">
                    <div class="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl"><i class="fa-solid fa-money-bill-wave"></i></div>
                    <span class="text-xs font-bold text-gray-400 uppercase tracking-wider">Restaurante</span>
                </div>
                <h3 class="text-3xl font-black text-gray-800">R$ ${totalVendas.toFixed(2).replace('.', ',')}</h3>
                <p class="text-sm font-bold text-emerald-500 mt-2">${qtdPedidos} pedidos hoje</p>
            </div>
            
            <div class="stat-card bg-white p-6 rounded-2xl border border-gray-100 flex flex-col justify-between">
                <div class="flex items-center justify-between mb-4">
                    <div class="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xl"><i class="fa-solid fa-door-open"></i></div>
                    <span class="text-xs font-bold text-gray-400 uppercase tracking-wider">Portaria</span>
                </div>
                <h3 class="text-3xl font-black text-gray-800">R$ ${totalPortaria.toFixed(2).replace('.', ',')}</h3>
                <p class="text-sm font-bold text-blue-500 mt-2">${totalAdults} pagantes hoje</p>
            </div>
            
            <div class="stat-card bg-white p-6 rounded-2xl border border-gray-100 flex flex-col justify-between">
                <div class="flex items-center justify-between mb-4">
                    <div class="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center text-xl"><i class="fa-solid fa-boxes-stacked"></i></div>
                    <span class="text-xs font-bold text-gray-400 uppercase tracking-wider">Estoque</span>
                </div>
                <h3 class="text-3xl font-black text-gray-800" id="dashLowStock">-</h3>
                <p class="text-sm font-bold text-red-500 mt-2">Produtos em baixa</p>
            </div>
            
             <div class="stat-card bg-white p-6 rounded-2xl border border-gray-100 flex flex-col justify-between">
                <div class="flex items-center justify-between mb-4">
                    <div class="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center text-xl"><i class="fa-solid fa-house-chimney"></i></div>
                    <span class="text-xs font-bold text-gray-400 uppercase tracking-wider">Chalés</span>
                </div>
                <h3 class="text-3xl font-black text-gray-800" id="dashChalets">-</h3>
                <p class="text-sm font-bold text-amber-500 mt-2">Ocupação hoje</p>
            </div>
        </div>
        
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 anim-fade" style="animation-delay: 0.1s">
            <div class="bg-white rounded-2xl border border-gray-100 p-6">
                <h3 class="text-lg font-black text-gray-800 mb-4">Últimos Pedidos</h3>
                <div class="space-y-3" id="dashLatestOrders">
                    <p class="text-sm text-gray-400 text-center py-4">Carregando...</p>
                </div>
            </div>
            
             <div class="bg-white rounded-2xl border border-gray-100 p-6">
                <h3 class="text-lg font-black text-gray-800 mb-4">Entradas Portaria</h3>
                <div class="space-y-3" id="dashLatestGate">
                    <p class="text-sm text-gray-400 text-center py-4">Carregando...</p>
                </div>
            </div>
        </div>
    `;

    // Fill async data
    fillDashboardLists(orders, portaria);
    
    // Low stock count
    const { count } = await supabase.from('products')
        .select('*', { count: 'exact', head: true })
        .eq('is_stock_controlled', true)
        .lte('stock_qty', 5); // Simplistic check
    document.getElementById('dashLowStock').textContent = count || 0;
    
    // Chalet occupancy count
    const todayIso = new Date().toISOString().split('T')[0];
    const { data: bookings } = await supabase
        .from('bookings')
        .select('chalet_id')
        .lte('checkin_date', todayIso)
        .gte('checkout_date', todayIso)
        .eq('status', 'confirmed'); // assuming 'confirmed' is the valid status for mapping
        
    let occupiedCount = 0;
    if (bookings) {
        const uniqueChalets = new Set(bookings.map(b => b.chalet_id));
        occupiedCount = uniqueChalets.size;
    }
    document.getElementById('dashChalets').textContent = `${occupiedCount} / 10`;
}

function fillDashboardLists(orders, portaria) {
    const oContainer = document.getElementById('dashLatestOrders');
    if(!orders || orders.length === 0) {
        oContainer.innerHTML = '<p class="text-sm text-gray-400 text-center py-4 font-bold">Nenhum pedido hoje.</p>';
    } else {
        const sorted = orders.sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
        oContainer.innerHTML = sorted.map(o => `
            <div onclick="openOrderDetails('${o.id}')" class="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition border border-transparent hover:border-gray-200">
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <span class="text-xs font-black text-gray-500 bg-gray-200 px-2 py-0.5 rounded mr-1">#${o.order_number}</span>
                        <span class="text-[10px] font-black uppercase text-white px-2 py-0.5 rounded ${o.destination === 'bar' ? 'bg-amber-500' : 'bg-red-500'}">${o.destination}</span>
                        ${o.status === 'entregue' ? '<span class="text-[10px] font-black uppercase text-green-600">✓ Entregue</span>' : ''}
                    </div>
                    <span class="font-bold text-gray-700 text-sm capitalize flex items-center gap-2">
                        <i class="fa-solid ${o.location_type === 'chale' ? 'fa-house' : o.location_type === 'mesa' ? 'fa-chair' : 'fa-store'} text-gray-400"></i>
                        ${o.location_type} ${o.location_id.replace('M','')}
                    </span>
                </div>
                <div class="text-right">
                    <p class="text-[10px] text-gray-400 font-bold mb-0.5">${new Date(o.created_at).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</p>
                    <span class="font-black text-emerald-600">R$ ${Number(o.total).toFixed(2).replace('.',',')}</span>
                </div>
            </div>
        `).join('');
    }
    
    const pContainer = document.getElementById('dashLatestGate');
    if(!portaria || portaria.length === 0) {
        pContainer.innerHTML = '<p class="text-sm text-gray-400 text-center py-4 font-bold">Nenhuma entrada hoje.</p>';
    } else {
        const sorted = portaria.sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
        pContainer.innerHTML = sorted.map(p => `
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <div>
                    <span class="font-bold text-gray-700 text-sm">${p.guest_name || 'Anônimo'}</span>
                    <p class="text-xs text-gray-500 font-bold mt-0.5">${p.qty_adults} Adulto(s) ${p.is_camping ? '🏕️' : ''}</p>
                </div>
                <span class="font-black text-blue-600">R$ ${Number(p.total_amount).toFixed(2).replace('.',',')}</span>
            </div>
        `).join('');
    }
}

// ====== MODULE: ORDER DETAILS MODAL ======
window.openOrderDetails = async (orderId) => {
    // Show loading modal
    document.getElementById('modalContainer').innerHTML = `
        <div class="modal-overlay">
            <div class="modal-box anim-fade text-center py-10">
                <i class="fa-solid fa-spinner fa-spin text-4xl text-emerald-600 mb-4"></i>
                <p class="text-gray-500 font-bold">Buscando Detalhes...</p>
            </div>
        </div>
    `;

    const { data: order } = await supabase.from('orders').select('*, order_items(*)').eq('id', orderId).single();
    if(!order) return closeMod();

    const time = new Date(order.created_at).toLocaleTimeString('pt-BR');
    const itemsHtml = order.order_items.map(i => `
        <div class="flex justify-between items-start py-2 border-b border-gray-100 last:border-0">
            <div>
                <p class="text-sm font-bold text-gray-800">${i.quantity}x ${i.product_name}</p>
                ${i.notes ? `<p class="text-xs text-gray-500 font-medium italic mt-0.5">Obs: ${i.notes}</p>` : ''}
            </div>
            <p class="text-sm font-black text-gray-600">R$ ${(i.quantity * i.unit_price).toFixed(2).replace('.',',')}</p>
        </div>
    `).join('');

    let statusColors = 'bg-gray-100 text-gray-600';
    if(order.status === 'pendente') statusColors = 'bg-yellow-100 text-yellow-800';
    else if(order.status === 'preparando') statusColors = 'bg-blue-100 text-blue-800';
    else if(order.status === 'pronto') statusColors = 'bg-green-100 text-green-800';

    document.getElementById('modalContainer').innerHTML = `
        <div class="modal-overlay" onclick="if(event.target===this) closeMod()">
            <div class="modal-box anim-fade max-w-md">
                <div class="flex justify-between items-start mb-6">
                    <div>
                        <div class="flex items-center gap-2 mb-1">
                            <h3 class="text-xl font-black text-gray-800">Pedido #${order.order_number}</h3>
                            <span class="${statusColors} text-[10px] px-2 py-0.5 rounded font-black uppercase">${order.status}</span>
                        </div>
                        <p class="text-sm text-gray-500 font-bold capitalize"><i class="fa-solid fa-clock mr-1 text-gray-400"></i> ${time} &nbsp;&bull;&nbsp; ${order.location_type} ${order.location_id}</p>
                    </div>
                    <button onclick="closeMod()" class="text-gray-400 bg-gray-100 w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-200 transition"><i class="fa-solid fa-xmark"></i></button>
                </div>
                
                <div class="bg-gray-50 rounded-xl p-4 mb-6">
                    <div class="flex items-center justify-between mb-3 border-b border-gray-200 pb-2">
                        <span class="text-xs font-bold text-gray-400 uppercase">Destino</span>
                        <span class="text-[10px] font-black uppercase text-white px-2 py-0.5 rounded ${order.destination === 'bar' ? 'bg-amber-500' : 'bg-red-500'}">${order.destination}</span>
                    </div>
                    ${itemsHtml}
                </div>
                
                <div class="flex justify-between items-end border-t border-gray-100 pt-4 mt-4">
                    <span class="text-sm font-bold text-gray-500 uppercase tracking-wider">Total</span>
                    <span class="text-3xl font-black text-emerald-600">R$ ${Number(order.total).toFixed(2).replace('.',',')}</span>
                </div>
            </div>
        </div>
    `;
};


// Funcionalidades migradas para sistema_mods_func.js

// ====== EXPERIMENTAL / PLACEHOLDERS ======
// Implementation details for Estoque, PDV, Portaria, Caixa will follow
