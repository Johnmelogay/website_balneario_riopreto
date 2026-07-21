/**
 * Auditoria & Logs Controller - Balneário Rio Preto
 * Consulta logs diários no Supabase, filtra por funcionário/ação/busca e exibe timeline detalhada.
 */
import { supabase } from './scripts.js';
import { loginStaff, getCurrentStaff } from './sistema_auth.js';

// ====== STATE ======
let currentPin = '';
let logs = [];
let staffUsers = [];
let currentLogModal = null;

// ====== PIN INPUT ======
window.pinInput = async (digit) => {
    if (currentPin.length >= 4) return;
    currentPin += digit;
    updatePinDots();

    if (currentPin.length === 4) {
        const result = await loginStaff(currentPin);
        if (result.success && result.user.role === 'admin') {
            document.getElementById('loginScreen').style.display = 'none';
            startApp();
        } else {
            const errEl = document.getElementById('loginError');
            errEl.textContent = result.success ? 'Acesso restrito para Administradores' : 'PIN inválido';
            errEl.classList.remove('hidden');
            setTimeout(() => {
                currentPin = '';
                updatePinDots();
                errEl.classList.add('hidden');
            }, 1200);
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

// ====== START ======
async function startApp() {
    document.getElementById('mainScreen').classList.remove('hidden');
    document.getElementById('mainScreen').classList.add('flex');

    // Set date picker to TODAY (YYYY-MM-DD)
    const dateInput = document.getElementById('datePicker');
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
    dateInput.onchange = loadLogs;

    // Filter Listeners
    document.getElementById('actionFilter').onchange = renderLogs;
    document.getElementById('staffFilter').onchange = renderLogs;
    document.getElementById('searchInput').oninput = renderLogs;

    await loadStaffList();
    await loadLogs();

    // Fast 3s Polling Fallback
    setInterval(loadLogs, 3000);

    // Supabase Realtime for instant log feed
    supabase
        .channel('audit-logs-live')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs' }, () => {
            loadLogs();
        })
        .subscribe();
}

// ====== LOAD STAFF ======
async function loadStaffList() {
    const { data } = await supabase
        .from('staff_users')
        .select('id, name, role')
        .order('name');

    staffUsers = data || [];
    const select = document.getElementById('staffFilter');
    select.innerHTML = '<option value="all">Todos Funcionários</option>';

    staffUsers.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.name;
        opt.textContent = `${s.name} (${s.role})`;
        select.appendChild(opt);
    });
}

// ====== LOAD LOGS BY DATE ======
window.loadLogs = async () => {
    const selectedDate = document.getElementById('datePicker').value;
    if (!selectedDate) return;

    const container = document.getElementById('logsContainer');

    // Precise local start/end of day
    const [yr, mo, dy] = selectedDate.split('-').map(Number);
    const startOfDay = new Date(yr, mo - 1, dy, 0, 0, 0, 0).toISOString();
    const endOfDay = new Date(yr, mo - 1, dy, 23, 59, 59, 999).toISOString();

    const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error loading audit logs:', error);
        return;
    }

    logs = data || [];
    updateStats();
    renderLogs();
};

// ====== STATS ======
function updateStats() {
    const total = logs.length;
    const orders = logs.filter(l => l.action_type === 'ORDER_CREATED').length;
    const status = logs.filter(l => l.action_type === 'STATUS_CHANGED').length;
    const stock = logs.filter(l => l.action_type === 'STOCK_UPDATED').length;

    document.getElementById('statTotal').textContent = total;
    document.getElementById('statOrders').textContent = orders;
    document.getElementById('statStatus').textContent = status;
    document.getElementById('statStock').textContent = stock;
}

// ====== RENDER TIMELINE ======
function renderLogs() {
    const container = document.getElementById('logsContainer');
    const actionVal = document.getElementById('actionFilter').value;
    const staffVal = document.getElementById('staffFilter').value;
    const query = document.getElementById('searchInput').value.toLowerCase().trim();

    let filtered = logs;

    if (actionVal !== 'all') {
        filtered = filtered.filter(l => l.action_type === actionVal);
    }

    if (staffVal !== 'all') {
        filtered = filtered.filter(l => l.staff_name === staffVal);
    }

    if (query) {
        filtered = filtered.filter(l => {
            const str = `${l.action_type} ${l.staff_name} ${l.location_type} ${l.location_id} ${JSON.stringify(l.details)}`.toLowerCase();
            return str.includes(query);
        });
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-16 text-stone-600">
                <i class="fa-solid fa-shield-halved text-4xl mb-3 opacity-30"></i>
                <p class="font-bold">Nenhum log encontrado para este dia/filtro</p>
            </div>`;
        return;
    }

    container.innerHTML = filtered.map((log, idx) => logCard(log, idx)).join('');
}

function logCard(log, idx) {
    const timeStr = new Date(log.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dev = log.device_info || {};
    const devIcon = dev.device === 'Mobile' ? '📱' : dev.device === 'Tablet' ? '📱' : '💻';
    const locStr = log.location_type ? `${log.location_type.toUpperCase()} ${log.location_id || ''}` : 'Geral';

    // Action badge mapping
    const actionMap = {
        'ORDER_CREATED': { label: 'Pedido Criado', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: 'fa-cart-plus' },
        'STATUS_CHANGED': { label: 'Status Cozinha', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: 'fa-kitchen-set' },
        'STOCK_UPDATED': { label: 'Estoque Ajustado', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', icon: 'fa-boxes-stacked' },
        'STAFF_LOGIN': { label: 'Login', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: 'fa-right-to-bracket' },
        'PAYMENT_CLOSED': { label: 'Pagamento Caixa', color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: 'fa-cash-register' }
    };

    const config = actionMap[log.action_type] || { label: log.action_type, color: 'bg-stone-700 text-stone-300 border-stone-600', icon: 'fa-info-circle' };

    // Format summary details
    let summaryText = '';
    if (log.details) {
        if (log.details.orders) summaryText = `Pedidos: ${log.details.orders.map(n => '#' + n).join(', ')} • R$ ${Number(log.details.total_amount || 0).toFixed(2)}`;
        else if (log.details.new_status) summaryText = `Pedido #${log.details.order_number || ''} ➔ ${log.details.new_status.toUpperCase()}`;
        else if (log.details.items && Array.isArray(log.details.items)) {
            summaryText = log.details.items.map(i => `${i.name}: ${i.old_qty} ➔ ${i.new_qty}`).join(' | ');
        }
        else if (log.details.updated_count) summaryText = `${log.details.updated_count} produtos salvos no estoque`;
        else summaryText = JSON.stringify(log.details);
    }

    return `
        <div onclick="openModal('${log.id}')" 
             class="bg-stone-800/70 border border-stone-700/60 rounded-xl p-3.5 hover:bg-stone-800 cursor-pointer active:scale-[0.99] transition flex items-center justify-between gap-3">
            
            <div class="flex items-center gap-3 min-w-0 flex-1">
                <!-- Action Icon -->
                <div class="w-10 h-10 rounded-xl ${config.color} border flex items-center justify-center text-sm shrink-0">
                    <i class="fa-solid ${config.icon}"></i>
                </div>

                <!-- Action Info -->
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 mb-0.5">
                        <span class="text-white font-bold text-sm truncate">${log.staff_name || 'Sistema'}</span>
                        <span class="text-[10px] text-stone-500 font-bold bg-stone-900 px-2 py-0.5 rounded-full">${log.staff_role || 'user'}</span>
                        <span class="text-[10px] text-stone-400 font-medium ml-auto">${timeStr}</span>
                    </div>

                    <div class="flex items-center gap-2">
                        <span class="text-xs font-bold ${config.color.split(' ')[1]}">${config.label}</span>
                        <span class="text-[10px] text-stone-400 font-medium truncate">• ${locStr}</span>
                    </div>

                    ${summaryText ? `<p class="text-stone-400 text-xs truncate mt-1">${summaryText}</p>` : ''}
                </div>
            </div>

            <!-- Device Badge -->
            <div class="shrink-0 text-right">
                <span class="text-base">${devIcon}</span>
                <span class="text-[10px] text-stone-500 block font-bold">${dev.os || ''}</span>
            </div>
        </div>
    `;
}

// ====== MODAL DETAILS ======
window.openModal = (logId) => {
    const log = logs.find(l => l.id === logId);
    if (!log) return;

    currentLogModal = log;
    const timeStr = new Date(log.created_at).toLocaleString('pt-BR');
    const dev = log.device_info || {};

    document.getElementById('modalTitle').textContent = `${log.action_type}`;
    
    document.getElementById('modalBody').innerHTML = `
        <div class="space-y-4">
            <!-- Timestamp & Who -->
            <div class="bg-stone-800/80 rounded-xl p-3.5 border border-stone-700/60 flex items-center justify-between">
                <div>
                    <p class="text-xs font-bold text-stone-400 uppercase">Executado Por</p>
                    <p class="text-white font-black text-base">${log.staff_name || 'Sistema'}</p>
                    <p class="text-xs text-blue-400 font-bold">${log.staff_role || 'role'}</p>
                </div>
                <div class="text-right">
                    <p class="text-xs font-bold text-stone-400 uppercase">Data / Hora</p>
                    <p class="text-white font-bold text-sm">${timeStr}</p>
                    <p class="text-xs text-stone-500 font-mono">${log.location_type ? `${log.location_type.toUpperCase()} ${log.location_id || ''}` : 'Localização Geral'}</p>
                </div>
            </div>

            <!-- Device Info -->
            <div class="bg-stone-800/80 rounded-xl p-3.5 border border-stone-700/60 space-y-2">
                <p class="text-xs font-bold text-stone-400 uppercase flex items-center gap-1">
                    <i class="fa-solid fa-mobile-screen mr-1"></i> Dispositivo & Aparelho
                </p>
                <div class="grid grid-cols-2 gap-2 text-xs">
                    <div><span class="text-stone-500 font-bold">Tipo:</span> <span class="text-white font-bold">${dev.device || 'N/A'}</span></div>
                    <div><span class="text-stone-500 font-bold">Sistema:</span> <span class="text-white font-bold">${dev.os || 'N/A'}</span></div>
                    <div><span class="text-stone-500 font-bold">Navegador:</span> <span class="text-white font-bold">${dev.browser || 'N/A'}</span></div>
                    <div><span class="text-stone-500 font-bold">Resolução:</span> <span class="text-white font-bold">${dev.screen || 'N/A'}</span></div>
                </div>
                <div class="pt-2 border-t border-stone-700/40">
                    <span class="text-stone-500 text-[10px] font-mono block break-all">UA: ${dev.ua || 'N/A'}</span>
                </div>
            </div>

            <!-- Payload Details -->
            <div class="bg-stone-800/80 rounded-xl p-3.5 border border-stone-700/60 space-y-2">
                <p class="text-xs font-bold text-stone-400 uppercase flex items-center gap-1">
                    <i class="fa-solid fa-code mr-1"></i> Detalhes da Ação (Payload)
                </p>
                <pre class="bg-stone-950 p-3 rounded-lg text-emerald-400 text-xs font-mono overflow-x-auto border border-stone-800 max-h-48">${JSON.stringify(log.details || {}, null, 2)}</pre>
            </div>
        </div>
    `;

    const modal = document.getElementById('detailsModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
};

window.closeModal = () => {
    const modal = document.getElementById('detailsModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
};

// ====== INIT ======
document.addEventListener('DOMContentLoaded', () => {
    const staff = getCurrentStaff();
    if (staff && staff.role === 'admin') {
        document.getElementById('loginScreen').style.display = 'none';
        startApp();
    }
});
