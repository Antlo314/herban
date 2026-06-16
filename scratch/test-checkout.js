const fs = require('fs');
const path = require('path');
const http = require('http');

console.log('==================================================');
console.log('   HERBAN ALCHEMY STRIPE CHECKOUT TEST SUITE      ');
console.log('==================================================\n');

// 1. SET UP MOCK STRIPE SDK
const mockStripeInstance = {
    checkout: {
        sessions: {
            create: async (data) => {
                return {
                    id: 'cs_test_mock_session_id',
                    url: 'https://checkout.stripe.com/pay/cs_test_mock_session_id'
                };
            },
            retrieve: async (id) => {
                return {
                    id: id,
                    payment_status: 'paid',
                    customer_details: {
                        email: 'testcustomer@example.com',
                        phone: '123-456-7890'
                    },
                    shipping_details: {
                        name: 'Test Customer',
                        address: {
                            line1: '123 Peach Street',
                            line2: 'Suite 400',
                            city: 'Atlanta',
                            state: 'GA',
                            postal_code: '30303',
                            country: 'US'
                        }
                    }
                };
            }
        }
    }
};

const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (name) {
    if (name === 'stripe') {
        return function () {
            return mockStripeInstance;
        };
    }
    return originalRequire.apply(this, arguments);
};

// Mock Stripe webhook signature validation bypass
process.env.STRIPE_WEBHOOK_SECRET = ''; // empty bypasses signature verification in webhook mock

// 2. BACKUP DATABASE FILES TO PREVENT CORRUPTING DATA
const CUSTOMERS_PATH = path.join(__dirname, '..', 'data', 'customers.json');
const CONFIG_PATH = path.join(__dirname, '..', 'data', 'config.json');
const SECRETS_PATH = path.join(__dirname, '..', 'data', 'secrets.json');
const PENDING_ORDERS_PATH = path.join(__dirname, '..', 'data', 'pending_orders.json');

const backups = {};
const backupFile = (filePath) => {
    if (fs.existsSync(filePath)) {
        backups[filePath] = fs.readFileSync(filePath, 'utf8');
    }
};

backupFile(CUSTOMERS_PATH);
backupFile(CONFIG_PATH);
backupFile(SECRETS_PATH);
backupFile(PENDING_ORDERS_PATH);

// Reset files to test state
fs.writeFileSync(CUSTOMERS_PATH, JSON.stringify({ customers: [] }, null, 2));
fs.writeFileSync(PENDING_ORDERS_PATH, JSON.stringify({ pendingOrders: {} }, null, 2));

// Ensure config has Stripe enabled
let configObj = {};
if (backups[CONFIG_PATH]) {
    configObj = JSON.parse(backups[CONFIG_PATH]);
}
configObj.stripe = {
    enabled: true,
    publicKey: 'pk_test_mock',
    currency: 'usd',
    shippingFlatRate: 5.99,
    freeShippingThreshold: 65
};
fs.writeFileSync(CONFIG_PATH, JSON.stringify(configObj, null, 2));

// Ensure secrets has Stripe mock key
let secretsObj = {};
if (backups[SECRETS_PATH]) {
    secretsObj = JSON.parse(backups[SECRETS_PATH]);
}
secretsObj.stripeSecretKey = 'sk_test_mock';
fs.writeFileSync(SECRETS_PATH, JSON.stringify(secretsObj, null, 2));

// 3. START SERVER
const app = require('../api/index.js');
const TEST_PORT = 9999;
let server;

const startServer = () => {
    return new Promise((resolve) => {
        server = app.listen(TEST_PORT, () => {
            console.log(`[TEST SERVER] Spawned successfully on port ${TEST_PORT}\n`);
            resolve();
        });
    });
};

const stopServer = () => {
    return new Promise((resolve) => {
        if (server) {
            server.close(() => {
                console.log('\n[TEST SERVER] Closed successfully.');
                resolve();
            });
        } else {
            resolve();
        }
    });
};

// Helper for making requests
const request = (method, path, body = null, headers = {}) => {
    return new Promise((resolve, reject) => {
        const reqHeaders = {
            'Content-Type': 'application/json',
            ...headers
        };
        const postData = body ? JSON.stringify(body) : '';
        if (body) {
            reqHeaders['Content-Length'] = Buffer.byteLength(postData);
        }

        const options = {
            hostname: '127.0.0.1',
            port: TEST_PORT,
            path: path,
            method: method,
            headers: reqHeaders
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    resolve({
                        statusCode: res.statusCode,
                        body: JSON.parse(data)
                    });
                } catch (e) {
                    resolve({
                        statusCode: res.statusCode,
                        body: data
                    });
                }
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        if (body) {
            req.write(postData);
        }
        req.end();
    });
};

// 4. RUN ASSERTIONS
async function runTests() {
    let failed = false;
    const assert = (condition, message) => {
        if (condition) {
            console.log(` ✅ PASS: ${message}`);
        } else {
            console.log(` ❌ FAIL: ${message}`);
            failed = true;
        }
    };

    try {
        await startServer();

        // TEST 1: Create checkout session
        console.log('--- Test Case 1: Create Checkout Session ---');
        const cartItems = [
            { id: 101, name: 'Sweet Auburn Butter Glaze', price: 38.00, qty: 1, scent: 'Mango Dream' }
        ];
        const res1 = await request('POST', '/api/create-checkout-session', {
            items: cartItems,
            email: 'testcustomer@example.com'
        });

        assert(res1.statusCode === 200, 'Endpoint returned 200 OK');
        assert(res1.body.success === true, 'Success flag is true');
        assert(res1.body.url.includes('cs_test_mock_session_id'), 'Stripe Checkout URL returned');

        // Check if saved to pending orders
        const pendingOrders = JSON.parse(fs.readFileSync(PENDING_ORDERS_PATH, 'utf8'));
        const pendingOrder = pendingOrders.pendingOrders['cs_test_mock_session_id'];
        assert(!!pendingOrder, 'Order was saved to pending_orders.json');
        assert(pendingOrder.total === 43.99, `Pending order total matches (price + shipping): ${pendingOrder?.total}`);
        assert(pendingOrder.email === 'testcustomer@example.com', 'Pending order email matches');

        // TEST 2: Verify success endpoint and promote order
        console.log('\n--- Test Case 2: Verify Session and Promote Order ---');
        const res2 = await request('POST', '/api/stripe-checkout-success', {
            session_id: 'cs_test_mock_session_id'
        });

        assert(res2.statusCode === 200, 'Endpoint returned 200 OK');
        assert(res2.body.success === true, 'Success flag is true');
        assert(res2.body.order.stripeSessionId === 'cs_test_mock_session_id', 'Response order references session ID');
        assert(res2.body.order.status === 'Processing', 'Order status is Processing');
        assert(res2.body.shipping.name === 'Test Customer', 'Shipping customer name matches Stripe payload');

        // Verify pending order was cleared
        const pendingOrdersAfter = JSON.parse(fs.readFileSync(PENDING_ORDERS_PATH, 'utf8'));
        assert(!pendingOrdersAfter.pendingOrders['cs_test_mock_session_id'], 'Pending order was removed');

        // Verify order saved under a guest customer profile in customers.json
        const customersAfter = JSON.parse(fs.readFileSync(CUSTOMERS_PATH, 'utf8'));
        const guest = customersAfter.customers.find(c => c.email === 'testcustomer@example.com');
        assert(!!guest, 'Guest customer profile was created');
        assert(guest.orders.length === 1, 'Guest customer has exactly 1 order');
        assert(guest.orders[0].stripeSessionId === 'cs_test_mock_session_id', 'Guest order references session ID');
        assert(guest.address.zip === '30303', `Guest shipping ZIP is saved: ${guest.address?.zip}`);

        // TEST 3: Handle webhook fallback promotion
        console.log('\n--- Test Case 3: Webhook Fallback ---');
        // Manually seed pending order again
        const pendingOrdersSeed = JSON.parse(fs.readFileSync(PENDING_ORDERS_PATH, 'utf8'));
        pendingOrdersSeed.pendingOrders['cs_webhook_session_id'] = {
            items: [
                { id: 102, name: 'Auburn Fragrance Oil', price: 20.00, qty: 2, scent: 'Vanilla Orchid' }
            ],
            total: 45.99,
            email: 'webhookuser@example.com',
            customerId: null,
            createdAt: new Date().toISOString()
        };
        fs.writeFileSync(PENDING_ORDERS_PATH, JSON.stringify(pendingOrdersSeed, null, 2));

        // Send mock Stripe webhook event
        const webhookPayload = {
            type: 'checkout.session.completed',
            data: {
                object: {
                    id: 'cs_webhook_session_id',
                    payment_status: 'paid',
                    customer_details: { email: 'webhookuser@example.com' },
                    shipping_details: {
                        name: 'Webhook Customer',
                        address: {
                            line1: '456 Webhook Ave',
                            city: 'San Francisco',
                            state: 'CA',
                            postal_code: '94103',
                            country: 'US'
                        }
                    }
                }
            }
        };

        const res3 = await request('POST', '/api/stripe-webhook', webhookPayload);
        assert(res3.statusCode === 200, 'Webhook endpoint returned 200 OK');
        assert(res3.body.received === true, 'Webhook acknowledged receipt');

        // Verify promoted
        const pendingOrdersWebhookAfter = JSON.parse(fs.readFileSync(PENDING_ORDERS_PATH, 'utf8'));
        assert(!pendingOrdersWebhookAfter.pendingOrders['cs_webhook_session_id'], 'Pending order was removed by webhook');

        const customersWebhookAfter = JSON.parse(fs.readFileSync(CUSTOMERS_PATH, 'utf8'));
        const guestWebhook = customersWebhookAfter.customers.find(c => c.email === 'webhookuser@example.com');
        assert(!!guestWebhook, 'Webhook guest profile created');
        assert(guestWebhook.orders.length === 1, 'Webhook guest profile has 1 order');
        assert(guestWebhook.orders[0].stripeSessionId === 'cs_webhook_session_id', 'Webhook guest order references session ID');
        assert(guestWebhook.address.city === 'San Francisco', `Webhook guest shipping city is saved: ${guestWebhook.address?.city}`);

    } catch (err) {
        console.error('Test execution failed:', err);
        failed = true;
    } finally {
        await stopServer();

        // RESTORE ORIGINAL FILES
        const restoreFile = (filePath) => {
            if (backups[filePath]) {
                fs.writeFileSync(filePath, backups[filePath]);
            } else if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        };

        restoreFile(CUSTOMERS_PATH);
        restoreFile(CONFIG_PATH);
        restoreFile(SECRETS_PATH);
        restoreFile(PENDING_ORDERS_PATH);

        console.log('\n==================================================');
        if (failed) {
            console.log('   RESULT: ❌ TEST RUN FAILED');
            console.log('==================================================');
            process.exit(1);
        } else {
            console.log('   RESULT: ✅ ALL TESTS PASSED SUCCESSFULLY!');
            console.log('==================================================');
            process.exit(0);
        }
    }
}

runTests();
