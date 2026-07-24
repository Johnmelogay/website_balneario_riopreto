export function renderImpressoes(container) {
    container.innerHTML = `
        <div class="max-w-2xl mx-auto space-y-6 animate-fade-in pb-20">
            
            <div class="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 relative overflow-hidden">
                <div class="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-emerald-400 to-teal-500"></div>
                
                <div class="flex items-center gap-4 mb-6">
                    <div class="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl shadow-inner">
                        <i class="fa-solid fa-print"></i>
                    </div>
                    <div>
                        <h2 class="text-xl font-black text-gray-800 tracking-tight">Imprimir Imagens e Fotos</h2>
                        <p class="text-sm text-gray-500 font-medium mt-0.5">Envie imagens para a impressora térmica Elgin i8</p>
                    </div>
                </div>

                <div class="space-y-4">
                    <label class="block text-sm font-bold text-gray-700 mb-1">Selecione uma imagem (PNG, JPG, JPEG):</label>
                    <div class="relative group cursor-pointer border-2 border-dashed border-gray-300 rounded-2xl hover:border-emerald-500 hover:bg-emerald-50 transition p-8 text-center" id="dropzone">
                        <input type="file" id="imageInput" accept="image/png, image/jpeg, image/jpg" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" onchange="handleImageSelect(event)">
                        <i class="fa-solid fa-image text-4xl text-gray-400 group-hover:text-emerald-500 transition mb-3"></i>
                        <p class="text-gray-600 font-bold">Clique ou arraste uma imagem aqui</p>
                        <p class="text-xs text-gray-400 mt-1">A imagem será convertida em preto e branco pela impressora.</p>
                    </div>

                    <div id="previewContainer" class="hidden mt-6 space-y-4">
                        <h3 class="text-sm font-bold text-gray-700">Pré-visualização:</h3>
                        <div class="border-2 border-gray-200 rounded-xl p-2 bg-gray-50 flex justify-center">
                            <img id="imagePreview" class="max-w-full max-h-64 object-contain rounded-lg shadow-sm" />
                        </div>
                        
                        <button id="btnPrintImage" onclick="printSelectedImage()" class="w-full bg-emerald-600 text-white py-3.5 rounded-xl font-black text-sm shadow-lg shadow-emerald-200 hover:bg-emerald-700 hover:scale-[1.02] transition-all flex items-center justify-center gap-2">
                            <i class="fa-solid fa-print"></i> ENVIAR PARA IMPRESSORA
                        </button>
                    </div>
                </div>
            </div>

        </div>
    `;

    // Dropzone styling events
    const dropzone = document.getElementById('dropzone');
    const input = document.getElementById('imageInput');
    
    input.addEventListener('dragenter', () => dropzone.classList.add('border-emerald-500', 'bg-emerald-50'));
    input.addEventListener('dragleave', () => dropzone.classList.remove('border-emerald-500', 'bg-emerald-50'));
    input.addEventListener('drop', () => dropzone.classList.remove('border-emerald-500', 'bg-emerald-50'));
}

let currentBase64 = null;

window.handleImageSelect = function(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        alert('Por favor, selecione um arquivo de imagem válido.');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        currentBase64 = e.target.result;
        
        document.getElementById('previewContainer').classList.remove('hidden');
        document.getElementById('imagePreview').src = currentBase64;
    };
    reader.readAsDataURL(file);
};

window.printSelectedImage = async function() {
    if (!currentBase64) return alert('Nenhuma imagem selecionada.');

    const btn = document.getElementById('btnPrintImage');
    const originalText = btn.innerHTML;
    
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ENVIANDO...';
    btn.disabled = true;
    btn.classList.add('opacity-75');

    // Construir o HTML que será renderizado pela Elgin (Puppeteer)
    const htmlPayload = `
        <!DOCTYPE html>
        <html>
        <body style="margin: 0; padding: 0; background: white; text-align: center;">
            <img src="${currentBase64}" style="width: 576px; display: block; margin: 0 auto; height: auto;" />
        </body>
        </html>
    `;

    try {
        const directRes = await fetch('http://localhost:3001/print_html', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ html: htmlPayload })
        });

        const resData = await directRes.json();

        if (resData.success) {
            alert('✅ Imagem enviada para a impressora com sucesso!');
        } else {
            alert('❌ Erro da Impressora: ' + (resData.error || 'Falha desconhecida.'));
        }
    } catch (err) {
        console.error('Erro de conexão USB:', err);
        alert('❌ Servidor Elgin offline ou impressora desconectada! Verifique o cabo USB e o servidor local.');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
        btn.classList.remove('opacity-75');
    }
};
