/**
 * Herban Alchemy Storefront Integration Engine
 * Dynamically loads banner configurations, layout section visibilities, 
 * redirects account icons to admin page, and injects floating AI Chatbot.
 */

(function () {
    // Standard Config Fallbacks
    let currentConfig = {
        banner: {
            enabled: true,
            text: "FREE shipping on orders over $65",
            link: "shipping-returns.html",
            bgColor: "#111111",
            textColor: "#ffffff"
        },
        placements: {
            mensCollection: true,
            carrierOils: true,
            rawIngredients: true,
            scentQuiz: true,
            benefits: true
        },
        chatbot: {
            enabled: true,
            name: "Aura",
            greeting: "Hi there! I'm Aura, your Herban Alchemy skincare guide. How can I help you find your glow today?",
            systemPrompt: "",
            model: "gemini"
        },
        stripe: {
            enabled: false,
            publicKey: '',
            currency: 'usd',
            shippingFlatRate: 5.99,
            freeShippingThreshold: 65
        }
    };

    // Load dynamic configuration from API
    async function loadConfig() {
        const origins = ['', 'http://localhost:3000'];
        let configLoaded = false;
        
        for (const origin of origins) {
            if (configLoaded) break;
            try {
                const res = await fetch(`${origin}/api/config`);
                if (res.ok) {
                    const data = await res.json();
                    
                    // Safe deep merge to prevent TypeError crashes with empty objects/properties
                    currentConfig = {
                        ...currentConfig,
                        ...data,
                        banner: { ...currentConfig.banner, ...(data.banner || {}) },
                        placements: { ...currentConfig.placements, ...(data.placements || {}) },
                        chatbot: { ...currentConfig.chatbot, ...(data.chatbot || {}) },
                        stripe: { ...currentConfig.stripe, ...(data.stripe || {}) }
                    };
                    if (data.theme) {
                        currentConfig.theme = { ...(currentConfig.theme || {}), ...data.theme };
                    }
                    if (data.hero) {
                        currentConfig.hero = { ...(currentConfig.hero || {}), ...data.hero };
                    }
                    if (data.footer) {
                        currentConfig.footer = { ...(currentConfig.footer || {}), ...data.footer };
                    }
                    if (data.products) {
                        currentConfig.products = data.products;
                    }
                    
                    window.HERBAN_BACKEND_ORIGIN = origin;
                    window.currentConfig = currentConfig; // Expose globally for cart/product lookups
                    console.log(`[Herban Engine] Dynamic configuration loaded successfully from ${origin || 'relative path'}.`);
                    configLoaded = true;
                }
            } catch (err) {
                // Try next origin in loop silently
            }
        }

        if (!configLoaded) {
            console.warn('[Herban Engine] Failed to fetch server config. Running in offline/static fallback mode.');
        }

        // Initialize elements
        applyBanner();
        applyPlacements();
        applyDynamicPrices();
        routeAccountButton();
        applyThemeStyles();
        applyThemeImages();
        applyBrandSettings();
        if (currentConfig.chatbot && currentConfig.chatbot.enabled) {
            injectChatbotWidget();
        }
        setupCheckoutOverride();

        // Auto open cart if url parameter cart_open=true is present
        try {
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('cart_open') === 'true' && typeof showCart === 'function') {
                showCart();
            }
        } catch (e) {
            console.warn('[Herban Engine] Failed to auto-open cart:', e);
        }
    }

    // Scan the DOM heuristically to synchronize pricing from config.json with static HTML cards
    function applyDynamicPrices() {
        if (!currentConfig.products) return;

        // Try direct selector mapping
        document.querySelectorAll('[data-product-price]').forEach(el => {
            const id = parseInt(el.getAttribute('data-product-price'));
            const prod = currentConfig.products.find(p => p.id === id);
            if (prod) el.textContent = `$${prod.price}`;
        });

        // Scan page elements that execute cart additions
        document.querySelectorAll('[onclick]').forEach(el => {
            const clickAttr = el.getAttribute('onclick') || '';
            const match = clickAttr.match(/(?:addAtlantaToCart|addMenToCart|addToCart)\s*\(\s*['"]([^'"]+)['"]/);
            if (match) {
                const productName = match[1];
                const prod = currentConfig.products.find(p => p.name === productName || (p.displayName && productName.includes(p.displayName)));
                if (prod) {
                    // Search parent container for price indicators (e.g. starts with $)
                    const card = el.closest('.ha-card') || el.closest('article') || el.parentElement;
                    if (card) {
                        card.querySelectorAll('span, div').forEach(child => {
                            const content = child.textContent.trim();
                            if (content.startsWith('$') && !isNaN(content.slice(1).split(' ')[0])) {
                                child.textContent = `$${prod.price}`;
                            }
                        });
                    }
                }
            }
        });
    }

    // Dynamic Announcement Banner
    function applyBanner() {
        const bannerConfig = currentConfig.banner;
        // Check if top bar exists (usually the first div in body)
        let topBar = document.querySelector('body > div:first-child');
        
        // Ensure we target the actual top bar. In our HTMLs, it usually starts with class containing "bg-[#111111] text-white"
        const potentialTopBar = document.querySelector('.bg-\\[\\#111111\\].text-white');
        if (potentialTopBar) topBar = potentialTopBar;

        if (topBar) {
            if (!bannerConfig.enabled) {
                topBar.style.display = 'none';
            } else {
                topBar.style.display = 'block';
                topBar.style.backgroundColor = bannerConfig.bgColor || '#111111';
                topBar.style.color = bannerConfig.textColor || '#ffffff';
                
                // Find banner span to update text
                const textSpan = topBar.querySelector('.flex.items-center span');
                if (textSpan) {
                    if (bannerConfig.link) {
                        textSpan.innerHTML = `<a href="${bannerConfig.link}" class="hover:underline">${bannerConfig.text}</a>`;
                    } else {
                        textSpan.textContent = bannerConfig.text;
                    }
                }
            }
        }
    }

    // Toggle placements (only applies to landing index.html)
    function applyPlacements() {
        const placements = currentConfig.placements;
        const page = window.location.pathname.split("/").pop();
        if (page === "" || page === "index.html") {
            const mapping = {
                mensCollection: '#mens-collection',
                carrierOils: '#carrier-oils',
                rawIngredients: '#raw-ingredients',
                scentQuiz: '#quiz',
                benefits: '#trust-bar' // fallback search
            };

            for (const [key, selector] of Object.entries(mapping)) {
                let section = document.querySelector(selector);
                
                // Backup check for trust bar
                if (key === 'benefits' && !section) {
                    // find by section class or content
                    document.querySelectorAll('section').forEach(sec => {
                        if (sec.textContent.includes('Organic') && sec.textContent.includes('Fair Trade')) {
                            section = sec;
                        }
                    });
                }

                if (section) {
                    if (placements[key] === false) {
                        section.style.display = 'none';
                    } else {
                        section.style.display = 'block';
                    }
                }
            }
        }
    }

    // Route Account user icon to account.html (Customer Portal)
    function routeAccountButton() {
        // Find fa-user icon
        const userIcon = document.querySelector('.fa-user');
        if (userIcon) {
            // Find parent button or anchor
            const parentBtn = userIcon.closest('button') || userIcon.closest('a');
            if (parentBtn) {
                // Change to anchor or attach click redirect
                parentBtn.style.cursor = 'pointer';
                parentBtn.onclick = function (e) {
                    e.preventDefault();
                    window.location.href = 'account.html';
                };
                console.log('[Herban Engine] Account user button bound to customer portal (account.html).');
            }
        }
    }

    // Dynamic Inject AI Chatbot UI Widget
    function injectChatbotWidget() {
        // Prevent double injection
        if (document.getElementById('herban-chatbot-root')) return;

        const cbConfig = currentConfig.chatbot;

        // Container
        const root = document.createElement('div');
        root.id = 'herban-chatbot-root';
        root.className = 'fixed bottom-6 right-6 z-[1000]';

        // Floating Bubble
        const bubble = document.createElement('button');
        bubble.id = 'herban-chat-bubble';
        bubble.className = 'w-14 h-14 bg-[#111111] hover:bg-[#C5A26F] text-white rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 transform hover:scale-105 active:scale-95 focus:outline-none relative';
        bubble.innerHTML = `
            <i class="fa-solid fa-comments text-xl"></i>
            <span class="absolute -top-1 -right-1 flex h-3 w-3">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
        `;
        bubble.onclick = toggleChatWindow;
        root.appendChild(bubble);

        // Chat Window
        const chatWindow = document.createElement('div');
        chatWindow.id = 'herban-chat-window';
        chatWindow.className = 'hidden absolute bottom-20 right-0 w-80 sm:w-96 bg-white rounded-3xl shadow-2xl border border-gray-100 flex-col overflow-hidden transition-all duration-300';
        chatWindow.style.maxHeight = '500px';
        chatWindow.style.height = '85vh';

        // Chat Header
        const header = document.createElement('div');
        header.className = 'bg-[#111111] text-white p-5 flex items-center justify-between';
        header.innerHTML = `
            <div>
                <div class="font-bold text-sm tracking-tight">${cbConfig.name || 'Aura'} AI Guide</div>
                <div class="text-[10px] text-green-400 font-medium tracking-wider uppercase flex items-center gap-x-1.5 mt-0.5">
                    <span class="w-1.5 h-1.5 bg-green-500 rounded-full"></span> Online &amp; Glowing
                </div>
            </div>
            <button id="herban-chat-close" class="text-white hover:text-[#C5A26F] text-xl focus:outline-none">&times;</button>
        `;
        chatWindow.appendChild(header);

        // Chat Content (messages scroll panel)
        const chatContent = document.createElement('div');
        chatContent.id = 'herban-chat-messages';
        chatContent.className = 'flex-1 p-5 overflow-y-auto space-y-4 bg-[#FAF7F2] text-sm';
        chatWindow.appendChild(chatContent);

        // Chat Input Bar
        const footer = document.createElement('div');
        footer.className = 'p-3 bg-white border-t border-gray-100 flex gap-x-2';
        footer.innerHTML = `
            <input type="text" id="herban-chat-input" placeholder="Ask Aura about dry skin, scents..." class="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-[#C5A26F]">
            <button id="herban-chat-send" class="bg-[#111111] hover:bg-[#C5A26F] text-white px-4 rounded-xl text-xs font-bold transition-all">
                Send
            </button>
        `;
        chatWindow.appendChild(footer);

        root.appendChild(chatWindow);
        document.body.appendChild(root);

        // Events
        document.getElementById('herban-chat-close').onclick = toggleChatWindow;
        document.getElementById('herban-chat-send').onclick = sendChatMessage;
        document.getElementById('herban-chat-input').onkeydown = e => {
            if (e.key === 'Enter') sendChatMessage();
        };

        // Load chat history or greeting
        initChatMessages();
    }

    function toggleChatWindow() {
        const win = document.getElementById('herban-chat-window');
        if (win.classList.contains('hidden')) {
            win.classList.remove('hidden');
            win.classList.add('flex');
            document.getElementById('herban-chat-input').focus();
        } else {
            win.classList.add('hidden');
            win.classList.remove('flex');
        }
    }

    let chatHistory = [];

    function initChatMessages() {
        const container = document.getElementById('herban-chat-messages');
        container.innerHTML = '';

        // Load greeting
        const cbConfig = currentConfig.chatbot;
        addMessageBubble('assistant', cbConfig.greeting || "Hi there! I'm Aura, your Herban Alchemy guide. How can I help you glow today?");

        // Rest of history (from session storage if exists)
        const stored = sessionStorage.getItem('herbanChatHistory');
        if (stored) {
            chatHistory = JSON.parse(stored);
            chatHistory.forEach(msg => {
                addMessageBubble(msg.role, msg.content);
            });
        }
    }

    function addMessageBubble(role, content) {
        const container = document.getElementById('herban-chat-messages');
        const bubble = document.createElement('div');
        
        if (role === 'assistant') {
            bubble.className = 'flex gap-x-2.5';
            bubble.innerHTML = `
                <div class="w-7 h-7 bg-[#C5A26F] text-white rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-black uppercase shadow-sm">
                    ${(currentConfig.chatbot.name || 'A').slice(0, 2)}
                </div>
                <div class="max-w-[80%] bg-white p-3 rounded-2xl border border-gray-100 shadow-sm leading-relaxed text-xs">
                    ${content}
                </div>
            `;
        } else {
            bubble.className = 'flex justify-end';
            bubble.innerHTML = `
                <div class="max-w-[80%] bg-[#111111] text-white p-3 rounded-2xl leading-relaxed text-xs">
                    ${content}
                </div>
            `;
        }
        
        container.appendChild(bubble);
        container.scrollTop = container.scrollHeight;
    }

    async function sendChatMessage() {
        const input = document.getElementById('herban-chat-input');
        if (!input || !input.value.trim()) return;

        const text = input.value.trim();
        input.value = '';

        // Render user message
        addMessageBubble('user', text);

        // Add loading typing indicator
        const container = document.getElementById('herban-chat-messages');
        const loader = document.createElement('div');
        loader.id = 'herban-chat-loader';
        loader.className = 'flex gap-x-2.5 items-center';
        loader.innerHTML = `
            <div class="w-7 h-7 bg-[#C5A26F] text-white rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-black uppercase shadow-sm">
                ${(currentConfig.chatbot.name || 'A').slice(0, 2)}
            </div>
            <div class="bg-white px-4 py-2.5 rounded-2xl border border-gray-100 shadow-sm text-xs text-gray-400 italic">
                <i class="fa-solid fa-spinner animate-spin mr-1"></i> thinking...
            </div>
        `;
        container.appendChild(loader);
        container.scrollTop = container.scrollHeight;

        try {
            const backendOrigin = window.HERBAN_BACKEND_ORIGIN || '';
            const res = await fetch(`${backendOrigin}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    history: chatHistory
                })
            });

            // Remove loader
            const spin = document.getElementById('herban-chat-loader');
            if (spin) spin.remove();

            if (res.ok) {
                const data = await res.json();
                
                // Add to history
                chatHistory.push({ role: 'user', content: text });
                chatHistory.push({ role: 'assistant', content: data.reply });
                sessionStorage.setItem('herbanChatHistory', JSON.stringify(chatHistory));

                // Render AI bubble
                addMessageBubble('assistant', data.reply);
            } else {
                const data = await res.json();
                addMessageBubble('assistant', `⚠️ Sorry, I encountered an issue. (${data.error || 'Server error'})`);
            }
        } catch (err) {
            console.error(err);
            const spin = document.getElementById('herban-chat-loader');
            if (spin) spin.remove();
            addMessageBubble('assistant', '⚠️ I am unable to reach the AI engine right now. Please verify your backend server connection.');
        }
    }

    // Adjust color brightness utility
    function adjustColor(hex, percent) {
        if (!hex || hex.length < 7) return hex;
        let R = parseInt(hex.substring(1, 3), 16);
        let G = parseInt(hex.substring(3, 5), 16);
        let B = parseInt(hex.substring(5, 7), 16);

        R = parseInt(R * (100 + percent) / 100);
        G = parseInt(G * (100 + percent) / 100);
        B = parseInt(B * (100 + percent) / 100);

        R = (R < 255) ? R : 255;
        G = (G < 255) ? G : 255;
        B = (B < 255) ? B : 255;

        R = (R > 0) ? R : 0;
        G = (G > 0) ? G : 0;
        B = (B > 0) ? B : 0;

        const rHex = R.toString(16).padStart(2, '0');
        const gHex = G.toString(16).padStart(2, '0');
        const bHex = B.toString(16).padStart(2, '0');

        return `#${rHex}${gHex}${bHex}`;
    }

    // Dynamic Color & Font Theme Application
    function applyThemeStyles() {
        const theme = currentConfig.theme;
        if (!theme) return;

        // 1. Handle Font Pairing Injection
        if (theme.fontPairing) {
            let fontLink = document.getElementById('herban-theme-fonts');
            if (!fontLink) {
                fontLink = document.createElement('link');
                fontLink.id = 'herban-theme-fonts';
                fontLink.rel = 'stylesheet';
                document.head.appendChild(fontLink);
            }
            
            if (theme.fontPairing === 'outfit') {
                fontLink.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;800;900&display=swap';
            } else if (theme.fontPairing === 'lora-outfit') {
                fontLink.href = 'https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&family=Outfit:wght@300;400;500;600;800&display=swap';
            } else {
                fontLink.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@300;400;500;600&display=swap';
            }
        }

        // 2. Inject override stylesheet
        let styleEl = document.getElementById('herban-theme-styles');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'herban-theme-styles';
            document.head.appendChild(styleEl);
        }

        const primary = theme.primaryColor || '#111111';
        const accent = theme.accentColor || '#C5A26F';
        const bg = theme.backgroundColor || '#FAF7F2';
        const text = theme.textColor || '#111111';
        
        let headingFont = "'Playfair Display', Georgia, serif";
        let bodyFont = "'Inter', system-ui, sans-serif";
        
        if (theme.fontPairing === 'outfit') {
            headingFont = "'Outfit', sans-serif";
            bodyFont = "'Outfit', sans-serif";
        } else if (theme.fontPairing === 'lora-outfit') {
            headingFont = "'Lora', serif";
            bodyFont = "'Outfit', sans-serif";
        }

        const lighterBg = adjustColor(bg, 5);
        const darkerBg = adjustColor(bg, -4);
        const cardBg = bg === '#FAF7F2' || bg === '#FAF7F2'.toLowerCase() ? '#ffffff' : lighterBg;

        styleEl.innerHTML = `
            :root {
                --gold: ${accent} !important;
                --accent-gold: ${accent} !important;
            }
            
            body {
                background-color: ${bg} !important;
                color: ${text} !important;
                font-family: ${bodyFont} !important;
            }
            
            h1, h2, h3, h4, .heading-serif, .serif-title, .herban-logo {
                font-family: ${headingFont} !important;
            }

            .bg-\\[\\#FAF7F2\\], .bg-gray-50, .le-section {
                background-color: ${darkerBg} !important;
                background: linear-gradient(180deg, ${bg} 0%, ${darkerBg} 100%) !important;
            }
            .bg-\\[\\#F9F7F4\\] {
                background-color: ${lighterBg} !important;
            }
            
            .ha-card, .le-card, .bg-white, .product-card {
                background-color: ${cardBg} !important;
                color: ${text} !important;
                border-color: ${adjustColor(bg, -15)} !important;
            }

            .text-\\[\\#C5A26F\\], .text-[#C5A26F], .gold-accent {
                color: ${accent} !important;
            }
            .text-\\[\\#111111\\], .text-gray-800, .text-gray-900 {
                color: ${text} !important;
            }
            
            .border-\\[\\#C5A26F\\], .border-[#C5A26F], .ring-[#FF6B35]\\/30 {
                border-color: ${accent} !important;
            }
            .bg-\\[\\#111111\\], .bg-black, button:not([class*="bg-white"]):not([class*="bg-[#C5A26F]/10"]):not([onclick*="changeQty"]):not([id*="herban-chat"]) {
                background-color: ${primary} !important;
                color: #ffffff !important;
            }
            .bg-\\[\\#111111\\]:hover, .bg-black:hover, button:not([class*="bg-white"]):not([class*="bg-[#C5A26F]/10"]):not([onclick*="changeQty"]):not([id*="herban-chat"]):hover {
                background-color: ${accent} !important;
                color: #ffffff !important;
            }
            
            .bg-green-50, .bg-[#C5A26F]/10 {
                background-color: ${adjustColor(accent, 45)}40 !important;
                color: ${accent} !important;
            }
        `;
    }

    // Dynamic Image Loading
    function applyThemeImages() {
        const theme = currentConfig.theme;
        if (!theme || !theme.images) return;

        const imgHero = document.getElementById('hero-img');
        if (imgHero && theme.images.hero) {
            imgHero.src = theme.images.hero;
        }

        const quizSec = document.getElementById('quiz');
        if (quizSec && theme.images.quiz_bg) {
            quizSec.style.backgroundImage = `linear-gradient(rgba(17,17,17,0.75), rgba(17,17,17,0.85)), url('${theme.images.quiz_bg}')`;
            quizSec.style.backgroundSize = 'cover';
            quizSec.style.backgroundPosition = 'center';
            quizSec.style.backgroundRepeat = 'no-repeat';
        }

        const journalImg = document.getElementById('journal-feat-img');
        if (journalImg && theme.images.journal_feat) {
            journalImg.src = theme.images.journal_feat;
        }
    }

    // Dynamic copywriting and footer customizations
    function applyBrandSettings() {
        // 1. Hero Content Copy
        if (currentConfig.hero) {
            const hero = currentConfig.hero;
            const badge = document.getElementById('hero-badge');
            if (badge && hero.badge) badge.textContent = hero.badge;

            const title = document.getElementById('hero-title');
            if (title && hero.title) title.innerHTML = hero.title;

            const subtitle = document.getElementById('hero-subtitle');
            if (subtitle && hero.subtitle) subtitle.textContent = hero.subtitle;

            const desc = document.getElementById('hero-description');
            if (desc && hero.description) {
                const highlight = hero.highlightText ? `<span class="block mt-1 text-[#C5A26F] font-semibold">${hero.highlightText}</span>` : '';
                desc.innerHTML = hero.description + ' ' + highlight;
            }

            const btnPrimary = document.getElementById('hero-btn-primary');
            if (btnPrimary && hero.primaryBtnText) btnPrimary.textContent = hero.primaryBtnText;

            const btnSecondary = document.getElementById('hero-btn-secondary');
            if (btnSecondary && hero.secondaryBtnText) btnSecondary.textContent = hero.secondaryBtnText;
        }

        // 2. Footer Copy
        if (currentConfig.footer) {
            const footer = currentConfig.footer;
            
            document.querySelectorAll('footer p, footer div').forEach(el => {
                if (el.textContent.includes('Luxury body care for melanated skin.') && el.children.length === 0) {
                    el.textContent = footer.description;
                }
            });

            document.querySelectorAll('footer p, footer div').forEach(el => {
                if (el.textContent.includes('©') && el.textContent.includes('Herban Alchemy') && el.children.length === 0) {
                    el.textContent = footer.copyright;
                }
            });

            // Render dynamic socials in footer
            const socialContainer = document.querySelector('footer .flex.items-center.gap-x-3.text-lg') || 
                                      document.querySelector('footer .fa-instagram')?.parentElement?.parentElement;
            if (socialContainer && footer.socials) {
                socialContainer.innerHTML = '';
                const icons = {
                    instagram: 'fa-brands fa-instagram',
                    tiktok: 'fa-brands fa-tiktok',
                    facebook: 'fa-brands fa-facebook',
                    youtube: 'fa-brands fa-youtube',
                    amazon: 'fa-brands fa-amazon',
                    pinterest: 'fa-brands fa-pinterest',
                    twitter: 'fa-brands fa-x-twitter'
                };
                
                for (const [key, value] of Object.entries(footer.socials)) {
                    if (value && value.trim() !== '') {
                        const a = document.createElement('a');
                        a.href = value.trim();
                        a.target = '_blank';
                        a.className = 'hover:text-[#C5A26F] transition-colors';
                        const iconClass = icons[key] || 'fa-solid fa-link';
                        a.innerHTML = `<i class="${iconClass}"></i>`;
                        socialContainer.appendChild(a);
                    }
                }
            } else {
                // Fallback to legacy single link if socials object doesn't exist
                document.querySelectorAll('footer a, nav a').forEach(el => {
                    if (el.href && el.href.includes('instagram.com/herban_alchemynaturalskincare')) {
                        el.href = footer.instagramLink || 'https://www.instagram.com/herban_alchemynaturalskincare';
                    }
                });
            }
            
            // Update header Instagram nav link if configured
            const headerSocial = document.querySelector('nav .fa-instagram')?.parentElement || 
                                 document.querySelector('header .fa-instagram')?.parentElement;
            if (headerSocial) {
                if (footer.socials && footer.socials.instagram) {
                    headerSocial.href = footer.socials.instagram;
                    headerSocial.style.display = 'inline-block';
                } else if (footer.instagramLink) {
                    headerSocial.href = footer.instagramLink;
                    headerSocial.style.display = 'inline-block';
                } else {
                    // find first available social link
                    const firstVal = Object.values(footer.socials || {}).find(v => v && v.trim() !== '');
                    if (firstVal) {
                        headerSocial.href = firstVal;
                        // Find icon inside headerSocial and update classes
                        const iconEl = headerSocial.querySelector('i');
                        if (iconEl) {
                            const activeKey = Object.keys(footer.socials).find(k => footer.socials[k] === firstVal);
                            const icons = {
                                instagram: 'fa-brands fa-instagram',
                                tiktok: 'fa-brands fa-tiktok',
                                facebook: 'fa-brands fa-facebook',
                                youtube: 'fa-brands fa-youtube',
                                amazon: 'fa-brands fa-amazon',
                                pinterest: 'fa-brands fa-pinterest',
                                twitter: 'fa-brands fa-x-twitter'
                            };
                            iconEl.className = icons[activeKey] || 'fa-solid fa-link';
                        }
                        headerSocial.style.display = 'inline-block';
                    } else {
                        headerSocial.style.display = 'none';
                    }
                }
            }
            
            document.querySelectorAll('body p, body div, body a').forEach(el => {
                if (el.textContent.includes('glow@herbanalchemy.com') && el.children.length === 0) {
                    el.textContent = footer.contactEmail;
                }
                if (el.href && el.href.includes('mailto:glow@herbanalchemy.com')) {
                    el.href = `mailto:${footer.contactEmail}`;
                }
            });
        }
    }

    // Intercept checkout to route to Stripe Checkout dynamically
    function setupCheckoutOverride() {
        window.checkout = async function () {
            // Read latest cart from localStorage
            let cart = [];
            try {
                cart = JSON.parse(localStorage.getItem('herbanCart') || '[]');
            } catch (e) {
                console.error('Failed to parse cart:', e);
            }

            if (cart.length === 0) {
                alert('Your cart is empty. Add some luxury skincare products before checking out!');
                return;
            }

            // Save order to customer account if logged in
            const customerToken = localStorage.getItem('herbanCustomerToken');
            if (customerToken) {
                try {
                    const orderTotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
                    const orderItems = cart.map(item => ({
                        id: item.id || null,
                        name: item.name,
                        qty: item.qty,
                        price: item.price,
                        image: item.image || ''
                    }));

                    const backendOrigin = window.HERBAN_BACKEND_ORIGIN || '';
                    await fetch(`${backendOrigin}/api/customer/orders`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${customerToken}`
                        },
                        body: JSON.stringify({
                            items: orderItems,
                            total: orderTotal
                        })
                    });
                    console.log('[Herban Engine] Order successfully recorded to customer account.');
                } catch (e) {
                    console.error('[Herban Engine] Failed to record order to customer account:', e);
                }
            }

            const stripeEnabled = currentConfig.stripe && currentConfig.stripe.enabled;
            if (!stripeEnabled) {
                // Redirect directly to the 'Thank You' (success.html) page for the demo checkout
                window.location.href = 'success.html';
                return;
            }

            // Find checkout button to set loading state
            const btn = document.querySelector('#cart-drawer button[onclick="checkout()"]') || 
                        document.querySelector('button[onclick="checkout()"]');
            
            let originalText = 'CHECKOUT';
            if (btn) {
                originalText = btn.textContent.trim();
                btn.disabled = true;
                btn.style.opacity = '0.6';
                btn.innerHTML = `<i class="fa-solid fa-spinner animate-spin mr-2"></i> SECURELY REDIRECTING...`;
            }

            try {
                // Call create checkout session endpoint
                const backendOrigin = window.HERBAN_BACKEND_ORIGIN || '';
                const res = await fetch(`${backendOrigin}/api/create-checkout-session`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        items: cart,
                        email: localStorage.getItem('herbanCustomerEmail') || ''
                    })
                });

                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.url) {
                        // Redirect to Stripe Checkout
                        window.location.href = data.url;
                    } else {
                        throw new Error('Invalid checkout session url');
                    }
                } else {
                    const err = await res.json();
                    throw new Error(err.error || 'Checkout request failed');
                }
            } catch (err) {
                console.error('[Herban Checkout] Stripe Checkout Redirect Error:', err);
                alert(`Checkout failed: ${err.message || 'Server error'}. Please try again.`);
                
                // Restore button state
                if (btn) {
                    btn.disabled = false;
                    btn.style.opacity = '1';
                    btn.textContent = originalText;
                }
            }
        };
    }

    // Auto start on page load
    window.addEventListener('DOMContentLoaded', loadConfig);
})();
