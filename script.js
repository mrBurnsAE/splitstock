// --- НАСТРОЙКИ ---
const API_BASE_URL = "https://api.splitstock.ru";

// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand();

const USER_ID = tg.initDataUnsafe?.user?.id || 123456789; 

window.currentVideoLinks = {};
window.currentItemId = null;
window.currentItemStatus = null;

document.addEventListener("DOMContentLoaded", () => {
    loadUserProfile();
    loadCategories();
    loadItems('active');
});

function getHeaders() {
    return {
        'Content-Type': 'application/json',
        'X-Telegram-User-Id': USER_ID.toString()
    };
}

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

function switchView(viewName) {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${viewName}`).classList.add('active');
    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) bottomNav.style.display = 'flex';
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
        const activeTab = document.querySelector('.tab.active');
        if(activeTab) selectTab(activeTab);
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
    else if (tabName.includes("Мои")) loadItems('active'); 
}

// Форматирование даты
function formatDate(isoString) {
    if (!isoString) return "";
    try {
        const date = new Date(isoString);
        return date.toLocaleString('ru-RU', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow'
        }) + " (МСК)";
    } catch (e) {
        console.error("Date error", e);
        return "";
    }
}

// --- API ---

async function loadUserProfile() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/user/${USER_ID}`, { headers: getHeaders() });
        const user = await response.json();
        document.querySelectorAll('.user-name').forEach(el => {
            el.innerText = user.first_name || user.username || "User";
        });
        const dateEl = document.querySelector('#view-profile p');
        if(dateEl && user.registration_date) {
            const dateStr = user.registration_date.split(' ')[0]; 
            dateEl.innerText = `Участник с ${dateStr}`;
        }
        const stats = document.querySelectorAll('.profile-menu .profile-btn div div:last-child');
        if(stats.length >= 3) {
            stats[0].innerText = user.status;
            stats[1].innerText = user.active_count;
            stats[2].innerText = user.completed_count;
        }
    } catch (error) { console.error(error); }
}

async function loadCategories() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/categories`, { headers: getHeaders() });
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
        const response = await fetch(url, { headers: getHeaders() });
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

            if (item.status === 'published' || item.status === 'active' || item.status === 'scheduled') {
                statusText = "Активная складчина";
                barColor = "background: linear-gradient(90deg, #00b894 0%, #00cec9 100%);";
                badgeColor = "#00cec9";
            } else if (item.status === 'fundraising') {
                statusText = "Идёт сбор средств";
                barColor = "background: #0984e3;";
                badgeColor = "#0984e3";
            } else if (item.status === 'fundraising_scheduled') {
                statusText = "Сбор назначен"; // В каталоге кратко
                barColor = "background: #0984e3;"; 
                badgeColor = "#0984e3";
            } else if (item.status === 'completed') {
                statusText = "Завершена";
                barColor = "background: #a2a5b9;";
                badgeColor = "#a2a5b9";
                percent = 100;
            }

            if (item.is_joined) {
                statusText = "✅ Вы участвуете";
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

async function openProduct(id) {
    document.querySelector('.bottom-nav').style.display = 'none';
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.getElementById('view-product').classList.add('active');
    
    document.getElementById('product-header-title').innerText = "Загрузка...";
    document.getElementById('product-desc').innerText = "...";
    
    const buttonsContainer = document.getElementById('video-switchers');
    if(buttonsContainer) buttonsContainer.style.display = 'none';
    switchVideo('none');

    window.currentItemId = id;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/items/${id}?t=${Date.now()}`, { headers: getHeaders() });
        const item = await response.json();
        
        window.currentItemStatus = item.status;

        document.getElementById('product-header-title').innerText = item.name;
        document.getElementById('product-desc').innerText = item.description || "Описание отсутствует";
        
        const linkEl = document.getElementById('product-link-ext');
        linkEl.href = item.link;
        linkEl.innerText = "🔗 Подробная информация";

        document.getElementById('product-category').innerText = item.category ? "#" + item.category : "";
        document.getElementById('product-tags').innerText = item.tags.map(t => "#" + t).join(" ");
        document.getElementById('product-price-orig').innerText = "$" + item.price;
        
        let contribution = "100₽"; 
        if (item.status === 'completed') contribution = "200₽"; 
        document.getElementById('product-price-contrib').innerText = contribution;
        
        document.getElementById('participants-count').innerText = `${item.current_participants}/${item.needed_participants}`;
        let percent = 0;
        if (item.needed_participants > 0) percent = (item.current_participants / item.needed_participants) * 100;
        document.getElementById('product-progress-fill').style.width = percent + "%";
        
        // --- ИСПРАВЛЕНИЕ: Передаем дату ---
        updateProductStatusUI(item.status, item.is_joined, item.payment_status, item.start_at);
        
        const coverImg = document.getElementById('product-cover-img');
        coverImg.src = item.cover_url || "";
        coverImg.onerror = function() {
            this.src = "icons/Ничего нет без фона.png"; 
            this.onerror = null;
        };

        window.currentVideoLinks = item.videos || {};
        const hasYoutube = window.currentVideoLinks.youtube && window.currentVideoLinks.youtube.length > 5;
        const hasVk = window.currentVideoLinks.vk && window.currentVideoLinks.vk.length > 5;
        const hasRutube = window.currentVideoLinks.rutube && window.currentVideoLinks.rutube.length > 5;
        const hasAnyVideo = hasYoutube || hasVk || hasRutube;

        if (hasAnyVideo) {
            if(buttonsContainer) buttonsContainer.style.display = 'flex';
            if (hasYoutube) switchVideo('youtube');
            else if (hasVk) switchVideo('vk');
            else if (hasRutube) switchVideo('rutube');
        } else {
            if(buttonsContainer) buttonsContainer.style.display = 'none';
            switchVideo('none'); 
        }

    } catch (error) {
        console.error(error);
        alert("Не удалось загрузить товар");
        closeProduct();
    }
}

function closeProduct() {
    document.getElementById('main-video-frame').src = "";
    loadItems('active');
    switchView('catalog');
}

function switchVideo(platform) {
    const iframe = document.getElementById('main-video-frame');
    const placeholder = document.getElementById('no-video-placeholder');
    const btns = document.querySelectorAll('.platform-btn');
    btns.forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`btn-${platform}`);
    if(btn) btn.classList.add('active');

    let videoUrl = "";
    if (window.currentVideoLinks) {
        if (platform === 'youtube') videoUrl = window.currentVideoLinks.youtube;
        if (platform === 'vk') videoUrl = window.currentVideoLinks.vk;
        if (platform === 'rutube') videoUrl = window.currentVideoLinks.rutube;
    }
    
    if (!videoUrl) {
        showPlaceholder(); return;
    }

    if (videoUrl.includes('<iframe')) {
        const srcMatch = videoUrl.match(/src=["']([^"']+)["']/);
        if (srcMatch && srcMatch[1]) videoUrl = srcMatch[1];
    }
    
    if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
        if (videoUrl.includes('watch?v=')) {
            videoUrl = videoUrl.replace('watch?v=', 'embed/');
            if (videoUrl.includes('&')) videoUrl = videoUrl.split('&')[0];
        } else if (videoUrl.includes('youtu.be/')) {
            videoUrl = videoUrl.replace('youtu.be/', 'youtube.com/embed/');
        }
    }
    else if (videoUrl.includes('vk.com/video')) {
        const match = videoUrl.match(/video(-?\d+)_(\d+)/);
        if (match) {
            const oid = match[1]; const vid = match[2];
            videoUrl = `https://vk.com/video_ext.php?oid=${oid}&id=${vid}&hd=2`;
        }
    }
    else if (videoUrl.includes('rutube.ru/video/')) {
        videoUrl = videoUrl.replace('rutube.ru/video/', 'rutube.ru/play/embed/');
    }

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

// --- УПРАВЛЕНИЕ СТАТУСАМИ (Logic Fixes Here) ---

function updateProductStatusUI(status, isJoined, paymentStatus, startAt) {
    const progressBar = document.getElementById('product-progress-fill');
    const actionBtn = document.getElementById('product-action-btn');
    const statusText = document.getElementById('product-status-text');
    const fundraisingRow = document.getElementById('fundraising-label-row');
    const leaveBtn = document.getElementById('product-leave-btn');

    progressBar.className = 'progress-fill'; 
    fundraisingRow.style.display = 'none';
    leaveBtn.style.display = 'none';
    
    actionBtn.disabled = false;
    actionBtn.style.opacity = "1";
    actionBtn.onclick = handleProductAction;

    // 1. АКТИВНАЯ (Набор)
    if (status === 'published' || status === 'active' || status === 'scheduled') {
        progressBar.classList.add('green-gradient');
        statusText.innerText = "Активная складчина";
        
        if (isJoined) {
            actionBtn.innerText = "Вы записаны";
            actionBtn.disabled = true;
            actionBtn.style.opacity = "0.7";
            leaveBtn.style.display = 'flex'; // Можно выйти
        } else {
            actionBtn.innerText = "Записаться";
        }
    } 
    // 2. СБОР НАЗНАЧЕН (Fundraising Scheduled)
    else if (status === 'fundraising_scheduled') {
        progressBar.classList.add('blue');
        
        const dateStr = formatDate(startAt);
        // Если дата есть - показываем, иначе заглушку
        if (dateStr) {
            statusText.innerText = `Сбор средств назначен на ${dateStr}`;
        } else {
            statusText.innerText = `Сбор средств скоро начнётся`;
        }
        
        if (isJoined) {
            actionBtn.innerText = "Вы записаны";
            actionBtn.disabled = true;
            actionBtn.style.opacity = "0.7";
            leaveBtn.style.display = 'flex';
        } else {
            actionBtn.innerText = "Записаться";
            actionBtn.disabled = false;
        }
    }
    // 3. ИДЁТ СБОР СРЕДСТВ
    else if (status === 'fundraising') {
        progressBar.classList.add('blue');
        statusText.innerText = "Идёт сбор средств";
        fundraisingRow.style.display = 'flex';
        
        if (isJoined) {
            if (paymentStatus === 'paid') {
                actionBtn.innerText = "Оплачено";
                actionBtn.disabled = true;
            } else {
                actionBtn.innerText = "Оплатить взнос";
                actionBtn.onclick = () => { tg.close(); };
            }
            // Кнопка выхода скрыта или вызывает алерт? Обычно в сборе уже нет кнопки.
            // Но если по ТЗ "при попытке выйти...", значит кнопку можно оставить
            leaveBtn.style.display = 'flex'; 
        } else {
            actionBtn.innerText = "Набор закрыт";
            actionBtn.disabled = true;
        }
    } 
    // 4. ЗАВЕРШЕНА
    else if (status === 'completed') {
        actionBtn.innerText = "Завершена";
        actionBtn.disabled = true;
        statusText.innerText = "Складчина завершена";
    }
}

async function handleProductAction() {
    const btn = document.getElementById('product-action-btn');
    const originalText = btn.innerText;
    btn.innerText = "⏳...";
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/api/join`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ user_id: USER_ID, item_id: window.currentItemId })
        });
        
        const result = await response.json();
        
        if (result.success) {
            openProduct(window.currentItemId);
        } else {
            if (result.error === 'penalty') {
                alert("Вы Штрафник! Оплатите штраф в боте.");
                tg.close();
            } else {
                alert("Ошибка: " + (result.message || "Не удалось записаться"));
            }
            btn.innerText = originalText;
            btn.disabled = false;
        }
    } catch (error) {
        console.error(error);
        alert("Ошибка соединения");
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

async function leaveProduct() {
    if (!confirm("Точно хотите выйти из складчины?")) return;
    
    const btn = document.getElementById('product-leave-btn');
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/api/leave`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ user_id: USER_ID, item_id: window.currentItemId })
        });
        
        const result = await response.json();
        
        if (result.success) {
            openProduct(window.currentItemId);
        } else {
            // --- ИСПРАВЛЕНИЕ: Обработка запрета на выход ---
            if (result.error === 'locked') {
                tg.showPopup({
                    title: 'Внимание',
                    message: 'После объявления сбора средств, покинуть складчину невозможно.',
                    buttons: [{type: 'ok'}]
                });
            } else {
                alert("Ошибка: " + (result.error || "Не удалось выйти"));
            }
            btn.disabled = false;
        }
    } catch (error) {
        console.error(error);
        alert("Ошибка соединения");
        btn.disabled = false;
    }
}

function openModal() { document.getElementById('modal-status').classList.add('open'); }
function closeModal() { document.getElementById('modal-status').classList.remove('open'); }