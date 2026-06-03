/**
 * Product gallery: campaign card + alt photo — thumbs below image (no overlay).
 */
(function () {
    function parseImages(el) {
        try {
            const raw = el.getAttribute('data-images');
            if (!raw) return [];
            const list = JSON.parse(raw);
            return Array.isArray(list) ? list.filter(Boolean) : [];
        } catch {
            return [];
        }
    }

    function setMainImage(gallery, src, index) {
        const main = gallery.querySelector('.gallery-main');
        if (!main) return;
        main.src = src;
        main.dataset.index = String(index);
        gallery.querySelectorAll('.gallery-thumb').forEach((btn, i) => {
            const active = i === index;
            btn.classList.toggle('ring-2', active);
            btn.classList.toggle('ring-[#C5A26F]', active);
            btn.classList.toggle('opacity-100', active);
            btn.classList.toggle('opacity-55', !active);
            btn.setAttribute('aria-current', active ? 'true' : 'false');
        });
        const hint = gallery.querySelector('.gallery-view-hint');
        if (hint) {
            hint.textContent = index === 0 ? 'Campaign' : 'Photo';
        }
    }

    function initGallery(gallery) {
        if (gallery.dataset.galleryReady === '1') return;
        const images = parseImages(gallery);
        if (images.length < 2) return;
        gallery.dataset.galleryReady = '1';

        const main = gallery.querySelector('.gallery-main');
        if (!main) return;

        let index = 0;
        setMainImage(gallery, images[0], 0);

        gallery.querySelectorAll('.gallery-thumb').forEach((btn) => {
            btn.addEventListener('click', () => {
                const i = parseInt(btn.dataset.index, 10);
                if (!Number.isNaN(i) && images[i]) {
                    index = i;
                    setMainImage(gallery, images[i], i);
                }
            });
        });

        const prev = gallery.querySelector('.gallery-prev');
        const next = gallery.querySelector('.gallery-next');
        if (prev) {
            prev.addEventListener('click', (e) => {
                e.preventDefault();
                index = (index - 1 + images.length) % images.length;
                setMainImage(gallery, images[index], index);
            });
        }
        if (next) {
            next.addEventListener('click', (e) => {
                e.preventDefault();
                index = (index + 1) % images.length;
                setMainImage(gallery, images[index], index);
            });
        }
    }

    window.buildGalleryHTML = function (images, alt, extraClass = '') {
        if (!images || !images.length) return '';
        const json = JSON.stringify(images).replace(/'/g, '&#39;');
        const thumbs = images
            .map(
                (src, i) => `
            <button type="button" class="gallery-thumb shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-md overflow-hidden border border-gray-200 ${i === 0 ? 'ring-2 ring-[#C5A26F] opacity-100' : 'opacity-55'}" data-index="${i}" aria-label="View image ${i + 1}">
                <img src="${src}" alt="" class="w-full h-full object-cover" loading="lazy">
            </button>`
            )
            .join('');

        const nav =
            images.length > 1
                ? `
            <button type="button" class="gallery-prev absolute left-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/50 text-white hover:bg-black/70 hidden sm:flex items-center justify-center" aria-label="Previous">‹</button>
            <button type="button" class="gallery-next absolute right-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/50 text-white hover:bg-black/70 hidden sm:flex items-center justify-center" aria-label="Next">›</button>`
                : '';

        const thumbRow =
            images.length > 1
                ? `<div class="gallery-thumbs-row">
                <span class="gallery-view-hint text-[9px] uppercase tracking-widest text-gray-400 shrink-0 mr-1">Campaign</span>
                ${thumbs}
            </div>`
                : '';

        return `
        <div class="product-gallery ${extraClass}" data-images='${json}'>
            <div class="gallery-media">
                <img src="${images[0]}" alt="${alt}" class="gallery-main transition-opacity duration-300" loading="lazy">
                ${nav}
            </div>
            ${thumbRow}
        </div>`;
    };

    window.initProductGalleries = function (root = document) {
        root.querySelectorAll('.product-gallery').forEach(initGallery);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => initProductGalleries());
    } else {
        initProductGalleries();
    }
})();