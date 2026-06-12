/* ─────────────────────────────────────────────────────────────
   Herban Alchemy — Motion System
   Lenis smooth scroll + GSAP ScrollTrigger.
   - Scroll-scrubbed hero video (frame-by-frame on scroll)
   - 3D tilt on limited-edition cards
   - Soft staggered reveals on every section
   Respects prefers-reduced-motion: everything degrades to static.
   ───────────────────────────────────────────────────────────── */
(function () {
    'use strict';

    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || typeof gsap === 'undefined') return;

    gsap.registerPlugin(ScrollTrigger);

    /* ── Lenis smooth scroll ── */
    var lenis = null;
    if (typeof Lenis !== 'undefined') {
        lenis = new Lenis({
            duration: 1.1,
            easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
            smoothWheel: true
        });
        lenis.on('scroll', ScrollTrigger.update);
        gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
        gsap.ticker.lagSmoothing(0);

        // Keep anchor links working with smooth scroll
        document.querySelectorAll('a[href^="#"]').forEach(function (a) {
            a.addEventListener('click', function (e) {
                var id = a.getAttribute('href');
                if (id.length > 1 && document.querySelector(id)) {
                    e.preventDefault();
                    lenis.scrollTo(id, { offset: -80 });
                }
            });
        });
    }

    /* ── Hero: scroll-scrubbed video ──
       The video does not autoplay — its currentTime is driven by
       scroll position through the hero, motionsites-style. */
    var heroVideo = document.getElementById('hero-video');
    if (heroVideo) {
        var syncScrub = function () {
            if (!heroVideo.duration) return;
            var st = ScrollTrigger.create({
                trigger: '#hero',
                start: 'top top',
                end: 'bottom top',
                scrub: true,
                onUpdate: function (self) {
                    // Hold the last 5% so the video rests on a clean frame
                    var t = Math.min(self.progress, 0.95) * heroVideo.duration;
                    if (Math.abs(heroVideo.currentTime - t) > 0.01) {
                        heroVideo.currentTime = t;
                    }
                }
            });
        };
        if (heroVideo.readyState >= 1) syncScrub();
        else heroVideo.addEventListener('loadedmetadata', syncScrub, { once: true });
        heroVideo.load();
    }

    /* ── Hero: gentle parallax + entrance ── */
    var heroCard = document.querySelector('#hero .hero-card');
    if (heroCard) {
        gsap.from(heroCard, { y: 48, opacity: 0, duration: 1.2, ease: 'power3.out', delay: 0.15 });
        gsap.to(heroCard, {
            yPercent: -14,
            ease: 'none',
            scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: 0.6 }
        });
    }
    var heroMedia = document.querySelector('#hero .hero-media');
    if (heroMedia) {
        gsap.to(heroMedia, {
            scale: 1.08,
            ease: 'none',
            scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: 0.6 }
        });
    }

    /* ── Marquee strip ── */
    var marqueeTrack = document.querySelector('.ha-marquee-track');
    if (marqueeTrack) {
        gsap.to(marqueeTrack, { xPercent: -50, ease: 'none', duration: 28, repeat: -1 });
    }

    /* ── Section reveals: headings rise, cards stagger in ──
       IntersectionObserver + CSS (the `translate` property, which is
       independent of `transform`, so GSAP tilt never conflicts).
       The hidden state only applies once html.ha-motion is set, so a
       failed script load can never leave content invisible. */
    document.querySelectorAll('section h2').forEach(function (h2) {
        if (!h2.closest('[data-reveal]')) h2.setAttribute('data-reveal', '');
    });

    document.querySelectorAll('[data-reveal-group]').forEach(function (group) {
        Array.prototype.forEach.call(group.children, function (child, i) {
            child.setAttribute('data-reveal-item', '');
            child.style.transitionDelay = (i * 120) + 'ms';
        });
    });

    document.documentElement.classList.add('ha-motion');

    var revealTargets = document.querySelectorAll('[data-reveal], [data-reveal-item]');
    var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            var el = entry.target;
            el.classList.add('is-in');
            io.unobserve(el);
            // Drop the stagger delay once revealed so hover effects stay snappy
            setTimeout(function () { el.style.transitionDelay = '0ms'; }, 1600);
        });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });

    revealTargets.forEach(function (el) {
        // Already in view (e.g. reload mid-page): show instantly, no animation
        var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) {
            el.style.transition = 'none';
            el.classList.add('is-in');
        } else {
            io.observe(el);
        }
    });

    /* ── Limited-edition cards: 3D tilt toward the cursor ── */
    var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (finePointer) {
        document.querySelectorAll('.le-card').forEach(function (card) {
            var qx = gsap.quickTo(card, 'rotationY', { duration: 0.45, ease: 'power2.out' });
            var qy = gsap.quickTo(card, 'rotationX', { duration: 0.45, ease: 'power2.out' });
            gsap.set(card, { transformPerspective: 900, transformOrigin: 'center' });

            card.addEventListener('mousemove', function (e) {
                var r = card.getBoundingClientRect();
                var px = (e.clientX - r.left) / r.width - 0.5;
                var py = (e.clientY - r.top) / r.height - 0.5;
                qx(px * 10);
                qy(py * -10);
            });
            card.addEventListener('mouseleave', function () { qx(0); qy(0); });
        });
    }
})();
