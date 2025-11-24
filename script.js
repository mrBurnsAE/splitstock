// --- НАСТРОЙКИ ---
// Адрес твоего API на сервере
const API_BASE_URL = "https://api.splitstock.ru";

// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand(); // Раскрыть на весь экран

// Получаем ID пользователя из Telegram
// (Если открыто в браузере для теста - используем заглушку)
const USER_ID = tg.initDataUnsafe?.user?.id || 123456789;

// Глобальная переменная для хранения ссылок на видео текущего товара
window.currentVideoLinks = {};

// --- ЗАПУСК ПРИ ОТКРЫТИИ ---
document.addEventListener("DOMContentLoaded", () => {
    // 1. Загружаем данные пользователя (имя, статус)
    loadUserProfile();
    // 2. Загружаем список категорий
    loadCategories();
    // 3. Загружаем товары (по умолчанию "Активные")
    loadItems('active');
});

// --- ЛОГИКА ПЕРЕКЛЮЧЕНИЯ ЭКРАНОВ ---

function switchView(viewName) {
    // Скрываем все экраны, показываем нужный
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${viewName}`).classList.add('active');

    // Показываем нижнее меню (вдруг мы вернулись из товара)
    document.querySelector('.bottom-nav').style.display = 'flex';
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    // Подсветка кнопок меню
    if(viewName === 'home') {
        document.querySelector('.nav-item:nth-child(2)').classList.add('active');
        document.getElementById('icon-home').src = 'icons/home active.svg';
        document.getElementById('icon-catalog').src = 'icons/apps.svg';
        document.getElementById('icon-profile').src = 'icons/user.svg';
    } else if(viewName === 'catalog') {
        document.querySelector('.nav-item:nth-child(1)').classList.add('active');
        document.getElementById('icon-home').src = 'icons/home.svg';
        document.getElementById('icon-catalog').src = 'icons/apps active.svg';
        document.getElementById('icon-profile').src = 'icons/user.svg';
        // При входе в каталог сбрасываем на вкладку "Активные"
        const firstTab = document.querySelector('.tab:nth-child(1)');
        if(firstTab) selectTab(firstTab);
    } else if(viewName === 'profile') {
        document.querySelector('.nav-item:nth-child(3)').classList.add('active');
        document.getElementById('icon-home').src = 'icons/home.svg';
        document.getElementById('icon-catalog').src = 'icons/apps.svg';
        document.getElementById('icon-profile').src = 'icons/user active.svg';
        loadUserProfile(); // Обновляем данные при входе в профиль
    }
}

// Логика табов (Активные / Завершенные / Мои)
function selectTab(tabElement) {
    document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
    tabElement.classList.add('active');
    
    const tabName = tabElement.innerText;
    if (tabName.includes("Активные")) {
        loadItems('active');
    } else if (tabName.includes("Завершённые")) {
        loadItems('completed');
    } else if (tabName.includes("Мои")) {
        // TODO: Если нужно API для "Моих складчин", нужно добавить endpoint
        // Пока можно грузить активные или сделать заглушку
        loadItems('active'); 
        alert("Раздел 'Мои складчины' в разработке");
    }
}

// --- ЗАГРУЗКА ДАННЫХ С СЕРВЕРА (API) ---

// 1. Профиль пользователя
async function loadUserProfile() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/user/${USER_ID}`);
        if (!response.ok) throw new Error("Ошибка сети");
        const user = await response.json();
        
        // Обновляем имя на главной и в профиле
        document.querySelectorAll('.user-name').forEach(el => {
            el.innerText = user.first_name || user.username || "User";
        });
        
        // Обновляем дату регистрации в профиле
        const dateEl = document.querySelector('#view-profile p');
        if(dateEl && user.registration_date) {
            // Берем только дату YYYY-MM-DD
            const dateStr = user.registration_date.split(' ')[0]; 
            dateEl.innerText = `Участник с ${dateStr}`;
        }
        
        // Здесь можно добавить обновление статуса ("Новичок"/"Опытный") и счетчиков,
        // если добавить соответствующие ID в HTML профиля.
        
    } catch (error) {
        console.error("Ошибка загрузки профиля:", error);
    }
}

// 2. Список категорий
async function loadCategories() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/categories`);
        const categories = await response.json();
        
        const container = document.querySelector('.categories-grid');
        container.innerHTML = ''; // Очищаем старые плитки
        
        categories.forEach(cat => {
            const div = document.createElement('div');
            div.className = 'category-card';
            // Если у категории есть иконка, можно добавить <img>, 
            // но пока в макете просто текст.
            div.innerText = cat.name;
            
            // При клике переходим в каталог и фильтруем
            div.onclick = () => {
                switchView('catalog');
                loadItems('active', cat.id); 
            };
            container.appendChild(div);
        });
        
    } catch (error) {
        console.error("Ошибка категорий:", error);
    }
}

// 3. Список товаров (Карточки)
async function loadItems(type, categoryId = null) {
    try {
        // Формируем URL запроса
        let url = `${API_BASE_URL}/api/items?type=${type}&page=1`;
        if (categoryId) url += `&cat=${categoryId}`;
        
        const response = await fetch(url);
        const items = await response.json();
        
        // Ищем контейнер в Каталоге
        const catalogView = document.getElementById('view-catalog');
        // Пытаемся найти существующий контейнер или создаем новый
        let container = catalogView.querySelector('.item-container'); 
        
        if (!container) {
            // Удаляем статичные демо-карточки, если они есть
            const oldCards = catalogView.querySelectorAll('.big-card');
            oldCards.forEach(c => c.remove());
            
            container = document.createElement('div');
            container.className = 'item-container';
            // Вставляем контейнер в .section
            catalogView.querySelector('.section').appendChild(container);
        }
        
        container.innerHTML = ''; // Очищаем список
        
        if (items.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:20px; color:#a2a5b9;">Здесь пока ничего нет...</div>';
            return;
        }

        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'big-card';
            card.onclick = () => openProduct(item.id);
            
            // Расчет прогресса и статуса
            let statusText = "";
            let barColor = "";
            let badgeColor = "";
            let percent = 0;
            
            if (item.needed_participants > 0) {
                percent = (item.current_participants / item.needed_participants) * 100;
            }

            if (item.status === 'published' || item.status === 'active') {
                statusText = "Активная складчина";
                barColor = "background: linear-gradient(90deg, #00b894 0%, #00cec9 100%);"; // Green
                badgeColor = "#00cec9";
            } else if (item.status === 'fundraising') {
                statusText = "Идёт сбор средств";
                barColor = "background: #0984e3;"; // Blue
                badgeColor = "#0984e3";
            } else if (item.status === 'completed') {
                statusText = "Завершена";
                barColor = "background: #a2a5b9;";
                badgeColor = "#a2a5b9";
                percent = 100;
            }

            // Используем реальную картинку или заглушку
            const imgSrc = item.cover_url || "icons/Ничего нет без фона.png"; 

            card.innerHTML = `
                <div class="card-media">
                    <img src="${imgSrc}" style="width:100%; height:100%; object-fit:cover; opacity:0.8;">
                </div>
                <div class="card-content">
                    <div class="item-name">${item.name}</div>
                    <div class="card-tags">$${item.price}</div>
                    <div class="progress-section">
                        <div class="progress-text">
                            <span>Участников: ${item.current_participants}/${item.needed_participants}</span>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${percent}%; ${barColor}"></div>
                        </div>
                    </div>
                    <div class="status-badge" style="color: ${badgeColor};">
                        ${statusText}
                    </div>
                </div>
            `;
            container.appendChild(card);
        });

    } catch (error) {
        console.error("Ошибка загрузки товаров:", error);
    }
}

// 4. Открытие товара (Подробности)
async function openProduct(id) {
    // Скрываем нижнее меню
    document.querySelector('.bottom-nav').style.display = 'none';
    
    // Показываем экран товара
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.getElementById('view-product').classList.add('active');
    
    // Сброс данных (показываем "Загрузка...")
    document.getElementById('product-header-title').innerText = "Загрузка...";
    document.getElementById('product-desc').innerText = "...";
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/items/${id}`);
        const item = await response.json();
        
        // Заполняем данными
        document.getElementById('product-header-title').innerText = item.name;
        document.getElementById('product-desc').innerText = item.description || "Описание отсутствует";
        document.getElementById('product-category').innerText = item.category ? "#" + item.category : "";
        document.getElementById('product-tags').innerText = item.tags.map(t => "#" + t).join(" ");
        document.getElementById('product-price-orig').innerText = "$" + item.price;
        
        // Расчет взноса (примерный)
        // TODO: получать реальный взнос с сервера (он зависит от статуса)
        let contribution = Math.ceil((item.price * 90) / item.needed_participants); // Пример: курс 90
        document.getElementById('product-price-contrib').innerText = "~" + contribution + "₽";
        
        // Участники
        document.getElementById('participants-count').innerText = `${item.current_participants}/${item.needed_participants}`;
        let percent = (item.current_participants / item.needed_participants) * 100;
        document.getElementById('product-progress-fill').style.width = percent + "%";
        
        // Обновляем кнопку и статус
        updateProductStatusUI(item.status);
        
        // Видео и Обложка
        window.currentVideoLinks = item.videos || {};
        
        // Обложка для плеера
        const coverImg = document.getElementById('product-cover-img');
        if (item.cover_url) {
            coverImg.src = item.cover_url;
        } else {
            coverImg.src = "icons/Ничего нет без фона.png";
        }

        // Пытаемся включить видео (приоритет: YouTube -> VK -> RuTube)
        if (item.videos && item.videos.youtube) switchVideo('youtube');
        else if (item.videos && item.videos.vk) switchVideo('vk');
        else if (item.videos && item.videos.rutube) switchVideo('rutube');
        else switchVideo('none'); // Показать только обложку

    } catch (error) {
        console.error("Ошибка загрузки деталей:", error);
        alert("Не удалось загрузить товар");
        closeProduct();
    }
}

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

function closeProduct() {
    // Останавливаем видео
    document.getElementById('main-video-frame').src = "";
    // Возвращаемся в каталог
    switchView('catalog');
}

function switchVideo(platform) {
    const iframe = document.getElementById('main-video-frame');
    const placeholder = document.getElementById('no-video-placeholder');
    const btns = document.querySelectorAll('.platform-btn');
    
    // Сброс активных кнопок
    btns.forEach(b => b.classList.remove('active'));
    
    // Активируем нажатую
    const btn = document.getElementById(`btn-${platform}`);
    if(btn) btn.classList.add('active');

    let videoUrl = "";
    if (window.currentVideoLinks) {
        if (platform === 'youtube') videoUrl = window.currentVideoLinks.youtube;
        if (platform === 'vk') videoUrl = window.currentVideoLinks.vk;
        if (platform === 'rutube') videoUrl = window.currentVideoLinks.rutube;
    }
    
    // Хак для YouTube embed (превращаем обычную ссылку в embed)
    if (videoUrl && videoUrl.includes('youtube') || videoUrl.includes('youtu.be')) {
        if (videoUrl.includes('watch?v=')) {
            videoUrl = videoUrl.replace('watch?v=', 'embed/');
        } else if (videoUrl.includes('youtu.be/')) {
            videoUrl = videoUrl.replace('youtu.be/', 'youtube.com/embed/');
        }
    }
    // Хак для VK Video (нужна именно embed ссылка, но если юзер кинул обычную - пробуем как есть)
    // Для RuTube тоже часто нужна embed ссылка

    if (videoUrl && platform !== 'none') {
        iframe.style.display = 'block';
        placeholder.style.display = 'none';
        iframe.src = videoUrl;
    } else {
        // Если видео нет или режим 'none'
        iframe.style.display = 'none';
        placeholder.style.display = 'block';
        iframe.src = "";
    }
}

function updateProductStatusUI(status) {
    const progressBar = document.getElementById('product-progress-fill');
    const actionBtn = document.getElementById('product-action-btn');
    const statusText = document.getElementById('product-status-text');
    const fundraisingRow = document.getElementById('fundraising-label-row');
    const leaveBtn = document.getElementById('product-leave-btn');

    // Сброс
    progressBar.className = 'progress-fill'; 
    fundraisingRow.style.display = 'none';
    leaveBtn.style.display = 'none';

    if (status === 'published' || status === 'active') {
        progressBar.classList.add('green-gradient');
        actionBtn.innerText = "Записаться";
        actionBtn.disabled = false;
        statusText.innerText = "Активная складчина";
    } else if (status === 'fundraising') {
        progressBar.classList.add('blue');
        actionBtn.innerText = "Оплатить взнос";
        statusText.innerText = "Идёт сбор средств";
        fundraisingRow.style.display = 'flex';
    } else if (status === 'completed') {
        actionBtn.innerText = "Завершена";
        actionBtn.disabled = true;
        statusText.innerText = "Складчина завершена";
    }
}

function handleProductAction() {
    // Здесь мы будем отправлять данные в бота
    // Например: tg.sendData(JSON.stringify({action: 'join', id: currentItemId}));
    alert("Эта кнопка скоро заработает! (Нужно связать с ботом)");
}

function leaveProduct() {
    alert("Выход...");
}

// Модалка статуса
function openModal() { document.getElementById('modal-status').classList.add('open'); }
function closeModal() { document.getElementById('modal-status').classList.remove('open'); }