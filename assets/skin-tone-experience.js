/**
 * Skin Spectrum Console — standalone interactive tone × product intelligence.
 */
(function () {
    const SHADES = [
        {
            id: 'deep',
            label: 'Deep Espresso',
            short: 'Deep',
            swatch: '#1a0f0a',
            ring: '#3d2518',
            profile:
                'Rich melanin can lose light on the surface, showing up as ashy or matte patches. Dense, fair-trade butters help reflect a healthy glow without a gray cast.',
            traits: ['Ashy dryness', 'Needs occlusive moisture', 'Glow without film'],
            metrics: { hydration: 94, luminosity: 86, barrier: 96, comfort: 91 },
            defaultProduct: 'glaze',
        },
        {
            id: 'rich',
            label: 'Rich Cocoa',
            short: 'Rich',
            swatch: '#2d1810',
            ring: '#5c3824',
            profile:
                'The sweet spot for our full ritual — glaze for daily cushion, oils for scent and sheen, raw blocks for elbows and knees that stay rough.',
            traits: ['Versatile layering', 'Even tone support', 'All formulas shine'],
            metrics: { hydration: 92, luminosity: 90, barrier: 93, comfort: 94 },
            defaultProduct: 'glaze',
        },
        {
            id: 'warm',
            label: 'Warm Caramel',
            short: 'Warm',
            swatch: '#4a2c1a',
            ring: '#7a4d2e',
            profile:
                'Warm undertones love mango’s vitamins and the glaze’s melt-in texture. Oils add radiance on shoulders; shea is there when you want DIY intensity.',
            traits: ['Golden undertones', 'Mango vitamins A & E', 'Light oil layering'],
            metrics: { hydration: 88, luminosity: 92, barrier: 87, comfort: 90 },
            defaultProduct: 'mango',
        },
        {
            id: 'golden',
            label: 'Golden Honey',
            short: 'Golden',
            swatch: '#6b4423',
            ring: '#9a6638',
            profile:
                'Luminosity is the goal — fragrance oil on damp skin after glaze gives a lit-from-within finish. Raw mango supports collagen-friendly daily care.',
            traits: ['Radiance focus', 'Oil + glaze duo', 'Soft texture'],
            metrics: { hydration: 85, luminosity: 95, barrier: 84, comfort: 88 },
            defaultProduct: 'oil',
        },
        {
            id: 'amber',
            label: 'Soft Amber',
            short: 'Amber',
            swatch: '#8f5e34',
            ring: '#b8864b',
            profile:
                'Lighter melanin depth still benefits from melanin-aware formulas — sheer oils won’t overpower, and glaze gives enough cushion without heaviness.',
            traits: ['Sheer finish', 'Lightweight oil', 'Optional raw boost'],
            metrics: { hydration: 78, luminosity: 91, barrier: 76, comfort: 92 },
            defaultProduct: 'oil',
        },
    ];

    const PRODUCTS = [
        { id: 'glaze', label: 'Body Butter Glaze', short: 'Glaze', icon: 'fa-jar', shop: 'shop.html#body-glaze' },
        { id: 'oil', label: 'Fragrance Oil', short: 'Oil', icon: 'fa-droplet', shop: 'shop.html#body-oil' },
        { id: 'shea', label: 'Raw Shea', short: 'Shea', icon: 'fa-cube', shop: 'shop.html#raw-ingredients' },
        { id: 'mango', label: 'Raw Mango', short: 'Mango', icon: 'fa-lemon', shop: 'shop.html#raw-ingredients' },
        { id: 'atlanta', label: 'Atlanta LE', short: 'ATL', icon: 'fa-star', shop: 'shop.html#limited-edition' },
    ];

    /** 1–3 fit score */
    const MATRIX = {
        deep: { glaze: 3, oil: 3, shea: 3, mango: 2, atlanta: 3 },
        rich: { glaze: 3, oil: 3, shea: 3, mango: 3, atlanta: 3 },
        warm: { glaze: 3, oil: 2, shea: 2, mango: 3, atlanta: 3 },
        golden: { glaze: 3, oil: 3, shea: 2, mango: 3, atlanta: 2 },
        amber: { glaze: 2, oil: 3, shea: 1, mango: 2, atlanta: 2 },
    };

    const CELL_INSIGHT = {
        'deep-glaze': {
            why: 'Cupuaçu + shea base seals moisture into melanin-rich skin so ashiness looks smoothed, not stripped.',
            tip: 'Apply on damp skin post-shower for maximum hold.',
        },
        'deep-oil': {
            why: 'Sheer oil adds light reflection on deeper tones without chalky residue.',
            tip: 'Layer over glaze on collarbones and arms.',
        },
        'deep-shea': {
            why: 'Unrefined blocks target stubborn dry zones — knees, elbows, heels.',
            tip: 'Melt a pea-size amount into high-friction areas.',
        },
        'deep-mango': {
            why: 'Vitamins support glow; best as a booster under or mixed with glaze.',
            tip: 'Pair with glaze for everyday use.',
        },
        'deep-atlanta': {
            why: 'Same nourishing glaze base with limited Atlanta scent profiles.',
            tip: 'Sweet Auburn & Lenox lean warm — great for deep tones.',
        },
        'rich-glaze': {
            why: 'Your daily hero — balanced occlusives for all-over comfort on rich cocoa tones.',
            tip: 'One scoop, full body, twice daily if needed.',
        },
        'rich-oil': {
            why: 'Locks in scent and a satin finish after glaze sets.',
            tip: 'Mango Dream or Amber Spice are community favorites.',
        },
        'rich-shea': {
            why: 'DIY control for extra-dry patches without changing your full-body glaze.',
            tip: '16 oz bag = four 4 oz blocks for easy melting.',
        },
        'rich-mango': {
            why: 'Collagen-friendly vitamins A, C, E — ideal for maintaining even, soft texture.',
            tip: 'Alternate nights with glaze for variety.',
        },
        'rich-atlanta': {
            why: 'Full-spectrum fit — Peachtree’s warmth matches rich undertones beautifully.',
            tip: 'Limited run — grab while the drop is live.',
        },
        'warm-glaze': {
            why: 'Melts fast on warm caramel skin — non-greasy cushion for daily glow.',
            tip: 'Focus on legs and arms where ashiness shows first.',
        },
        'warm-oil': {
            why: 'Adds fragrance and sheen; slightly lighter priority than glaze for this tone.',
            tip: 'Best as a second step, not a solo moisturizer.',
        },
        'warm-shea': {
            why: 'Spot treatment when seasonal dryness hits knuckles or shins.',
            tip: 'Keep a melted jar bedside for quick touch-ups.',
        },
        'warm-mango': {
            why: 'Top pick — mango butter’s profile aligns with warm golden undertones.',
            tip: 'Use raw blocks or pair with Mango Dream glaze.',
        },
        'warm-atlanta': {
            why: 'Peachtree’s peach-vanilla warmth complements caramel undertones.',
            tip: 'Layer Atlanta glaze + matching oil if you add oils later.',
        },
        'golden-glaze': {
            why: 'Foundation for the glaze + oil glow stack golden honey tones love.',
            tip: 'Thin layer — a little spreads far on this depth.',
        },
        'golden-oil': {
            why: 'Highest luminosity pairing — oil catches light on honey undertones.',
            tip: 'Apply while skin is still dewy from glaze.',
        },
        'golden-shea': {
            why: 'Optional intensity for feet and hands without daily full-body weight.',
            tip: 'Weekly intensive mask on dry areas.',
        },
        'golden-mango': {
            why: 'Radiance support — vitamins help skin look smooth and reflective.',
            tip: 'Great under sunscreen on exposed areas (cosmetic prep).',
        },
        'golden-atlanta': {
            why: 'Solid fit; Lenox’s softer profile suits golden warmth.',
            tip: 'Try Sweet Auburn for a bolder scent.',
        },
        'amber-glaze': {
            why: 'Light cushion — enough moisture without feeling heavy on softer amber depth.',
            tip: 'Use sparingly on arms; build where you need more.',
        },
        'amber-oil': {
            why: 'Star pairing — lightweight fragrance oil is ideal for sheer daily radiance.',
            tip: 'Citrus or coconut scents feel fresh, not cloying.',
        },
        'amber-shea': {
            why: 'Only when you want DIY richness; daily glaze + oil usually suffices.',
            tip: 'Skip unless elbows need extra.',
        },
        'amber-mango': {
            why: 'Gentle vitamin boost for maintenance, not primary hydration.',
            tip: 'Mix a small melt into glaze occasionally.',
        },
        'amber-atlanta': {
            why: 'Enjoy for scent variety; glaze remains your moisture anchor.',
            tip: 'Sample Atlanta if you love fragrance drops.',
        },
    };

    const CONCERNS = [
        {
            id: 'dry-flaky',
            label: 'Dry / flaky',
            icon: 'fa-wind',
            summary: 'Barrier-loving butters for cushioned, smooth-feeling skin.',
            ingredients: [
                { name: 'Cupuaçu Butter', note: 'May help hold moisture so skin feels less tight after showers.' },
                { name: 'Raw Shea', note: 'Rich fatty acids for dry patches on elbows and legs.' },
                { name: 'Vitamin E', note: 'Helps glaze glide on without a stripping feel.' },
            ],
            picks: ['Body Butter Glaze', 'Raw White Shea'],
        },
        {
            id: 'dull-ashy',
            label: 'Dull / ashy',
            icon: 'fa-sun',
            summary: 'Botanicals chosen to help melanin-rich skin reflect light.',
            ingredients: [
                { name: 'Mango Butter', note: 'Vitamins A & E may support a more radiant look over time.' },
                { name: 'Sweet Almond Oil', note: 'Light emollience — melts in without a gray cast.' },
                { name: 'Fragrance Oil', note: 'Sheer finish on shoulders and décolletage.' },
            ],
            picks: ['Body Butter Glaze', 'Fragrance Oil'],
        },
        {
            id: 'rough-patches',
            label: 'Rough spots',
            icon: 'fa-hand-sparkles',
            summary: 'Concentrated butters for knees, elbows, and heels.',
            ingredients: [
                { name: 'Raw Shea Blocks', note: 'Melt into dry areas for an intensive balm feel.' },
                { name: 'Mango Butter', note: 'May soften the feel of rough texture with regular use.' },
                { name: 'Body Butter Glaze', note: 'Daily conditioning on high-friction zones.' },
            ],
            picks: ['Raw Shea', 'Raw Mango', 'Glaze'],
        },
        {
            id: 'tight-after-shower',
            label: 'Tight after shower',
            icon: 'fa-droplet',
            summary: 'Seal hydration while skin is still damp.',
            ingredients: [
                { name: 'Cupuaçu Butter', note: 'Holds many times its weight in water — ideal post-shower.' },
                { name: 'Glaze formula', note: 'Apply to damp skin to lock in hydration.' },
                { name: 'Atlanta LE', note: 'Same nourishing base, limited scents.' },
            ],
            picks: ['Body Butter Glaze', 'Atlanta Collection'],
        },
    ];

    const SCORE_LABEL = { 3: 'Optimal', 2: 'Strong', 1: 'Support' };
    const SCORE_PCT = { 3: 100, 2: 68, 1: 38 };

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function cellKey(shade, product) {
        return `${shade}-${product}`;
    }

    function scoreStyle(level) {
        if (level >= 3) return 'background: linear-gradient(135deg, #C5A26F 0%, #e8d4b0 100%); color: #111;';
        if (level >= 2) return 'background: rgba(197, 162, 111, 0.35); color: #f5f0e8;';
        return 'background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.45);';
    }

    function buildConsole(root) {
        let activeShade = 'rich';
        let activeProduct = 'glaze';
        let activeConcern = CONCERNS[0].id;
        let userInteracted = false;
        let demoTimer = null;

        root.innerHTML = `
            <div class="rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-md overflow-hidden shadow-2xl shadow-black/50">
                <div class="flex flex-wrap items-center justify-between gap-3 px-4 md:px-6 py-3 border-b border-white/10 bg-black/40">
                    <div class="flex items-center gap-2 text-[10px] tracking-[0.2em] text-[#C5A26F] font-semibold">
                        <span class="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></span>
                        SPECTRUM ANALYZER v1
                    </div>
                    <div id="ha-live-label" class="text-[10px] text-white/40 font-mono">tone: rich · product: glaze</div>
                </div>

                <div class="p-4 md:p-8">
                    <div id="ha-spectrum-rail" class="flex gap-2 md:gap-3 overflow-x-auto pb-2 scrollbar-thin mb-6 md:mb-8"></div>

                    <div class="grid lg:grid-cols-12 gap-6 md:gap-8">
                        <div class="lg:col-span-4 space-y-4">
                            <div id="ha-profile-card" class="rounded-2xl border border-white/10 bg-black/30 p-5 md:p-6"></div>
                            <div id="ha-metrics" class="rounded-2xl border border-white/10 bg-black/20 p-5 space-y-3"></div>
                        </div>

                        <div class="lg:col-span-5">
                            <div class="flex items-center justify-between mb-3">
                                <span class="text-[10px] uppercase tracking-widest text-white/40">Formula matrix</span>
                                <span class="text-[10px] text-white/30">tap any cell</span>
                            </div>
                            <div id="ha-heatmap" class="relative"></div>
                        </div>

                        <div class="lg:col-span-3">
                            <div id="ha-product-focus" class="rounded-2xl border border-[#C5A26F]/30 bg-gradient-to-br from-[#C5A26F]/10 to-transparent p-5 md:p-6 h-full min-h-[220px]"></div>
                        </div>
                    </div>

                    <div id="ha-insight-strip" class="mt-6 md:mt-8 rounded-2xl border border-white/10 bg-black/25 p-5 md:p-6 min-h-[100px]"></div>

                    <div class="mt-8 pt-6 border-t border-white/10">
                        <div class="flex items-center gap-2 mb-4">
                            <i class="fa-solid fa-flask text-[#C5A26F] text-sm"></i>
                            <span class="text-sm font-semibold text-white/90">Everyday skin feels</span>
                            <span class="text-[10px] text-white/35">— cosmetic only</span>
                        </div>
                        <div id="ha-concern-pills" class="flex flex-wrap gap-2 mb-4"></div>
                        <div id="ha-concern-body" class="rounded-2xl border border-white/10 bg-black/20 p-5 md:p-6"></div>
                    </div>
                </div>
            </div>`;

        const rail = root.querySelector('#ha-spectrum-rail');
        const profileCard = root.querySelector('#ha-profile-card');
        const metricsEl = root.querySelector('#ha-metrics');
        const heatmap = root.querySelector('#ha-heatmap');
        const productFocus = root.querySelector('#ha-product-focus');
        const insightStrip = root.querySelector('#ha-insight-strip');
        const concernPills = root.querySelector('#ha-concern-pills');
        const concernBody = root.querySelector('#ha-concern-body');
        const liveLabel = root.querySelector('#ha-live-label');

        function renderRail() {
            rail.innerHTML = SHADES.map((s) => {
                const on = s.id === activeShade;
                return `
                <button type="button" data-shade="${s.id}" class="ha-shade-btn shrink-0 flex flex-col items-center gap-2 p-3 md:p-4 rounded-2xl border transition-all duration-300 min-w-[88px] md:min-w-[110px]
                    ${on ? 'border-[#C5A26F] bg-[#C5A26F]/15 scale-[1.02] shadow-lg shadow-[#C5A26F]/20' : 'border-white/10 bg-white/[0.02] hover:border-white/25'}"
                    aria-pressed="${on}">
                    <span class="w-12 h-12 md:w-14 md:h-14 rounded-full border-2 transition-all ${on ? 'border-[#C5A26F] scale-110' : 'border-white/20'}"
                        style="background: radial-gradient(circle at 30% 30%, ${s.ring}, ${s.swatch}); box-shadow: inset 0 -4px 12px rgba(0,0,0,0.4);"></span>
                    <span class="text-[10px] md:text-xs font-semibold tracking-wide ${on ? 'text-[#C5A26F]' : 'text-white/60'}">${s.short}</span>
                </button>`;
            }).join('');

            rail.querySelectorAll('.ha-shade-btn').forEach((btn) => {
                btn.addEventListener('click', () => {
                    userInteracted = true;
                    stopDemo();
                    activeShade = btn.dataset.shade;
                    const shade = SHADES.find((x) => x.id === activeShade);
                    if (shade) activeProduct = shade.defaultProduct;
                    refresh();
                });
            });
        }

        function renderMetrics(shade) {
            const labels = [
                { key: 'hydration', label: 'Hydration lock' },
                { key: 'luminosity', label: 'Luminosity' },
                { key: 'barrier', label: 'Barrier cushion' },
                { key: 'comfort', label: 'Daily comfort' },
            ];
            metricsEl.innerHTML = `
                <div class="text-[10px] uppercase tracking-widest text-white/40 mb-1">Calibrated for ${shade.short}</div>
                ${labels
                    .map(
                        (m) => `
                <div>
                    <div class="flex justify-between text-xs mb-1">
                        <span class="text-white/70">${m.label}</span>
                        <span class="text-[#C5A26F] font-mono font-semibold">${shade.metrics[m.key]}%</span>
                    </div>
                    <div class="h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div class="ha-metric-bar-fill h-full rounded-full bg-gradient-to-r from-[#8f5e34] to-[#C5A26F]" style="width: ${shade.metrics[m.key]}%"></div>
                    </div>
                </div>`
                    )
                    .join('')}`;
        }

        function renderProfile(shade) {
            profileCard.innerHTML = `
                <div class="flex items-center gap-3 mb-3">
                    <span class="w-10 h-10 rounded-full border-2 border-[#C5A26F]/50" style="background: radial-gradient(circle at 30% 25%, ${shade.ring}, ${shade.swatch});"></span>
                    <div>
                        <h3 class="text-lg font-bold text-white tracking-tight">${escapeHtml(shade.label)}</h3>
                        <p class="text-[10px] text-[#C5A26F] tracking-widest uppercase">Active profile</p>
                    </div>
                </div>
                <p class="text-sm text-white/65 leading-relaxed">${escapeHtml(shade.profile)}</p>
                <ul class="mt-4 space-y-1.5">
                    ${shade.traits.map((t) => `<li class="text-xs text-white/45 flex items-center gap-2"><span class="w-1 h-1 rounded-full bg-[#C5A26F]"></span>${escapeHtml(t)}</li>`).join('')}
                </ul>`;
        }

        function renderHeatmap() {
            const colHeads = PRODUCTS.map(
                (p) =>
                    `<button type="button" data-product-head="${p.id}" class="ha-prod-head text-[9px] md:text-[10px] font-semibold text-center py-2 rounded-lg transition-colors text-white/50 hover:text-[#C5A26F] ${activeProduct === p.id ? 'text-[#C5A26F] bg-white/5' : ''}">${p.short}</button>`
            ).join('');

            const rows = SHADES.map((shade) => {
                const cells = PRODUCTS.map((product) => {
                    const level = MATRIX[shade.id][product.id];
                    const active = shade.id === activeShade && product.id === activeProduct;
                    return `
                    <button type="button" data-cell data-shade="${shade.id}" data-product="${product.id}" data-level="${level}"
                        class="ha-cell relative aspect-square rounded-xl md:rounded-2xl text-[11px] font-bold transition-all duration-300 ${active ? 'ha-cell-active ring-2 ring-[#C5A26F] scale-105 z-10' : 'hover:scale-[1.03] hover:ring-1 hover:ring-white/20'}"
                        style="${scoreStyle(level)}"
                        aria-label="${shade.short} skin, ${product.label}, ${SCORE_LABEL[level]}">
                        <span class="opacity-90">${level >= 3 ? '●●●' : level >= 2 ? '●●' : '●'}</span>
                        ${active ? '<span class="absolute inset-0 rounded-xl md:rounded-2xl border border-white/30 pointer-events-none"></span>' : ''}
                    </button>`;
                }).join('');
                const rowActive = shade.id === activeShade;
                return `
                <div class="grid grid-cols-[64px_repeat(5,1fr)] md:grid-cols-[72px_repeat(5,1fr)] gap-1.5 md:gap-2 items-center ${rowActive ? 'opacity-100' : 'opacity-40 hover:opacity-70 transition-opacity'}">
                    <button type="button" data-shade-row="${shade.id}" class="text-left text-[10px] md:text-xs font-medium flex items-center gap-1.5 ${rowActive ? 'text-[#C5A26F]' : 'text-white/50'}">
                        <span class="w-3 h-3 rounded-full shrink-0" style="background:${shade.swatch}"></span>${shade.short}
                    </button>
                    ${cells}
                </div>`;
            }).join('');

            heatmap.innerHTML = `
                <div class="grid grid-cols-[64px_repeat(5,1fr)] md:grid-cols-[72px_repeat(5,1fr)] gap-1.5 md:gap-2 mb-2">
                    <div></div>
                    ${colHeads}
                </div>
                <div class="space-y-1.5 md:space-y-2">${rows}</div>
                <div class="flex flex-wrap gap-3 mt-4 text-[9px] text-white/35">
                    <span><span class="text-[#C5A26F]">●●●</span> Optimal</span>
                    <span><span class="text-white/50">●●</span> Strong</span>
                    <span><span class="text-white/25">●</span> Support</span>
                </div>`;

            heatmap.querySelectorAll('[data-cell]').forEach((cell) => {
                cell.addEventListener('click', () => {
                    userInteracted = true;
                    stopDemo();
                    activeShade = cell.dataset.shade;
                    activeProduct = cell.dataset.product;
                    refresh();
                });
            });
            heatmap.querySelectorAll('[data-shade-row]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    userInteracted = true;
                    stopDemo();
                    activeShade = btn.dataset.shadeRow;
                    const s = SHADES.find((x) => x.id === activeShade);
                    activeProduct = s ? s.defaultProduct : 'glaze';
                    refresh();
                });
            });
            heatmap.querySelectorAll('[data-product-head]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    userInteracted = true;
                    stopDemo();
                    activeProduct = btn.dataset.productHead;
                    refresh();
                });
            });
        }

        function renderProductFocus(shade, product, level) {
            const insight = CELL_INSIGHT[cellKey(shade.id, product.id)] || {
                why: 'Formulated for melanin-rich skin with plant butters and oils.',
                tip: 'Explore the shop to find your scent.',
            };
            productFocus.innerHTML = `
                <div class="text-[10px] uppercase tracking-widest text-[#C5A26F] mb-2">${SCORE_LABEL[level]} match</div>
                <div class="flex items-center gap-2 mb-3">
                    <span class="w-9 h-9 rounded-xl bg-black/40 flex items-center justify-center text-[#C5A26F]"><i class="fa-solid ${product.icon}"></i></span>
                    <h4 class="text-lg font-bold text-white leading-tight">${escapeHtml(product.label)}</h4>
                </div>
                <div class="relative w-full h-2 rounded-full bg-white/10 mb-4 overflow-hidden">
                    <div class="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#C5A26F] to-[#f0e6d2] transition-all duration-700" style="width: ${SCORE_PCT[level]}%"></div>
                </div>
                <p class="text-sm text-white/70 leading-relaxed">${escapeHtml(insight.why)}</p>
                <p class="text-xs text-white/45 mt-3 italic">${escapeHtml(insight.tip)}</p>
                <a href="${product.shop}" class="inline-flex mt-5 items-center gap-2 text-xs font-semibold tracking-wider text-[#111] bg-[#C5A26F] hover:bg-white px-4 py-2.5 rounded-full transition-colors">
                    SHOP ${product.short.toUpperCase()} <i class="fa-solid fa-arrow-right text-[10px]"></i>
                </a>`;
        }

        function renderInsight(shade, product, level) {
            const insight = CELL_INSIGHT[cellKey(shade.id, product.id)];
            insightStrip.innerHTML = `
                <div class="flex flex-col md:flex-row md:items-start gap-4 md:gap-8">
                    <div class="shrink-0">
                        <div class="text-[10px] text-white/40 uppercase tracking-widest mb-1">Signal</div>
                        <div class="text-2xl md:text-3xl font-black text-white">${SCORE_PCT[level]}<span class="text-lg text-[#C5A26F]">%</span></div>
                        <div class="text-xs text-[#C5A26F] font-semibold">${SCORE_LABEL[level]} synergy</div>
                    </div>
                    <div class="flex-1 border-l-0 md:border-l border-white/10 md:pl-8">
                        <p class="text-sm md:text-base text-white/80 leading-relaxed">
                            <strong class="text-white">${escapeHtml(shade.label)}</strong> + <strong class="text-[#C5A26F]">${escapeHtml(product.label)}</strong>:
                            ${escapeHtml(insight ? insight.why : 'Layer-friendly formula for everyday cosmetic moisture.')}
                        </p>
                    </div>
                </div>`;
        }

        function renderConcerns() {
            concernPills.innerHTML = CONCERNS.map(
                (c) =>
                    `<button type="button" data-concern="${c.id}" class="ha-concern-pill px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${c.id === activeConcern ? 'bg-[#C5A26F] text-[#111] border-[#C5A26F]' : 'border-white/15 text-white/60 hover:border-[#C5A26F]/50'}">${escapeHtml(c.label)}</button>`
            ).join('');

            const c = CONCERNS.find((x) => x.id === activeConcern) || CONCERNS[0];
            concernBody.innerHTML = `
                <div class="flex items-start gap-3 mb-4">
                    <span class="w-9 h-9 rounded-xl bg-[#C5A26F]/15 flex items-center justify-center text-[#C5A26F]"><i class="fa-solid ${c.icon}"></i></span>
                    <div>
                        <p class="text-sm text-white/80">${escapeHtml(c.summary)}</p>
                    </div>
                </div>
                <div class="grid sm:grid-cols-3 gap-4">
                    ${c.ingredients
                        .map(
                            (ing) => `
                    <div class="rounded-xl bg-white/[0.03] border border-white/10 p-3">
                        <div class="text-xs font-semibold text-[#C5A26F]">${escapeHtml(ing.name)}</div>
                        <p class="text-[11px] text-white/50 mt-1 leading-relaxed">${escapeHtml(ing.note)}</p>
                    </div>`
                        )
                        .join('')}
                </div>
                <div class="flex flex-wrap gap-2 mt-4">
                    ${c.picks.map((p) => `<span class="text-[10px] px-2.5 py-1 rounded-full border border-white/15 text-white/55">${escapeHtml(p)}</span>`).join('')}
                </div>`;

            concernPills.querySelectorAll('.ha-concern-pill').forEach((pill) => {
                pill.addEventListener('click', () => {
                    activeConcern = pill.dataset.concern;
                    renderConcerns();
                });
            });
        }

        function refresh() {
            const shade = SHADES.find((s) => s.id === activeShade) || SHADES[1];
            const product = PRODUCTS.find((p) => p.id === activeProduct) || PRODUCTS[0];
            const level = MATRIX[shade.id][product.id];

            liveLabel.textContent = `tone: ${shade.id} · product: ${product.id} · ${SCORE_LABEL[level]}`;

            renderRail();
            renderProfile(shade);
            renderMetrics(shade);
            renderHeatmap();
            renderProductFocus(shade, product, level);
            renderInsight(shade, product, level);
            renderConcerns();
        }

        function stopDemo() {
            if (demoTimer) {
                clearInterval(demoTimer);
                demoTimer = null;
            }
        }

        function startDemo() {
            let i = 0;
            demoTimer = setInterval(() => {
                if (userInteracted) {
                    stopDemo();
                    return;
                }
                activeShade = SHADES[i % SHADES.length].id;
                const s = SHADES.find((x) => x.id === activeShade);
                activeProduct = s.defaultProduct;
                i += 1;
                refresh();
            }, 3200);
        }

        refresh();
        startDemo();

        root.addEventListener('mouseenter', () => {
            userInteracted = true;
            stopDemo();
        }, { once: true });
    }

    function init() {
        const root = document.getElementById('skin-spectrum-console');
        if (root) buildConsole(root);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();