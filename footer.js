import { captureLead } from './scripts.js';

window.handleNewsletterSubmit = async (e) => {
    e.preventDefault();
    const emailInput = document.getElementById('newsletter-email');
    const email = emailInput.value;

    if (!email) return;

    await captureLead({
        name: 'Newsletter Subscriber',
        email,
        intention: 'newsletter',
        details: { source: 'footer_form' }
    });

    alert('Inscrito com sucesso! Obrigado.');
    emailInput.value = '';
};

document.addEventListener("DOMContentLoaded", () => {
    const footerContainer = document.getElementById("footer-container");
    if (!footerContainer) return;

    footerContainer.innerHTML = `
    <footer class="bg-gray-900 text-white pt-20 pb-10 border-t-4 border-primary-green">
        <div class="max-w-7xl mx-auto px-4 grid md:grid-cols-4 gap-10">
            <div class="space-y-4">
                <img src="images/logo.png" onerror="this.style.display='none'" alt="Logo" class="h-12 opacity-90">
                <h3 class="text-2xl font-bold text-white">Rio Preto</h3>
                <p class="text-gray-400 text-sm">Conectando você à natureza com conforto e segurança desde 1998.</p>
                <div class="flex gap-4">
                    <a href="#" class="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center hover:bg-primary-green transition"><i class="fab fa-instagram"></i></a>
                    <a href="#" class="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center hover:bg-primary-green transition"><i class="fab fa-facebook-f"></i></a>
                    <a href="#" class="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center hover:bg-primary-green transition"><i class="fab fa-whatsapp"></i></a>
                </div>
            </div>

            <div>
                <h4 class="font-bold text-lg mb-6" onclick="window.location.href='admin_secret_v1.html'" style="cursor: default; user-select: none;">Explorar</h4>
                <ul class="space-y-3 text-gray-400 text-sm">
                    <li><a href="reservas.html" class="hover:text-primary-green transition">Reservas</a></li>
                    <li><a href="index.html#dayuse" class="hover:text-primary-green transition">Day Use</a></li>
                    <li><a href="index.html#gallery" class="hover:text-primary-green transition">Galeria</a></li>
                    <li><a href="index.html#loja" class="hover:text-primary-green transition">Loja</a></li>
                </ul>
            </div>

            <div>
                <h4 class="font-bold text-lg mb-6">Contato</h4>
                <ul class="space-y-3 text-gray-400 text-sm">
                    <li class="flex items-center gap-2"><i class="fab fa-whatsapp text-primary-green"></i> (69) 99312-9559</li>
                    <li class="flex items-center gap-2"><i class="far fa-envelope text-primary-green"></i> johnmelocontato@gmail.com</li>
                    <li class="flex items-start gap-2"><i class="fas fa-map-marker-alt text-primary-green mt-1"></i> BR-364, Km 40<br>Candeias do Jamari, RO</li>
                </ul>
            </div>

            <div class="bg-gray-800 p-6 rounded-2xl">
                <h4 class="font-bold text-white mb-2">Novidades</h4>
                <p class="text-xs text-gray-400 mb-4">Receba notícias e promoções.</p>
                <form onsubmit="handleNewsletterSubmit(event)">
                    <input type="email" id="newsletter-email" placeholder="Seu e-mail" required class="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-primary-green mb-2">
                    <button class="w-full bg-primary-green text-white font-bold text-sm py-2 rounded-lg hover:bg-green-700 transition">Inscrever-se</button>
                </form>
            </div>
        </div>
        <div class="max-w-7xl mx-auto px-4 mt-16 pt-8 border-t border-gray-800 text-center text-gray-500 text-sm">
            &copy; 2025 Balneário Rio Preto. Todos os direitos reservados.
        </div>
    </footer>
    `;
});
