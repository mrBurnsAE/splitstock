// --- НАСТРОЙКИ ---
const API_BASE_URL = "https://api.splitstock.ru";

// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand();

const USER_ID = tg.initDataUnsafe?.user?.id || 123456789; 
window.currentVideoLinks = {};

document.addEventListener("DOMContentLoaded", () => {
    loadUserProfile();
    loadCategories();
    loadItems('active');
});

// --- ЛОГИКА UI ---

function switchView(viewName) {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${viewName}`).classList.add('active');

    document.querySelector('.bottom-nav').style.display = 'flex';
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
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
        const firstTab = document.querySelector('.tab:nth-child(1)');
        if(firstTab) selectTab(firstTab);
    } else if(viewName === 'profile') {
        document.querySelector('.nav-item:nth-child(3)').classList.add('active');
        document.getElementById('icon-home').src = 'icons/home.svg';
        document.getElementById('icon-catalog').src = 'icons/apps.svg';
        document.getElementById('icon-profile').src = 'icons/user active.svg';
        loadUserProfile(); 
    }
}

function selectTab(tabElement) {
    document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
    tabElement.classList.add('active');
    
    const tabName = tabElement.innerText;
    if (tabName.includes("Активные")) loadItems('active');
    else if (tabName.includes("Завершённые")) loadItems('completed');
    else if (tabName.includes("Мои")) {
        loadItems('active'); 
        alert("Раздел 'Мои складчины' в разработке");
    }
}

// --- API ---

async function loadUserProfile() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/user/${USER_ID}`);
        const user = await response.json();
        document.querySelectorAll('.user-name').forEach(el => {
            el.innerText = user.first_name || user.username || "User";
        });
        const dateEl = document.querySelector('#view-profile p');
        if(dateEl && user.registration_date) {
            const dateStr = user.registration_date.split(' ')[0]; 
            dateEl.innerText = `Участник с ${dateStr}`;
        }
    } catch (error) { console.error(error); }
}

async function loadCategories() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/categories`);
        const categories = await response.json();
        const container = document.querySelector('.categories-grid');
        container.innerHTML = '';
        
        categories.forEach(cat => {
            const div = document.createElement('div');
            div.className = 'category-card';
            div.innerText = cat.name;
            div.onclick = () => { switchView('catalog'); loadItems('active', cat.id); };
            container.appendChild(div);
        });
    } catch (error) { console.error(error); }
}

async function loadItems(type, categoryId = null) {
    try {
        let url = `${API_BASE_URL}/api/items?type=${type}&page=1`;
        if (categoryId) url += `&cat=${categoryId}`;
        const response = await fetch(url);
        const items = await response.json();
        
        const catalogView = document.getElementById('view-catalog');
        let container = catalogView.querySelector('.item-container'); 
        
        if (!container) {
            const oldCards = catalogView.querySelectorAll('.big-card');
            oldCards.forEach(c => c.remove());
            container = document.createElement('div');
            container.className = 'item-container';
            catalogView.querySelector('.section').appendChild(container);
        }
        container.innerHTML = '';
        
        if (items.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:20px; color:#a2a5b9;">Здесь пока ничего нет...</div>';
            return;
        }

        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'big-card';
            card.onclick = () => openProduct(item.id);
            
            let statusText = "";
            let barColor = "";
            let badgeColor = "";
            let percent = 0;
            
            if (item.needed_participants > 0) {
                percent = (item.current_participants / item.needed_participants) * 100;
            }

            if (item.status === 'published' || item.status === 'active') {
                statusText = "Активная складчина";
                barColor = "background: linear-gradient(90deg, #00b894 0%, #00cec9 100%);";
                badgeColor = "#00cec9";
            } else if (item.status === 'fundraising') {
                statusText = "Идёт сбор средств";
                barColor = "background: #0984e3;";
                badgeColor = "#0984e3";
            } else if (item.status === 'completed') {
                statusText = "Завершена";
                barColor = "background: #a2a5b9;";
                badgeColor = "#a2a5b9";
                percent = 100;
            }

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
    } catch (error) { console.error(error); }
}

// --- ОТКРЫТИЕ ТОВАРА ---
async function openProduct(id) {
    document.querySelector('.bottom-nav').style.display = 'none';
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.getElementById('view-product').classList.add('active');
    
    document.getElementById('product-header-title').innerText = "Загрузка...";
    document.getElementById('product-desc').innerText = "...";
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/items/${id}`);
        const item = await response.json();
        
        document.getElementById('product-header-title').innerText = item.name;
        document.getElementById('product-desc').innerText = item.description || "Описание отсутствует";
        document.getElementById('product-category').innerText = item.category ? "#" + item.category : "";
        document.getElementById('product-tags').innerText = item.tags.map(t => "#" + t).join(" "); // Теги теперь будут без пробелов (из базы)
        document.getElementById('product-price-orig').innerText = "$" + item.price;
        
        // --- ИСПРАВЛЕНИЕ ЦЕНЫ ---
        let contribution = "100₽"; // По умолчанию 100
        if (item.status === 'completed') {
            contribution = "200₽"; // Для завершенных 200
        }
        document.getElementById('product-price-contrib').innerText = contribution;
        // ------------------------
        
        document.getElementById('participants-count').innerText = `${item.current_participants}/${item.needed_participants}`;
        let percent = (item.current_participants / item.needed_participants) * 100;
        document.getElementById('product-progress-fill').style.width = percent + "%";
        
        updateProductStatusUI(item.status);
        
        window.currentVideoLinks = item.videos || {};
        
        const coverImg = document.getElementById('product-cover-img');
        if (item.cover_url) coverImg.src = item.cover_url;
        else coverImg.src = "icons/Ничего нет без фона.png";

        // Логика авто-выбора видео
        if (item.videos && item.videos.youtube) switchVideo('youtube');
        else if (item.videos && item.videos.vk) switchVideo('vk');
        else if (item.videos && item.videos.rutube) switchVideo('rutube');
        else switchVideo('none'); 

    } catch (error) {
        console.error(error);
        alert("Не удалось загрузить товар");
        closeProduct();
    }
}

function closeProduct() {
    document.getElementById('main-video-frame').src = "";
    switchView('catalog');
}

// --- ИСПРАВЛЕННАЯ ЛОГИКА ВИДЕО ---
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
    
    if (!videoUrl) {
        // Если ссылки нет - показываем заглушку
        showPlaceholder();
        return;
    }

    // --- 1. Если вставили полный код <iframe>, вытаскиваем только ссылку ---
    if (videoUrl.includes('<iframe')) {
        const srcMatch = videoUrl.match(/src=["']([^"']+)["']/);
        if (srcMatch && srcMatch[1]) {
            videoUrl = srcMatch[1];
        }
    }
    
    // --- 2. Логика для YouTube ---
    if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
        if (videoUrl.includes('watch?v=')) {
            videoUrl = videoUrl.replace('watch?v=', 'embed/');
            if (videoUrl.includes('&')) videoUrl = videoUrl.split('&')[0];
        } else if (videoUrl.includes('youtu.be/')) {
            videoUrl = videoUrl.replace('youtu.be/', 'youtube.com/embed/');
        }
    }
    
    // --- 3. Логика для VK Видео ---
    // Превращаем https://vk.com/video-196495662_456245129 
    // В https://vk.com/video_ext.php?oid=-196495662&id=456245129
    else if (videoUrl.includes('vk.com/video')) {
        // Ищем ID видео (цифры с минусом или без)
        const match = videoUrl.match(/video(-?\d+)_(\d+)/);
        if (match) {
            const oid = match[1]; // ID группы/человека
            const vid = match[2]; // ID видео
            videoUrl = `https://vk.com/video_ext.php?oid=${oid}&id=${vid}&hd=2`;
        }
    }

    // --- 4. Логика для RuTube ---
    // Превращаем https://rutube.ru/video/ID/
    // В https://rutube.ru/play/embed/ID/
    else if (videoUrl.includes('rutube.ru/video/')) {
        videoUrl = videoUrl.replace('rutube.ru/video/', 'rutube.ru/play/embed/');
    }

    // Финальная проверка и отображение
    if (platform !== 'none') {
        iframe.style.display = 'block';
        placeholder.style.display = 'none';
        iframe.src = videoUrl;
    } else {
        showPlaceholder();
    }
}

function showPlaceholder() {
    const iframe = document.getElementById('main-video-frame');
    const placeholder = document.getElementById('no-video-placeholder');
    iframe.style.display = 'none';
    placeholder.style.display = 'block';
    iframe.src = "";
}

function updateProductStatusUI(status) {
    const progressBar = document.getElementById('product-progress-fill');
    const actionBtn = document.getElementById('product-action-btn');
    const statusText = document.getElementById('product-status-text');
    const fundraisingRow = document.getElementById('fundraising-label-row');
    const leaveBtn = document.getElementById('product-leave-btn');

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

function handleProductAction() { alert("Эта кнопка скоро заработает!"); }
function leaveProduct() { alert("Выход..."); }
function openModal() { document.getElementById('modal-status').classList.add('open'); }
function closeModal() { document.getElementById('modal-status').classList.remove('open'); }