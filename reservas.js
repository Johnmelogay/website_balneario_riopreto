import { openWhatsApp, CONSTANTS, captureLead } from './scripts.js';

// --- GOOGLE APPS SCRIPT API ---
const API_URL = "https://script.google.com/macros/s/AKfycbyj-tvyGLJkpfhlGTxpvlGV9WnBp88nDhwxbvAorHe_dmEYC3JR0flJ98udRn5cOUBZ/exec";

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

    carregarDisponibilidade();
    renderGaleria();

    document.getElementById("checkin").addEventListener("change", calcular);
    document.getElementById("checkout").addEventListener("change", calcular);
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

function carregarDisponibilidade() {
    fetch(API_URL)
        .then(r => r.json())
        .then(data => {
            renderOpcoesChale(data);
        })
        .catch(err => {
            console.error("Erro ao carregar chalés", err);
            const container = document.getElementById("chale-opcoes");
            if (container) container.innerHTML = "<p class='text-red-500'>Erro ao carregar disponibilidade. Tente recarregar a página.</p>";
        });
}

function renderOpcoesChale(data) {
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
            const status = data[num];
            let isAvailable = status === "disponivel";
            let isBusy = status === "ocupado";

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
            } else if (isBusy) {
                wrapperClass += " bg-gray-50 border-gray-100 opacity-60 cursor-not-allowed grayscale";
                iconClass += " text-gray-400";
                textStatus = `<span class="text-[10px] font-bold text-gray-400 uppercase line-through">Ocupado</span>`;
                disabledAttr = "disabled";
            } else {
                wrapperClass += " bg-yellow-50 border-yellow-100 opacity-80 cursor-not-allowed";
                iconClass += " text-yellow-600";
                textStatus = `<span class="text-[10px] font-bold text-yellow-600 uppercase">Manut.</span>`;
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
    "videos/hero-video.mp4",
    "images/img-aerea.jpg",
    "images/img-rio.jpg",
    "images/img-churrasco.jpg",
    "images/img-natureza.jpg"
];

function renderGaleria() {
    const grid = document.getElementById("galeria-grid");
    if (!grid) return;
    grid.innerHTML = "";

    galeriaMidia.forEach((src, index) => {
        const isVideo = src.endsWith(".mp4");

        // Imagem fallback para placeholders de desenvolvimento se o arquivo real não existir
        // Usando uma lógica simples de onerror no HTML
        const fallbackSrc = `https://placehold.co/800x800/2E7D32/FFF?text=RioPreto-${index}`;

        const item = document.createElement("div");
        item.className = "rounded-2xl overflow-hidden relative shadow-sm group cursor-pointer";
        item.setAttribute("onclick", "openFullscreenItem(this)");

        if (index === 0) {
            item.classList.add("col-span-2", "row-span-2");
        }

        let overlayHTML = `
      <div class="absolute bottom-4 left-4">
          <p class="text-white text-lg font-bold drop-shadow-md">Rio Preto</p>
      </div>
    `;

        if (index === 0) {
            overlayHTML = `
          <div class="absolute bottom-4 left-4">
              <span class="bg-white/20 backdrop-blur-md text-white text-[10px] px-2 py-1 rounded mb-1 inline-block">Destaque</span>
              <p class="text-white text-lg font-bold drop-shadow-md">Explorar Visual</p>
          </div>
        `;
        }

        if (isVideo) {
            item.innerHTML = `
          <video src="${src}" autoplay muted loop playsinline class="w-full h-full object-cover"></video>
          ${overlayHTML}
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

function openFullscreenItem(el) {
    const viewer = document.getElementById('fullscreenViewer');
    const img = document.getElementById('fullscreenImage');
    const vid = document.getElementById('fullscreenVideo');
    img.classList.add('hidden');
    vid.classList.add('hidden');

    const media = el.querySelector('img, video');
    if (!media) return;

    if (media.tagName === 'IMG') {
        img.src = media.src;
        img.classList.remove('hidden');
    } else if (media.tagName === 'VIDEO') {
        vid.src = media.getAttribute('src') || media.currentSrc;
        vid.classList.remove('hidden');
        vid.play();
    }
    viewer.classList.remove('hidden');
}

function closeFullscreen() {
    const viewer = document.getElementById('fullscreenViewer');
    const vid = document.getElementById('fullscreenVideo');
    if (vid) vid.pause();
    viewer.classList.add('hidden');
}
