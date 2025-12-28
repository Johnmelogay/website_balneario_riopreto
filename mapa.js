import { supabase } from './scripts.js';

let selectedDate = new Date();
let bookingsCache = [];

document.addEventListener("DOMContentLoaded", () => {
    // Init Date Picker with Today
    const dateInput = document.getElementById('datePicker');
    dateInput.valueAsDate = selectedDate;
    updateDateLabel();

    // Listeners
    dateInput.addEventListener('change', (e) => {
        const [y, m, d] = e.target.value.split('-').map(Number);
        selectedDate = new Date(y, m - 1, d);
        updateDateLabel();
        loadDataAndRender();
    });

    document.getElementById('prevDay').addEventListener('click', () => changeDay(-1));
    document.getElementById('nextDay').addEventListener('click', () => changeDay(1));

    // Initial Load
    loadDataAndRender();
});

function changeDay(delta) {
    selectedDate.setDate(selectedDate.getDate() + delta);
    document.getElementById('datePicker').valueAsDate = selectedDate;
    updateDateLabel();
    loadDataAndRender();
}

function updateDateLabel() {
    const options = { weekday: 'long' };
    let label = selectedDate.toLocaleDateString('pt-BR', options);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const check = new Date(selectedDate);
    check.setHours(0, 0, 0, 0);

    if (check.getTime() === today.getTime()) label = "HOJE";
    else if (check.getTime() === today.getTime() + 86400000) label = "AMANHÃ";
    else if (check.getTime() === today.getTime() - 86400000) label = "ONTEM";

    document.getElementById('dayOfWeekLabel').innerText = label.toUpperCase();
}

async function loadDataAndRender() {
    const y = selectedDate.getFullYear();
    const m = selectedDate.getMonth();
    const startOfMonth = new Date(y, m, 1).toISOString().split('T')[0];
    const endOfMonth = new Date(y, m + 1, 0).toISOString().split('T')[0];

    const { data: bookings, error } = await supabase
        .from('bookings')
        .select('*')
        .lt('checkin_date', endOfMonth)
        .gt('checkout_date', startOfMonth);

    if (bookings) bookingsCache = bookings;

    renderGrid();
}

function renderGrid() {
    const container = document.getElementById('cardsGrid');
    container.innerHTML = "";

    let free = 0, busy = 0, swap = 0;
    const isoDate = selectedDate.toISOString().split('T')[0];

    // Render Chalets 1 to 10
    for (let id = 1; id <= 10; id++) {
        const status = getStatus(id, isoDate);

        // DEFAULT: FREE
        let cardColor = "bg-white border-green-200";
        let iconColor = "bg-green-100 text-green-600";
        let iconType = "fa-house";
        let statusText = "Livre";
        let statusColorText = "text-gray-400";
        let guestName = "";
        let detailsHtml = "";

        let isFree = status.type === 'free';

        if (isFree) {
            free++;
            // FREE = GREEN (USER REQUEST)
            cardColor = "bg-green-500 border-green-600 text-white shadow-lg shadow-green-200 hover:brightness-110";
            iconColor = "bg-white/20 text-white";
            statusText = "Disponível";
            statusColorText = "text-white/90";
        }
        else {
            // OCCUPIED / PENDING / SWAP
            // Extract Details
            const b = status.booking;
            const isPending = b.status === 'pending';

            // Extract detailed info from JSON if needed for display
            let extraInfo = {};
            try {
                if (b.raw_message && b.raw_message.startsWith('{')) {
                    const rawObj = JSON.parse(b.raw_message);
                    extraInfo = rawObj.ai_parsed || {};
                }
            } catch (e) { }

            // COLORS & TEXT
            if (isPending) {
                // PENDENTE = AMARELO
                busy++;
                cardColor = "bg-yellow-400 border-yellow-500 text-white shadow-lg shadow-yellow-200";
                iconColor = "bg-white/20 text-white";
                iconType = "fa-clock";
                statusText = "Pendente (Aguardando)";
                statusColorText = "text-white/90";
                guestName = b.guest_name;
            } else {
                // CONFIRMADO = VERMELHO
                busy++;
                cardColor = "bg-red-600 border-red-700 text-white shadow-lg shadow-red-200";
                iconColor = "bg-white/20 text-white";
                iconType = "fa-bed";
                statusText = "Ocupado (Confirmado)";
                statusColorText = "text-white/90";
                guestName = b.guest_name;
            }

            // DAY SPECIFIC OVERRIDES (Check-in/Check-out visuals)
            if (status.type === 'entrada') {
                statusText = isPending ? "Entrada (Pendente)" : "Entrada (Check-in)";
                iconType = "fa-right-to-bracket";

            } else if (status.type === 'saida') {
                swap++;
                // Don't double count busy if we count swap separately conceptually, but here we just style it
                if (!isPending) {
                    // SAÍDA CONFIRMADA -> RED CLARO / ROSE (Ending Cycle)
                    cardColor = "bg-red-400 border-red-500 text-white shadow-lg shadow-red-200";
                    statusText = "Saída (Finalizando)";
                } else {
                    // Saída Pendente (Yellow still)
                    statusText = "Saída (Pendente)";
                }
                iconType = "fa-right-from-bracket";
            }

            // BUILD MINI DETAILS
            const adults = b.adults || extraInfo.adults || "?";
            const price = b.total_price || extraInfo.price ? `R$ ${b.total_price || extraInfo.price}` : "";

            const [yIn, mIn, dIn] = b.checkin_date.split('-');
            const [yOut, mOut, dOut] = b.checkout_date.split('-');
            const fmtDate = (d, m) => `${d}/${m}`;
            const dateRange = `${fmtDate(dIn, mIn)} a ${fmtDate(dOut, mOut)}`;

            detailsHtml = `
                <div class="mt-3 pt-2 border-t border-white/20 text-xs font-medium opacity-90 space-y-1 pointe-events-none">
                    <div class="flex items-center gap-2">
                        <i class="fa-regular fa-calendar"></i> ${dateRange}
                    </div>
                    <div class="flex items-center gap-2">
                        <i class="fa-solid fa-user-group"></i> ${adults} pessoas
                        ${price ? `<span class="ml-auto bg-black/20 px-1.5 rounded text-[10px]">${price}</span>` : ''}
                    </div>
                </div>
            `;
        }

        const card = document.createElement('div');
        card.className = `chalet-card relative p-4 rounded-3xl border-2 flex flex-col justify-between min-h-[12rem] ${cardColor} cursor-pointer transition-all`;

        // CLICK HANDLERS
        if (isFree) {
            card.onclick = function () { openNewReservation(id, isoDate); };
        } else {
            const bookingRef = status.booking;
            card.onclick = function () { openDetails(bookingRef); };
        }

        card.innerHTML = `
            <div class="flex justify-between items-start pointer-events-none">
                <div class="w-10 h-10 rounded-xl ${iconColor} flex items-center justify-center text-lg backdrop-blur-sm">
                    <i class="fa-solid ${iconType}"></i>
                </div>
                <span class="font-outfit font-black text-3xl opacity-20">#${id}</span>
            </div>
            
            <div class="mt-2 text-left pointer-events-none">
                <p class="text-[10px] font-bold uppercase tracking-wider mb-0.5 ${statusColorText}">${statusText}</p>
                <p class="font-bold text-lg leading-tight truncate w-full" title="${guestName}">${guestName || 'Chalé ' + id}</p>
                 ${detailsHtml}
            </div>
            
            ${isFree ?
                `<div class="mt-auto pt-4 flex justify-center opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
                    <span class="bg-white text-green-700 px-3 py-1.5 rounded-full text-xs font-bold shadow-sm">Reservar</span>
                </div>` : ''
            }
        `;

        container.appendChild(card);
    }

    document.getElementById('countFree').innerText = free;
    document.getElementById('countBusy').innerText = busy;
    document.getElementById('countSwap').innerText = swap;
}

function getStatus(chaletId, dateStr) {
    const bookings = bookingsCache.filter(b => b.chalet_id == chaletId);
    let entrada = null, saida = null, ocupado = null;

    for (const b of bookings) {
        if (b.checkin_date === dateStr) entrada = b;
        if (b.checkout_date === dateStr) saida = b;
        if (dateStr > b.checkin_date && dateStr < b.checkout_date) ocupado = b;
    }

    if (saida && entrada) return { type: 'saida', guest: `Sai: ${saida.guest_name?.split(' ')[0]}`, booking: saida };
    if (saida) return { type: 'saida', guest: saida.guest_name, booking: saida };
    if (entrada) return { type: 'entrada', guest: entrada.guest_name, booking: entrada };
    if (ocupado) return { type: 'ocupado', guest: ocupado.guest_name, booking: ocupado };

    return { type: 'free' };
}

// --- MODAL LOGIC ---

window.closeModal = (id) => {
    document.getElementById(id).classList.add('hidden');
}

window.openDetails = (booking) => {
    if (!booking) { console.error("No booking data"); return; }

    // Parse Extra
    let extra = {};
    try {
        if (booking.raw_message && booking.raw_message.startsWith('{')) {
            const rawObj = JSON.parse(booking.raw_message);
            extra = rawObj.ai_parsed || {};
        }
    } catch (e) { }

    // HEADERS
    document.getElementById('detailGuestName').innerText = booking.guest_name || "Sem Nome";
    document.getElementById('detailChaletInfo').innerText = `Chalé #${booking.chalet_id}`;
    document.getElementById('detailCheckin').innerText = formatDate(booking.checkin_date);
    document.getElementById('detailCheckout').innerText = formatDate(booking.checkout_date);
    document.getElementById('detailAdults').innerText = booking.adults || extra.adults || "0";

    // FINANCIALS
    const total = Number(booking.total_price || extra.total_price || 0);
    const paid = Number(booking.advance_payment || extra.advance_payment || 0);
    const pendingAmount = total - paid;

    document.getElementById('detailPrice').innerHTML = `
        <div class="flex flex-col">
            <span>Total: R$ ${total.toFixed(2)}</span>
            <span class="text-xs text-green-600">Pago: R$ ${paid.toFixed(2)}</span>
            ${pendingAmount > 0 ? `<span class="text-xs text-red-500 font-bold">Falta: R$ ${pendingAmount.toFixed(2)}</span>` : ''}
        </div>
    `;

    // STATUS BADGE
    const statusBadge = document.getElementById('detailStatusBadge');
    const isPending = booking.status === 'pending';
    statusBadge.innerText = isPending ? "PENDENTE (Pré-Reserva)" : "CONFIRMADO";
    statusBadge.className = isPending
        ? "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-yellow-100 text-yellow-600"
        : "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-green-100 text-green-600";

    // ARRIVAL & FEE
    const arrivalEl = document.getElementById('detailCheckinTime');
    let arrivalText = booking.arrival_time || extra.arrival_time || "--:--";
    let feeHtml = "";
    if (booking.is_late_arrival) {
        feeHtml = ` <span class="ml-2 text-red-500 font-bold">(Multa Total R$${booking.late_fee})</span>`;
    }
    arrivalEl.innerHTML = `Chegada: ${arrivalText}${feeHtml}`;
    arrivalEl.classList.remove('hidden');

    // ADDITIONAL INFO LIST
    let notesHtml = "";

    // Contact
    if (booking.contact_info) {
        notesHtml += `<div class="mb-3 p-2 bg-blue-50 rounded border border-blue-100 text-sm text-blue-800">
            <i class="fa-solid fa-address-book mr-1"></i> <strong>Contato:</strong> ${booking.contact_info}
        </div>`;
    }

    // Receipt Link
    if (booking.payment_proof_url) {
        notesHtml += `<div class="mb-3">
            <a href="${booking.payment_proof_url}" target="_blank" class="block w-full text-center py-2 bg-indigo-50 text-indigo-700 font-bold rounded-lg border border-indigo-200 hover:bg-indigo-100 transition">
                <i class="fa-solid fa-paperclip mr-2"></i> Ver Comprovante
            </a>
        </div>`;
    }

    // Notes
    if (extra.notes) notesHtml += `<p class="mb-2 text-sm italic">Obs: "${extra.notes}"</p>`;
    document.getElementById('detailExtra').innerHTML = notesHtml || "<p class='text-sm text-gray-400'>Sem informações extras.</p>";


    // ACTIONS
    const btnDelete = document.getElementById('btnDelete');
    btnDelete.onclick = () => deleteReservation(booking.id);

    // CONFIRM BUTTON INJECTION
    const existingConfirm = document.getElementById('btnConfirmRes');
    if (existingConfirm) existingConfirm.remove();

    if (isPending) {
        const confirmBtn = document.createElement('button');
        confirmBtn.id = 'btnConfirmRes';
        confirmBtn.className = "flex-1 py-3 rounded-xl bg-green-600 text-white font-bold text-sm hover:bg-green-700 transition shadow-lg shadow-green-200 ml-2";
        confirmBtn.innerHTML = `<i class="fa-solid fa-check"></i> CONFIRMAR`;
        confirmBtn.onclick = () => confirmReservation(booking.id);

        const footer = btnDelete.parentElement;
        footer.appendChild(confirmBtn);
    }

    document.getElementById('modalDetails').classList.remove('hidden');
}

window.openNewReservation = (chaletId, defaultDate) => {
    document.getElementById('newChaletId').value = chaletId;
    document.getElementById('newChaletBadge').innerText = `Chalé #${chaletId}`;
    document.getElementById('newGuestName').value = "";
    document.getElementById('newContact').value = ""; // NEW
    document.getElementById('newCheckin').value = defaultDate;

    const nextDay = new Date(defaultDate);
    nextDay.setDate(nextDay.getDate() + 1);
    const y = nextDay.getFullYear();
    const m = String(nextDay.getMonth() + 1).padStart(2, '0');
    const d = String(nextDay.getDate()).padStart(2, '0');
    document.getElementById('newCheckout').value = `${y}-${m}-${d}`;

    document.getElementById('newAdults').value = "2 Adultos";
    document.getElementById('newTime').value = "14:00";
    document.getElementById('newSource').value = "WhatsApp"; // NEW
    document.getElementById('newPlate').value = ""; // NEW
    document.getElementById('newPrice').value = "";
    document.getElementById('newPaid').value = "";
    document.getElementById('newProof').value = ""; // NEW
    document.getElementById('newNotes').value = "";

    document.getElementById('modalNew').classList.remove('hidden');
}

window.saveReservation = async () => {
    const chaletId = document.getElementById('newChaletId').value;
    const name = document.getElementById('newGuestName').value;
    const contact = document.getElementById('newContact').value; // NEW
    const checkin = document.getElementById('newCheckin').value;
    const checkout = document.getElementById('newCheckout').value;
    const adults = document.getElementById('newAdults').value;
    const time = document.getElementById('newTime').value;
    const source = document.getElementById('newSource').value; // NEW
    const plate = document.getElementById('newPlate').value; // NEW
    const price = document.getElementById('newPrice').value;
    const paid = document.getElementById('newPaid').value;
    const notes = document.getElementById('newNotes').value;
    const fileInput = document.getElementById('newProof'); // NEW

    if (!name || !checkin || !checkout) {
        alert("Preencha obrigatórios: Nome, check-in e check-out.");
        return;
    }

    // 1. UPLOAD FILE IF EXISTS
    let proofUrl = null;
    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const fileExt = file.name.split('.').pop();
        const fileName = `manual_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `manual_uploads/${fileName}`;

        try {
            // Basic Supabase upload (using global client passed from scripts usually, or imported)
            // We need to ensure supabase client works with storage here.
            // Usually map.js imports `supabase`.

            const { error: uploadError } = await supabase.storage
                .from('receipts')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: publicData } = supabase.storage
                .from('receipts')
                .getPublicUrl(filePath);

            proofUrl = publicData.publicUrl;

        } catch (err) {
            console.error("Upload failed", err);
            alert("Falha no upload do comprovante: " + err.message);
            // We continue saving without the file? Or stop? 
            // Better stop and warn.
            return;
        }
    }

    // Construct Object for V2 Schema
    const insertData = {
        chalet_id: chaletId,
        guest_name: name,
        contact_info: contact, // NEW
        checkin_date: checkin,
        checkout_date: checkout,
        adults: parseInt(adults) || 2,
        arrival_time: time,
        total_price: parseFloat(price) || 0,
        advance_payment: parseFloat(paid) || 0,
        payment_proof_url: proofUrl, // NEW
        status: 'pending', // Manual starts pending
        // Store extras in raw_message JSON since we don't have columns for Plate/Source yet
        raw_message: JSON.stringify({
            manual: true,
            ai_parsed: {
                notes,
                source,
                plate
            }
        })
    };

    const { error } = await supabase
        .from('bookings')
        .insert(insertData);

    if (error) {
        alert("Erro ao salvar: " + error.message);
    } else {
        closeModal('modalNew');
        loadDataAndRender();
    }
}

window.deleteReservation = async (id) => {
    if (!confirm("Tem certeza que deseja excluir esta reserva?")) return;

    const { error } = await supabase
        .from('bookings')
        .delete()
        .eq('id', id);

    if (error) {
        alert("Erro ao excluir: " + error.message);
    } else {
        closeModal('modalDetails');
        loadDataAndRender();
    }
}

window.confirmReservation = async (id) => {
    if (!confirm("Confirmar oficialmente esta reserva? Ela ficará Vermelha (Ocupada).")) return;

    const { error } = await supabase
        .from('bookings')
        .update({ status: 'confirmed' })
        .eq('id', id);

    if (error) {
        alert("Erro: " + error.message);
    } else {
        closeModal('modalDetails');
        loadDataAndRender();
    }
}

function formatDate(isoStr) {
    if (!isoStr) return "--/--/----";
    const [y, m, d] = isoStr.split('-');
    return `${d}/${m}/${y}`;
}
