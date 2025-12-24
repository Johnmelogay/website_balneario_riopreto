import { supabase, openWhatsApp } from './scripts.js';

document.addEventListener('DOMContentLoaded', async () => {
    const loadingEl = document.getElementById('detail-loading');
    const contentEl = document.getElementById('detail-content');

    function render404() {
        loadingEl.innerHTML = `
          <div class="max-w-md mx-auto mt-20 text-center">
            <h1 class="text-3xl font-extrabold text-text-dark mb-4">Página não encontrada</h1>
            <p class="text-gray-600 mb-6">A notícia que você está procurando não está disponível ou não existe.</p>
            <a href="index.html" class="inline-block rounded bg-primary-green px-6 py-3 text-white hover:bg-green-700 transition">
              Voltar para o início
            </a>
          </div>
        `;
        loadingEl.classList.remove('hidden');
        contentEl.classList.add('hidden');
    }

    function getSlug() {
        const params = new URLSearchParams(window.location.search);
        return params.get('slug');
    }

    function formatDateParts(isoString) {
        if (!isoString) {
            return { weekday: '', fullDate: '', time: '' };
        }
        const date = new Date(isoString);

        const weekday = date.toLocaleDateString('pt-BR', { weekday: 'long' });
        const fullDate = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
        const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        return { weekday, fullDate, time };
    }

    function formatShortDate(isoString) {
        if (!isoString) return '';
        return new Date(isoString).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    async function loadRelatedPosts(currentSlug) {
        const relatedContainer = document.getElementById('related-posts-container');
        if (!relatedContainer) return;

        const { data, error } = await supabase
            .from('blog_posts')
            .select('*')
            .eq('is_published', true)
            .neq('slug', currentSlug)
            .order('published_at', { ascending: false })
            .limit(4);

        if (error) {
            console.error('Erro ao carregar posts relacionados:', error);
            relatedContainer.innerHTML = `<p class="text-sm text-gray-500">Não foi possível carregar outras notícias.</p>`;
            return;
        }

        if (!data || data.length === 0) {
            relatedContainer.innerHTML = `<p class="text-sm text-gray-500">Em breve você verá mais notícias por aqui.</p>`;
            return;
        }

        relatedContainer.innerHTML = '';
        data.forEach((post) => {
            const url = `detalhes.html?slug=${encodeURIComponent(post.slug)}`;
            const imageUrl = post.cover_image_url || 'https://placehold.co/160x100/2E7D32/FFFFFF?text=Blog';
            const dateShort = formatShortDate(post.published_at);

            const item = document.createElement('a');
            item.href = url;
            item.className = 'flex gap-3 border-b border-gray-100 pb-3 mb-3 last:mb-0 last:border-b-0 hover:bg-gray-50 rounded-lg p-1 transition';
            item.innerHTML = `
            <img src="${imageUrl}" alt="${post.title}" class="h-20 w-24 flex-shrink-0 rounded-md object-cover">
            <div class="flex flex-col">
              <p class="text-sm font-semibold text-text-dark leading-snug">${post.title}</p>
              <span class="mt-1 text-xs text-gray-500">${dateShort}</span>
            </div>
            `;
            relatedContainer.appendChild(item);
        });
    }

    async function loadBlogPost() {
        const slug = getSlug();
        if (!slug) {
            render404();
            return;
        }

        const { data, error } = await supabase
            .from('blog_posts')
            .select('*')
            .eq('slug', slug)
            .eq('is_published', true)
            .single();

        if (error || !data) {
            console.error(error);
            render404();
            return;
        }

        const { weekday, fullDate, time } = formatDateParts(data.published_at);
        const shareUrl = encodeURIComponent(window.location.href);
        const shareText = encodeURIComponent(data.title);
        const coverImage = data.cover_image_url || 'https://placehold.co/1200x400/2E7D32/FFFFFF?text=Blog+Rio+Preto';

        contentEl.innerHTML = `
          <section class="bg-white rounded-xl shadow-md overflow-hidden">
            <header class="border-b border-gray-100 px-4 pt-4 pb-3 md:px-8 md:pt-6">
              <p class="text-xs font-semibold tracking-wide text-primary-green uppercase">Blog Rio Preto</p>
              <h1 class="mt-1 text-2xl md:text-3xl font-extrabold text-gray-900">${data.title}</h1>
              <p class="mt-2 text-xs md:text-sm text-gray-500">
                ${weekday ? weekday.charAt(0).toUpperCase() + weekday.slice(1) + ', ' : ''}${fullDate}${time ? ' - ' + time : ''}${data.author_name ? ' | ' + data.author_name : ''}
              </p>
              <div class="mt-3 flex flex-wrap items-center gap-2 text-xs md:text-sm">
                <span class="mr-2 font-semibold text-gray-500">Compartilhar:</span>
                <button type="button" id="instagram-share-button"
                   class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-purple-500 via-pink-500 to-yellow-400 text-white hover:opacity-90">
                  <img src="images/instagram.svg" alt="Instagram" class="h-4 w-4 icon-white">
                </button>
                <a href="https://www.facebook.com/sharer/sharer.php?u=${shareUrl}"
                   target="_blank" rel="noopener"
                   class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700">
                  <img src="images/facebook.svg" alt="Facebook" class="h-4 w-4 icon-white">
                </a>
                <a href="https://api.whatsapp.com/send?text=${shareText}%20${shareUrl}"
                   target="_blank" rel="noopener"
                   class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-green-500 text-white hover:bg-green-600">
                  <img src="images/whatsapp.svg" alt="WhatsApp" class="h-4 w-4 icon-white">
                </a>
                <a href="mailto:?subject=${shareText}&body=${shareText}%20-%20${shareUrl}"
                   target="_blank" rel="noopener"
                   class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gray-500 text-white hover:bg-gray-600">
                  <img src="images/mail.svg" alt="Email" class="h-4 w-4 icon-white">
                </a>
                <button id="share-copy"
                   class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gray-400 text-gray-700 hover:bg-gray-300">
                  <img src="images/link.svg" alt="Copy link" class="h-4 w-4 icon-white">
                </button>
              </div>
            </header>

            <figure class="mt-4 px-4 md:px-8">
              <img src="${coverImage}" alt="${data.title}"
                   class="mb-4 max-h-[420px] w-full rounded-xl object-cover">
            </figure>

            <div class="px-4 pb-8 pt-2 md:px-8 md:pb-10">
              <div class="space-y-4 leading-relaxed text-gray-800">
                ${data.content || ''}
              </div>
            </div>
          </section>

          <section class="mt-8 rounded-xl bg-white p-4 shadow-sm md:p-6">
            <h2 class="mb-4 border-b border-gray-200 pb-2 text-lg font-extrabold tracking-wide text-accent-orange">
              VEJA TAMBÉM
            </h2>
            <div id="related-posts-container">
              <p class="text-sm text-gray-500">Carregando outras notícias...</p>
            </div>
          </section>
        `;

        loadingEl.classList.add('hidden');
        contentEl.classList.remove('hidden');

        // Setup share listeners
        setupShareListeners(data.title, data.cover_image_url);
        await loadRelatedPosts(data.slug);
    }

    function setupShareListeners(title, imageUrl) {
        const instaModal = document.getElementById('instagram-share-modal');
        const instaOpenBtn = document.getElementById('instagram-share-button');
        const instaCloseBtn = document.getElementById('instagram-share-close');
        const instaCopyBtn = document.getElementById('insta-copy-link');
        const instaOpenAppBtn = document.getElementById('insta-open-app');
        const storyBtn = document.getElementById("insta-generate-story");

        if (instaOpenBtn && instaModal) {
            instaOpenBtn.addEventListener('click', () => {
                instaModal.classList.remove('hidden');
                instaModal.classList.add('flex');
            });
        }

        if (instaCloseBtn && instaModal) {
            instaCloseBtn.addEventListener('click', () => {
                instaModal.classList.add('hidden');
                instaModal.classList.remove('flex');
            });
        }

        if (instaModal) {
            instaModal.addEventListener('click', (event) => {
                if (event.target === instaModal) {
                    instaModal.classList.add('hidden');
                    instaModal.classList.remove('flex');
                }
            });
        }

        const copyLinkValues = async (btn) => {
            const urlToShare = window.location.href;
            if (navigator.clipboard && navigator.clipboard.writeText) {
                try {
                    await navigator.clipboard.writeText(urlToShare);
                    btn.classList.add('bg-green-100', 'text-green-700');
                    setTimeout(() => {
                        btn.classList.remove('bg-green-100', 'text-green-700');
                    }, 1500);
                } catch (err) {
                    console.error('Erro ao copiar link:', err);
                    alert('Não foi possível copiar o link automaticamente.');
                }
            } else {
                alert('Copie o link diretamente pela barra de endereço do navegador.');
            }
        }

        if (instaCopyBtn) {
            instaCopyBtn.addEventListener('click', () => copyLinkValues(instaCopyBtn));
        }

        if (instaOpenAppBtn) {
            instaOpenAppBtn.addEventListener('click', () => {
                window.open('https://www.instagram.com/balnearioriopreto/', '_blank');
            });
        }

        const copyButton = document.getElementById('share-copy');
        if (copyButton) {
            copyButton.addEventListener('click', () => copyLinkValues(copyButton));
        }

        if (storyBtn) {
            storyBtn.addEventListener("click", () => {
                generateStoryImage(title, imageUrl);
            });
        }
    }

    loadBlogPost();
});

// Canvas Story Generator
async function generateStoryImage(title, imageUrl) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const WIDTH = 1080;
    const HEIGHT = 1920;
    canvas.width = WIDTH;
    canvas.height = HEIGHT;

    // Background logic... (Same as original, cleaned up)
    const patternImg = new Image();
    patternImg.src = "images/pattern.png";
    // If pattern fails, use color
    try {
        await new Promise((resolve, reject) => {
            patternImg.onload = resolve;
            patternImg.onerror = reject;
        });
        const pattern = ctx.createPattern(patternImg, "repeat");
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
    } catch (e) {
        ctx.fillStyle = "#15803d";
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    gradient.addColorStop(0, "#15803d");
    gradient.addColorStop(1, "#0e5529");
    ctx.fillStyle = gradient;
    ctx.globalAlpha = 0.75;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.globalAlpha = 1;

    // Title Box
    ctx.fillStyle = "#ffffffcc";
    roundRect(ctx, 80, 300, WIDTH - 160, 500, 40);
    ctx.fill();

    ctx.fillStyle = "#15803d";
    ctx.font = "bold 48px Arial";
    ctx.textAlign = "center";
    ctx.fillText("BLOG RIO PRETO", WIDTH / 2, 380);

    ctx.fillStyle = "#111827";
    ctx.font = "bold 72px Arial";
    const lines = wrapText(ctx, title, WIDTH - 260);
    let y = 500;
    const lineHeight = 90;
    lines.forEach(line => {
        ctx.fillText(line.trim(), WIDTH / 2, y);
        y += lineHeight;
    });

    // CTA Box
    ctx.fillStyle = "#ffffff22";
    roundRect(ctx, 80, 1250, WIDTH - 160, 200, 40);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 60px Arial";
    ctx.fillText("TOQUE PARA SABER MAIS", WIDTH / 2, 1370);

    // Logo
    const logoImg = new Image();
    logoImg.src = "images/logo.png";
    // Best effort load
    try {
        await new Promise((resolve, reject) => { logoImg.onload = resolve; logoImg.onerror = reject; });
        ctx.drawImage(logoImg, WIDTH - 260, 80, 180, 180);
    } catch (e) { }

    const link = document.createElement("a");
    link.download = "story-balneario.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
}

// Canvas Helpers
function roundRect(ctx, x, y, w, h, r) {
    if (typeof r === "number") r = { tl: r, tr: r, br: r, bl: r };
    ctx.beginPath();
    ctx.moveTo(x + r.tl, y);
    ctx.lineTo(x + w - r.tr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r.tr);
    ctx.lineTo(x + w, y + h - r.br);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h);
    ctx.lineTo(x + r.bl, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r.bl);
    ctx.lineTo(x, y + r.tl);
    ctx.quadraticCurveTo(x, y, x + r.tl, y);
    ctx.closePath();
}

function wrapText(ctx, text, maxWidth) {
    const words = text.split(" ");
    let line = "";
    let lines = [];
    words.forEach(word => {
        const testLine = line + word + " ";
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth) {
            lines.push(line);
            line = word + " ";
        } else {
            line = testLine;
        }
    });
    if (line) lines.push(line);
    return lines;
}
