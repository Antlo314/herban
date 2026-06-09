const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const Stripe = require('stripe');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use((req, res, next) => {
    console.log(`[HTTP] ${req.method} ${req.url}`);
    next();
});
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Serve static frontend files
app.use(express.static(path.join(process.cwd(), './')));

const CONFIG_PATH = path.join(process.cwd(), 'data', 'config.json');
const SECRETS_PATH = path.join(process.cwd(), 'data', 'secrets.json');

// Helper to read JSON
function readJSON(filePath, defaultData = {}) {
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

// Helper to write JSON
function writeJSON(filePath, data) {
    try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (err) {
        console.error(`Error writing ${filePath}:`, err);
        return false;
    }
}

// Auth Middleware
function checkAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing token' });
    }
    const token = authHeader.split(' ')[1];
    const secrets = readJSON(SECRETS_PATH, { adminPassword: 'admin' });
    const adminPassword = process.env.ADMIN_PASSWORD || secrets.adminPassword || 'admin';
    if (token !== adminPassword) {
        return res.status(403).json({ error: 'Forbidden: Invalid password' });
    }
    next();
}

// PUBLIC CONFIG
app.get('/api/config', (req, res) => {
    const config = readJSON(CONFIG_PATH);
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
    const geminiApiKey = process.env.GEMINI_API_KEY || secrets.geminiApiKey;
    const openaiApiKey = process.env.OPENAI_API_KEY || secrets.openaiApiKey;
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY || secrets.stripeSecretKey;
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
        secrets.geminiApiKey = geminiApiKey;
    }
    if (openaiApiKey !== undefined && openaiApiKey !== '••••••••••••••••') {
        secrets.openaiApiKey = openaiApiKey;
    }
    if (stripeSecretKey !== undefined && stripeSecretKey !== '••••••••••••••••') {
        secrets.stripeSecretKey = stripeSecretKey;
    }
    if (adminPassword && adminPassword.trim() !== '') {
        secrets.adminPassword = adminPassword;
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
    const secrets = readJSON(SECRETS_PATH, { adminPassword: 'admin' });
    const adminPassword = process.env.ADMIN_PASSWORD || secrets.adminPassword || 'admin';
    if (password === adminPassword) {
        res.json({ success: true, token: adminPassword });
    } else {
        res.status(401).json({ error: 'Invalid password' });
    }
});

// AI PROXY CHAT
app.post('/api/chat', async (req, res) => {
    const { message, history } = req.body;
    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    const config = readJSON(CONFIG_PATH);
    const secrets = readJSON(SECRETS_PATH);
    const chatbot = config.chatbot || { enabled: true, model: 'gemini', systemPrompt: '' };
    const isThemeGen = req.body.isThemeGen || false;

    if (!chatbot.enabled && !isThemeGen) {
        return res.status(400).json({ error: 'Chatbot is currently disabled' });
    }

    const systemPrompt = req.body.systemPrompt || chatbot.systemPrompt || 'You are Aura, an AI assistant for Herban Alchemy.';
    const activeModel = chatbot.model || 'gemini';
    const geminiApiKey = process.env.GEMINI_API_KEY || secrets.geminiApiKey;
    const openaiApiKey = process.env.OPENAI_API_KEY || secrets.openaiApiKey;

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
    const geminiApiKey = process.env.GEMINI_API_KEY || secrets.geminiApiKey;
    const openaiApiKey = process.env.OPENAI_API_KEY || secrets.openaiApiKey;
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
    const { items } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Cart items are required' });
    }

    try {
        const config = readJSON(CONFIG_PATH);
        const secrets = readJSON(SECRETS_PATH);

        const stripeEnabled = config.stripe && config.stripe.enabled;
        const stripeSecretKey = process.env.STRIPE_SECRET_KEY || secrets.stripeSecretKey;

        if (!stripeEnabled || !stripeSecretKey) {
            return res.status(400).json({ error: 'Stripe payments are not configured or disabled' });
        }

        const stripe = new Stripe(stripeSecretKey);

        const currency = config.stripe.currency || 'usd';
        const shippingFlatRate = parseFloat(config.stripe.shippingFlatRate || 5.99);
        const freeShippingThreshold = parseFloat(config.stripe.freeShippingThreshold || 65);

        // Sum total amount for shipping calculations
        const totalAmount = items.reduce((sum, item) => sum + (item.price * item.qty), 0);

        // Format cart items to Stripe Line Items
        const line_items = items.map(item => {
            const line = {
                price_data: {
                    currency: currency,
                    product_data: {
                        name: item.scent ? `${item.name} (${item.scent})` : item.name,
                    },
                    unit_amount: Math.round(item.price * 100), // Stripe expects unit price in cents
                },
                quantity: item.qty
            };

            // Safely append absolute image URL if present
            if (item.image) {
                try {
                    // Try to resolve absolute image URL for Stripe display
                    const host = req.get('host');
                    const protocol = req.protocol;
                    const imageUrl = new URL(item.image, `${protocol}://${host}`).href;
                    line.price_data.product_data.images = [imageUrl];
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
            success_url: `${req.protocol}://${req.get('host')}/success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.protocol}://${req.get('host')}/index.html?cart_open=true`,
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
