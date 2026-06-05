const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, './')));

const CONFIG_PATH = path.join(__dirname, 'data', 'config.json');
const SECRETS_PATH = path.join(__dirname, 'data', 'secrets.json');

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
    if (token !== secrets.adminPassword) {
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
    // Exclude actual password for safety, return mask details
    res.json({
        geminiApiKey: secrets.geminiApiKey ? '••••••••••••••••' : '',
        openaiApiKey: secrets.openaiApiKey ? '••••••••••••••••' : '',
        hasGemini: !!secrets.geminiApiKey,
        hasOpenai: !!secrets.openaiApiKey
    });
});

app.post('/api/secrets', checkAuth, (req, res) => {
    const { geminiApiKey, openaiApiKey, adminPassword } = req.body;
    const secrets = readJSON(SECRETS_PATH);

    if (geminiApiKey !== undefined && geminiApiKey !== '••••••••••••••••') {
        secrets.geminiApiKey = geminiApiKey;
    }
    if (openaiApiKey !== undefined && openaiApiKey !== '••••••••••••••••') {
        secrets.openaiApiKey = openaiApiKey;
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
    if (password === secrets.adminPassword) {
        res.json({ success: true, token: secrets.adminPassword });
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

    if (!chatbot.enabled) {
        return res.status(400).json({ error: 'Chatbot is currently disabled' });
    }

    const systemPrompt = chatbot.systemPrompt || 'You are Aura, an AI assistant for Herban Alchemy.';
    const activeModel = chatbot.model || 'gemini';

    try {
        if (activeModel === 'gemini') {
            if (!secrets.geminiApiKey) {
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

            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${secrets.geminiApiKey}`;
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
                        maxOutputTokens: 500
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
            if (!secrets.openaiApiKey) {
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
                    'Authorization': `Bearer ${secrets.openaiApiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: messages,
                    temperature: 0.7,
                    max_tokens: 500
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

// Fallback for everything else (SPA redirect to index.html)
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Herban Alchemy backend server listening on port ${PORT}`);
});
