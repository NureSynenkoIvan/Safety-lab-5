
const dotenv = require('dotenv');

dotenv.config();

const axios = require('axios');
const express = require('express');
const paypal = require('@paypal/checkout-server-sdk');

const app = express();
app.use(express.static('public')); // Папка для HTML файлу
app.use(express.json());

// === 1. НАЛАШТУВАННЯ PAYPAL ===
// Вставте сюди ваші ключі з developer.paypal.com
const clientId = "Ac5VbUGI5eaX0Jm_c2PBUOBGOb-X2W-G8D5IHBcSLmBGpYgbLbQNtT58jNzhpzjv_Lof1ZNJh9ITxXB1";
const clientSecret = "EB2uz6Rf9JzcmKqsU45cD1tODqfmyEJ2L0YfNw5fPN0EOKWORAnoqzNZ3Tzf1j3wKOQlEQnZZqpBuzP7";

// Налаштовуємо середовище (Sandbox для тестів)
const environment = new paypal.core.SandboxEnvironment(clientId, clientSecret);
const client = new paypal.core.PayPalHttpClient(environment);


//Налаштування Google OAuth
const GOOGLE_OAUTH_URL = process.env.GOOGLE_OAUTH_URL;

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const GOOGLE_CALLBACK_URL = "http%3A//localhost:3000/google/callback";

const GOOGLE_OAUTH_SCOPES = [

"https%3A//www.googleapis.com/auth/userinfo.email",

"https%3A//www.googleapis.com/auth/userinfo.profile",

];

// === 2. БАЗА ДАНИХ (Імітація) ===
// У нас є 3 автомобілі ЗАЗ 968
let stockInventory = {
    zaz968: 3
};



// Функція, яка перевіряє, чи авторизований користувач
const requireAuth = (req, res, next) => {
    // 1. Отримати токен із кукі або заголовків
    if (!req.cookies || !req.cookies.session_token) {
        return res.status(401).send("Unauthorized. Please log in.");
    }
    

    try {
        // 2. Верифікувати токен
        // Наприклад, за допомогою 'jsonwebtoken': jwt.verify(token, JWT_SECRET)
        // const decoded = jwt.verify(token, JWT_SECRET);
        
        // 3. Якщо верифікація успішна, прикріпити дані користувача до запиту
        // req.user = decoded; 

        // 4. Продовжити до наступної функції маршруту
        next(); 
    } catch (err) {
        // Токен недійсний або термін дії закінчився
        console.error("Token verification failed:", err);
        return res.status(401).send("Invalid token. Please log in again.");
    }
};

// === 3. API МАРШРУТИ ===

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.get('/api/login', (req, res) => {
    const state = "secure_random_state"; // У реальному додатку згенеруйте випадковий рядок
    const scopes = GOOGLE_OAUTH_SCOPES.join(" ");
  const GOOGLE_OAUTH_CONSENT_SCREEN_URL = `${GOOGLE_OAUTH_URL}?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${GOOGLE_CALLBACK_URL}&access_type=offline&response_type=code&state=${state}&scope=${scopes}`;
  res.redirect(GOOGLE_OAUTH_CONSENT_SCREEN_URL);
}
);


app.get("/google/callback", async (req, res) => {
    const { code, state } = req.query;
    try {
        /*const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
            code: code,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            redirect_uri: GOOGLE_CALLBACK_URL,
            grant_type: 'authorization_code'
        });
*/
        const access_token = "ACCESS_TOKEN_MOCK"; //tokenResponse.data.access_token;

        // --- 3. Отримання даних користувача (за допомогою access_token або декодування id_token) ---
        // Використання id_token простіше, оскільки він є JWT і містить основні дані.

        // Якщо ви хочете отримати більше даних, використовуйте access_token:
        /*const userResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: {
                Authorization: `Bearer ${access_token}`
            }
        });*/

        //const userProfile = userResponse.data;

        res.cookie('session_token', (access_token), { httpOnly: true, secure: true });
      
        res.redirect('/shop');

    } catch (error) {
        console.error("Error during token exchange or user info fetch:", error.response ? error.response.data : error.message);
        res.status(500).send("Login failed.");
    }
});


app.get("/shop", requireAuth, (req, res) => {
    res.sendFile(__dirname + '/public/shop.html');
});

app.get('/api/stock', requireAuth, (req, res) => {
    res.json({ count: stockInventory.zaz968 });
});

// КРОК 1: Створення замовлення
app.post('/api/create-order', requireAuth, async (req, res) => {
    // Спочатку перевіряємо, чи є товар в наявності
    if (stockInventory.zaz968 <= 0) {
        return res.status(400).json({ error: "Вибачте, ЗАЗи закінчились!" });
    }

    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
        intent: 'CAPTURE',
        purchase_units: [{
            amount: {
                currency_code: 'USD',
                value: '100.00' // Ціна ЗАЗ 968 :)
            },
            description: 'Легендарний ЗАЗ 968'
        }]
    });

    try {
        const order = await client.execute(request);
        // Відправляємо ID замовлення на фронтенд
        res.json({ id: order.result.id });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// КРОК 2: Підтвердження оплати (Capture) та ОНОВЛЕННЯ СКЛАДУ
app.post('/api/capture-order', requireAuth, async (req, res) => {
    const { orderID } = req.body;
    const request = new paypal.orders.OrdersCaptureRequest(orderID);
    request.requestBody({});

    try {
        const capture = await client.execute(request);

        // ПЕРЕВІРКА УСПІШНОСТІ
        // Якщо PayPal каже COMPLETED, значить гроші знято
        if (capture.result.status === 'COMPLETED') {
            
            // !!! ГОЛОВНА ЛОГІКА ЗАВДАННЯ !!!
            if (stockInventory.zaz968 > 0) {
                stockInventory.zaz968 -= 1; // Зменшуємо кількість авто
                console.log(`Успішний продаж! Залишилось авто: ${stockInventory.zaz968}`);
                res.json({ status: 'success', remaining: stockInventory.zaz968 });
            } else {
                // Рідкісний випадок race condition, але обробимо його
                res.json({ status: 'error', message: 'Вже розкупили поки ви платили' });
            }

        } else {
            res.json({ status: 'failed' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});


app.listen(3000, () => console.log('Server running on http://localhost:3000'));