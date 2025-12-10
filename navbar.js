document.addEventListener("DOMContentLoaded", () => {
  const navbarContainer = document.getElementById("navbar-container");
  if (!navbarContainer) return;

  const currentPage = window.location.pathname.split("/").pop();

  function isActive(page) {
    return currentPage === page ? "text-primary-green font-semibold" : "text-gray-700";
  }

  navbarContainer.innerHTML = `
<header id="main-header" class="sticky top-0 bg-white/90 backdrop-blur-md z-50 border-b border-gray-100 transition-all">
  <div class="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">

    <a href="index.html" class="flex items-center gap-2">
      <img src="images/logo.png" class="logo-img h-12 w-auto transition-all" />
      <span class="hidden sm:block font-extrabold text-primary-green text-sm tracking-wide">Balneário Rio Preto</span>
    </a>

    <nav class="hidden md:flex gap-8 font-semibold text-sm uppercase tracking-wide text-gray-700">
      <a href="index.html" class="hover:text-primary-green transition">Início</a>
      <a href="reservas.html" class="hover:text-primary-green transition">Chalés</a>
      <a href="index.html#dayuse" class="hover:text-primary-green transition">Day Use</a>
      <a href="index.html#news-section" class="hover:text-primary-green transition">Blog</a>
      <a href="index.html#location" class="hover:text-primary-green transition">Como Chegar</a>
    </nav>

    <button id="mobileMenuBtn" class="md:hidden text-gray-700 text-3xl p-2">
      <i class="fa-solid fa-bars"></i>
    </button>
  </div>

  <div id="mobileMenu" class="fixed top-0 left-0 w-screen h-screen hidden z-[9999] bg-black/95 text-white flex flex-col items-center justify-center pt-20 space-y-10 text-2xl font-bold transition-opacity duration-300">
    <button id="closeMenu" class="absolute top-6 right-6 text-4xl">
      <i class="fa-solid fa-xmark"></i>
    </button>

    <a href="index.html" class="mobile-link block w-full text-center hover:text-accent-orange transition">Início</a>
    <a href="reservas.html" class="mobile-link block w-full text-center hover:text-accent-orange transition">Chalés</a>
    <a href="index.html#dayuse" class="mobile-link block w-full text-center hover:text-accent-orange transition">Day Use</a>
    <a href="index.html#news-section" class="mobile-link block w-full text-center hover:text-accent-orange transition">Blog</a>
    <a href="index.html#location" class="mobile-link block w-full text-center hover:text-accent-orange transition">Como Chegar</a>

  </div>
</header>
`;

  const mainHeader = document.getElementById('main-header');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 40) {
      mainHeader.classList.add('shadow-lg', 'bg-white');
      document.querySelector('.logo-img').classList.add('h-10');
    } else {
      mainHeader.classList.remove('shadow-lg', 'bg-white');
      document.querySelector('.logo-img').classList.remove('h-10');
    }
  });

  const mobileBtn = document.getElementById('mobileMenuBtn');
  const closeMenu = document.getElementById('closeMenu');
  const mobileMenu = document.getElementById('mobileMenu');
  const mobileLinks = document.querySelectorAll('.mobile-link');

  function toggleMobile() {
    mobileMenu.classList.toggle('hidden');
    mobileMenu.classList.toggle('flex');
    document.body.classList.toggle('overflow-hidden');
  }

  mobileBtn.addEventListener('click', toggleMobile);
  closeMenu.addEventListener('click', toggleMobile);
  mobileLinks.forEach(link => link.addEventListener('click', toggleMobile));
});