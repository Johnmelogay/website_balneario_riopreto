export class Lightbox {
    constructor() {
        this.isOpen = false;
        this.currentIndex = 0;
        this.items = []; // { src, type: 'image'|'video', caption? }

        this.createDOM();
        this.bindEvents();
    }

    createDOM() {
        // Prevent duplicate
        if (document.getElementById('marketing-lightbox')) return;

        const html = `
            <div id="marketing-lightbox" class="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-md hidden opacity-0 transition-opacity duration-300 flex items-center justify-center">
                <!-- Close Button -->
                <button id="lb-close" class="absolute top-4 right-4 text-white/80 hover:text-white p-4 z-50 transition-transform hover:rotate-90">
                    <i class="fa-solid fa-xmark text-3xl drop-shadow-md"></i>
                </button>

                <!-- Nav Buttons (Desktop) -->
                <button id="lb-prev" class="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 text-white rounded-full items-center justify-center backdrop-blur-sm transition-all hover:scale-110 z-40">
                    <i class="fa-solid fa-chevron-left text-xl"></i>
                </button>
                <button id="lb-next" class="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 text-white rounded-full items-center justify-center backdrop-blur-sm transition-all hover:scale-110 z-40">
                    <i class="fa-solid fa-chevron-right text-xl"></i>
                </button>

                <!-- Content Container -->
                <div class="relative w-full h-full max-w-7xl max-h-screen p-4 md:p-10 flex flex-col items-center justify-center">
                    <div id="lb-content" class="relative w-full h-full flex items-center justify-center">
                        <!-- Media Injected Here -->
                    </div>
                    
                    <!-- Caption / Counter -->
                    <div class="absolute bottom-6 left-0 w-full text-center pointer-events-none">
                        <p id="lb-caption" class="text-white font-medium text-lg drop-shadow-md mb-1"></p>
                        <p id="lb-counter" class="text-white/60 text-xs uppercase tracking-widest"></p>
                    </div>
                </div>

                <!-- Loading Spinner -->
                <div id="lb-loader" class="absolute inset-0 z-30 flex items-center justify-center pointer-events-none hidden">
                    <div class="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);

        this.el = document.getElementById('marketing-lightbox');
        this.content = document.getElementById('lb-content');
        this.captionEl = document.getElementById('lb-caption');
        this.counterEl = document.getElementById('lb-counter');
        this.loader = document.getElementById('lb-loader');
    }

    bindEvents() {
        // Clicks
        document.getElementById('lb-close').onclick = () => this.close();
        document.getElementById('lb-prev').onclick = (e) => { e.stopPropagation(); this.prev(); };
        document.getElementById('lb-next').onclick = (e) => { e.stopPropagation(); this.next(); };

        // Close on background click
        this.el.onclick = (e) => {
            if (e.target === this.el || e.target.closest('#lb-content') === null) {
                // Check if click was NOT on nav buttons
                if (!e.target.closest('button')) this.close();
            }
        };

        // Keyboard
        document.addEventListener('keydown', (e) => {
            if (!this.isOpen) return;
            if (e.key === 'Escape') this.close();
            if (e.key === 'ArrowLeft') this.prev();
            if (e.key === 'ArrowRight') this.next();
        });

        // Swipe (Touch)
        let touchStartX = 0;
        let touchEndX = 0;

        this.el.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        this.el.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            handleSwipe();
        }, { passive: true });

        const handleSwipe = () => {
            const diff = touchStartX - touchEndX;
            if (Math.abs(diff) > 50) { // Threshold
                if (diff > 0) this.next(); // Swiped Left -> Next
                else this.prev(); // Swiped Right -> Prev
            }
        };
    }

    open(items, index = 0) {
        this.items = items;
        this.currentIndex = index;
        this.isOpen = true;

        this.el.classList.remove('hidden');
        // Small delay for fade in
        requestAnimationFrame(() => {
            this.el.classList.remove('opacity-0');
        });
        document.body.style.overflow = 'hidden'; // Lock scroll

        this.renderItem();
    }

    close() {
        this.isOpen = false;
        this.el.classList.add('opacity-0');

        // Pause any video
        const videos = this.content.querySelectorAll('video');
        videos.forEach(v => v.pause());

        setTimeout(() => {
            this.el.classList.add('hidden');
            this.content.innerHTML = ""; // Clear memory
            document.body.style.overflow = '';
        }, 300);
    }

    next() {
        this.currentIndex = (this.currentIndex + 1) % this.items.length;
        this.renderItem('next');
    }

    prev() {
        this.currentIndex = (this.currentIndex - 1 + this.items.length) % this.items.length;
        this.renderItem('prev');
    }

    renderItem(direction = null) {
        const item = this.items[this.currentIndex];

        // Animate Out? Maybe simple replacement for now
        this.content.innerHTML = "";
        this.loader.classList.remove('hidden');

        // Logic to support both strings (url) and objects {src, type}
        const src = typeof item === 'string' ? item : item.src;
        // Auto-detect type if not provided
        const isVideo = (typeof item === 'object' && item.type === 'video') || src.match(/\.(mp4|webm)$/i);
        const caption = typeof item === 'object' ? (item.caption || "") : "";

        let mediaEl;
        if (isVideo) {
            mediaEl = document.createElement('video');
            mediaEl.src = src;
            mediaEl.controls = true;
            mediaEl.autoplay = true;
            mediaEl.playsInline = true;
            mediaEl.className = "max-h-full max-w-full rounded-lg shadow-2xl object-contain animate-fade-in";
            mediaEl.onloadeddata = () => this.loader.classList.add('hidden');
        } else {
            mediaEl = document.createElement('img');
            mediaEl.src = src;
            mediaEl.className = "max-h-full max-w-full rounded-lg shadow-2xl object-contain animate-fade-in";
            mediaEl.onload = () => this.loader.classList.add('hidden');
        }

        this.content.appendChild(mediaEl);

        // Update Meta
        this.captionEl.innerText = caption;
        this.counterEl.innerText = `${this.currentIndex + 1} / ${this.items.length}`;
    }
}

// Global Instance
export const galleryLightbox = new Lightbox();
