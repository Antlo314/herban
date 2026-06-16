const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const os = require('os');
const Stripe = require('stripe');
const crypto = require('crypto');
const dns = require('dns');
const https = require('https');

dotenv.config();

// Prefer IPv4 when resolving outbound hosts. Vercel's serverless egress can
// fail fast on IPv6 (ENETUNREACH/ECONNREFUSED), which surfaced as Stripe
// "StripeConnectionError / Could not reach Stripe" at checkout even though the
// secret key was valid and the same code connects fine locally. Forcing
// IPv4-first makes the Stripe (and Blob) HTTPS calls take the routable path.
try {
    dns.setDefaultResultOrder('ipv4first');
} catch (e) {
    // Older Node without this API — safe to ignore.
}

const app = express();
const PORT = process.env.PORT || 3000;

app.enable('trust proxy');

app.use(cors());
app.use((req, res, next) => {
    console.log(`[HTTP] ${req.method} ${req.url}`);
    next();
});
app.use(express.json({
    limit: '10mb',
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Serve static frontend files
app.use(express.static(path.join(process.cwd(), './')));

const CONFIG_PATH = path.join(__dirname, '..', 'data', 'config.json');
const SECRETS_PATH = path.join(__dirname, '..', 'data', 'secrets.json');
const LEADS_PATH = path.join(__dirname, '..', 'data', 'leads.json');
const CUSTOMERS_PATH = path.join(__dirname, '..', 'data', 'customers.json');
const PENDING_ORDERS_PATH = path.join(__dirname, '..', 'data', 'pending_orders.json');

const TMP_CONFIG_PATH = path.join(os.tmpdir(), 'herban_config.json');
const TMP_SECRETS_PATH = path.join(os.tmpdir(), 'herban_secrets.json');
const TMP_LEADS_PATH = path.join(os.tmpdir(), 'herban_leads.json');
const TMP_CUSTOMERS_PATH = path.join(os.tmpdir(), 'herban_customers.json');
const TMP_PENDING_ORDERS_PATH = path.join(os.tmpdir(), 'herban_pending_orders.json');

// ==========================================
// PERSISTENT STORAGE (Vercel Blob)
// ------------------------------------------
// Vercel's deployment filesystem is read-only and /tmp is per-instance,
// so anything saved via the admin panel (Stripe/LLM keys, config, leads,
// customers) used to evaporate between serverless invocations. When a
// Vercel Blob store is connected (BLOB_READ_WRITE_TOKEN present), all
// four JSON stores read/write through Blob instead. Local dev keeps the
// original filesystem behavior.
// ==========================================
const { put: blobPut, del: blobDel, list: blobList } = require('@vercel/blob');
const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;

const STORE_NAMES = {
    [CONFIG_PATH]: 'config',
    [SECRETS_PATH]: 'secrets',
    [LEADS_PATH]: 'leads',
    [CUSTOMERS_PATH]: 'customers',
    [PENDING_ORDERS_PATH]: 'pending_orders'
};

// Blob URLs are publicly accessible, so the secrets store is encrypted
// at rest with a key derived from the blob token (never leaves Vercel).
function getEncryptionKey() {
    return crypto.createHash('sha256').update(process.env.BLOB_READ_WRITE_TOKEN).digest();
}

function encryptPayload(text) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return JSON.stringify({
        __enc: true,
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        data: encrypted.toString('base64')
    });
}

function decryptPayload(text) {
    const parsed = JSON.parse(text);
    if (!parsed || parsed.__enc !== true) return parsed;
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(parsed.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(parsed.data, 'base64')), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
}

// Each write creates a new random-suffixed blob (avoids CDN cache staleness
// on overwrites); reads pick the newest and writes clean up older versions.
async function blobReadStore(name) {
    const { blobs } = await blobList({ prefix: `herban/${name}` });
    if (!blobs || blobs.length === 0) return null;
    const latest = blobs.reduce((a, b) => new Date(a.uploadedAt) > new Date(b.uploadedAt) ? a : b);
    const res = await fetch(latest.url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Blob fetch failed: ${res.status}`);
    const text = await res.text();
    if (name === 'secrets') return decryptPayload(text);
    return JSON.parse(text);
}

async function blobWriteStore(name, data) {
    let body = JSON.stringify(data, null, 2);
    if (name === 'secrets') body = encryptPayload(body);
    const written = await blobPut(`herban/${name}.json`, body, {
        access: 'public',
        addRandomSuffix: true,
        contentType: 'application/json'
    });
    // Best-effort cleanup of superseded versions
    try {
        const { blobs } = await blobList({ prefix: `herban/${name}` });
        const stale = blobs.filter(b => b.url !== written.url);
        if (stale.length > 0) await blobDel(stale.map(b => b.url));
    } catch (err) {
        console.error(`Blob cleanup error for ${name}:`, err);
    }
}

// Helper to read JSON — Vercel Blob first, then local file / tmp fallback
async function readJSON(filePath, defaultData = {}) {
    const storeName = STORE_NAMES[filePath];

    if (useBlob && storeName) {
        try {
            const data = await blobReadStore(storeName);
            if (data !== null) return data;
            // No blob yet — fall through to the bundled repo file as seed data
        } catch (err) {
            console.error(`Blob read error for ${storeName}:`, err);
        }
    }

    let tmpPath;
    if (filePath === CONFIG_PATH) tmpPath = TMP_CONFIG_PATH;
    if (filePath === SECRETS_PATH) tmpPath = TMP_SECRETS_PATH;
    if (filePath === LEADS_PATH) tmpPath = TMP_LEADS_PATH;
    if (filePath === CUSTOMERS_PATH) tmpPath = TMP_CUSTOMERS_PATH;
    if (filePath === PENDING_ORDERS_PATH) tmpPath = TMP_PENDING_ORDERS_PATH;

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

// Helper to write JSON — Vercel Blob first, then local file / tmp fallback
async function writeJSON(filePath, data) {
    const storeName = STORE_NAMES[filePath];

    if (useBlob && storeName) {
        try {
            await blobWriteStore(storeName, data);
            return true;
        } catch (err) {
            console.error(`Blob write error for ${storeName}:`, err);
            // fall through to filesystem attempts
        }
    }

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
            if (filePath === PENDING_ORDERS_PATH) tmpPath = TMP_PENDING_ORDERS_PATH;

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

// Force IPv4 for outbound HTTPS — Vercel serverless egress can fail on IPv6.
const stripeHttpAgent = new https.Agent({
    keepAlive: true,
    lookup: (hostname, options, callback) => {
        dns.lookup(hostname, { family: 4, all: false }, (err, address, family) => {
            if (err) return callback(err, null, null);
            callback(null, address, family || 4);
        });
    }
});

function sanitizeStripeKey(key) {
    if (typeof key !== 'string') return '';
    // Strip whitespace/newlines and any non-ASCII characters that break HTTP headers
    // when keys are copy-pasted into Vercel (a common cause of checkout failures).
    return key.replace(/\s+/g, '').replace(/[^a-zA-Z0-9_]/g, '');
}

function createStripeClient(secretKey) {
    return new Stripe(secretKey, {
        httpAgent: stripeHttpAgent,
        maxNetworkRetries: 3,
        timeout: 30000
    });
}

function flattenStripeParams(value, prefix = '', parts = []) {
    if (value === undefined || value === null) return parts;

    if (Array.isArray(value)) {
        const primitiveArray = value.every(v => v === null || typeof v !== 'object');
        if (primitiveArray) {
            value.forEach((item) => {
                if (item === undefined || item === null) return;
                parts.push([`${prefix}[]`, String(item)]);
            });
            return parts;
        }
        value.forEach((item, index) => {
            flattenStripeParams(item, `${prefix}[${index}]`, parts);
        });
        return parts;
    }

    if (typeof value === 'object') {
        Object.entries(value).forEach(([key, nested]) => {
            const nextPrefix = prefix ? `${prefix}[${key}]` : key;
            flattenStripeParams(nested, nextPrefix, parts);
        });
        return parts;
    }

    parts.push([prefix, String(value)]);
    return parts;
}

function encodeStripeFormBody(payload) {
    return flattenStripeParams(payload)
        .map(([key, val]) => `${encodeURIComponent(key)}=${encodeURIComponent(val)}`)
        .join('&');
}

function stripeHttpsRequest(secretKey, path, payload) {
    const body = encodeStripeFormBody(payload);
    return new Promise((resolve, reject) => {
        const request = https.request({
            hostname: 'api.stripe.com',
            port: 443,
            path: `/v1${path}`,
            method: 'POST',
            agent: stripeHttpAgent,
            headers: {
                Authorization: `Bearer ${secretKey}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(body)
            },
            timeout: 30000
        }, (response) => {
            let raw = '';
            response.on('data', (chunk) => { raw += chunk; });
            response.on('end', () => {
                let parsed;
                try {
                    parsed = JSON.parse(raw);
                } catch (err) {
                    return reject(new Error(`Stripe returned invalid JSON (${response.statusCode})`));
                }
                if (response.statusCode >= 400) {
                    const err = new Error(parsed.error?.message || 'Stripe API error');
                    err.type = parsed.error?.type || 'StripeAPIError';
                    err.code = parsed.error?.code;
                    return reject(err);
                }
                resolve(parsed);
            });
        });

        request.on('timeout', () => {
            request.destroy();
            reject(new Error('Stripe HTTPS request timed out'));
        });
        request.on('error', reject);
        request.write(body);
        request.end();
    });
}

async function createCheckoutSession(secretKey, payload) {
    // On Vercel, the Stripe SDK can throw StripeConnectionError even with a valid
    // secret key. Direct IPv4-forced HTTPS to api.stripe.com is more reliable.
    if (process.env.VERCEL) {
        return stripeHttpsRequest(secretKey, '/checkout/sessions', payload);
    }

    const stripe = createStripeClient(secretKey);
    return stripe.checkout.sessions.create(payload);
}

function stripeHttpsGet(secretKey, path) {
    return new Promise((resolve, reject) => {
        const request = https.request({
            hostname: 'api.stripe.com',
            port: 443,
            path: `/v1${path}`,
            method: 'GET',
            agent: stripeHttpAgent,
            headers: {
                Authorization: `Bearer ${secretKey}`
            },
            timeout: 30000
        }, (response) => {
            let raw = '';
            response.on('data', (chunk) => { raw += chunk; });
            response.on('end', () => {
                let parsed;
                try {
                    parsed = JSON.parse(raw);
                } catch (err) {
                    return reject(new Error(`Stripe returned invalid JSON (${response.statusCode})`));
                }
                if (response.statusCode >= 400) {
                    const err = new Error(parsed.error?.message || 'Stripe API error');
                    err.type = parsed.error?.type || 'StripeAPIError';
                    err.code = parsed.error?.code;
                    return reject(err);
                }
                resolve(parsed);
            });
        });

        request.on('timeout', () => {
            request.destroy();
            reject(new Error('Stripe HTTPS request timed out'));
        });
        request.on('error', reject);
        request.end();
    });
}

async function retrieveCheckoutSession(secretKey, sessionId) {
    if (process.env.VERCEL) {
        return stripeHttpsGet(secretKey, `/checkout/sessions/${sessionId}`);
    }

    const stripe = createStripeClient(secretKey);
    return stripe.checkout.sessions.retrieve(sessionId);
}

// Stripe secret key: Vercel env vars in production; secrets.json fallback for local dev/tests.
async function getStripeSecretKey() {
    const envKey = sanitizeStripeKey(
        process.env.STRIPE_SECRET_KEY ||
        process.env.STRIPE_API_KEY ||
        process.env.STRIPE_KEY ||
        ''
    );
    if (envKey) return envKey;

    if (!process.env.VERCEL) {
        const secrets = await readJSON(SECRETS_PATH);
        return sanitizeStripeKey(secrets.stripeSecretKey || '');
    }

    return '';
}

// Helper to merge config with environment variables dynamically
async function getMergedConfig() {
    const config = await readJSON(CONFIG_PATH);
    
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
    const stripeSecretKey = await getStripeSecretKey();
    const hasPublishableKey = !!(
        (config.stripe.publicKey && config.stripe.publicKey.trim()) ||
        process.env.STRIPE_PUBLISHABLE_KEY ||
        process.env.STRIPE_PUBLIC_KEY
    );

    config.stripe.ready = !!stripeSecretKey && stripeSecretKey.startsWith('sk_');
    config.stripe.keySource = stripeSecretKey ? 'env' : 'none';
    config.stripe.keyValid = stripeSecretKey.startsWith('sk_');

    if (process.env.STRIPE_ENABLED !== undefined) {
        config.stripe.enabled = process.env.STRIPE_ENABLED === 'true';
    } else if (stripeSecretKey) {
        // Secret key present (typically via Vercel env) — enable checkout automatically.
        config.stripe.enabled = true;
    } else if (hasPublishableKey) {
        config.stripe.enabled = true;
    }
    
    if (process.env.STRIPE_PUBLISHABLE_KEY) {
        config.stripe.publicKey = sanitizeStripeKey(process.env.STRIPE_PUBLISHABLE_KEY);
    } else if (process.env.STRIPE_PUBLIC_KEY) {
        config.stripe.publicKey = sanitizeStripeKey(process.env.STRIPE_PUBLIC_KEY);
    } else if (config.stripe.publicKey) {
        config.stripe.publicKey = sanitizeStripeKey(config.stripe.publicKey);
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
// The admin password comes from the ADMIN_PASSWORD env var or a password
// saved via the admin panel. There is intentionally NO hardcoded default —
// this code is in a public repo.
async function getAdminPassword() {
    const secrets = await readJSON(SECRETS_PATH, {});
    return process.env.ADMIN_PASSWORD || secrets.adminPassword || '';
}

async function checkAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing token' });
    }
    const token = authHeader.split(' ')[1];
    const adminPassword = await getAdminPassword();
    if (!adminPassword || token !== adminPassword) {
        return res.status(403).json({ error: 'Forbidden: Invalid password' });
    }
    next();
}

// PUBLIC CONFIG
app.get('/api/config', async (req, res) => {
    const config = await getMergedConfig();
    res.json(config);
});

app.post('/api/config', checkAuth, async (req, res) => {
    const updated = req.body;
    if (!updated || typeof updated !== 'object') {
        return res.status(400).json({ error: 'Invalid config structure' });
    }
    const success = await writeJSON(CONFIG_PATH, updated);
    if (success) {
        res.json({ success: true, message: 'Configuration saved successfully' });
    } else {
        res.status(500).json({ error: 'Failed to write config file' });
    }
});

// SECRETS
app.get('/api/secrets', checkAuth, async (req, res) => {
    const secrets = await readJSON(SECRETS_PATH);
    const geminiApiKey = secrets.geminiApiKey || process.env.GEMINI_API_KEY;
    const openaiApiKey = secrets.openaiApiKey || process.env.OPENAI_API_KEY;
    const stripeSecretKey = await getStripeSecretKey();
    const stripeFromEnv = !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.trim());
    // Exclude actual password for safety, return mask details
    res.json({
        geminiApiKey: geminiApiKey ? '••••••••••••••••' : '',
        openaiApiKey: openaiApiKey ? '••••••••••••••••' : '',
        hasGemini: !!geminiApiKey,
        hasOpenai: !!openaiApiKey,
        hasStripe: !!stripeSecretKey,
        stripeFromEnv
    });
});

app.post('/api/secrets', checkAuth, async (req, res) => {
    const { geminiApiKey, openaiApiKey, adminPassword } = req.body;
    const secrets = await readJSON(SECRETS_PATH);

    if (geminiApiKey !== undefined && geminiApiKey !== '••••••••••••••••') {
        secrets.geminiApiKey = typeof geminiApiKey === 'string' ? geminiApiKey.trim() : geminiApiKey;
    }
    if (openaiApiKey !== undefined && openaiApiKey !== '••••••••••••••••') {
        secrets.openaiApiKey = typeof openaiApiKey === 'string' ? openaiApiKey.trim() : openaiApiKey;
    }
    if (adminPassword && adminPassword.trim() !== '') {
        secrets.adminPassword = typeof adminPassword === 'string' ? adminPassword.trim() : adminPassword;
    }

    const success = await writeJSON(SECRETS_PATH, secrets);
    if (success) {
        res.json({ success: true, message: 'Secrets updated successfully' });
    } else {
        res.status(500).json({ error: 'Failed to save secrets' });
    }
});

// LOGIN
app.post('/api/login', async (req, res) => {
    const { password } = req.body;
    const adminPassword = await getAdminPassword();
    if (!adminPassword) {
        return res.status(503).json({ error: 'Admin access is not configured. Set the ADMIN_PASSWORD environment variable.' });
    }
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

async function checkCustomerAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing token' });
    }
    const token = authHeader.split(' ')[1];
    const customersData = await readJSON(CUSTOMERS_PATH, { customers: [] });
    const customer = customersData.customers.find(c => c.sessionToken === token);
    if (!customer) {
        return res.status(403).json({ error: 'Forbidden: Invalid token' });
    }
    req.customer = customer;
    req.customersData = customersData;
    next();
}

// CUSTOMER REGISTER
app.post('/api/customer/register', async (req, res) => {
    const { name, email, password, phone, address } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    const customersData = await readJSON(CUSTOMERS_PATH, { customers: [] });
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
    const success = await writeJSON(CUSTOMERS_PATH, customersData);
    if (!success) {
        return res.status(500).json({ error: 'Failed to register customer' });
    }

    const { passwordHash, ...safeCustomer } = newCustomer;
    res.json({ success: true, token, customer: safeCustomer });
});

// CUSTOMER LOGIN
app.post('/api/customer/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }
    const customersData = await readJSON(CUSTOMERS_PATH, { customers: [] });
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

    const success = await writeJSON(CUSTOMERS_PATH, customersData);
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
app.post('/api/customer/update', checkCustomerAuth, async (req, res) => {
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

    const success = await writeJSON(CUSTOMERS_PATH, req.customersData);
    if (!success) {
        return res.status(500).json({ error: 'Failed to update profile' });
    }

    const { passwordHash: _, ...safeCustomer } = customer;
    res.json({ success: true, customer: safeCustomer });
});

// CUSTOMER CREATE ORDER
app.post('/api/customer/orders', checkCustomerAuth, async (req, res) => {
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

    const success = await writeJSON(CUSTOMERS_PATH, req.customersData);
    if (!success) {
        return res.status(500).json({ error: 'Failed to save order' });
    }

    res.json({ success: true, order: newOrder });
});

// GET LEADS (Protected)
app.get('/api/leads', checkAuth, async (req, res) => {
    const leadsData = await readJSON(LEADS_PATH, { leads: [] });
    res.json(leadsData);
});

// POST LEAD (Public)
app.post('/api/leads', async (req, res) => {
    const { email, variantId, variantTitle } = req.body;
    if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'A valid email is required' });
    }

    const leadsData = await readJSON(LEADS_PATH, { leads: [] });
    
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
        const success = await writeJSON(LEADS_PATH, leadsData);
        if (!success) {
            return res.status(500).json({ error: 'Failed to save lead' });
        }
    }
    
    res.json({ success: true });
});

// DELETE LEAD (Protected)
app.delete('/api/leads', checkAuth, async (req, res) => {
    const { id, clearAll } = req.query;

    if (clearAll === 'true') {
        const success = await writeJSON(LEADS_PATH, { leads: [] });
        if (success) {
            return res.json({ success: true, message: 'All leads cleared' });
        } else {
            return res.status(500).json({ error: 'Failed to clear leads' });
        }
    }

    if (!id) {
        return res.status(400).json({ error: 'Lead ID is required' });
    }

    const leadsData = await readJSON(LEADS_PATH, { leads: [] });
    const originalLength = leadsData.leads.length;
    leadsData.leads = leadsData.leads.filter(l => l.id !== id);
    
    if (leadsData.leads.length === originalLength) {
        return res.status(404).json({ error: 'Lead not found' });
    }

    const success = await writeJSON(LEADS_PATH, leadsData);
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

    const config = await getMergedConfig();
    const secrets = await readJSON(SECRETS_PATH);
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

    const secrets = await readJSON(SECRETS_PATH);
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
        const config = await getMergedConfig();
        const stripeSecretKey = await getStripeSecretKey();
        const stripeEnabled = config.stripe && config.stripe.enabled;

        if (!stripeSecretKey) {
            return res.status(400).json({ error: 'Stripe is not configured. Add STRIPE_SECRET_KEY (sk_live_... or sk_test_...) in your Vercel project environment variables, then redeploy.' });
        }
        if (!stripeSecretKey.startsWith('sk_')) {
            return res.status(400).json({
                error: 'STRIPE_SECRET_KEY must be a Stripe secret key (starts with sk_live_ or sk_test_). A publishable key (pk_) was detected — check your Vercel environment variables.'
            });
        }
        if (!stripeEnabled) {
            return res.status(400).json({ error: 'Stripe payments are disabled. Enable them in the admin Payments tab.' });
        }

        // Authenticate the customer if an Authorization token is provided
        let customerId = null;
        let customerEmail = email || '';

        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const customersData = await readJSON(CUSTOMERS_PATH, { customers: [] });
            const customer = customersData.customers.find(c => c.sessionToken === token);
            if (customer) {
                customerId = customer.id;
                customerEmail = customer.email;
            }
        }

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

        const sessionPayload = {
            payment_method_types: ['card'],
            line_items,
            mode: 'payment',
            success_url: getAbsoluteUrl('/success.html?session_id={CHECKOUT_SESSION_ID}'),
            cancel_url: getAbsoluteUrl('/index.html?cart_open=true'),
            shipping_address_collection: {
                allowed_countries: ['US', 'CA', 'GB']
            }
        };
        if (customerEmail) sessionPayload.customer_email = customerEmail;
        if (shipping_options.length > 0) sessionPayload.shipping_options = shipping_options;

        const session = await createCheckoutSession(stripeSecretKey, sessionPayload);

        // Save the pending order
        const pendingOrdersData = await readJSON(PENDING_ORDERS_PATH, { pendingOrders: {} });
        pendingOrdersData.pendingOrders[session.id] = {
            items: items.map(item => ({
                id: item.id || null,
                name: item.name,
                qty: item.qty,
                price: item.price,
                image: item.image || '',
                scent: item.scent || ''
            })),
            total: totalAmount + (totalAmount >= freeShippingThreshold ? 0 : shippingFlatRate),
            email: customerEmail,
            customerId: customerId,
            createdAt: new Date().toISOString()
        };
        await writeJSON(PENDING_ORDERS_PATH, pendingOrdersData);

        res.json({
            success: true,
            url: session.url
        });

    } catch (err) {
        console.error('Stripe Checkout Error:', err.type || '', err.code || '', err.message, err.stack);
        let message = err.message || 'Error generating payment checkout session';
        if (err.type === 'StripeAuthenticationError') {
            message = 'The Stripe secret key is invalid. Please re-check STRIPE_SECRET_KEY in your Vercel environment variables.';
        } else if (err.type === 'StripeConnectionError') {
            const detail = err.code || err.cause?.code || 'connection error';
            console.error('Stripe connection detail:', detail, err.cause?.message || '');
            message = `Could not reach Stripe (${detail}). Please try again in a moment.`;
        }
        res.status(500).json({ error: message });
    }
});

// STRIPE CHECKOUT VERIFICATION ENDPOINT (Public success callback)
app.post('/api/stripe-checkout-success', async (req, res) => {
    const { session_id } = req.body;
    if (!session_id) {
        return res.status(400).json({ error: 'Session ID is required' });
    }

    try {
        const stripeSecretKey = await getStripeSecretKey();

        if (!stripeSecretKey) {
            return res.status(400).json({ error: 'Stripe is not configured' });
        }

        // 1. Retrieve the session from Stripe to verify payment status
        const session = await retrieveCheckoutSession(stripeSecretKey, session_id);
        if (!session) {
            return res.status(404).json({ error: 'Stripe checkout session not found' });
        }

        if (session.payment_status !== 'paid') {
            return res.status(400).json({ error: 'Payment is not completed' });
        }

        // 2. Retrieve the pending order details
        const pendingOrdersData = await readJSON(PENDING_ORDERS_PATH, { pendingOrders: {} });
        const pendingOrder = pendingOrdersData.pendingOrders[session_id];

        if (!pendingOrder) {
            // Check if this order was already promoted (to handle page reloads)
            const customersData = await readJSON(CUSTOMERS_PATH, { customers: [] });
            let existingOrder = null;
            for (const c of customersData.customers) {
                if (c.orders) {
                    existingOrder = c.orders.find(o => o.stripeSessionId === session_id);
                    if (existingOrder) break;
                }
            }

            if (existingOrder) {
                return res.json({ success: true, alreadyProcessed: true, order: existingOrder });
            }

            return res.status(404).json({ error: 'Pending order details not found or already processed' });
        }

        // 3. Promote pending order to a real order
        const customersData = await readJSON(CUSTOMERS_PATH, { customers: [] });
        
        let customer = null;
        if (pendingOrder.customerId) {
            customer = customersData.customers.find(c => c.id === pendingOrder.customerId);
        }
        if (!customer && pendingOrder.email) {
            customer = customersData.customers.find(c => c.email === pendingOrder.email.trim().toLowerCase());
        }

        const orderId = 'HA-' + Math.floor(100000 + Math.random() * 900000);
        const finalOrder = {
            orderId: orderId,
            stripeSessionId: session_id,
            date: new Date().toISOString(),
            total: pendingOrder.total,
            status: 'Processing',
            items: pendingOrder.items.map(item => ({
                id: item.id || null,
                name: item.name,
                qty: item.qty,
                price: item.price,
                image: item.image || 'assets/carrier_oil_base.png',
                scent: item.scent || ''
            }))
        };

        if (customer) {
            if (!customer.orders) customer.orders = [];
            if (!customer.orders.some(o => o.stripeSessionId === session_id)) {
                customer.orders.unshift(finalOrder);
            }
            
            // Update address
            if (session.shipping_details && session.shipping_details.address) {
                const addr = session.shipping_details.address;
                customer.address = {
                    street: addr.line1 + (addr.line2 ? ', ' + addr.line2 : ''),
                    city: addr.city || '',
                    state: addr.state || '',
                    zip: addr.postal_code || ''
                };
                if (session.shipping_details.name && !customer.name) {
                    customer.name = session.shipping_details.name;
                }
            }
            await writeJSON(CUSTOMERS_PATH, customersData);
        } else {
            // Guest checkout: create a guest customer profile
            const guestCustomer = {
                id: 'guest_' + Math.random().toString(36).substr(2, 9),
                name: session.shipping_details?.name || 'Guest Customer',
                email: pendingOrder.email.trim().toLowerCase(),
                phone: session.customer_details?.phone || '',
                address: session.shipping_details?.address ? {
                    street: session.shipping_details.address.line1 + (session.shipping_details.address.line2 ? ', ' + session.shipping_details.address.line2 : ''),
                    city: session.shipping_details.address.city || '',
                    state: session.shipping_details.address.state || '',
                    zip: session.shipping_details.address.postal_code || ''
                } : { street: '', city: '', state: '', zip: '' },
                orders: [finalOrder],
                createdAt: new Date().toISOString(),
                isGuest: true
            };
            customersData.customers.push(guestCustomer);
            await writeJSON(CUSTOMERS_PATH, customersData);
        }

        // Remove from pending orders
        delete pendingOrdersData.pendingOrders[session_id];
        await writeJSON(PENDING_ORDERS_PATH, pendingOrdersData);

        res.json({ success: true, order: finalOrder, shipping: session.shipping_details });

    } catch (err) {
        console.error('Stripe Success Verification Error:', err);
        res.status(500).json({ error: err.message || 'Verification failed' });
    }
});

// STRIPE WEBHOOK FALLBACK ENDPOINT
app.post('/api/stripe-webhook', async (req, res) => {
    const secrets = await readJSON(SECRETS_PATH);
    const stripeWebhookSecret = secrets.stripeWebhookSecret || process.env.STRIPE_WEBHOOK_SECRET;
    const stripeSecretKey = await getStripeSecretKey();

    if (!stripeSecretKey) {
        return res.status(400).send('Stripe is not configured');
    }

    const stripe = createStripeClient(stripeSecretKey);

    const sig = req.headers['stripe-signature'];
    let event;

    try {
        if (stripeWebhookSecret && sig && req.rawBody) {
            event = stripe.webhooks.constructEvent(req.rawBody, sig, stripeWebhookSecret);
        } else {
            // Fallback for local testing/dev
            event = req.body;
        }
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const session_id = session.id;

        try {
            const pendingOrdersData = await readJSON(PENDING_ORDERS_PATH, { pendingOrders: {} });
            const pendingOrder = pendingOrdersData.pendingOrders[session_id];

            if (pendingOrder) {
                const customersData = await readJSON(CUSTOMERS_PATH, { customers: [] });
                
                let customer = null;
                if (pendingOrder.customerId) {
                    customer = customersData.customers.find(c => c.id === pendingOrder.customerId);
                }
                if (!customer && pendingOrder.email) {
                    customer = customersData.customers.find(c => c.email === pendingOrder.email.trim().toLowerCase());
                }

                const orderId = 'HA-' + Math.floor(100000 + Math.random() * 900000);
                const finalOrder = {
                    orderId: orderId,
                    stripeSessionId: session_id,
                    date: new Date().toISOString(),
                    total: pendingOrder.total,
                    status: 'Processing',
                    items: pendingOrder.items.map(item => ({
                        id: item.id || null,
                        name: item.name,
                        qty: item.qty,
                        price: item.price,
                        image: item.image || 'assets/carrier_oil_base.png',
                        scent: item.scent || ''
                    }))
                };

                if (customer) {
                    if (!customer.orders) customer.orders = [];
                    if (!customer.orders.some(o => o.stripeSessionId === session_id)) {
                        customer.orders.unshift(finalOrder);
                        
                        if (session.shipping_details && session.shipping_details.address) {
                            const addr = session.shipping_details.address;
                            customer.address = {
                                street: addr.line1 + (addr.line2 ? ', ' + addr.line2 : ''),
                                city: addr.city || '',
                                state: addr.state || '',
                                zip: addr.postal_code || ''
                            };
                        }
                        await writeJSON(CUSTOMERS_PATH, customersData);
                    }
                } else {
                    if (!customersData.customers.some(c => c.orders && c.orders.some(o => o.stripeSessionId === session_id))) {
                        const guestCustomer = {
                            id: 'guest_' + Math.random().toString(36).substr(2, 9),
                            name: session.shipping_details?.name || 'Guest Customer',
                            email: pendingOrder.email.trim().toLowerCase(),
                            phone: session.customer_details?.phone || '',
                            address: session.shipping_details?.address ? {
                                street: session.shipping_details.address.line1 + (session.shipping_details.address.line2 ? ', ' + session.shipping_details.address.line2 : ''),
                                city: session.shipping_details.address.city || '',
                                state: session.shipping_details.address.state || '',
                                zip: session.shipping_details.address.postal_code || ''
                            } : { street: '', city: '', state: '', zip: '' },
                            orders: [finalOrder],
                            createdAt: new Date().toISOString(),
                            isGuest: true
                        };
                        customersData.customers.push(guestCustomer);
                        await writeJSON(CUSTOMERS_PATH, customersData);
                    }
                }

                delete pendingOrdersData.pendingOrders[session_id];
                await writeJSON(PENDING_ORDERS_PATH, pendingOrdersData);
            }
        } catch (err) {
            console.error('Error promoting order via webhook:', err);
            return res.status(500).send('Webhook processing failed');
        }
    }

    res.json({ received: true });
});

// Fallback for everything else (SPA redirect to index.html)
app.use((req, res) => {
    res.sendFile(path.join(process.cwd(), 'index.html'));
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Herban Alchemy backend server listening on port ${PORT}`);
    });
}

module.exports = app;
