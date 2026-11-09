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
    renderFaixaFotos();
    iniciarVideoHero();
    iniciarBarraReserva();
    iniciarEventosFunil();

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

    const servidorCheck = document.getElementById("servidorPublico");
    if (servidorCheck) {
        servidorCheck.addEventListener("change", () => {
            document.getElementById("servidor-detalhes").classList.toggle("hidden", !servidorCheck.checked);
            calcular();
        });
    }

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

    // Mostra o preço já na abertura (antes ficava "R$ 0,00" até a pessoa mexer em algo)
    calcular();
});

// --- MEDIÇÃO (Microsoft Clarity) ---
// Funil: visitou /reservas -> simular_reserva -> inicio_formulario -> envio_whatsapp
const eventosEnviados = new Set();
function marcar(evento, umaVez = true) {
    if (umaVez && eventosEnviados.has(evento)) return;
    eventosEnviados.add(evento);
    try { if (typeof window.clarity === 'function') window.clarity("event", evento); } catch (e) { }
}

function iniciarEventosFunil() {
    const sim = document.getElementById("simulador");
    if (sim) {
        // Primeira mexida em datas, pessoas, chalé ou desconto conta como "simulou"
        sim.addEventListener("change", () => marcar("simular_reserva"));
        sim.addEventListener("click", (e) => {
            if (e.target.closest(".stepper-btn")) marcar("simular_reserva");
        });
    }
    ["nome-reserva", "email-reserva", "celular-reserva"].forEach(id => {
        const campo = document.getElementById(id);
        if (!campo) return;
        campo.addEventListener("focus", () => marcar("inicio_formulario"));
        campo.addEventListener("input", () => limparErro(id));
    });
    // Máscara do celular: (69) 99999-9999
    const cel = document.getElementById("celular-reserva");
    if (cel) cel.addEventListener("input", () => { cel.value = formatarCelular(cel.value); });
}

function formatarCelular(v) {
    const d = v.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 2) return d.length ? `(${d}` : "";
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// --- VÍDEO DO TOPO: só carrega no computador; no celular fica a foto ---
function iniciarVideoHero() {
    const video = document.getElementById("heroVideo");
    if (!video || !window.matchMedia("(min-width: 768px)").matches) return;
    video.src = video.dataset.src;
    video.play().catch(() => { });
}

// --- BARRA FIXA DE RESERVA (celular) ---
function iniciarBarraReserva() {
    const barra = document.getElementById("barra-reserva");
    const btnBarra = document.getElementById("btnBarraReservar");
    const btnForm = document.getElementById("btnWhatsappReserva");
    if (!barra || !btnBarra) return;

    btnBarra.addEventListener("click", () => {
        marcar("barra_reservar", false);
        enviarWhatsapp();
    });

    // Esconde a barra quando o botão verde do formulário já está visível (evita dois botões iguais)
    if (btnForm && "IntersectionObserver" in window) {
        new IntersectionObserver((entries) => {
            barra.classList.toggle("escondida", entries[0].isIntersecting);
        }, { threshold: 0.4 }).observe(btnForm);
    }
}

function limparErro(id) {
    document.getElementById(`${id}-erro`)?.classList.add("hidden");
    document.getElementById(`${id}-box`)?.classList.remove("campo-erro");
    // Some o aviso geral quando não há mais nenhum campo marcado
    if (!document.querySelector(".campo-erro")) document.getElementById("aviso-dados")?.classList.add("hidden");
}

// Marca todos os dados que faltam, mostra o aviso explicando o porquê e
// leva a pessoa até o primeiro campo. Devolve true se faltou algo.
function validarDados(nome, email, celularDigitos) {
    const faltando = [];
    if (!nome) faltando.push(["nome-reserva", "erro_reserva_nome"]);
    if (celularDigitos.length < 10 || celularDigitos.length > 11) faltando.push(["celular-reserva", "erro_reserva_celular"]);
    // E-mail é opcional; só avisa se a pessoa digitou algo que não é e-mail
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) faltando.push(["email-reserva", "erro_reserva_email"]);
    if (!faltando.length) return false;

    faltando.forEach(([id, evento]) => {
        marcar(evento, false);
        document.getElementById(`${id}-erro`)?.classList.remove("hidden");
        document.getElementById(`${id}-box`)?.classList.add("campo-erro");
    });
    const aviso = document.getElementById("aviso-dados");
    aviso?.classList.remove("hidden");
    const primeiro = document.getElementById(faltando[0][0]);
    (aviso || primeiro).scrollIntoView({ behavior: "smooth", block: "start" });
    // focus no mesmo toque abre o teclado no celular
    primeiro.focus({ preventScroll: true });
    return true;
}

function changeValue(id, delta) {
    const input = document.getElementById(id);
    let val = parseInt(input.value) || 0;
    let min = parseInt(input.getAttribute('min')) || 0;
    let max = parseInt(input.getAttribute('max')) || 99;

    let newVal = val + delta;
    if (newVal >= min && newVal <= max) {
        input.value = newVal;
        calcular();
    }
}

function formatarReais(v) {
    return "R$ " + v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Atualiza a barra fixa do celular com o total e um resumo curto
function atualizarBarra(total, noites) {
    const elTotal = document.getElementById("barraTotal");
    const elDet = document.getElementById("barraDetalhe");
    if (!elTotal || !elDet) return;
    const adultos = parseInt(document.getElementById("adultos").value) || 0;
    const criancas = (parseInt(document.getElementById("criancas5")?.value) || 0) + (parseInt(document.getElementById("criancas0")?.value) || 0);
    const pessoas = adultos + criancas;
    if (!noites || noites <= 0) {
        elTotal.innerText = "Escolha as datas";
        elDet.innerText = "Toque em Reservar para começar";
        return;
    }
    elTotal.innerText = formatarReais(total);
    const sel = document.querySelector('input[name="chale"]:checked');
    const chale = sel && sel.dataset.curto ? ` • ${sel.dataset.curto}` : "";
    elDet.innerText = `${noites} ${noites === 1 ? "noite" : "noites"} • ${pessoas} ${pessoas === 1 ? "pessoa" : "pessoas"}${chale}`;
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
        document.getElementById("linhaDescontoServidor")?.classList.add("hidden");
        atualizarBarra(0, 0);
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
        atualizarBarra(0, 0);
        return;
    }

    elNoites.innerText = `${noites} ${noites === 1 ? "noite" : "noites"}`;

    const dayOfWeek = d1Day.getDay(); // 0-Dom, 1-Seg, ..., 5-Sex, 6-Sab

    // Linha de ajuda sob as datas: noites + horário de saída (domingo é estendido)
    const d2Day = new Date(y2, m2 - 1, d_2);
    const elInfo = document.getElementById("infoNoites");
    if (elInfo) {
        const saida = d2Day.getDay() === 0 ? "Saída no domingo até 16h30" : "Saída até 12h";
        elInfo.innerHTML = `<strong class="text-gray-700">${noites} ${noites === 1 ? "noite" : "noites"}</strong> • ${saida} • O horário de entrada aparece em cada chalé`;
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

    // Viaja Mais Servidor: 10% só na diária do casal (adicionais não entram)
    const servidor = document.getElementById("servidorPublico")?.checked;
    const descontoServidor = servidor ? valorBase * 0.10 * noites : 0;
    const elLinhaDesc = document.getElementById("linhaDescontoServidor");
    if (elLinhaDesc) {
        elLinhaDesc.classList.toggle("hidden", !servidor);
        document.getElementById("resumoDescontoServidor").innerText = "- R$ " + descontoServidor.toFixed(2).replace('.', ',');
    }

    let total = valorDiaria * noites - descontoServidor;

    if (document.getElementById("discount-helper")) {
        document.getElementById("discount-helper").remove();
    }

    elTotal.innerText = formatarReais(total);
    atualizarBarra(total, noites);
}

function enviarWhatsapp() {
    // --- LEAD CAPTURE VALIDATION ---
    // Nome e celular são obrigatórios; e-mail é opcional (coleta prevista na política de privacidade).
    const nome = document.getElementById("nome-reserva").value.trim();
    const email = document.getElementById("email-reserva").value.trim();
    const celular = document.getElementById("celular-reserva").value.trim();
    const celularDigitos = celular.replace(/\D/g, "");

    const checkin = document.getElementById("checkin").value;
    const checkout = document.getElementById("checkout").value;

    if (!checkin || !checkout || checkout <= checkin) {
        marcar("erro_reserva_datas", false);
        document.getElementById("checkin").scrollIntoView({ behavior: "smooth", block: "center" });
        document.getElementById("infoNoites").innerHTML = '<span class="text-red-600 font-bold">Escolha a data de entrada e a de saída.</span>';
        return;
    }

    // Dados da pessoa primeiro: sem nome e celular não abre o WhatsApp
    if (validarDados(nome, email, celularDigitos)) return;

    const adultos = document.getElementById("adultos").value;
    const criancas5 = document.getElementById("criancas5")?.value || 0;
    const criancas0 = document.getElementById("criancas0")?.value || 0;
    const horarioChegada = document.getElementById("horarioChegada").value || "Não informado";
    const chaleInput = document.querySelector('input[name="chale"]:checked');

    if (!chaleInput) {
        marcar("erro_reserva_chale", false);
        document.getElementById("erro-chale").classList.remove("hidden");
        document.getElementById("chale-opcoes").scrollIntoView({ behavior: "smooth", block: "center" });
        return;
    }

    const chale = chaleInput.value;
    document.getElementById("erro-chale").classList.add("hidden");
    const total = document.getElementById("resumoTotal").innerText;
    const servidor = !!document.getElementById("servidorPublico")?.checked;

    const [yIn, mIn, dIn] = checkin.split('-');
    const dataIn = `${dIn}/${mIn}/${yIn}`;

    const [yOut, mOut, dOut] = checkout.split('-');
    const dataOut = `${dOut}/${mOut}/${yOut}`;

    marcar("envio_whatsapp", false);
    try { if (typeof window.clarity === 'function') window.clarity("set", "servidor_publico", servidor ? "sim" : "nao"); } catch (e) { }

    const texto = `Olá! Me chamo *${nome}*.\nFiz uma simulação no site e gostaria de confirmar a disponibilidade:\n\n` +
        `📅 *Data:* ${dataIn} até ${dataOut}\n` +
        `📱 *Celular:* ${celular}\n` +
        (email ? `✉️ *E-mail:* ${email}\n` : '') +
        `👥 *Pessoas:* ${adultos} Adultos, ${criancas5} Crianças (5-8), ${criancas0} Bebês\n` +
        `⏰ *Horário previsto de chegada:* ${horarioChegada}\n` +
        `🏠 *Preferência:* ${chale}\n` +
        (servidor ? `🏛️ *Servidor(a) público(a):* Sim, desconto Viaja Mais Servidor (10% na diária do casal). Vou apresentar a carteira funcional ou um contracheque de até 60 dias.\n` : '') +
        `💰 *Valor Estimado${servidor ? ' (com desconto)' : ''}:* ${total}\n\n` +
        `Aguardo confirmação para efetuar o pagamento.`;

    // Salva o lead em segundo plano, sem esperar a resposta do banco.
    // Antes o WhatsApp só abria depois do Supabase responder; nesse atraso o
    // celular (principalmente iPhone) deixava de considerar a abertura como
    // vinda do clique e bloqueava a nova aba sem aviso: o botão "não fazia nada".
    captureLead({
        name: nome,
        email: email,
        celular,
        intention: 'reserva_simulador',
        details: { checkin, checkout, adultos, chale, total, servidor, celular }
    }).catch(() => { });

    openWhatsApp({ text: texto });
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

        // QUERY 1: Find bookings with STRICT overlap (allows same-day turnover)
        // overlap: (book_start < query_end) AND (book_end > query_start)
        const { data: bookingsData, error: bookingsError } = await supabase
            .from('bookings')
            .select('chalet_id')
            .in('status', ['confirmed', 'pending'])
            .lt('checkin_date', end)
            .gt('checkout_date', start);

        if (bookingsError) throw bookingsError;

        // QUERY 2: Sunday exception - check if check-in date is a Sunday
        // On Sundays, the previous guest has late checkout until 17:30 (courtesy),
        // so we cannot allow a new check-in on that day.
        const [sY, sM, sD] = start.split('-').map(Number);
        const checkinDayOfWeek = new Date(sY, sM - 1, sD).getDay(); // 0=Sunday

        let sundayBlockedIds = [];
        if (checkinDayOfWeek === 0) {
            // Find bookings checking OUT on this Sunday
            const { data: sundayData, error: sundayError } = await supabase
                .from('bookings')
                .select('chalet_id')
                .in('status', ['confirmed', 'pending'])
                .eq('checkout_date', start);

            if (!sundayError && sundayData) {
                sundayBlockedIds = sundayData.map(b => parseInt(b.chalet_id));
            }
        }

        // QUERY 3: Detect TURNOVER chalets (booking checks out on user's check-in date)
        // These chalets are available but need cleaning, so check-in is at 14:00 instead of 12:00
        let turnoverIds = [];
        const { data: turnoverData, error: turnoverError } = await supabase
            .from('bookings')
            .select('chalet_id')
            .in('status', ['confirmed', 'pending'])
            .eq('checkout_date', start);

        if (!turnoverError && turnoverData) {
            turnoverIds = turnoverData.map(b => parseInt(b.chalet_id));
        }

        const { data: blocksData, error: blocksError } = await supabase
            .from('blocked_chalets')
            .select('chalet_id');

        if (blocksError) throw blocksError;

        // Merge all blocked IDs (deduplicated via Set)
        const blockedIds = [...new Set([
            ...bookingsData.map(b => parseInt(b.chalet_id)),
            ...sundayBlockedIds,
            ...blocksData.map(b => parseInt(b.chalet_id))
        ])];

        // Remove turnover chalets from blocked (they ARE available, just with later check-in)
        // But keep them blocked if they're in sundayBlockedIds (Sunday exception)
        const finalTurnoverIds = turnoverIds.filter(id => !blockedIds.includes(id));

        renderOpcoesChale(blockedIds, finalTurnoverIds);

    } catch (err) {
        console.error("Erro ao verificar disponibilidade:", err);
        renderOpcoesChale([]); // Fallback: Show all available (or handle error UI)
    } finally {
        if (container) container.style.opacity = "1";
    }
}

function renderOpcoesChale(blockedIds = [], turnoverIds = []) {
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
            const isTurnover = turnoverIds.includes(num);
            const isAvailable = !isBusy;

            let wrapperClass = "relative flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all duration-200 cursor-pointer select-none text-center h-24";

            if (area === "De Frente Para a Piscina") {
                wrapperClass += " bg-blue-50/90";
            } else if (area === "De Frente Para o Gramado") {
                wrapperClass += " bg-green-50/60";
            }

            let iconClass = "text-xl mb-1";
            let textStatus = "";
            let disabledAttr = "";
            let checkinBadge = "";

            if (isAvailable && isTurnover) {
                // TURNOVER: available but needs cleaning, check-in at 14:00
                wrapperClass += " bg-amber-50 border-amber-200 hover:border-amber-400 hover:shadow-md";
                iconClass += " text-amber-600";
                textStatus = `<span class="text-[10px] font-bold text-amber-600 uppercase">Livre</span>`;
                checkinBadge = `<span class="text-[9px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full mt-0.5"><i class="fa-regular fa-clock mr-0.5"></i>Check-in 14:00</span>`;
            } else if (isAvailable) {
                // FREE: normal availability, check-in at 12:00
                wrapperClass += " bg-white border-gray-100 hover:border-primary-green hover:shadow-md hover:bg-green-50/50";
                iconClass += " text-primary-green";
                textStatus = `<span class="text-[10px] font-bold text-green-600 uppercase">Livre</span>`;
                checkinBadge = `<span class="text-[9px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full mt-0.5"><i class="fa-regular fa-clock mr-0.5"></i>Check-in 12:00</span>`;
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
            <input type="radio" name="chale" value="Chalé ${num} (${area})" data-curto="Chalé ${num}" class="peer sr-only chale-radio" ${disabledAttr}>
            <div class="${wrapperClass}">
                <i class="fa-solid ${iconName} ${iconClass} opacity-80"></i>
                <span class="font-bold text-gray-800 text-sm leading-none mb-0.5">Chalé ${num}</span>
                ${textStatus}
                ${checkinBadge}
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
    // Tour por dentro do chalé primeiro (antes ficava escondido no meio do vídeo "Aconchego").
    // Vídeo recortado: interior primeiro, depois a área externa; sem áudio.
    { type: 'video', src: "videos/aconchego-interior.mp4", thumb: "images/chale-interior-quarto.webp", caption: "Por dentro do chalé" },
    { type: 'image', src: "images/img-aerea.jpg", caption: "Chalé 10" },
    { type: 'video', src: `${BASE_VIDEO_URL}/hero-video720p.mp4`, thumb: "images/hero-video_thumbnail.png", caption: "Destaques" },
    { type: 'video', src: `${BASE_VIDEO_URL}/pool720p.mp4`, thumb: "images/pool_thumbnail.png", caption: "Piscina" },
    { type: 'video', src: `${BASE_VIDEO_URL}/toboagua720p.mp4`, thumb: "images/toboagua_thumbnail.png", caption: "Toboágua" },
    { type: 'video', src: `${BASE_VIDEO_URL}/vistaparario720p.mp4`, thumb: "images/vistaparario_thumbnail.png", caption: "Vista para o Rio" },
    { type: 'video', src: `${BASE_VIDEO_URL}/peopleplaying720p.mp4`, thumb: "images/peopleplaying_thumbnail.png", caption: "Diversão" },
    { type: 'video', src: `${BASE_VIDEO_URL}/paradise720p.mp4`, thumb: "images/paradise_thumbnail.png", caption: "Paraíso" },
    { type: 'video', src: `${BASE_VIDEO_URL}/beach720p.mp4`, thumb: "images/beach_thumbnail.png", caption: "Praia" },
];

// Faixa curta de fotos acima do simulador (celular): os 5 primeiros itens da galeria
function renderFaixaFotos() {
    const faixa = document.getElementById("faixa-fotos");
    if (!faixa) return;
    faixa.innerHTML = "";
    galeriaMidia.slice(0, 5).forEach((item, index) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `relative shrink-0 snap-start overflow-hidden rounded-xl bg-gray-100 h-32 ${index === 0 ? "w-44" : "w-28"}`;
        btn.setAttribute("aria-label", item.caption || "Abrir foto");
        btn.onclick = () => { marcar("faixa_fotos", false); galleryLightbox.open(galeriaMidia, index); };

        const img = document.createElement("img");
        img.src = item.thumb || item.src;
        img.alt = item.caption || "";
        img.loading = index === 0 ? "eager" : "lazy";
        img.className = "w-full h-full object-cover";
        btn.appendChild(img);

        if (item.type === "video") {
            btn.insertAdjacentHTML("beforeend", `
                <span class="absolute inset-0 flex items-center justify-center bg-black/15">
                    <span class="w-10 h-10 rounded-full bg-white/25 backdrop-blur-md border border-white/60 flex items-center justify-center">
                        <i class="fa-solid fa-play text-white ml-0.5"></i>
                    </span>
                </span>`);
        }
        if (item.caption) {
            btn.insertAdjacentHTML("beforeend",
                `<span class="absolute bottom-1.5 left-1.5 right-1.5 text-left text-[11px] font-bold text-white drop-shadow-md leading-tight">${item.caption}</span>`);
        }
        faixa.appendChild(btn);
    });
}

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
