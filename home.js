import { supabase, formatCurrency, openWhatsApp, captureLead, trackEvent } from './scripts.js';

document.addEventListener('DOMContentLoaded', async () => {

    // --- 1. CARROSSEL ---
    async function loadCarouselSlides() {
        const track = document.getElementById('slides-container');
        if (!track) return;

        try {
            const { data, error } = await supabase.from('carousel_slides')
                .select('*')
                .eq('is_active', true)
                .order('order_index');

            if (error) throw error;
            if (!data || !data.length) return;

            track.innerHTML = '';
            data.forEach(slide => {
                const slideDiv = document.createElement('a');
                slideDiv.href = slide.cta_url || '#';
                slideDiv.className = 'carousel-slide w-full h-full relative flex-shrink-0 group overflow-hidden';

                slideDiv.addEventListener('click', () => {
                    trackEvent('select_content', {
                        content_type: 'carousel_slide',
                        item_id: slide.id,
                        item_name: slide.title
                    });
                });

                slideDiv.innerHTML = `
                    <img src="${slide.background_image_url}" class="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105">
                    <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
                    <div class="absolute bottom-0 left-0 px-6 pb-2 md:px-10 md:pb-6 z-20 w-full md:max-w-3xl">
                        <div>
                            <h3 class="text-2xl md:text-4xl font-bold text-white mb-2 leading-tight drop-shadow-lg">${slide.title}</h3>
                            ${slide.description ? `<p class="text-gray-100 text-sm md:text-lg font-light leading-relaxed mb-3 max-w-xl drop-shadow-md">${slide.description}</p>` : ''}
                            <div class="overflow-hidden">
                                <div class="opacity-0 group-hover:opacity-100 transition-all duration-500 transform translate-y-full group-hover:translate-y-0">
                                     <span class="text-[10px] md:text-xs font-bold text-white/80 uppercase tracking-widest border-b border-white/30 pb-0.5">Clique para saber mais</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                track.appendChild(slideDiv);
            });

            initCarouselControls(track);
        } catch (err) {
            console.error("Erro no Carrossel:", err.message);
        }
    }

    function initCarouselControls(trackEl) {
        let currentIndex = 0;
        const slides = trackEl.children;
        if (slides.length === 0) return;

        const updateCarousel = () => {
            trackEl.style.transform = `translateX(-${currentIndex * 100}%)`;
        };

        // Auto-play
        setInterval(() => {
            currentIndex = (currentIndex + 1) % slides.length;
            updateCarousel();
        }, 5000);

        // Arvores/Setas
        const prevBtn = document.getElementById('carousel-prev');
        const nextBtn = document.getElementById('carousel-next');

        if (prevBtn && nextBtn) {
            prevBtn.onclick = () => { currentIndex = Math.max(0, currentIndex - 1); updateCarousel(); };
            nextBtn.onclick = () => { currentIndex = Math.min(slides.length - 1, currentIndex + 1); updateCarousel(); };
        }
    }

    // --- 2. LOJA ---
    let currentStoreItem = null;

    async function loadStoreItems() {
        const container = document.getElementById('store-items-container');
        if (!container) return;

        try {
            const { data, error } = await supabase.from('store_items')
                .select('*')
                .eq('is_active', true)
                .limit(4);

            if (error) throw error;

            // Limpa o esqueleto de carregamento (pulse)
            container.innerHTML = '';

            if (!data || !data.length) {
                container.innerHTML = '<p class="col-span-4 text-center text-gray-400">Novidades em breve.</p>';
                return;
            }

            data.forEach(item => {
                const div = document.createElement('div');
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

                div.addEventListener('click', () => {
                    trackEvent('select_content', {
                        content_type: 'store_item',
                        item_id: item.id,
                        item_name: item.title,
                        value: item.price,
                        currency: 'BRL'
                    });
                    window.openItemModal(item);
                });

                container.appendChild(div);
            });
        } catch (err) {
            console.error("Erro na Loja:", err.message);
        }
    }

    // --- 3. BLOG ---
    async function loadBlogPosts() {
        const container = document.getElementById('blog-posts-container');
        if (!container) return;

        try {
            const { data, error } = await supabase.from('blog_posts')
                .select('*')
                .eq('is_published', true)
                .limit(3);

            if (error) throw error;
            container.innerHTML = '';

            if (!data || !data.length) {
                container.innerHTML = '<p class="col-span-3 text-center text-gray-400">Posts em breve.</p>';
                return;
            }

            data.forEach(post => {
                const div = document.createElement('div');
                div.className = 'group cursor-pointer flex flex-col h-full bg-white rounded-3xl border-2 border-orange-100 hover:border-accent-orange p-4 transition-all duration-300 hover:shadow-lg hover:-translate-y-1';
                const date = new Date(post.published_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

                div.innerHTML = `
                   <div class="relative h-48 mb-4 overflow-hidden rounded-2xl shadow-sm">
                       <img src="${post.cover_image_url}" class="w-full h-full object-cover transition duration-700 group-hover:scale-110">
                       <div class="absolute top-3 left-3 bg-white/90 backdrop-blur font-bold text-xs px-3 py-1 rounded-lg shadow-sm uppercase text-accent-orange">${date}</div>
                   </div>
                   <h3 class="text-xl font-bold text-gray-900 mb-2 group-hover:text-accent-orange transition-colors line-clamp-2">${post.title}</h3>
                   <p class="text-gray-500 text-sm line-clamp-3 mb-4 flex-1">${post.excerpt || ''}</p>
                   <div class="mt-auto pt-4 border-t border-gray-100">
                        <span class="text-accent-orange font-bold text-sm flex items-center gap-1">Ler Matéria <i class="fas fa-arrow-right"></i></span>
                   </div>
                `;

                div.onclick = () => {
                    trackEvent('select_content', {
                        content_type: 'blog_post',
                        item_id: post.id,
                        item_name: post.title
                    });
                    window.location.href = `detalhes.html?slug=${post.slug}`;
                };
                container.appendChild(div);
            });
        } catch (err) {
            console.error("Erro no Blog:", err.message);
        }
    }

    // --- GLOBAL MODAL FUNCTIONS ---
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

    window.buyItemOnWhatsapp = async () => {
        if (!currentStoreItem) return;
        const name = document.getElementById('storeName').value;
        const email = document.getElementById('storeEmail').value;
        if (!name || !email) { alert('Preencha nome e e-mail.'); return; }

        await captureLead({ name, email, intention: 'loja_item', details: { item: currentStoreItem.title } });
        const text = `Olá! Me chamo *${name}*.\nQuero o produto: *${currentStoreItem.title}*`;
        openWhatsApp({ text });
        window.closeItemModal();
    };

    window.sendToWhatsapp = async (e) => {
        e.preventDefault();
        const name = document.getElementById('name').value;
        const email = document.getElementById('email').value;
        const type = document.getElementById('type').value;
        const guests = document.getElementById('guests').value;
        // Fix date formatting: Create date from string parts to avoid timezone issues
        const dateVal = document.getElementById('date').value;
        const [y, m, d] = dateVal.split('-');
        const dateBr = `${d}/${m}/${y}`;

        // Chalet ID Logic
        const chaletId = document.getElementById('chaletId')?.value;
        let chaletText = "";
        if (type === 'Chalé' && chaletId) {
            chaletText = ` (Quero o Chalé #${chaletId})`;
        }

        await captureLead({ name, email, intention: 'reserva_modal' });

        const text = `Olá! Me chamo *${name}*.\nInteresse: *${type}*${chaletText} para *${guests} pessoas* no dia *${dateBr}*.`;

        openWhatsApp({ text });
        document.getElementById('bookingModal').classList.remove('active');
    };

    // --- INITIALIZE EVERYTHING ---
    await loadCarouselSlides();
    await loadStoreItems();
    await loadBlogPosts();
});
