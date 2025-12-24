import { supabase, formatCurrency, openWhatsApp } from './scripts.js';

document.addEventListener('DOMContentLoaded', async () => {

    // --- CARROSSEL ---
    async function loadCarouselSlides() {
        const track = document.getElementById('slides-container');
        if (!track) return;
        const { data } = await supabase.from('carousel_slides').select('*').eq('is_active', true).order('order_index');
        if (!data || !data.length) return;

        track.innerHTML = '';
        data.forEach(slide => {
            const slideDiv = document.createElement('div');
            slideDiv.className = 'carousel-slide w-full h-full relative flex-shrink-0';
            slideDiv.innerHTML = `
               <img src="${slide.background_image_url}" class="absolute inset-0 w-full h-full object-cover">
               <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
               <div class="absolute bottom-0 left-0 p-8 md:p-12 text-white w-full">
                   <span class="bg-accent-orange text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-3 inline-block shadow-sm">Destaque</span>
                   <h3 class="text-3xl md:text-5xl font-black mb-2 drop-shadow-lg leading-tight">${slide.title}</h3>
                   ${slide.description ? `<p class="text-gray-200 text-lg mb-6 max-w-xl line-clamp-2">${slide.description}</p>` : ''}
                   ${slide.cta_label ? `<a href="${slide.cta_url || '#'}" class="inline-flex items-center gap-2 bg-white text-gray-900 px-6 py-3 rounded-full font-bold hover:bg-gray-200 transition">${slide.cta_label} <i class="fas fa-arrow-right"></i></a>` : ''}
               </div>
            `;
            track.appendChild(slideDiv);
        });

        // Script simples de slide automático
        let idx = 0;
        const slides = track.children;
        setInterval(() => {
            idx = (idx + 1) % slides.length;
            track.style.transform = `translateX(-${idx * 100}%)`;
        }, 5000);

        initCarouselControls(track);
    }

    function initCarouselControls(trackEl) {
        let currentIndex = 0;
        let startX = 0;
        let isDragging = false;

        function updateCarousel() {
            if (!trackEl) return;
            trackEl.style.transform = `translateX(-${currentIndex * 100}%)`;
        }

        // TOUCH
        trackEl.addEventListener('touchstart', e => {
            startX = e.touches[0].clientX;
            isDragging = true;
        });

        trackEl.addEventListener('touchmove', e => {
            if (!isDragging) return;
            const diff = e.touches[0].clientX - startX;
            if (Math.abs(diff) > 60) {
                isDragging = false;
                if (diff < 0) currentIndex++;
                else currentIndex--;
                const totalSlides = trackEl.children.length;
                if (currentIndex < 0) currentIndex = 0;
                if (currentIndex >= totalSlides) currentIndex = totalSlides - 1;
                updateCarousel();
            }
        });

        trackEl.addEventListener('touchend', () => { isDragging = false; });

        // ARROWS
        const prevBtn = document.getElementById('carousel-prev');
        const nextBtn = document.getElementById('carousel-next');

        if (prevBtn && nextBtn) {
            prevBtn.addEventListener('click', () => {
                currentIndex--;
                if (currentIndex < 0) currentIndex = 0;
                updateCarousel();
            });
            nextBtn.addEventListener('click', () => {
                const totalSlides = trackEl.children.length;
                currentIndex++;
                if (currentIndex >= totalSlides) currentIndex = totalSlides - 1;
                updateCarousel();
            });
        }
    }

    // --- LOJA ---
    let currentStoreItem = null;

    async function loadStoreItems() {
        const container = document.getElementById('store-items-container');
        if (!container) return;
        const { data } = await supabase.from('store_items').select('*').eq('is_active', true).limit(4);
        if (!data || !data.length) { container.innerHTML = '<p class="col-span-4 text-center text-gray-400">Novidades em breve.</p>'; return; }

        container.innerHTML = '';
        data.forEach(item => {
            const div = document.createElement('div');
            // Added cursor-pointer and click event
            div.className = 'group bg-white rounded-2xl p-4 shadow-soft border border-gray-100 hover:shadow-xl transition-all duration-300 cursor-pointer';

            div.innerHTML = `
               <div class="relative overflow-hidden rounded-xl h-56 mb-4 bg-gray-50">
                   <img src="${item.image_url}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500">
                   <div class="absolute bottom-2 right-2 bg-white/90 backdrop-blur text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                        ${formatCurrency(item.price)}
                   </div>
               </div>
               <h4 class="font-bold text-gray-900 mb-1 truncate">${item.title}</h4>
               
            `;

            // Open modal on click
            div.addEventListener('click', () => {
                window.openItemModal(item);
            });

            container.appendChild(div);
        });
    }

    // --- MODAL LOGIC (Global for HTML access) ---
    window.openItemModal = (item) => {
        currentStoreItem = item;
        const modal = document.getElementById('itemModal');
        if (!modal) return;

        document.getElementById('modalImg').src = item.image_url || '';
        document.getElementById('modalTitle').innerText = item.title;
        document.getElementById('modalPrice').innerText = formatCurrency(item.price);
        document.getElementById('modalDescription').innerText = item.description || "Sem descrição detalhada.";

        modal.classList.add('active');
    };

    window.closeItemModal = () => {
        const modal = document.getElementById('itemModal');
        if (modal) modal.classList.remove('active');
        currentStoreItem = null;
    };

    window.buyItemOnWhatsapp = () => {
        if (!currentStoreItem) return;
        const text = `Olá! Gostaria de fazer um pedido na loja:\n\n` +
            `🛒 *Produto:* ${currentStoreItem.title}\n` +
            `💰 *Valor:* ${formatCurrency(currentStoreItem.price)}\n` +
            `📄 *Detalhes:* (Tamanho/Cor se aplicável)\n\n` +
            `Poderia verificar o estoque e frete?`;
        openWhatsApp({ text });
    };

    // --- BLOG ---
    async function loadBlogPosts() {
        const container = document.getElementById('blog-posts-container');
        if (!container) return;

        const { data } = await supabase.from('blog_posts').select('*').eq('is_published', true).limit(3);
        if (!data || !data.length) { container.innerHTML = '<p class="col-span-3 text-center text-gray-400">Posts em breve.</p>'; return; }

        container.innerHTML = '';
        data.forEach(post => {
            const div = document.createElement('div');
            // Updated Styling: Boxed card with orange border effect
            div.className = 'group cursor-pointer flex flex-col h-full bg-white rounded-3xl border-2 border-orange-100 hover:border-accent-orange p-4 transition-all duration-300 hover:shadow-lg hover:-translate-y-1';

            const date = new Date(post.published_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

            div.innerHTML = `
               <div class="relative h-48 mb-4 overflow-hidden rounded-2xl shadow-sm">
                   <img src="${post.cover_image_url}" class="w-full h-full object-cover transition duration-700 group-hover:scale-110">
                   <div class="absolute top-3 left-3 bg-white/90 backdrop-blur font-bold text-xs px-3 py-1 rounded-lg shadow-sm uppercase text-accent-orange">
                       ${date}
                   </div>
               </div>
               <h3 class="text-xl font-bold text-gray-900 mb-2 group-hover:text-accent-orange transition-colors line-clamp-2 leading-tight">${post.title}</h3>
               <p class="text-gray-500 text-sm line-clamp-3 mb-4 flex-1">${post.excerpt || ''}</p>
               <div class="mt-auto pt-4 border-t border-gray-100">
                    <a href="detalhes.html?slug=${post.slug}" class="text-accent-orange font-bold text-sm hover:underline flex items-center gap-1">Ler Matéria <i class="fas fa-arrow-right"></i></a>
               </div>
            `;
            container.appendChild(div);

            // Allow whole card click
            div.addEventListener('click', (e) => {
                // don't trigger if clicked on the link itself to avoid double action (though href handles it)
                if (!e.target.closest('a')) {
                    window.location.href = `detalhes.html?slug=${post.slug}`;
                }
            });
        });
    }

    loadCarouselSlides();
    loadStoreItems();
    loadBlogPosts();
});
