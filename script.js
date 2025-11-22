// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand(); // Раскрыть на весь экран

// Логика переключения экранов
function switchView(viewName) {
    // 1. Скрываем все экраны
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    
    // 2. Показываем нужный
    document.getElementById(`view-${viewName}`).classList.add('active');

    // 3. Обновляем нижнее меню (иконки)
    // Сначала показываем меню (на случай если мы вернулись со страницы товара)
    document.querySelector('.bottom-nav').style.display = 'flex';
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    // Меняем иконки (Active/Inactive)
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
    } else if(viewName === 'profile') {
        document.querySelector('.nav-item:nth-child(3)').classList.add('active');
        document.getElementById('icon-home').src = 'icons/home.svg';
        document.getElementById('icon-catalog').src = 'icons/apps.svg';
        document.getElementById('icon-profile').src = 'icons/user active.svg';
    }
}

// Логика табов внутри каталога
function selectTab(tabElement) {
    document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
    tabElement.classList.add('active');
    // Здесь будет логика фильтрации списка
}

// Модальные окна
function openModal() {
    document.getElementById('modal-status').classList.add('open');
}

function closeModal() {
    document.getElementById('modal-status').classList.remove('open');
}


// --- ЛОГИКА СТРАНИЦЫ ТОВАРА (Новая часть) ---

// Фейковые данные для теста (в реальности придут из бота)
const mockProduct = {
    id: 1,
    title: "Photo 3D Slideshow",
    description: "Крутой проект для After Effects. Очень полезный для слайдшоу. Полностью настраиваемый, без плагинов.",
    link: "https://videohive.net/item/...",
    category: "Videohive",
    tags: ["AfterEffects", "Слайдшоу", "3D"],
    price: 10,
    contribution: 100,
    currentParticipants: 10,
    neededParticipants: 20,
    status: "active", // active, fundraising, completed
    videos: {
        youtube: "https://www.youtube.com/embed/dQw4w9WgXcQ", // Пример (Рик Ролл :))
        vk: "", 
        rutube: ""
    },
    cover: "icons/Ничего нет без фона.png" // Заглушка
};

// Открыть страницу товара
function openProduct(id) {
    // 1. Скрываем нижнее меню (оно не нужно на странице товара)
    document.querySelector('.bottom-nav').style.display = 'none';
    
    // 2. Заполняем данные (Mock)
    document.getElementById('product-header-title').innerText = mockProduct.title;
    document.getElementById('product-desc').innerText = mockProduct.description;
    document.getElementById('product-category').innerText = "#" + mockProduct.category;
    document.getElementById('product-tags').innerText = mockProduct.tags.map(t => "#" + t).join(" ");
    document.getElementById('product-price-orig').innerText = "$" + mockProduct.price;
    document.getElementById('product-price-contrib').innerText = mockProduct.contribution + "₽";
    
    // Участники
    document.getElementById('participants-count').innerText = `${mockProduct.currentParticipants}/${mockProduct.neededParticipants}`;
    let percent = (mockProduct.currentParticipants / mockProduct.neededParticipants) * 100;
    document.getElementById('product-progress-fill').style.width = percent + "%";
    
    // Логика статусов (цвета бара и кнопки)
    updateProductStatusUI(mockProduct.status);

    // Видео (включаем YouTube по умолчанию)
    switchVideo('youtube');

    // 3. Показываем экран
    // Прямо вызываем переключение видимости классов, минуя switchView для этого кейса, 
    // или дорабатываем switchView. Но проще вручную:
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.getElementById('view-product').classList.add('active');
}

// Закрыть страницу товара
function closeProduct() {
    // Очищаем iframe чтобы звук не играл
    document.getElementById('main-video-frame').src = "";
    
    // Возвращаем нижнее меню и переходим в каталог
    switchView('catalog');
}

// Переключение видео
function switchVideo(platform) {
    const iframe = document.getElementById('main-video-frame');
    const placeholder = document.getElementById('no-video-placeholder');
    const btns = document.querySelectorAll('.platform-btn');
    
    // Убираем класс active у всех кнопок
    btns.forEach(b => b.classList.remove('active'));
    
    // Ставим active нажатой
    const btn = document.getElementById(`btn-${platform}`);
    if(btn) btn.classList.add('active');

    // Логика смены src
    let videoUrl = mockProduct.videos[platform];
    
    if (videoUrl) {
        iframe.style.display = 'block';
        placeholder.style.display = 'none';
        iframe.src = videoUrl;
    } else {
        // Если ссылки на эту платформу нет - показываем заглушку
        iframe.style.display = 'none';
        placeholder.style.display = 'block';
        document.getElementById('product-cover-img').src = mockProduct.cover;
        iframe.src = ""; // Остановить воспроизведение
    }
}

// Логика UI в зависимости от статуса
function updateProductStatusUI(status) {
    const progressBar = document.getElementById('product-progress-fill');
    const actionBtn = document.getElementById('product-action-btn');
    const statusText = document.getElementById('product-status-text');
    const fundraisingRow = document.getElementById('fundraising-label-row');
    const leaveBtn = document.getElementById('product-leave-btn');

    // Сброс классов
    progressBar.className = 'progress-fill'; 
    fundraisingRow.style.display = 'none';
    leaveBtn.style.display = 'none';

    if (status === 'active') {
        progressBar.classList.add('green-gradient'); // Зелено-желтый градиент из CSS
        actionBtn.innerText = "Записаться";
        actionBtn.disabled = false;
        statusText.innerText = "Активная складчина";
        
        // Пример: если записан
        // actionBtn.innerText = "Вы записаны";
        // actionBtn.style.background = "transparent";
        // actionBtn.style.border = "1px solid #3d4258";
        // leaveBtn.style.display = "flex";

    } else if (status === 'fundraising') {
        progressBar.classList.add('blue'); // Синий цвет (нужно добавить в CSS класс .blue или использовать inline)
        // В CSS мы добавили .progress-fill.blue { background: #0984e3; }
        
        actionBtn.innerText = "Оплатить взнос";
        statusText.innerText = "Идёт сбор средств";
        
        // Показываем доп. строку прогресса
        fundraisingRow.style.display = 'flex';
        document.getElementById('fundraising-count').innerText = "5/10"; // Заглушка
    }
}

function handleProductAction() {
    alert("Действие кнопки (Запись/Оплата)");
}

function leaveProduct() {
    alert("Выход из складчины");
}