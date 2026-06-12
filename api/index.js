const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const os = require('os');
const Stripe = require('stripe');
const crypto = require('crypto');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.enable('trust proxy');

app.use(cors());
app.use((req, res, next) => {
    console.log(`[HTTP] ${req.method} ${req.url}`);
    next();
});
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Serve static frontend files
app.use(express.static(path.join(process.cwd(), './')));

const CONFIG_PATH = path.join(__dirname, '..', 'data', 'config.json');
const SECRETS_PATH = path.join(__dirname, '..', 'data', 'secrets.json');
const LEADS_PATH = path.join(__dirname, '..', 'data', 'leads.json');
const CUSTOMERS_PATH = path.join(__dirname, '..', 'data', 'customers.json');

const TMP_CONFIG_PATH = path.join(os.tmpdir(), 'herban_config.json');
const TMP_SECRETS_PATH = path.join(os.tmpdir(), 'herban_secrets.json');
const TMP_LEADS_PATH = path.join(os.tmpdir(), 'herban_leads.json');
const TMP_CUSTOMERS_PATH = path.join(os.tmpdir(), 'herban_customers.json');

// Helper to read JSON with /tmp fallback support
function readJSON(filePath, defaultData = {}) {
    let tmpPath;
    if (filePath === CONFIG_PATH) tmpPath = TMP_CONFIG_PATH;
    if (filePath === SECRETS_PATH) tmpPath = TMP_SECRETS_PATH;
    if (filePath === LEADS_PATH) tmpPath = TMP_LEADS_PATH;
    if (filePath === CUSTOMERS_PATH) tmpPath = TMP_CUSTOMERS_PATH;

    if (tmpPath && fs.existsSync(tmpPath)) {
        try {
            const raw = fs.readFileSync(tmpPath, 'utf8');
            return JSON.parse(raw);
        } catch (err) {
            console.error(`Error reading temp file ${tmpPath}:`, err);
        }
    }

    try {
        if (!fs.existsSync(filePath)) {
            // Ensure dir exists
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
            return defaultData;
        }
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw);
    } catch (err) {
        console.error(`Error reading ${filePath}:`, err);
        return defaultData;
    }
}

// Helper to write JSON with /tmp fallback support
function writeJSON(filePath, data) {
    try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (err) {
        console.error(`Error writing ${filePath}, attempting temp fallback:`, err);
        try {
            let tmpPath;
            if (filePath === CONFIG_PATH) tmpPath = TMP_CONFIG_PATH;
            if (filePath === SECRETS_PATH) tmpPath = TMP_SECRETS_PATH;
            if (filePath === LEADS_PATH) tmpPath = TMP_LEADS_PATH;
            if (filePath === CUSTOMERS_PATH) tmpPath = TMP_CUSTOMERS_PATH;

            if (tmpPath) {
                fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
                fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
                console.log(`Successfully wrote to temp fallback ${tmpPath}`);
                return true;
            }
        } catch (tmpErr) {
            console.error(`Error writing to temp fallback:`, tmpErr);
        }
        return false;
    }
}

// Helper to merge config with environment variables dynamically
function getMergedConfig() {
    const config = readJSON(CONFIG_PATH);
    
    if (!config.stripe) {
        config.stripe = {
            enabled: false,
            publicKey: '',
            currency: 'usd',
            shippingFlatRate: 5.99,
            freeShippingThreshold: 65
        };
    }
    if (!config.chatbot) {
        config.chatbot = {
            enabled: true,
            name: "Aura",
            greeting: "Hi there! I'm Aura, your Herban Alchemy skincare guide.",
            systemPrompt: "",
            model: "gemini"
        };
    }

    // Merge Stripe overrides
    const secrets = readJSON(SECRETS_PATH);
    const rawSecretKey = secrets.stripeSecretKey || process.env.STRIPE_SECRET_KEY;
    const stripeSecretKey = typeof rawSecretKey === 'string' ? rawSecretKey.trim() : '';

    if (process.env.STRIPE_ENABLED !== undefined) {
        config.stripe.enabled = process.env.STRIPE_ENABLED === 'true';
    } else if (stripeSecretKey || config.stripe.publicKey || process.env.STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLIC_KEY) {
        config.stripe.enabled = true;
    }
    
    if (!config.stripe.publicKey) {
        if (process.env.STRIPE_PUBLISHABLE_KEY) {
            config.stripe.publicKey = process.env.STRIPE_PUBLISHABLE_KEY.trim();
        } else if (process.env.STRIPE_PUBLIC_KEY) {
            config.stripe.publicKey = process.env.STRIPE_PUBLIC_KEY.trim();
        }
    }
    
    if (process.env.STRIPE_CURRENCY) {
        config.stripe.currency = process.env.STRIPE_CURRENCY;
    }
    if (process.env.STRIPE_SHIPPING_FLAT_RATE) {
        config.stripe.shippingFlatRate = parseFloat(process.env.STRIPE_SHIPPING_FLAT_RATE);
    }
    if (process.env.STRIPE_FREE_SHIPPING_THRESHOLD) {
        config.stripe.freeShippingThreshold = parseFloat(process.env.STRIPE_FREE_SHIPPING_THRESHOLD);
    }

    // Merge Chatbot overrides
    if (process.env.CHATBOT_ENABLED !== undefined) {
        config.chatbot.enabled = process.env.CHATBOT_ENABLED === 'true';
    }
    if (process.env.CHATBOT_NAME) {
        config.chatbot.name = process.env.CHATBOT_NAME;
    }
    if (process.env.CHATBOT_GREETING) {
        config.chatbot.greeting = process.env.CHATBOT_GREETING;
    }
    if (process.env.CHATBOT_MODEL) {
        config.chatbot.model = process.env.CHATBOT_MODEL;
    }
    if (process.env.CHATBOT_SYSTEM_PROMPT) {
        config.chatbot.systemPrompt = process.env.CHATBOT_SYSTEM_PROMPT;
    }

    return config;
}

// Auth Middleware
function checkAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing token' });
    }
    const token = authHeader.split(' ')[1];
    const secrets = readJSON(SECRETS_PATH, { adminPassword: 'kiara26!' });
    const adminPassword = process.env.ADMIN_PASSWORD || secrets.adminPassword || 'kiara26!';
    if (token !== adminPassword) {
        return res.status(403).json({ error: 'Forbidden: Invalid password' });
    }
    next();
}

// PUBLIC CONFIG
app.get('/api/config', (req, res) => {
    const config = getMergedConfig();
    res.json(config);
});

app.post('/api/config', checkAuth, (req, res) => {
    const updated = req.body;
    if (!updated || typeof updated !== 'object') {
        return res.status(400).json({ error: 'Invalid config structure' });
    }
    const success = writeJSON(CONFIG_PATH, updated);
    if (success) {
        res.json({ success: true, message: 'Configuration saved successfully' });
    } else {
        res.status(500).json({ error: 'Failed to write config file' });
    }
});

// SECRETS
app.get('/api/secrets', checkAuth, (req, res) => {
    const secrets = readJSON(SECRETS_PATH);
    const geminiApiKey = secrets.geminiApiKey || process.env.GEMINI_API_KEY;
    const openaiApiKey = secrets.openaiApiKey || process.env.OPENAI_API_KEY;
    const stripeSecretKey = secrets.stripeSecretKey || process.env.STRIPE_SECRET_KEY;
    // Exclude actual password for safety, return mask details
    res.json({
        geminiApiKey: geminiApiKey ? '••••••••••••••••' : '',
        openaiApiKey: openaiApiKey ? '••••••••••••••••' : '',
        stripeSecretKey: stripeSecretKey ? '••••••••••••••••' : '',
        hasGemini: !!geminiApiKey,
        hasOpenai: !!openaiApiKey,
        hasStripe: !!stripeSecretKey
    });
});

app.post('/api/secrets', checkAuth, (req, res) => {
    const { geminiApiKey, openaiApiKey, stripeSecretKey, adminPassword } = req.body;
    const secrets = readJSON(SECRETS_PATH);

    if (geminiApiKey !== undefined && geminiApiKey !== '••••••••••••••••') {
        secrets.geminiApiKey = typeof geminiApiKey === 'string' ? geminiApiKey.trim() : geminiApiKey;
    }
    if (openaiApiKey !== undefined && openaiApiKey !== '••••••••••••••••') {
        secrets.openaiApiKey = typeof openaiApiKey === 'string' ? openaiApiKey.trim() : openaiApiKey;
    }
    if (stripeSecretKey !== undefined && stripeSecretKey !== '••••••••••••••••') {
        secrets.stripeSecretKey = typeof stripeSecretKey === 'string' ? stripeSecretKey.trim() : stripeSecretKey;
    }
    if (adminPassword && adminPassword.trim() !== '') {
        secrets.adminPassword = typeof adminPassword === 'string' ? adminPassword.trim() : adminPassword;
    }

    const success = writeJSON(SECRETS_PATH, secrets);
    if (success) {
        res.json({ success: true, message: 'Secrets updated successfully' });
    } else {
        res.status(500).json({ error: 'Failed to save secrets' });
    }
});

// LOGIN
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    const secrets = readJSON(SECRETS_PATH, { adminPassword: 'kiara26!' });
    const adminPassword = process.env.ADMIN_PASSWORD || secrets.adminPassword || 'kiara26!';
    if (password === adminPassword) {
        res.json({ success: true, token: adminPassword });
    } else {
        res.status(401).json({ error: 'Invalid password' });
    }
});

// ==========================================
// CUSTOMER AUTHENTICATION & MANAGEMENT
// ==========================================

// CUSTOMER AUTH HELPERS
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

function checkCustomerAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing token' });
    }
    const token = authHeader.split(' ')[1];
    const customersData = readJSON(CUSTOMERS_PATH, { customers: [] });
    const customer = customersData.customers.find(c => c.sessionToken === token);
    if (!customer) {
        return res.status(403).json({ error: 'Forbidden: Invalid token' });
    }
    req.customer = customer;
    req.customersData = customersData;
    next();
}

// CUSTOMER REGISTER
app.post('/api/customer/register', (req, res) => {
    const { name, email, password, phone, address } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    const customersData = readJSON(CUSTOMERS_PATH, { customers: [] });
    const cleanEmail = email.trim().toLowerCase();
    if (customersData.customers.some(c => c.email === cleanEmail)) {
        return res.status(400).json({ error: 'An account with this email already exists' });
    }

    const customerId = 'cust_' + Math.random().toString(36).substr(2, 9);
    const token = crypto.randomBytes(16).toString('hex');

    // Seed with 2 realistic mock past orders
    const mockOrders = [
        {
            orderId: 'HA-' + Math.floor(100000 + Math.random() * 900000),
            date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            total: 76.00,
            status: 'Delivered',
            items: [
                { id: 1, name: 'Sweet Auburn Butter Glaze', qty: 2, price: 38.00, image: 'assets/atlanta-collection/sweet-auburn-le-card.jpg' }
            ]
        },
        {
            orderId: 'HA-' + Math.floor(100000 + Math.random() * 900000),
            date: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
            total: 34.00,
            status: 'Delivered',
            items: [
                { id: 4, name: 'Raw White Shea Butter', qty: 1, price: 34.00, image: 'assets/raw-white-shea-le-card.jpg' }
            ]
        }
    ];

    const newCustomer = {
        id: customerId,
        name: name.trim(),
        email: cleanEmail,
        passwordHash: hashPassword(password),
        phone: phone ? phone.trim() : '',
        address: address || { street: '', city: '', state: '', zip: '' },
        orders: mockOrders,
        sessionToken: token,
        createdAt: new Date().toISOString()
    };

    customersData.customers.push(newCustomer);
    const success = writeJSON(CUSTOMERS_PATH, customersData);
    if (!success) {
        return res.status(500).json({ error: 'Failed to register customer' });
    }

    const { passwordHash, ...safeCustomer } = newCustomer;
    res.json({ success: true, token, customer: safeCustomer });
});

// CUSTOMER LOGIN
app.post('/api/customer/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }
    const customersData = readJSON(CUSTOMERS_PATH, { customers: [] });
    const cleanEmail = email.trim().toLowerCase();
    const customer = customersData.customers.find(c => c.email === cleanEmail);
    if (!customer) {
        return res.status(401).json({ error: 'Invalid email or password' });
    }

    const passwordHash = hashPassword(password);
    if (customer.passwordHash !== passwordHash) {
        return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = crypto.randomBytes(16).toString('hex');
    customer.sessionToken = token;
    
    const success = writeJSON(CUSTOMERS_PATH, customersData);
    if (!success) {
        return res.status(500).json({ error: 'Failed to create session' });
    }

    const { passwordHash: _, ...safeCustomer } = customer;
    res.json({ success: true, token, customer: safeCustomer });
});

// CUSTOMER GET PROFILE
app.get('/api/customer/profile', checkCustomerAuth, (req, res) => {
    const { passwordHash, ...safeCustomer } = req.customer;
    res.json({ success: true, customer: safeCustomer });
});

// CUSTOMER UPDATE PROFILE
app.post('/api/customer/update', checkCustomerAuth, (req, res) => {
    const { name, email, phone, address } = req.body;
    const customer = req.customer;
    
    if (name) customer.name = name.trim();
    if (email) {
        const cleanEmail = email.trim().toLowerCase();
        if (cleanEmail !== customer.email) {
            // Check if email already exists
            const exists = req.customersData.customers.some(c => c.email === cleanEmail);
            if (exists) {
                return res.status(400).json({ error: 'An account with this email already exists' });
            }
            customer.email = cleanEmail;
        }
    }
    if (phone !== undefined) customer.phone = phone.trim();
    if (address) {
        customer.address = {
            street: address.street ? address.street.trim() : '',
            city: address.city ? address.city.trim() : '',
            state: address.state ? address.state.trim() : '',
            zip: address.zip ? address.zip.trim() : ''
        };
    }

    const success = writeJSON(CUSTOMERS_PATH, req.customersData);
    if (!success) {
        return res.status(500).json({ error: 'Failed to update profile' });
    }

    const { passwordHash: _, ...safeCustomer } = customer;
    res.json({ success: true, customer: safeCustomer });
});

// CUSTOMER CREATE ORDER
app.post('/api/customer/orders', checkCustomerAuth, (req, res) => {
    const { items, total } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Order items are required' });
    }

    const customer = req.customer;
    const newOrder = {
        orderId: 'HA-' + Math.floor(100000 + Math.random() * 900000),
        date: new Date().toISOString(),
        total: parseFloat(total) || items.reduce((sum, item) => sum + (item.price * item.qty), 0),
        status: 'Processing',
        items: items.map(item => ({
            id: item.id || null,
            name: item.name,
            qty: item.qty,
            price: item.price,
            image: item.image || 'assets/carrier_oil_base.png'
        }))
    };

    if (!customer.orders) customer.orders = [];
    customer.orders.unshift(newOrder);

    const success = writeJSON(CUSTOMERS_PATH, req.customersData);
    if (!success) {
        return res.status(500).json({ error: 'Failed to save order' });
    }

    res.json({ success: true, order: newOrder });
});

// GET LEADS (Protected)
app.get('/api/leads', checkAuth, (req, res) => {
    const leadsData = readJSON(LEADS_PATH, { leads: [] });
    res.json(leadsData);
});

// POST LEAD (Public)
app.post('/api/leads', (req, res) => {
    const { email, variantId, variantTitle } = req.body;
    if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'A valid email is required' });
    }

    const leadsData = readJSON(LEADS_PATH, { leads: [] });
    
    // Check if email already exists
    const exists = leadsData.leads.some(l => l.email === email.trim().toLowerCase());
    if (!exists) {
        leadsData.leads.push({
            id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5),
            email: email.trim().toLowerCase(),
            variantId: variantId || 'default',
            variantTitle: variantTitle || 'The Atlanta Collection',
            timestamp: new Date().toISOString(),
            status: 'Subscribed'
        });
        const success = writeJSON(LEADS_PATH, leadsData);
        if (!success) {
            return res.status(500).json({ error: 'Failed to save lead' });
        }
    }
    
    res.json({ success: true });
});

// DELETE LEAD (Protected)
app.delete('/api/leads', checkAuth, (req, res) => {
    const { id, clearAll } = req.query;
    
    if (clearAll === 'true') {
        const success = writeJSON(LEADS_PATH, { leads: [] });
        if (success) {
            return res.json({ success: true, message: 'All leads cleared' });
        } else {
            return res.status(500).json({ error: 'Failed to clear leads' });
        }
    }

    if (!id) {
        return res.status(400).json({ error: 'Lead ID is required' });
    }

    const leadsData = readJSON(LEADS_PATH, { leads: [] });
    const originalLength = leadsData.leads.length;
    leadsData.leads = leadsData.leads.filter(l => l.id !== id);
    
    if (leadsData.leads.length === originalLength) {
        return res.status(404).json({ error: 'Lead not found' });
    }

    const success = writeJSON(LEADS_PATH, leadsData);
    if (success) {
        res.json({ success: true, message: 'Lead deleted successfully' });
    } else {
        res.status(500).json({ error: 'Failed to delete lead' });
    }
});

// AI PROXY CHAT
app.post('/api/chat', async (req, res) => {
    const { message, history } = req.body;
    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    const config = getMergedConfig();
    const secrets = readJSON(SECRETS_PATH);
    const chatbot = config.chatbot || { enabled: true, model: 'gemini', systemPrompt: '' };
    const isThemeGen = req.body.isThemeGen || false;

    if (!chatbot.enabled && !isThemeGen) {
        return res.status(400).json({ error: 'Chatbot is currently disabled' });
    }

    const systemPrompt = req.body.systemPrompt || chatbot.systemPrompt || 'You are Aura, an AI assistant for Herban Alchemy.';
    const activeModel = chatbot.model || 'gemini';
    const geminiApiKey = secrets.geminiApiKey || process.env.GEMINI_API_KEY;
    const openaiApiKey = secrets.openaiApiKey || process.env.OPENAI_API_KEY;

    try {
        if (activeModel === 'gemini') {
            if (!geminiApiKey) {
                return res.status(400).json({ error: 'Gemini API key is not configured' });
            }

            // Construct Gemini content with system instruction and history
            const contents = [];
            
            // Add conversation history
            if (history && Array.isArray(history)) {
                history.forEach(turn => {
                    contents.push({
                        role: turn.role === 'assistant' ? 'model' : 'user',
                        parts: [{ text: turn.content }]
                    });
                });
            }
            
            // Add current message
            contents.push({
                role: 'user',
                parts: [{ text: message }]
            });

            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: contents,
                    systemInstruction: {
                        parts: [{ text: systemPrompt }]
                    },
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 2048
                    }
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Gemini API Error: ${response.status} ${errText}`);
            }

            const data = await response.json();
            const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'I am sorry, I was unable to formulate a response.';
            res.json({ reply });

        } else if (activeModel === 'openai') {
            if (!openaiApiKey) {
                return res.status(400).json({ error: 'OpenAI API key is not configured' });
            }

            const messages = [
                { role: 'system', content: systemPrompt }
            ];

            // Add history
            if (history && Array.isArray(history)) {
                history.forEach(turn => {
                    messages.push({ role: turn.role, content: turn.content });
                });
            }

            // Add current user message
            messages.push({ role: 'user', content: message });

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openaiApiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: messages,
                    temperature: 0.7,
                    max_tokens: 2048
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`OpenAI API Error: ${response.status} ${errText}`);
            }

            const data = await response.json();
            const reply = data.choices?.[0]?.message?.content || 'I am sorry, I was unable to formulate a response.';
            res.json({ reply });
        } else {
            res.status(400).json({ error: 'Unsupported active AI model' });
        }
    } catch (error) {
        console.error('AI Proxy Error:', error);
        res.status(500).json({ error: error.message || 'Error communicating with AI service' });
    }
});

// IMAGE GENERATION PROXY (Protected)
app.post('/api/generate-image', checkAuth, async (req, res) => {
    const { prompt, target, engine } = req.body;
    if (!prompt || !target || !engine) {
        return res.status(400).json({ error: 'Prompt, target, and engine are required' });
    }

    const isValidTarget = typeof target === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(target);
    if (!isValidTarget) {
        return res.status(400).json({ error: 'Invalid target identifier. Must be alphanumeric with underscores/hyphens only.' });
    }

    const secrets = readJSON(SECRETS_PATH);
    const geminiApiKey = secrets.geminiApiKey || process.env.GEMINI_API_KEY;
    const openaiApiKey = secrets.openaiApiKey || process.env.OPENAI_API_KEY;
    const targetFilename = `generated_${target}.jpg`;
    const targetPath = path.join(process.cwd(), 'assets', targetFilename);

    try {
        let base64Data = '';

        if (engine === 'gemini') {
            if (!geminiApiKey) {
                return res.status(400).json({ error: 'Gemini API key is not configured' });
            }

            const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict?key=${geminiApiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instances: [
                        { prompt: prompt }
                    ],
                    parameters: {
                        sampleCount: 1,
                        outputMimeType: 'image/jpeg',
                        aspectRatio: '1:1'
                    }
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Gemini Imagen Error: ${response.status} ${errText}`);
            }

            const data = await response.json();
            base64Data = data.predictions?.[0]?.bytesBase64Encoded;
            if (!base64Data) {
                throw new Error('No image data returned from Gemini Imagen');
            }

        } else if (engine === 'openai') {
            if (!openaiApiKey) {
                return res.status(400).json({ error: 'OpenAI API key is not configured' });
            }

            const response = await fetch('https://api.openai.com/v1/images/generations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openaiApiKey}`
                },
                body: JSON.stringify({
                    model: 'dall-e-3',
                    prompt: prompt,
                    n: 1,
                    size: '1024x1024',
                    response_format: 'b64_json'
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`OpenAI DALL-E Error: ${response.status} ${errText}`);
            }

            const data = await response.json();
            base64Data = data.data?.[0]?.b64_json;
            if (!base64Data) {
                throw new Error('No image data returned from OpenAI DALL-E');
            }
        } else {
            return res.status(400).json({ error: 'Unsupported active image generation engine' });
        }

        // Save base64 string to file
        const imageBuffer = Buffer.from(base64Data, 'base64');
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, imageBuffer);

        res.json({
            success: true,
            imageUrl: `assets/${targetFilename}?t=${Date.now()}`
        });

    } catch (error) {
        console.error('Image Generation Error:', error);
        res.status(500).json({ error: error.message || 'Error generating image' });
    }
});

// SECURE FILE UPLOAD ENDPOINT
app.post('/api/upload', checkAuth, (req, res) => {
    const { filename, base64Data } = req.body;
    if (!filename || !base64Data) {
        return res.status(400).json({ error: 'Filename and base64Data are required' });
    }

    try {
        // Sanitize filename to prevent directory traversal
        const cleanName = path.basename(filename).replace(/[^a-zA-Z0-9.-]/g, '_');
        const ext = path.extname(cleanName);
        const nameWithoutExt = path.basename(cleanName, ext);
        const finalFilename = `upload_${nameWithoutExt}_${Date.now()}${ext}`;
        
        const targetPath = path.join(process.cwd(), 'assets', finalFilename);
        
        // Extract base64 image data
        const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            return res.status(400).json({ error: 'Invalid base64 data format' });
        }
        
        const buffer = Buffer.from(matches[2], 'base64');
        
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, buffer);
        
        res.json({
            success: true,
            url: `assets/${finalFilename}`
        });
    } catch (err) {
        console.error('File Upload Error:', err);
        res.status(500).json({ error: err.message || 'Failed to save uploaded file' });
    }
});

// CREATE STRIPE CHECKOUT SESSION ENDPOINT (Public)
app.post('/api/create-checkout-session', async (req, res) => {
    const { items, email } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Cart items are required' });
    }

    try {
        const config = getMergedConfig();
        const secrets = readJSON(SECRETS_PATH);

        const stripeEnabled = config.stripe && config.stripe.enabled;
        const rawSecretKey = secrets.stripeSecretKey || process.env.STRIPE_SECRET_KEY;
        const stripeSecretKey = typeof rawSecretKey === 'string' ? rawSecretKey.trim() : '';

        if (!stripeEnabled || !stripeSecretKey) {
            return res.status(400).json({ error: 'Stripe payments are not configured or disabled' });
        }

        // Initialize Stripe client with the Fetch HTTP client for compatibility with serverless environments (like Vercel)
        // and add timeout/retry controls for network resilience.
        const stripe = new Stripe(stripeSecretKey, {
            httpClient: Stripe.createFetchHttpClient(),
            maxNetworkRetries: 3,
            timeout: 10000
        });

        const currency = config.stripe.currency || 'usd';
        const shippingFlatRate = parseFloat(config.stripe.shippingFlatRate || 5.99);
        const freeShippingThreshold = parseFloat(config.stripe.freeShippingThreshold || 65);

        // Sum total amount for shipping calculations
        const totalAmount = items.reduce((sum, item) => {
            const price = parseFloat(item.price) || 0;
            const qty = parseInt(item.qty, 10) || 1;
            return sum + (price * qty);
        }, 0);

        // Resolve absolute URL helper
        const getAbsoluteUrl = (pathStr) => {
            const host = req.get('host');
            const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
            return `${protocol}://${host}${pathStr}`;
        };

        // Format cart items to Stripe Line Items
        const line_items = items.map(item => {
            const price = parseFloat(item.price) || 0;
            const qty = parseInt(item.qty, 10) || 1;
            const line = {
                price_data: {
                    currency: currency,
                    product_data: {
                        name: item.scent ? `${item.name} (${item.scent})` : item.name,
                    },
                    unit_amount: Math.round(price * 100), // Stripe expects unit price in cents
                },
                quantity: qty
            };

            // Safely append absolute image URL if present and is a public URL
            if (item.image) {
                try {
                    const imgUrl = getAbsoluteUrl('/' + item.image.replace(/^\/+/, ''));
                    // Stripe requires publicly accessible image URLs and throws an error for localhost/loopbacks
                    if (!imgUrl.includes('localhost') && !imgUrl.includes('127.0.0.1') && !imgUrl.includes('[::1]')) {
                        line.price_data.product_data.images = [imgUrl];
                    }
                } catch (e) {
                    // Ignore image URL formatting errors
                }
            }

            return line;
        });

        // Set up shipping options dynamically in Stripe Checkout
        const shipping_options = [];
        if (shippingFlatRate > 0) {
            const isFree = totalAmount >= freeShippingThreshold;
            shipping_options.push({
                shipping_rate_data: {
                    type: 'fixed_amount',
                    fixed_amount: {
                        amount: isFree ? 0 : Math.round(shippingFlatRate * 100),
                        currency: currency
                    },
                    display_name: isFree ? 'Free Shipping (Over $' + freeShippingThreshold + ')' : 'Standard Shipping',
                    delivery_estimate: {
                        minimum: { unit: 'business_day', value: 3 },
                        maximum: { unit: 'business_day', value: 5 }
                    }
                }
            });
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items,
            mode: 'payment',
            customer_email: email || undefined,
            success_url: getAbsoluteUrl('/success.html?session_id={CHECKOUT_SESSION_ID}'),
            cancel_url: getAbsoluteUrl('/index.html?cart_open=true'),
            shipping_address_collection: {
                allowed_countries: ['US', 'CA', 'GB']
            },
            shipping_options: shipping_options.length > 0 ? shipping_options : undefined
        });

        res.json({
            success: true,
            url: session.url
        });

    } catch (err) {
        console.error('Stripe Checkout Error:', err);
        res.status(500).json({ error: err.message || 'Error generating payment checkout session' });
    }
});

// Fallback for everything else (SPA redirect to index.html)
app.use((req, res) => {
    res.sendFile(path.join(process.cwd(), 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Herban Alchemy backend server listening on port ${PORT}`);
});

module.exports = app;
