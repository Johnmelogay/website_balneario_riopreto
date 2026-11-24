import { supabase, trackEvent } from './scripts.js';

// Elements
const grid = document.getElementById('blog-grid');
const loading = document.getElementById('blog-loading');

document.addEventListener("DOMContentLoaded", () => {
    loadBlogPosts();
});

// Load Items
// A lista principal já vem no HTML (melhor para o Google). Aqui só acrescentamos
// posts publicados no banco que ainda não estão na página.
async function loadBlogPosts() {
    try {
        const { data, error } = await supabase
            .from('blog_posts')
            .select('*')
            .eq('is_published', true)
            .order('published_at', { ascending: false });

        if (error) throw error;

        const existentes = new Set([...grid.querySelectorAll('[data-slug]')].map(el => el.dataset.slug));
        const extras = (data || []).filter(p => p.slug && !existentes.has(p.slug));
        if (extras.length) renderGrid(extras);

    } catch (err) {
        console.error("Erro ao carregar blog:", err);
    } finally {
        loading.classList.add('hidden');
        grid.classList.remove('hidden');
    }
}

function renderGrid(posts) {
    if (!posts || posts.length === 0) return;

    grid.insertAdjacentHTML('afterbegin', posts.map(post => {
        const date = new Date(post.published_at).toLocaleDateString('pt-BR', { timeZone: 'America/Porto_Velho',  day: '2-digit', month: 'short' });
        const imageUrl = post.cover_image_url || 'https://placehold.co/600x400/2E7D32/FFFFFF?text=Blog';
        const titleEscaped = post.title.replace(/'/g, "&#39;").replace(/"/g, "&quot;");

        return `
            <div data-slug="${post.slug}" class="group cursor-pointer flex flex-col h-full bg-white rounded-3xl border-2 border-orange-100 hover:border-accent-orange p-4 transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
                 onclick="window.openBlogPost('${post.slug}', '${post.id}', '${titleEscaped}')">
                
                <div class="relative h-48 mb-4 overflow-hidden rounded-2xl shadow-sm">
                    <img src="${imageUrl}" alt="${titleEscaped}" loading="lazy" class="w-full h-full object-cover transition duration-700 group-hover:scale-110">
                    <div class="absolute top-3 left-3 bg-white/90 backdrop-blur font-bold text-xs px-3 py-1 rounded-lg shadow-sm uppercase text-accent-orange">${date}</div>
                </div>

                <h3 class="text-xl font-bold text-gray-900 mb-2 group-hover:text-accent-orange transition-colors line-clamp-2"><a href="/blog/${post.slug}">${post.title}</a></h3>
                <p class="text-gray-500 text-sm line-clamp-3 mb-4 flex-1">${post.excerpt || ''}</p>
                
                <div class="mt-auto pt-4 border-t border-gray-100">
                    <span class="text-accent-orange font-bold text-sm flex items-center gap-1">Ler Matéria <i class="fas fa-arrow-right"></i></span>
                </div>
            </div>
        `;
    }).join(''));
}

window.openBlogPost = (slug, id, title) => {
    trackEvent('select_content', {
        content_type: 'blog_post',
        item_id: id,
        item_name: title
    });
    window.location.href = `/blog/${slug}`;
}
