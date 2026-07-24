/**
 * KDS - Kitchen / Bar Display System
 * Balneário Rio Preto
 * 
 * Detects mode from filename: cozinha.html -> cozinha, bar.html -> bar
 */
import { supabase } from './scripts.js';
import { loginStaff, getCurrentStaff, logoutStaff } from './sistema_auth.js';
import { logAuditAction } from './audit_logger.js';

// ====== CONFIG ======
const isBar = window.location.pathname.includes('bar');
const DESTINATION = isBar ? 'bar' : 'cozinha';
const TITLE = isBar ? 'Bar' : 'Cozinha';
const ICON = isBar ? '🍺' : '🍳';
const TIMER_WARN = 10 * 60 * 1000;      // 10min = timer amarelo
const TIMER_LATE = 30 * 60 * 1000;      // 30min = timer vermelho
const TIMER_CRITICAL = 50 * 60 * 1000;  // 50min = card inteiro vermelho

let soundEnabled = true;
let orders = [];
let timerInterval = null;
let isInitialLoad = true;

// ====== PIN ======
let currentPin = '';

let audioUnlocked = false;

window.pinInput = async (digit) => {
    if (!audioUnlocked) {
        audioUnlocked = true;
        try {
            const audio = document.getElementById('notifSound');
            audio.play().then(() => {
                audio.pause();
                audio.currentTime = 0;
            }).catch(() => {});
        } catch(e) {}
    }

    if (currentPin.length >= 4) return;
    currentPin += digit;
    updatePinDots();

    if (currentPin.length === 4) {
        const result = await loginStaff(currentPin);
        if (result.success) {
            document.getElementById('loginScreen').style.display = 'none';
            startKDS();
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

// ====== SOUND ======
window.toggleSound = () => {
    soundEnabled = !soundEnabled;
    const btn = document.getElementById('soundBtn');
    btn.innerHTML = soundEnabled
        ? '<i class="fa-solid fa-volume-high"></i>'
        : '<i class="fa-solid fa-volume-xmark"></i>';
};

function playNotification() {
    if (!soundEnabled) return;
    try {
        const audio = document.getElementById('notifSound');
        audio.currentTime = 0;
        audio.play().catch(() => {});
    } catch {}
}

// ====== KDS START ======
async function startKDS() {
    // Unlock Audio Context (browsers require user interaction before playing sound)
    try {
        const audio = document.getElementById('notifSound');
        audio.play().then(() => {
            audio.pause();
            audio.currentTime = 0;
        }).catch(() => {});
    } catch(e) {}

    // Set titles
    document.getElementById('kdsTitle').textContent = TITLE;
    document.getElementById('kdsHeaderTitle').textContent = TITLE;
    document.getElementById('kdsIcon').textContent = ICON;
    document.getElementById('kdsMain').classList.remove('hidden');
    document.getElementById('kdsMain').classList.add('flex');

    // Clock
    updateClock();
    // Clock
    setInterval(updateClock, 1000);
    setInterval(updateTimersOnly, 1000); // Live ticking for order elapsed time

    // Load initial
    await loadOrders();

    // Polling inteligente: 3s somente em caso de falha no WebSocket, 30s quando online
    let pollingInterval = null;

    function setPollingInterval(ms) {
        if (pollingInterval) clearInterval(pollingInterval);
        pollingInterval = setInterval(() => {
            loadOrders();
        }, ms);
    }

    // Inicia com heartbeat leve de 30s por padrão
    setPollingInterval(30000);

    // Realtime subscription (primary — instant updates)
    const channel = supabase
        .channel('kds-orders')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'orders'
        }, (payload) => {
            handleRealtimeOrder(payload);
        })
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'order_items'
        }, () => {
            loadOrders();
        })
        .subscribe((status) => {
            const indicator = document.getElementById('connectionStatus');
            if (indicator) {
                if (status === 'SUBSCRIBED') {
                    indicator.innerHTML = '<i class="fa-solid fa-wifi text-green-400"></i>';
                    indicator.title = 'Conexão em tempo real ativa (Polling leve 30s)';
                    setPollingInterval(30000); // Polling leve enquanto online
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                    indicator.innerHTML = '<i class="fa-solid fa-wifi text-red-400 animate-pulse"></i>';
                    indicator.title = 'Conexão perdida — ativando polling reserva de 3s';
                    setPollingInterval(3000); // Polling rápido de emergência
                } else {
                    indicator.innerHTML = '<i class="fa-solid fa-wifi text-yellow-400"></i>';
                    indicator.title = 'Reconectando...';
                    setPollingInterval(5000);
                }
            }
        });
}

function updateClock() {
    const now = new Date();
    document.getElementById('currentTime').textContent =
        now.toLocaleTimeString('pt-BR', { timeZone: 'America/Porto_Velho',  hour: '2-digit', minute: '2-digit' });
}

// ====== LOAD ORDERS ======
async function loadOrders() {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0).toISOString();

    const { data, error } = await supabase
        .from('orders')
        .select(`
            *,
            order_items(*),
            staff_users(name)
        `)
        .gte('created_at', startOfDay)
        .neq('status', 'cancelado')
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error loading orders:', error);
        return;
    }

    // Filter orders that have items for this destination
    const newOrders = (data || []).filter(order => {
        const relevantItems = (order.order_items || []).filter(i => i.destination === DESTINATION);
        return relevantItems.length > 0;
    });

    if (!isInitialLoad) {
        const oldPendingIds = new Set(orders.filter(o => o.status === 'pendente').map(o => o.id));
        const currentPending = newOrders.filter(o => o.status === 'pendente');
        currentPending.forEach(o => {
            if (!oldPendingIds.has(o.id)) {
                playNotification();
                speakOrder(o);
            }
        });
    }

    orders = newOrders;
    isInitialLoad = false;
    renderOrders();
}

function handleRealtimeOrder(payload) {
    loadOrders();
}

// ====== VOICE & BELL CHIME ======
let voicesList = [];
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    voicesList = window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
        voicesList = window.speechSynthesis.getVoices();
    };
}

function playBellChime() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        function playNote(freq, time, duration) {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, time);
            gain.gain.setValueAtTime(0.35, time);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(time);
            osc.stop(time + duration);
        }
        const now = audioCtx.currentTime;
        playNote(1567.98, now, 0.5);        // G6 (Ding!)
        playNote(2093.00, now + 0.12, 0.8); // C7 (Dong!)
    } catch(e) {}
}

function speakOrder(order) {
    if (!soundEnabled) return;
    try {
        const relevantItems = (order.order_items || []).filter(i => i.destination === DESTINATION);
        if (relevantItems.length === 0) return;

        const itemsText = relevantItems.map(i => `${i.quantity} ${i.product_name}`).join(', ');
        const staffName = order.staff_users?.name || 'Garçom';
        const customerName = order.customer_name?.trim() || '';
        const loc = order.location_type === 'chale' ? 'Chalé ' + order.location_id :
                    order.location_type === 'mesa' ? 'Mesa ' + order.location_id.replace('M','') :
                    'Balcão ' + order.location_id;

        const custText = customerName ? `. Cliente: ${customerName}` : '';
        const text = `Novo pedido número ${order.order_number}! ${loc}${custText}. Garçom: ${staffName}. Itens: ${itemsText}.`;

        // Tocamos o sininho cristalino primeiro
        playBellChime();


        // Aguardamos 500ms para a voz começar limpa após o sininho
        setTimeout(() => {
            try {
                if ('speechSynthesis' in window) {
                    window.speechSynthesis.cancel();
                    const utterance = new SpeechSynthesisUtterance(text);
                    utterance.lang = 'pt-BR';
                    utterance.rate = 1.05;
                    utterance.pitch = 1.0;

                    const voices = voicesList.length > 0 ? voicesList : window.speechSynthesis.getVoices();
                    const ptBrVoice = voices.find(v => (v.lang === 'pt-BR' || v.lang === 'pt_BR') && (v.name.includes('Google') || v.name.includes('Luciana') || v.name.includes('Felipe') || v.name.includes('Francisca') || v.name.includes('Heloisa') || v.name.includes('Daniel') || v.name.includes('Brasil'))) ||
                                      voices.find(v => v.lang === 'pt-BR' || v.lang === 'pt_BR') ||
                                      voices.find(v => v.lang.startsWith('pt'));

                    if (ptBrVoice) {
                        utterance.voice = ptBrVoice;
                        window.speechSynthesis.speak(utterance);
                        return;
                    }
                }

                // Fallback de voz neural em português do Brasil
                const encodedText = encodeURIComponent(text);
                const audio = new Audio(`https://translate.google.com/translate_tts?ie=UTF-8&tl=pt-BR&client=tw-ob&q=${encodedText}`);
                audio.play().catch(() => {});
            } catch(e) {}
        }, 500);
    } catch(e) {}
}

// ====== RENDER ======
function renderOrders() {
    const container = document.getElementById('ordersContainer');

    // Split by status
    const pending = orders.filter(o => o.status === 'pendente');
    const preparing = orders.filter(o => o.status === 'preparando');
    const ready = orders.filter(o => o.status === 'pronto');
    const delivered = orders.filter(o => o.status === 'entregue');

    // Update counters
    const pEl = document.getElementById('countPending');
    const prEl = document.getElementById('countPreparing');
    const rEl = document.getElementById('countReady');
    const dEl = document.getElementById('countDelivered');

    if (pEl) pEl.textContent = pending.length;
    if (prEl) prEl.textContent = preparing.length;
    if (rEl) rEl.textContent = ready.length;
    if (dEl) dEl.textContent = delivered.length;

    // Active preparation cards (exclude delivered from grid to keep kitchen uncluttered)
    const activeOrders = [...pending, ...preparing, ...ready];

    if (activeOrders.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-stone-600">
                <i class="fa-solid fa-kitchen-set text-6xl mb-4 opacity-30"></i>
                <p class="font-bold text-lg">Nenhum pedido pendente</p>
                <p class="text-sm text-stone-700">${delivered.length} pedido(s) finalizados hoje</p>
            </div>`;
        return;
    }

    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            ${activeOrders.map(order => orderCard(order)).join('')}
        </div>
    `;
}

function orderCard(order) {
    const items = (order.order_items || []).filter(i => i.destination === DESTINATION);
    const elapsed = Date.now() - new Date(order.created_at).getTime();
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    const timeStr = `${minutes}:${String(seconds).padStart(2, '0')}`;

    let statusClass = 'status-pending';
    let statusLabel = 'NOVO';
    let statusBg = 'bg-red-500';
    let cardBg = 'bg-stone-800';
    let actionBtn = '';
    let isUrgent = '';

    if (order.status === 'preparando') {
        statusClass = 'status-preparing';
        statusLabel = 'PREPARANDO';
        statusBg = 'bg-amber-500';
        cardBg = 'bg-stone-800';
        actionBtn = `<button onclick="markReady('${order.id}')" class="flex-1 py-3 rounded-xl bg-green-600 text-white font-bold text-sm hover:bg-green-700 active:scale-95 transition">
            <i class="fa-solid fa-check mr-1"></i> PRONTO
        </button>`;
    } else if (order.status === 'pronto') {
        statusClass = 'status-ready';
        statusLabel = 'PRONTO';
        statusBg = 'bg-green-500';
        cardBg = 'bg-emerald-900/30';
        actionBtn = `<button onclick="markDelivered('${order.id}')" class="flex-1 py-3 rounded-xl bg-stone-700 text-stone-300 font-bold text-sm hover:bg-stone-600 active:scale-95 transition">
            <i class="fa-solid fa-hand-holding mr-1"></i> ENTREGUE
        </button>`;
    } else {
        // Pending
        actionBtn = `<button onclick="markPreparing('${order.id}')" class="flex-1 py-3 rounded-xl bg-amber-500 text-white font-bold text-sm hover:bg-amber-600 active:scale-95 transition">
            <i class="fa-solid fa-fire-burner mr-1"></i> INICIAR
        </button>`;
    }

    // Time color
    let timeColor = 'text-green-500';
    if (elapsed > TIMER_LATE) timeColor = 'text-red-500 font-black';
    else if (elapsed > TIMER_WARN) timeColor = 'text-amber-500';

    // Critical Time (Card turns entirely red)
    if (order.status !== 'pronto' && elapsed >= TIMER_CRITICAL) {
        cardBg = 'bg-[url("data:image/svg+xml,%3Csvg width=\'20\' height=\'20\' viewBox=\'0 0 20 20\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%23ef4444\' fill-opacity=\'0.05\' fill-rule=\'evenodd\'%3E%3Ccircle cx=\'3\' cy=\'3\' r=\'3\'/%3E%3Ccircle cx=\'13\' cy=\'13\' r=\'3\'/%3E%3C/g%3E%3C/svg%3E")] bg-red-950/80 border-red-600 shadow-xl shadow-red-900/30';
        timeColor = 'text-red-400 font-black decoration-wavy underline';
    }

    // Location label
    const locLabel = order.location_type === 'chale'
        ? `Chalé ${order.location_id}`
        : order.location_type === 'mesa'
            ? `Mesa ${order.location_id.replace('M', '')}`
            : 'Balcão';

    const staffName = order.staff_users?.name || '—';
    const customerName = order.customer_name?.trim() || '';

    return `
        <div id="card-${order.id}" class="order-card-container ${cardBg} ${statusClass} rounded-2xl overflow-hidden border border-stone-700" data-created="${order.created_at}" data-status="${order.status}">
            <!-- Header -->
            <div class="px-4 pt-4 pb-2 flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <span class="${statusBg} text-white text-[10px] font-black px-2 py-1 rounded-lg uppercase">${statusLabel}</span>
                    <span class="text-white font-black text-lg">#${order.order_number}${customerName ? ' • ' + customerName.toUpperCase() : ''}</span>
                </div>
                <div class="text-right">
                    <p class="${timeColor} time-display font-mono font-bold text-sm"><i class="fa-regular fa-clock mr-1"></i>${timeStr}</p>
                </div>
            </div>

            <!-- Location & Customer / Garçom Info -->
            <div class="px-4 pb-3 flex flex-col space-y-1 border-b border-stone-700/50 mb-2">
                <div class="flex items-center justify-between">
                    <p class="text-emerald-400 font-black text-xs">
                        <i class="fa-solid fa-location-dot mr-1"></i>${locLabel}
                    </p>
                    <p class="text-stone-300 text-xs font-bold">
                        <i class="fa-solid fa-user-tie mr-1 text-emerald-400"></i>Garçom: ${staffName}
                    </p>
                </div>
                ${customerName ? `
                    <p class="text-amber-300 text-xs font-black truncate">
                        <i class="fa-solid fa-user-tag mr-1"></i>Cliente: ${customerName}
                    </p>
                ` : ''}
            </div>


            <!-- Items -->
            <div class="px-4 pb-3 space-y-2">
                ${items.map(item => `
                    <div class="flex items-start gap-2 ${item.status === 'pronto' ? 'opacity-40 line-through' : ''}">
                        <span class="text-amber-500 font-black text-sm min-w-[24px]">${item.quantity}x</span>
                        <div class="flex-1">
                            <p class="text-white font-bold text-sm leading-tight">${item.product_name}</p>
                            ${item.notes ? `<p class="text-amber-400 text-xs font-medium mt-0.5"><i class="fa-solid fa-circle-info mr-1"></i>${item.notes}</p>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>

            ${order.notes ? `<div class="px-4 pb-3"><p class="text-stone-500 text-xs bg-stone-900 rounded-lg p-2"><i class="fa-solid fa-message mr-1"></i>${order.notes}</p></div>` : ''}

            <!-- Action -->
            <div class="px-4 pb-4">
                ${actionBtn}
            </div>
        </div>
    `;
}

function updateTimersOnly() {
    const now = Date.now();
    document.querySelectorAll('.order-card-container').forEach(card => {
        const status = card.getAttribute('data-status');
        if(status === 'pronto' || status === 'entregue') return; // Do not tick anymore
        
        const createdAttr = card.getAttribute('data-created');
        const elapsed = now - new Date(createdAttr).getTime();
        const mins = Math.floor(elapsed / 60000);
        const secs = Math.floor((elapsed % 60000) / 1000);
        const timeStr = `${mins}:${String(secs).padStart(2, '0')}`;
        
        const timeEl = card.querySelector('.time-display');
        if(timeEl) {
            timeEl.innerHTML = `<i class="fa-regular fa-clock mr-1"></i>${timeStr}`;
            
            // Dynamic styling update for classes without re-rendering everything
            if(elapsed >= TIMER_CRITICAL) {
                // Whole card critical styling
                card.className = `order-card-container bg-[url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ef4444' fill-opacity='0.05' fill-rule='evenodd'%3E%3Ccircle cx='3' cy='3' r='3'/%3E%3Ccircle cx='13' cy='13' r='3'/%3E%3C/g%3E%3C/svg%3E")] bg-red-950/80 border-red-600 shadow-xl shadow-red-900/30 status-${status === 'preparando' ? 'preparing' : 'pending'} animate-pulse rounded-2xl overflow-hidden anim-in`;
                timeEl.className = 'time-display text-red-400 font-black decoration-wavy underline font-mono text-sm';
            } else if(elapsed > TIMER_LATE) {
                timeEl.className = 'time-display text-red-500 font-black font-mono text-sm';
            } else if(elapsed > TIMER_WARN) {
                timeEl.className = 'time-display text-amber-500 font-mono font-bold text-sm';
            }
        }
    });
}

// ====== ACTIONS ======
window.markPreparing = async (orderId) => {
    await supabase.from('orders').update({ status: 'preparando', updated_at: new Date().toISOString() }).eq('id', orderId);
    logKitchenAudit(orderId, 'preparando');
    loadOrders();
};

window.markReady = async (orderId) => {
    await supabase.from('orders').update({ status: 'pronto', updated_at: new Date().toISOString() }).eq('id', orderId);
    logKitchenAudit(orderId, 'pronto');
    loadOrders();
};

window.markDelivered = async (orderId) => {
    await supabase.from('orders').update({ status: 'entregue', updated_at: new Date().toISOString() }).eq('id', orderId);
    logKitchenAudit(orderId, 'entregue');
    loadOrders();
};

function logKitchenAudit(orderId, newStatus) {
    try {
        const order = orders.find(o => o.id === orderId);
        logAuditAction('STATUS_CHANGED', {
            order_id: orderId,
            order_number: order?.order_number || null,
            new_status: newStatus
        }, { type: order?.location_type, id: order?.location_id });
    } catch(e) {}
}

// ====== INIT ======
document.addEventListener('DOMContentLoaded', () => {
    // Auto-login if session exists
    const staff = getCurrentStaff();
    if (staff) {
        document.getElementById('loginScreen').style.display = 'none';
        startKDS();
    }
});
