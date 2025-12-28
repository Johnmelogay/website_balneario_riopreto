import { supabase } from './scripts.js';

let publicDate = new Date();
let publicCache = [];

document.addEventListener("DOMContentLoaded", () => {
    const picker = document.getElementById('publicDatePicker');
    if (!picker) return; // Guard clause if element missing

    picker.valueAsDate = publicDate;

    // Listeners
    picker.addEventListener('change', (e) => {
        const [y, m, d] = e.target.value.split('-').map(Number);
        publicDate = new Date(y, m - 1, d);
        loadPublicMap();
    });

    document.getElementById('pubPrevDay').addEventListener('click', () => changePublicDay(-1));
    document.getElementById('pubNextDay').addEventListener('click', () => changePublicDay(1));

    loadPublicMap();
});

function changePublicDay(delta) {
    publicDate.setDate(publicDate.getDate() + delta);
    document.getElementById('publicDatePicker').valueAsDate = publicDate;
    loadPublicMap();
}

async function loadPublicMap() {
    const y = publicDate.getFullYear();
    const m = publicDate.getMonth();
    const startOfMonth = new Date(y, m, 1).toISOString().split('T')[0];
    const endOfMonth = new Date(y, m + 1, 0).toISOString().split('T')[0];

    // SECURE FETCH: We select ONLY non-sensitive fields
    const { data: bookings } = await supabase
        .from('bookings')
        .select('chalet_id, checkin_date, checkout_date, status')
        .lte('checkin_date', endOfMonth)
        .gte('checkout_date', startOfMonth)
        .neq('status', 'cancelled');

    // FETCH BLOCKS
    const { data: blocks } = await supabase
        .from('blocked_chalets')
        .select('chalet_id');

    if (bookings) publicCache = bookings;
    if (blocks) window.blockedCache = blocks.map(b => b.chalet_id); // Global or Module scope

    renderPublicGrid();
}

function renderPublicGrid() {
    const container = document.getElementById('publicMapGrid');
    if (!container) return;

    container.innerHTML = "";
    const isoDate = publicDate.toISOString().split('T')[0];

    for (let id = 1; id <= 10; id++) {
        const status = getPublicStatus(id, isoDate);

        // Base Styles
        let colorClass = "bg-white border-green-100";
        let icon = "fa-house";
        let text = "Disponível";
        let textColor = "text-green-600";
        let isClickable = true;

        if (status === 'busy') {
            colorClass = "bg-red-50 border-red-100 opacity-70 grayscale";
            icon = "fa-ban";
            text = "Ocupado";
            textColor = "text-red-400";
            isClickable = false;
        } else if (status === 'pending') {
            colorClass = "bg-yellow-50 border-yellow-100";
            icon = "fa-clock";
            text = "Pré-Reservado";
            textColor = "text-yellow-600";
            isClickable = false; // Or true? Let's say false to avoid confusion
        } else if (status === 'maintenance') {
            colorClass = "bg-gray-100 border-gray-200 opacity-50 grayscale";
            icon = "fa-screwdriver-wrench";
            text = "Indisponível";
            textColor = "text-gray-500";
            isClickable = false;
        }

        // HTML
        const div = document.createElement('div');
        div.className = `relative flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all duration-300 ${colorClass} ${isClickable ? 'cursor-pointer hover:border-green-500 hover:shadow-lg hover:-translate-y-1' : 'cursor-not-allowed'}`;

        div.innerHTML = `
            <span class="absolute top-2 right-3 text-xs font-black opacity-20 text-gray-900">#${id}</span>
            <div class="w-10 h-10 rounded-full flex items-center justify-center mb-2 ${isClickable ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}">
                <i class="fa-solid ${icon}"></i>
            </div>
            <p class="text-sm font-bold ${textColor}">${text}</p>
            ${isClickable ? '<div class="mt-2 text-[10px] bg-green-500 text-white px-2 py-0.5 rounded-full uppercase tracking-wide font-bold">Reservar</div>' : ''}
        `;

        if (isClickable) {
            div.onclick = () => {
                // Open the existing Modal in index.html
                // We assume openBookingModal exists globally
                if (window.openBookingModal) {
                    window.openBookingModal('Chalé', id);
                    // Pre-fill date?
                    try { document.getElementById('date').value = isoDate; } catch (e) { }
                }
            };
        }

        container.appendChild(div);
    }
}

function getPublicStatus(chaletId, dateStr) {
    const bookings = publicCache.filter(b => b.chalet_id == chaletId);

    // Check overlapping
    const busy = bookings.some(b =>
        b.checkin_date <= dateStr && b.checkout_date > dateStr // Exclusive of checkout day? Usually checkout day is free for checkin after 14h.
        // Let's stick to standard logic: If dateStr is within range. 
        // Logic: Checkin=25, Checkout=26. 
        // If query 25: 25 <= 25 && 26 > 25 (TRUE) -> Busy
        // If query 26: 25 <= 26 && 26 > 26 (FALSE) -> Free (Checkout day is available for new checkin)
    );

    // Check for Maintenance (Dynamic)
    if (window.blockedCache && window.blockedCache.includes(chaletId)) return 'maintenance';

    if (busy) {
        // Find specific one to check status
        const booking = bookings.find(b => b.checkin_date <= dateStr && b.checkout_date > dateStr);
        if (booking && booking.status === 'pending') return 'pending';
        return 'busy';
    }
    return 'free';
}
