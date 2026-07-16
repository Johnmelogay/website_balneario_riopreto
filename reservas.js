import { openWhatsApp, CONSTANTS, captureLead, supabase } from './scripts.js';
import { galleryLightbox } from './lightbox.js';

// --- API REMOVED (Migrated to Supabase) ---

document.addEventListener("DOMContentLoaded", () => {
    const mainHeader = document.getElementById('main-header');
    if (mainHeader) {
        function handleScrollHeader() {
            if (window.scrollY > 50) {
                mainHeader.classList.add('scrolled-header');
            } else {
                mainHeader.classList.remove('scrolled-header');
            }
        }
        window.addEventListener('scroll', handleScrollHeader);
    }

    // Verify availability (Supabase)
    setTimeout(verificarDisponibilidade, 500);
    renderGaleria();

    const checkinInput = document.getElementById("checkin");
    const checkoutInput = document.getElementById("checkout");

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

    if (checkinInput) {
        checkinInput.min = todayStr;
        if (!checkinInput.value) checkinInput.value = todayStr;
    }
    if (checkoutInput) {
        checkoutInput.min = tomorrowStr;
        if (!checkoutInput.value) checkoutInput.value = tomorrowStr;
    }

    if (checkinInput) {
        checkinInput.addEventListener("change", () => {
            const checkinVal = checkinInput.value;
            if (checkinVal) {
                const nextDay = new Date(checkinVal + 'T12:00:00');
                nextDay.setDate(nextDay.getDate() + 1);
                const nextDayStr = nextDay.toISOString().split('T')[0];
                checkoutInput.min = nextDayStr;

                const checkoutVal = checkoutInput.value;
                if (!checkoutVal || checkoutVal <= checkinVal) {
                    checkoutInput.value = nextDayStr;
                }
            }
            calcular();
            verificarDisponibilidade();
        });
    }

    if (checkoutInput) {
        checkoutInput.addEventListener("change", () => {
            const checkinVal = checkinInput.value;
            const checkoutVal = checkoutInput.value;
            if (checkoutVal && checkinVal && checkoutVal <= checkinVal) {
                const prevDay = new Date(checkoutVal + 'T12:00:00');
                prevDay.setDate(prevDay.getDate() - 1);
                checkinInput.value = prevDay.toISOString().split('T')[0];
            }
            calcular();
            verificarDisponibilidade();
        });
    }
    document.getElementById("adultos").addEventListener("change", calcular);

    document.addEventListener("change", function (e) {
        if (e.target && e.target.name === "chale") {
            document.getElementById("erro-chale").classList.add("hidden");
            calcular();
        }
    });

    window.changeValue = changeValue;
    window.enviarWhatsapp = enviarWhatsapp;
    window.openFullscreenItem = openFullscreenItem;
    window.closeFullscreen = closeFullscreen;

    // --- PRE-FILL FROM URL PARAMS ---
    const params = new URLSearchParams(window.location.search);
    if (params.has('nome')) document.getElementById('nome-reserva').value = params.get('nome');
    if (params.has('email')) document.getElementById('email-reserva').value = params.get('email');
    if (params.has('adultos')) document.getElementById('adultos').value = params.get('adultos');
    if (params.has('checkin')) {
        const checkinDate = params.get('checkin');
        document.getElementById('checkin').value = checkinDate;

        // Auto-set checkout to next day
        try {
            const date = new Date(checkinDate);
            date.setDate(date.getDate() + 1);
            document.getElementById('checkout').value = date.toISOString().split('T')[0];
        } catch (e) { console.error('Error setting checkout date', e); }

        // Trigger calculation
        setTimeout(calcular, 500);
    }
});


function changeValue(id, delta) {
    const input = document.getElementById(id);
    let val = parseInt(input.value) || 0;
    let min = parseInt(input.getAttribute('min')) || 0;

    let newVal = val + delta;
    if (newVal >= min) {
        input.value = newVal;
        calcular();
    }
}

function calcular() {
    const checkin = document.getElementById("checkin").value;
    const checkout = document.getElementById("checkout").value;
    const adultos = parseInt(document.getElementById("adultos").value) || 0;
    const criancas5 = parseInt(document.getElementById("criancas5")?.value) || 0;

    const elNoites = document.getElementById("resumoNoites");
    const elDiaria = document.getElementById("resumoDiaria");
    const elTotal = document.getElementById("resumoTotal");

    if (!checkin || !checkout) {
        elNoites.innerText = "--";
        elDiaria.innerText = "R$ 0,00";
        elTotal.innerText = "R$ 0,00";
        return;
    }

    const [y1, m1, d_1] = checkin.split('-').map(Number);
    const [y2, m2, d_2] = checkout.split('-').map(Number);

    const d1 = new Date(Date.UTC(y1, m1 - 1, d_1));
    const d2 = new Date(Date.UTC(y2, m2 - 1, d_2));
    const d1Day = new Date(y1, m1 - 1, d_1); // For local day of week

    const diffMs = d2 - d1;
    const noites = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (noites <= 0) {
        elNoites.innerText = "Data Inválida";
        elTotal.innerText = "---";
        return;
    }

    elNoites.innerText = `${noites} noite(s)`;

    // --- DISCOUNT LOGIC ---
    // "Desconto de reservas de sexta a domingo"
    // Interpretando: Check-in Sexta (5), Checkout Domingo (0) ou Segunda (1) com Domingo incluso?
    // Geralmente pacote de fds é entra sexta sai domingo = 2 noites.
    const dayOfWeek = d1Day.getDay(); // 0-Dom, 1-Seg, ..., 5-Sex, 6-Sab
    let discount = 0;
    let isWeekendPackage = false;

    // Se checkin é Sexta(5) E check-out é Domingo(0) ou depois
    if (dayOfWeek === 5 && noites >= 2) {
        discount = 40;
        isWeekendPackage = true;
    }

    // Sunday Checkout Message
    // Se checkout cai no domingo
    const d2Day = new Date(y2, m2 - 1, d_2);
    if (d2Day.getDay() === 0) { // 0 = Domingo
        // Poderia injetar uma msg na UI, mas por enquanto só cálculo
        // Se tiver local para msg:
        // document.getElementById('msg-checkout').innerText = "Domingo: Saída estendida até 16h30!";
    }


    let valorBase = 280;
    let valorExtraAdulto = 40;
    let valorExtraCrianca = 20;

    let valorDiaria = valorBase;

    if (adultos > 2) {
        valorDiaria += (adultos - 2) * valorExtraAdulto;
    }

    valorDiaria += criancas5 * valorExtraCrianca;

    elDiaria.innerText = "R$ " + valorDiaria.toFixed(2).replace('.', ',');

    let total = valorDiaria * noites;

    // Aplica desconto no total
    if (isWeekendPackage) {
        total -= discount;
        // Poderia mostrar visualmente "Desconto aplicado: R$ 40"
        // Como não alterei o HTML para ter slots de desconto, vou apenas garantir o total certo.
        // Se possível, adicionaria um elemento extra pelo JS.
        let helperText = "";
        if (document.getElementById("discount-helper")) {
            document.getElementById("discount-helper").remove();
        }
        if (isWeekendPackage) {
            const span = document.createElement("span");
            span.id = "discount-helper";
            span.className = "text-xs text-green-600 font-bold block text-right";
            span.innerText = "Desconto FDS aplicado (-R$ 40)";
            elTotal.parentNode.appendChild(span);
        }
    } else {
        if (document.getElementById("discount-helper")) {
            document.getElementById("discount-helper").remove();
        }
    }

    elTotal.innerText = "R$ " + total.toFixed(2).replace('.', ',');
}

function enviarWhatsapp() {
    // --- LEAD CAPTURE VALIDATION ---
    const nome = document.getElementById("nome-reserva").value;
    const email = document.getElementById("email-reserva").value;

    if (!nome || !email) {
        alert("Por favor, preencha seu Nome e E-mail para continuar.");
        document.getElementById("nome-reserva").focus();
        return;
    }

    const checkin = document.getElementById("checkin").value;
    const checkout = document.getElementById("checkout").value;

    if (!checkin || !checkout) {
        alert("Por favor, selecione as datas de entrada e saída.");
        document.getElementById("checkin").scrollIntoView({ behavior: "smooth" });
        document.getElementById("checkin").focus();
        return;
    }

    const adultos = document.getElementById("adultos").value;
    const criancas5 = document.getElementById("criancas5")?.value || 0;
    const criancas0 = document.getElementById("criancas0")?.value || 0;
    const horarioChegada = document.getElementById("horarioChegada").value || "Não informado";
    const chaleInput = document.querySelector('input[name="chale"]:checked');

    if (!chaleInput) {
        document.getElementById("erro-chale").classList.remove("hidden");
        document.getElementById("chale-opcoes").scrollIntoView({ behavior: "smooth" });
        return;
    }

    const chale = chaleInput.value;
    document.getElementById("erro-chale").classList.add("hidden");
    const total = document.getElementById("resumoTotal").innerText;

    const [yIn, mIn, dIn] = checkin.split('-');
    const dataIn = `${dIn}/${mIn}/${yIn}`;

    const [yOut, mOut, dOut] = checkout.split('-');
    const dataOut = `${dOut}/${mOut}/${yOut}`;

    // --- CAPTURE LEAD ASYNC (FIRE AND FORGET OR AWAIT?) ---
    // Since we open a new tab, async without await is risky if browser closes too fast, 
    // but usually fine. For safety, we can await if we make function async, 
    // but window.enviarWhatsapp is called by onclick HTML attribute.
    // It's better to update it to be async and await captureLead.
    captureLead({
        name: nome,
        email: email,
        intention: 'reserva_simulador',
        details: { checkin, checkout, adultos, chale, total }
    }).then(() => {
        const texto = `Olá! Me chamo *${nome}*.\nFiz uma simulação no site e gostaria de confirmar a disponibilidade:\n\n` +
            `📅 *Data:* ${dataIn} até ${dataOut}\n` +
            `👥 *Pessoas:* ${adultos} Adultos, ${criancas5} Crianças (5-8), ${criancas0} Bebês\n` +
            `⏰ *Horário previsto de chegada:* ${horarioChegada}\n` +
            `🏠 *Preferência:* ${chale}\n` +
            `💰 *Valor Estimado:* ${total}\n\n` +
            `Aguardo confirmação para efetuar o pagamento.`;

        openWhatsApp({ text: texto });
    });
}

// --- SUPABASE AVAILABILITY LOGIC ---

async function verificarDisponibilidade() {
    const checkinInput = document.getElementById("checkin");
    const checkoutInput = document.getElementById("checkout");
    const checkin = checkinInput ? checkinInput.value : "";
    const checkout = checkoutInput ? checkoutInput.value : "";

    if (!checkin || !checkout || checkout <= checkin) {
        renderOpcoesChale([]);
        return;
    }

    const start = checkin;
    const end = checkout;

    // Visual loading state
    const container = document.getElementById("chale-opcoes");
    if (container) container.style.opacity = "0.5";

    try {
        if (!supabase) {
            console.warn("Supabase client not ready.");
            return;
        }

        // QUERY: Find bookings that OVERLAP with [start, end]
        // overlap: (book_start < query_end) AND (book_end > query_start)
        // Note: Supabase filtering on Date columns works well with strings YYYY-MM-DD
        const { data: bookingsData, error: bookingsError } = await supabase
            .from('bookings')
            .select('chalet_id')
            .in('status', ['confirmed', 'pending'])
            .lt('checkin_date', end)
            .gt('checkout_date', start);

        if (bookingsError) throw bookingsError;

        const { data: blocksData, error: blocksError } = await supabase
            .from('blocked_chalets')
            .select('chalet_id');

        if (blocksError) throw blocksError;

        // Extract blocked IDs
        const blockedIds = [
            ...bookingsData.map(b => parseInt(b.chalet_id)),
            ...blocksData.map(b => parseInt(b.chalet_id))
        ];

        renderOpcoesChale(blockedIds);

    } catch (err) {
        console.error("Erro ao verificar disponibilidade:", err);
        renderOpcoesChale([]); // Fallback: Show all available (or handle error UI)
    } finally {
        if (container) container.style.opacity = "1";
    }
}

function renderOpcoesChale(blockedIds = []) {
    const container = document.getElementById("chale-opcoes");
    if (!container) return;
    container.innerHTML = "";

    const grupos = {
        "De Frente Para o Gramado": [3, 4, 5, 6],
        "De Frente Para a Piscina": [7, 8, 9, 10]
    };

    Object.keys(grupos).forEach(area => {
        const titulo = document.createElement('div');
        titulo.className = "flex items-center gap-2 mt-4 mb-2";
        titulo.innerHTML = `
        <div class="h-px bg-gray-200 flex-1"></div>
        <span class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">${area}</span>
        <div class="h-px bg-gray-200 flex-1"></div>
    `;
        container.appendChild(titulo);

        const gridDiv = document.createElement('div');
        gridDiv.className = "grid grid-cols-2 gap-3";

        grupos[area].forEach(num => {
            // CHECK IF BLOCKED
            const isBusy = blockedIds.includes(num);
            const isAvailable = !isBusy;

            let wrapperClass = "relative flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all duration-200 cursor-pointer select-none text-center h-20";

            if (area === "De Frente Para a Piscina") {
                wrapperClass += " bg-blue-50/90";
            } else if (area === "De Frente Para o Gramado") {
                wrapperClass += " bg-green-50/60";
            }

            let iconClass = "text-xl mb-1";
            let textStatus = "";
            let disabledAttr = "";

            if (isAvailable) {
                wrapperClass += " bg-white border-gray-100 hover:border-primary-green hover:shadow-md hover:bg-green-50/50";
                iconClass += " text-primary-green";
                textStatus = `<span class="text-[10px] font-bold text-green-600 uppercase">Livre</span>`;
            } else {
                // BUSY STYLE
                wrapperClass += " bg-gray-100 border-gray-100 opacity-50 cursor-not-allowed grayscale";
                iconClass += " text-gray-400";
                textStatus = `<span class="text-[10px] font-bold text-red-400 uppercase line-through">Ocupado</span>`;
                disabledAttr = "disabled";
            }

            let iconName = area === "De Frente Para a Piscina" ? "fa-water" : "fa-home";

            const cardHtml = `
        <label class="relative block w-full">
            <input type="radio" name="chale" value="Chalé ${num} (${area})" class="peer sr-only chale-radio" ${disabledAttr}>
            <div class="${wrapperClass}">
                <i class="fa-solid ${iconName} ${iconClass} opacity-80"></i>
                <span class="font-bold text-gray-800 text-sm leading-none mb-1">Chalé ${num}</span>
                ${textStatus}
                <div class="absolute top-2 right-2 text-primary-green opacity-0 peer-checked:opacity-100 transition-opacity">
                    <i class="fa-solid fa-circle-check"></i>
                </div>
            </div>
        </label>
      `;
            gridDiv.innerHTML += cardHtml;
        });

        container.appendChild(gridDiv);
    });
}

// Lista dinâmica de imagens e vídeos (SUPABASE HOSTED + THUMBNAILS)
const BASE_VIDEO_URL = "https://hihaipaslnpaqnqotrwm.supabase.co/storage/v1/object/public/website-assets/videos";

// Use images present in repo as temporary placeholders for video covers to speed up loading
const galeriaMidia = [
    { type: 'image', src: "images/img-aerea.jpg", caption: "Chalé 10" },
    { type: 'video', src: `${BASE_VIDEO_URL}/aconchego720p.mp4`, thumb: "images/aconchego_thumbnail.png", caption: "Aconchego" },
    { type: 'video', src: `${BASE_VIDEO_URL}/hero-video720p.mp4`, thumb: "images/hero-video_thumbnail.png", caption: "Destaques" },
    { type: 'video', src: `${BASE_VIDEO_URL}/pool720p.mp4`, thumb: "images/pool_thumbnail.png", caption: "Piscina" },
    { type: 'video', src: `${BASE_VIDEO_URL}/toboagua720p.mp4`, thumb: "images/toboagua_thumbnail.png", caption: "Toboágua" },
    { type: 'video', src: `${BASE_VIDEO_URL}/vistaparario720p.mp4`, thumb: "images/vistaparario_thumbnail.png", caption: "Vista para o Rio" },
    { type: 'video', src: `${BASE_VIDEO_URL}/peopleplaying720p.mp4`, thumb: "images/peopleplaying_thumbnail.png", caption: "Diversão" },
    { type: 'video', src: `${BASE_VIDEO_URL}/paradise720p.mp4`, thumb: "images/paradise_thumbnail.png", caption: "Paraíso" },
    { type: 'video', src: `${BASE_VIDEO_URL}/beach720p.mp4`, thumb: "images/beach_thumbnail.png", caption: "Praia" },
];

function renderGaleria() {
    const grid = document.getElementById("galeria-grid");
    if (!grid) return;
    grid.innerHTML = "";

    galeriaMidia.forEach((mediaItem, index) => {
        // Support both old string format (fallback) and new object format
        const isObj = typeof mediaItem === 'object';
        const src = isObj ? mediaItem.src : mediaItem;
        const type = isObj ? mediaItem.type : (src.endsWith('.mp4') ? 'video' : 'image');
        const thumb = isObj ? (mediaItem.thumb || src) : src;
        const caption = isObj ? mediaItem.caption : "";

        const itemDiv = document.createElement("div");
        itemDiv.className = "rounded-2xl overflow-hidden relative shadow-sm group cursor-pointer bg-gray-100 min-h-[200px]";

        // Grid Spacing: First item is big
        if (index === 0) {
            itemDiv.classList.add("col-span-2", "row-span-2", "md:min-h-[400px]");
        }

        // On Click -> Lightbox
        itemDiv.onclick = () => {
            galleryLightbox.open(galeriaMidia, index);
        };

        // Render Content (Thumbnail Image)
        const img = document.createElement('img');
        img.src = thumb;
        img.alt = caption;
        img.className = "w-full h-full object-cover transition duration-700 group-hover:scale-110";
        img.loading = "lazy";

        // Error handling for thumbnail
        img.onerror = () => {
            if (thumb.includes('supabase')) img.src = 'images/droneview.png';
        };

        itemDiv.appendChild(img);

        // Overlays
        const overlayDiv = document.createElement('div');
        overlayDiv.className = "absolute inset-0 transition-colors duration-300";

        if (type === 'video') {
            overlayDiv.classList.add("bg-black/10", "group-hover:bg-black/20", "flex", "items-center", "justify-center");
            overlayDiv.innerHTML = `
                <div class="w-14 h-14 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/50 shadow-lg group-hover:scale-110 transition-transform">
                    <i class="fa-solid fa-play text-white text-2xl ml-1"></i>
                </div>
            `;
        } else {
            overlayDiv.classList.add("bg-black/0", "group-hover:bg-black/10");
        }
        itemDiv.appendChild(overlayDiv);

        // Caption Badge (Optional)
        if (caption) {
            const capDiv = document.createElement('div');
            capDiv.className = "absolute bottom-4 left-4 pointer-events-none";
            capDiv.innerHTML = `<p class="text-white text-sm font-bold drop-shadow-md border border-white/20 bg-black/20 backdrop-blur-md px-3 py-1 rounded-full">${caption}</p>`;
            itemDiv.appendChild(capDiv);
        }

        grid.appendChild(itemDiv);
    });
}

// Deprecated functions (kept as empty to avoid breakage)
window.openFullscreenItem = () => { };
window.closeFullscreen = () => { };
