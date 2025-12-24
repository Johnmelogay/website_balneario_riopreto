import { supabase, openWhatsApp } from './scripts.js';

// Elements
const grid = document.getElementById('loja-grid');
const loading = document.getElementById('loja-loading');
const modal = document.getElementById('itemModal');

let currentItem = null;

document.addEventListener("DOMContentLoaded", () => {
    loadStoreItems();
});

// Load Items
async function loadStoreItems() {
    try {
        const { data, error } = await supabase
            .from('store_items')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        loading.classList.add('hidden');
        grid.classList.remove('hidden');
        renderGrid(data);

    } catch (err) {
        console.error("Erro ao carregar loja:", err);
        loading.innerHTML = "<p>Erro ao carregar produtos. Tente novamente.</p>";
    }
}

function renderGrid(items) {
    if (!items || items.length === 0) {
        grid.innerHTML = "<p class='col-span-full text-center'>Nenhum produto encontrado.</p>";
        return;
    }

    grid.innerHTML = items.map(item => `
        <div class="group bg-white rounded-2xl p-4 cursor-pointer hover:shadow-xl transition-all duration-300 border border-gray-100"
             onclick='window.openItemModal(${JSON.stringify(item)})'>
            
            <div class="relative overflow-hidden rounded-xl aspect-square mb-4 bg-gray-50">
                <img src="${item.image_url || 'https://placehold.co/400x400'}" 
                     class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                
                <div class="absolute bottom-2 right-2 bg-white/90 backdrop-blur shadow-sm px-3 py-1 rounded-full text-sm font-bold text-gray-900">
                    R$ ${item.price?.toFixed(2).replace('.', ',')}
                </div>
            </div>

            <h3 class="font-bold text-gray-900 text-lg leading-tight mb-1 group-hover:text-primary-green transition-colors">${item.name}</h3>
            <p class="text-gray-500 text-sm line-clamp-2">${item.description || 'Sem descrição.'}</p>
        </div>
    `).join('');
}

// Modal Logic
window.openItemModal = (item) => {
    currentItem = item;

    document.getElementById('modalImg').src = item.image_url || 'https://placehold.co/600x600';
    document.getElementById('modalTitle').innerText = item.name;
    document.getElementById('modalPrice').innerText = `R$ ${item.price?.toFixed(2).replace('.', ',')}`;
    document.getElementById('modalDescription').innerText = item.description || "Sem descrição detalhada.";
    document.getElementById('modalCategory').innerText = "Loja Oficial"; // or item.category

    modal.classList.add('active');
}

window.closeModal = () => {
    modal.classList.remove('active');
    currentItem = null;
}

window.buyOnWhatsapp = () => {
    if (!currentItem) return;

    const text = `Olá! Gostaria de fazer um pedido na loja:\n\n` +
        `🛒 *Produto:* ${currentItem.name}\n` +
        `💰 *Valor:* R$ ${currentItem.price?.toFixed(2).replace('.', ',')}\n` +
        `📄 *Detalhes:* (Tamanho/Cor se aplicável)\n\n` +
        `Poderia verificar o estoque e frete?`;

    openWhatsApp({ text: text });
}
