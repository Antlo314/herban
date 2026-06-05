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
        }
    };

    // Load dynamic configuration from API
    async function loadConfig() {
        try {
            const res = await fetch('/api/config');
            if (res.ok) {
                const data = await res.json();
                currentConfig = data;
                window.currentConfig = data; // Expose globally for cart/product lookups
                console.log('[Herban Engine] Dynamic configuration loaded successfully.');
            }
        } catch (err) {
            console.warn('[Herban Engine] Failed to fetch server config. Running in offline/static fallback mode.', err);
        }

        // Initialize elements
        applyBanner();
        applyPlacements();
        applyDynamicPrices();
        routeAccountButton();
        if (currentConfig.chatbot.enabled) {
            injectChatbotWidget();
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

    // Route Account user icon to admin.html
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
                    window.location.href = 'admin.html';
                };
                console.log('[Herban Engine] Account user button bound to admin panel.');
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
            const res = await fetch('/api/chat', {
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

    // Auto start on page load
    window.addEventListener('DOMContentLoaded', loadConfig);
})();
