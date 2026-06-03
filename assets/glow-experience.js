/**
 * Light scroll reveals (optional parallax on marked elements).
 */
(function () {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const parallaxEnabled = !prefersReduced && window.innerWidth >= 768;

    function initScrollReveal() {
        const els = document.querySelectorAll('[data-glow-reveal]');
        if (!els.length) return;
        const io = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('glow-reveal--in');
                        io.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
        );
        els.forEach((el) => io.observe(el));
    }

    function initParallax() {
        if (!parallaxEnabled) return;
        const layers = document.querySelectorAll('[data-glow-parallax]');
        if (!layers.length) return;

        let ticking = false;
        function update() {
            layers.forEach((el) => {
                const speed = parseFloat(el.dataset.glowParallax) || 0.08;
                const rect = el.getBoundingClientRect();
                const center = rect.top + rect.height / 2;
                const offset = (center - window.innerHeight / 2) * speed;
                el.style.transform = `translate3d(0, ${offset}px, 0)`;
            });
            ticking = false;
        }

        window.addEventListener(
            'scroll',
            () => {
                if (!ticking) {
                    ticking = true;
                    requestAnimationFrame(update);
                }
            },
            { passive: true }
        );
        update();
    }

    function init() {
        initScrollReveal();
        initParallax();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();