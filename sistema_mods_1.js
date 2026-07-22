export async function renderEstoque(container) {
    container.innerHTML = `
        <div class="h-[calc(100vh-80px)] w-full rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-white">
            <iframe src="estoque.html?embedded=true" class="w-full h-full border-none"></iframe>
        </div>
    `;
}
