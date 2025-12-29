document.addEventListener("DOMContentLoaded", () => {
  const navbarContainer = document.getElementById("navbar-container");
  if (!navbarContainer) return;

  // --- CONFIGURATION ---
  const path = window.location.pathname;
  const page = path.split("/").pop();
  // Include both with and without extension just in case
  const isTransparentPage = ["", "index.html", "reservas.html", "reservas"].includes(page);

  // --- STYLES & CLASSES ---
  // Ensure container is fixed and top-level. z-50 is usually enough, but we use 100 to be safe.
  navbarContainer.className = "fixed top-0 left-0 w-full z-[100] transition-all duration-300";

  function getLinkClass(linkPage) {
    // Simple approximation for active state
    const isActive = (page === linkPage) || (page === "" && linkPage === "index.html");

    let classes = "transition text-sm uppercase tracking-wide cursor-pointer ";
    if (isActive) {
      return classes + "text-primary-green font-extrabold";
    }
    return classes + "nav-item hover:text-primary-green font-medium";
  }

  // --- RENDER HTML ---
  navbarContainer.innerHTML = `
    <header id="main-header" class="w-full transition-all duration-300 ${isTransparentPage ? 'bg-transparent py-4' : 'bg-white/95 backdrop-blur-md shadow-sm py-2'}">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between items-center h-16">
                
                <a href="index.html" class="flex items-center gap-2 group z-50 relative">
                    <img src="images/logo_opt.png" id="nav-logo" class="transition-all duration-300 ${isTransparentPage ? 'h-14' : 'h-10'}" alt="Logo" />
                    <div class="flex flex-col">
                        <span id="nav-logo-text" class="hidden sm:block font-extrabold text-sm tracking-wide transition-colors duration-300 ${isTransparentPage ? 'text-white' : 'text-gray-900'}">
                            Balneário Rio Preto
                        </span>
                    </div>
                </a>

                <!-- DESKTOP MENU -->
                <nav id="desktop-nav" class="hidden md:flex items-center gap-8 ${isTransparentPage ? 'text-white' : 'text-gray-700'}">
                    <a href="index.html" class="${getLinkClass('index.html')}">Início</a>
                    <a href="reservas.html" class="${getLinkClass('reservas.html')}">Chalés</a>
                    <a href="index.html#dayuse" class="${getLinkClass('')}">Day Use</a>
                    <a href="loja.html" class="${getLinkClass('loja.html')}">Loja</a>
                    <a href="index.html#location" class="${getLinkClass('')}">Como Chegar</a>
                </nav>

                <!-- MOBILE MENU BUTTON -->
                <button id="mobileMenuBtn" class="md:hidden text-2xl p-2 z-50 relative transition-colors duration-300 ${isTransparentPage ? 'text-white' : 'text-gray-700'}">
                    <i class="fa-solid fa-bars"></i>
                </button>
            </div>
        </div>

        <!-- MOBILE MENU OVERLAY (Fixed to Viewport, Top Z-Index, Moved to Body) -->
        <div id="mobileMenu" class="fixed inset-0 w-screen h-[100dvh] bg-gray-900/95 backdrop-blur-xl text-white z-[9999] hidden flex-col items-center justify-center space-y-8 opacity-0 transition-opacity duration-300">
            <button id="closeMenu" class="absolute top-6 right-6 text-4xl text-white/50 hover:text-white transition cursor-pointer">
                <i class="fa-solid fa-xmark"></i>
            </button>

            <div class="flex flex-col items-center gap-6 text-xl font-bold tracking-wide">
                <a href="index.html" class="mobile-link hover:text-primary-green transition transform hover:scale-105">Início</a>
                <a href="reservas.html" class="mobile-link hover:text-primary-green transition transform hover:scale-105">Chalés & Reservas</a>
                <a href="index.html#dayuse" class="mobile-link hover:text-primary-green transition transform hover:scale-105">Day Use</a>
                <a href="loja.html" class="mobile-link hover:text-primary-green transition transform hover:scale-105">Loja Oficial</a>
                <a href="index.html#location" class="mobile-link hover:text-primary-green transition transform hover:scale-105">Como Chegar</a>
            </div>
            
            <div class="mt-8 flex gap-6">
                <a href="https://instagram.com/balneario_riopreto" target="_blank" class="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center hover:bg-primary-green transition"><i class="fab fa-instagram text-xl"></i></a>
                <a href="https://wa.me/5569992139559" target="_blank" class="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center hover:bg-primary-green transition"><i class="fab fa-whatsapp text-xl"></i></a>
            </div>
        </div>
    </header>
    `;

  // --- MOVE MOBILE MENU TO BODY (Fix for fixed positioning context) ---
  const injectedMobileMenu = document.getElementById("mobileMenu");
  if (injectedMobileMenu) {
    document.body.appendChild(injectedMobileMenu);
  }

  // --- ELEMENTS ---
  const header = document.getElementById('main-header');
  const logoImg = document.getElementById('nav-logo');
  const logoText = document.getElementById('nav-logo-text');
  const desktopNav = document.getElementById('desktop-nav');
  const mobileBtn = document.getElementById('mobileMenuBtn');

  // Mobile Menu Elements (Queried AFTER moving to body)
  const mobileMenu = document.getElementById('mobileMenu');
  const closeMenu = document.getElementById('closeMenu');
  const mobileLinks = document.querySelectorAll('.mobile-link');

  // --- SCROLL LOGIC ---
  function handleScroll() {
    // Robust scroll check
    const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    const isScrolled = scrollTop > 10; // Lower threshold

    if (isTransparentPage) {
      if (isScrolled) {
        // Scrolled: Solid White
        header.classList.remove('bg-transparent', 'py-4');
        header.classList.add('bg-white/95', 'backdrop-blur-md', 'shadow-sm', 'py-2');

        logoImg.classList.remove('h-14');
        logoImg.classList.add('h-10');

        updateColors('dark');
      } else {
        // Top: Transparent
        header.classList.add('bg-transparent', 'py-4');
        header.classList.remove('bg-white/95', 'backdrop-blur-md', 'shadow-sm', 'py-2');

        logoImg.classList.add('h-14');
        logoImg.classList.remove('h-10');

        updateColors('light');
      }
    } else {
      // Other Pages: Always Solid White & Dark Text
      if (isScrolled) {
        header.classList.remove('py-4', 'shadow-none');
        header.classList.add('py-2', 'shadow-sm');
      } else {
        header.classList.add('py-4', 'shadow-none');
        header.classList.remove('py-2', 'shadow-sm');
      }
      // FORCE dark colors
      updateColors('dark');
    }
  }

  function updateColors(theme) {
    if (theme === 'dark') {
      logoText.classList.remove('text-white');
      logoText.classList.add('text-gray-900');

      desktopNav.classList.remove('text-white');
      desktopNav.classList.add('text-gray-700');

      mobileBtn.classList.remove('text-white');
      mobileBtn.classList.add('text-gray-700');
    } else {
      logoText.classList.add('text-white');
      logoText.classList.remove('text-gray-900');

      desktopNav.classList.add('text-white');
      desktopNav.classList.remove('text-gray-700');

      mobileBtn.classList.add('text-white');
      mobileBtn.classList.remove('text-gray-700');
    }
  }

  window.addEventListener('scroll', handleScroll);
  // Initial check (Ensure state is correct on load)
  handleScroll();

  // --- MOBILE MENU LOGIC ---
  function openMobileMenu() {
    if (!mobileMenu) return;
    mobileMenu.classList.remove('hidden');
    mobileMenu.classList.add('flex');
    // Trigger reflow/animation
    setTimeout(() => {
      mobileMenu.classList.remove('opacity-0');
    }, 10);
    document.body.style.overflow = 'hidden';
  }

  function closeMobileMenu() {
    if (!mobileMenu) return;
    mobileMenu.classList.add('opacity-0');
    setTimeout(() => {
      mobileMenu.classList.remove('flex');
      mobileMenu.classList.add('hidden');
      document.body.style.overflow = '';
    }, 300);
  }

  if (mobileBtn) mobileBtn.addEventListener('click', openMobileMenu);
  if (closeMenu) closeMenu.addEventListener('click', closeMobileMenu);
  mobileLinks.forEach(link => link.addEventListener('click', closeMobileMenu));
});