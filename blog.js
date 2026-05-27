import { supabase, trackEvent } from './scripts.js';

// Elements
const grid = document.getElementById('blog-grid');
const loading = document.getElementById('blog-loading');

document.addEventListener("DOMContentLoaded", () => {
    loadBlogPosts();
});

// Load Items
async function loadBlogPosts() {
    try {
        const { data, error } = await supabase
            .from('blog_posts')
            .select('*')
            .eq('is_published', true)
            .order('published_at', { ascending: false });

        if (error) throw error;

        loading.classList.add('hidden');
        grid.classList.remove('hidden');
        renderGrid(data);

    } catch (err) {
        console.error("Erro ao carregar blog:", err);
        loading.innerHTML = "<p class='text-red-500 font-medium'>Erro ao carregar matérias. Tente novamente.</p>";
    }
}

function renderGrid(posts) {
    if (!posts || posts.length === 0) {
        grid.innerHTML = "<p class='col-span-full text-center text-gray-500'>Nenhuma matéria encontrada.</p>";
        return;
    }

    grid.innerHTML = posts.map(post => {
        const date = new Date(post.published_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
        const imageUrl = post.cover_image_url || 'https://placehold.co/600x400/2E7D32/FFFFFF?text=Blog';
        const titleEscaped = post.title.replace(/'/g, "&#39;").replace(/"/g, "&quot;");

        return `
            <div class="group cursor-pointer flex flex-col h-full bg-white rounded-3xl border-2 border-orange-100 hover:border-accent-orange p-4 transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
                 onclick="window.openBlogPost('${post.slug}', '${post.id}', '${titleEscaped}')">
                
                <div class="relative h-48 mb-4 overflow-hidden rounded-2xl shadow-sm">
                    <img src="${imageUrl}" class="w-full h-full object-cover transition duration-700 group-hover:scale-110">
                    <div class="absolute top-3 left-3 bg-white/90 backdrop-blur font-bold text-xs px-3 py-1 rounded-lg shadow-sm uppercase text-accent-orange">${date}</div>
                </div>

                <h3 class="text-xl font-bold text-gray-900 mb-2 group-hover:text-accent-orange transition-colors line-clamp-2">${post.title}</h3>
                <p class="text-gray-500 text-sm line-clamp-3 mb-4 flex-1">${post.excerpt || ''}</p>
                
                <div class="mt-auto pt-4 border-t border-gray-100">
                    <span class="text-accent-orange font-bold text-sm flex items-center gap-1">Ler Matéria <i class="fas fa-arrow-right"></i></span>
                </div>
            </div>
        `;
    }).join('');
}

window.openBlogPost = (slug, id, title) => {
    trackEvent('select_content', {
        content_type: 'blog_post',
        item_id: id,
        item_name: title
    });
    window.location.href = `detalhes.html?slug=${slug}`;
}
