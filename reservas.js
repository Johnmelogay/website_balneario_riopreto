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

    document.getElementById("checkin").addEventListener("change", () => {
        calcular();
        verificarDisponibilidade();
    });
    document.getElementById("checkout").addEventListener("change", () => {
        calcular();
        verificarDisponibilidade();
    });
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

    const d1 = new Date(checkin);
    // O checkout na lógica de hotéis é "saída até o meio dia", então pagou pela noite anterior.
    // Mas aqui o cálculo deve considerar a quantidade de noites.
    // Para evitar issues de fuso horário, usar setHours no cálculo de diff apenas.
    // Mas preciso do Dia da Semana.
    const d1Day = new Date(checkin + 'T00:00:00'); // Força a data local para pegar dia da semana correto
    const d2 = new Date(checkout);

    d1.setHours(0, 0, 0, 0);
    d2.setHours(0, 0, 0, 0);

    const diffMs = d2 - d1;
    const noites = diffMs / (1000 * 60 * 60 * 24);

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
    const d2Day = new Date(checkout + 'T00:00:00');
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

    const dataIn = new Date(checkin).toLocaleDateString('pt-BR');
    const dataOut = new Date(checkout).toLocaleDateString('pt-BR');

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
    const checkin = document.getElementById("checkin").value;
    const checkout = document.getElementById("checkout").value;

    // Default to today/next day if empty to show general availability
    const start = checkin || new Date().toISOString().split('T')[0];
    const end = checkout || new Date(Date.now() + 86400000).toISOString().split('T')[0];

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
        const { data, error } = await supabase
            .from('bookings')
            .select('chalet_id')
            .lt('checkin_date', end)
            .gt('checkout_date', start);

        if (error) throw error;

        // Extract blocked IDs
        const blockedIds = data.map(b => b.chalet_id);
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

// Lista dinâmica de imagens e vídeos (PLACEHOLDERS RELEVANTES)
const galeriaMidia = [
    "images/img-aerea.jpg",
    "videos/aconchego.mp4",
    "videos/hero-video.mp4",
    "videos/pool.mp4",
    "videos/vistaparario.mp4",
    "videos/peopleplaying.mp4",
    "videos/paradise.mp4",
    "videos/beach.mp4",
    
];

function renderGaleria() {
    const grid = document.getElementById("galeria-grid");
    if (!grid) return;
    grid.innerHTML = "";

    galeriaMidia.forEach((src, index) => {
        const isVideo = src.endsWith(".mp4");
        // Imagem fallback
        const fallbackSrc = `https://placehold.co/800x800/2E7D32/FFF?text=RioPreto-${index}`;

        const item = document.createElement("div");
        item.className = "rounded-2xl overflow-hidden relative shadow-sm group cursor-pointer";

        // --- NEW LIGHTBOX INTEGRATION ---
        item.onclick = () => {
            galleryLightbox.open(galeriaMidia, index);
        };

        if (index === 0) {
            item.classList.add("col-span-2", "row-span-2");
        }

        let overlayHTML = `
      <div class="absolute bottom-4 left-4">
          <p class="text-white text-lg font-bold drop-shadow-md"></p>
      </div>
    `;

        if (index === 0) {
            overlayHTML = `
          <div class="absolute bottom-4 left-4">
              <span class="bg-white/20 backdrop-blur-md text-white text-[10px] px-2 py-1 rounded mb-1 inline-block">Destaque</span>
              <p class="text-white text-lg font-bold drop-shadow-md">Passeio Virtual</p>
          </div>
        `;
        }

        if (isVideo) {
            item.innerHTML = `
          <video src="${src}" muted loop playsinline onmouseover="this.play()" onmouseout="this.pause()" class="w-full h-full object-cover"></video>
          ${overlayHTML}
          <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
            <i class="fa-solid fa-play text-white/80 text-4xl drop-shadow-lg"></i>
          </div>
        `;
        } else {
            item.innerHTML = `
          <img src="${src}" onerror="this.src='${fallbackSrc}'" class="w-full h-full object-cover transition duration-500 group-hover:scale-110">
          ${overlayHTML}
        `;
        }

        grid.appendChild(item);
    });
}

// Deprecated functions (kept as empty to avoid breakage)
window.openFullscreenItem = () => { };
window.closeFullscreen = () => { };
