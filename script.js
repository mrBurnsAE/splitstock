// ==========================================
// ЧАСТЬ 1: НАСТРОЙКИ, НАВИГАЦИЯ, МОДАЛКИ
// ==========================================

const API_BASE_URL = "https://api.splitstock.ru";

const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// Получаем ID пользователя
let USER_ID = tg.initDataUnsafe?.user?.id;
const urlParams = new URLSearchParams(window.location.search);
const debugId = urlParams.get('uid');
if (debugId) USER_ID = parseInt(debugId);
if (!USER_ID) USER_ID = 0;

console.log("WebApp initialized. User ID:", USER_ID);

// --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---
window.currentVideoLinks = {};
window.currentItemId = null;
window.currentSearchQuery = "";
window.pendingPaymentType = null;
window.currentUserStatus = null; 

// Навигация
window.currentCategoryDetailsId = null;
window.isMyItemsContext = false;
window.currentMyItemsType = 'active';

// Фильтр
window.filterState = { sort: 'new', categories: [], tags: [] };

// --- ЛОВУШКА ОШИБОК (Оставь для отладки) ---
window.onerror = function(message, source, lineno, colno, error) {
    // alert("Error: " + message + " at line " + lineno); // Можно раскомментировать если снова будут проблемы
};

// --- ИНИЦИАЛИЗАЦИЯ ---
document.addEventListener("DOMContentLoaded", () => {
    try {
        console.log("DOM Loaded. Starting...");
        loadUserProfile();
        loadCategories(); 
        loadTags();       
        loadHomeItems(); 
        loadItems('active'); 

        const searchInput = document.querySelector('.search-input');
        const filterBtn = document.querySelector('.filter-btn');

        if (searchInput) {
            searchInput.addEventListener('keypress', function (e) {
                if (e.key === 'Enter') {
                    performSearch(this.value);
                    this.blur();
                }
            });
        }
        if (filterBtn) filterBtn.onclick = openFilter;

    } catch (e) { console.error("Init error:", e); }
});

function getHeaders() {
    const uidStr = USER_ID ? USER_ID.toString() : "0";
    return { 'Content-Type': 'application/json', 'X-Telegram-User-Id': uidStr };
}

// --- НАВИГАЦИЯ (SWITCH VIEW) ---
function switchView(viewName) {
    // Скрываем все экраны
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    // Показываем нужный
    const target = document.getElementById(`view-${viewName}`);
    if (target) target.classList.add('active');
    
    // Управление нижним меню
    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) {
        if(['product', 'filter', 'categories', 'category-details', 'my-items'].includes(viewName)) {
            bottomNav.style.display = 'none';
        } else {
            bottomNav.style.display = 'flex';
        }
    }

    if (['home', 'catalog', 'profile'].includes(viewName)) {
        updateBottomNav(viewName);
    }

    if (viewName === 'categories') {
        loadFullCategoriesList();
    }
}

function updateBottomNav(activeView) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const iconHome = document.getElementById('icon-home');
    const iconCatalog = document.getElementById('icon-catalog');
    const iconProfile = document.getElementById('icon-profile');
    
    if(iconHome) iconHome.src = 'icons/home.svg';
    if(iconCatalog) iconCatalog.src = 'icons/apps.svg';
    if(iconProfile) iconProfile.src = 'icons/user.svg';

    if(activeView === 'home') {
        document.querySelector('.nav-item:nth-child(2)')?.classList.add('active');
        if(iconHome) iconHome.src = 'icons/home active.svg';
    } else if(activeView === 'catalog') {
        document.querySelector('.nav-item:nth-child(1)')?.classList.add('active');
        if(iconCatalog) iconCatalog.src = 'icons/apps active.svg';
    } else if(activeView === 'profile') {
        document.querySelector('.nav-item:nth-child(3)')?.classList.add('active');
        if(iconProfile) iconProfile.src = 'icons/user active.svg';
    }
}

// --- МОДАЛЬНЫЕ ОКНА ---
function openModal() { 
    const el = document.getElementById('modal-status');
    if(el) el.classList.add('open'); 
}
function closeModal() { 
    const el = document.getElementById('modal-status');
    if(el) el.classList.remove('open'); 
}

function openPaymentModal(type) {
    window.pendingPaymentType = type;
    const el = document.getElementById('modal-payment');
    if(el) el.classList.add('open');
}

function closePaymentModal() {
    const el = document.getElementById('modal-payment');
    if(el) el.classList.remove('open');
    window.pendingPaymentType = null;
}

// --- НОВАЯ ФУНКЦИЯ ПРОВЕРКИ ШТРАФА ---
function checkPenaltyAndPay() {
    if (window.currentUserStatus === 'Штрафник') {
        updateStatusModal('Штрафник', 0);
        openModal();
    } else {
        openPaymentModal('item');
    }
}

// --- ОТКРЫТИЕ РАЗДЕЛОВ ---
function openMyItems(type) {
    window.isMyItemsContext = true;
    window.currentCategoryDetailsId = null;
    window.currentMyItemsType = type;

    const titleEl = document.getElementById('my-items-title');
    if (titleEl) {
        titleEl.innerText = (type === 'active') ? 'Мои активные складчины' : 'Мои завершённые складчины';
    }

    switchView('my-items');
    loadMyItems(type);
}

function openCategoryDetails(id, name) {
    window.currentCategoryDetailsId = id;
    window.isMyItemsContext = false;
    
    const titleEl = document.getElementById('cat-details-title');
    if (titleEl) titleEl.innerText = name;
    
    document.querySelectorAll('#view-category-details .tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-cat-active').classList.add('active');
    
    switchView('category-details');
    loadCategoryItems('active');
}

function openFilter() { switchView('filter'); }
function closeFilter() { switchView('catalog'); }

// --- ВСПОМОГАТЕЛЬНЫЕ ---
function formatDate(isoString) {
    if(!isoString) return "";
    try {
        const d = new Date(isoString);
        return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    } catch(e) { return ""; }
}

// ==========================================
// ЧАСТЬ 2: ЗАГРУЗКА ДАННЫХ И ЛОГИКА ТОВАРА
// ==========================================

// --- ЗАГРУЗЧИКИ СПИСКОВ ---

async function loadMyItems(type) {
    const container = document.getElementById('my-items-container');
    if (!container) return;
    container.innerHTML = '<div style="padding:20px; text-align:center;">Загрузка...</div>';
    
    try {
        let url = `${API_BASE_URL}/api/items?type=${type}&joined=true&page=1&sort=new&t=${Date.now()}`;
        const response = await fetch(url, { headers: getHeaders() });
        const items = await response.json();
        renderItems(container, items);
    } catch (error) {
        console.error("My items error:", error);
        container.innerHTML = '<div style="padding:20px; text-align:center;">Ошибка загрузки</div>';
    }
}

async function loadCategoryItems(type) {
    const container = document.getElementById('category-details-container');
    if (!container) return;
    container.innerHTML = '<div style="padding:20px; text-align:center;">Загрузка...</div>';
    
    try {
        const catId = window.currentCategoryDetailsId;
        let url = `${API_BASE_URL}/api/items?type=${type}&cat=${catId}&page=1&sort=new&t=${Date.now()}`;
        const response = await fetch(url, { headers: getHeaders() });
        const items = await response.json();
        renderItems(container, items);
    } catch (error) {
        console.error("Cat items error:", error);
        container.innerHTML = '<div style="padding:20px; text-align:center;">Ошибка загрузки</div>';
    }
}

async function loadItems(type) {
    const container = document.querySelector('#view-catalog .item-container');
    if(!container) return;
    container.innerHTML = '<div style="padding:20px; text-align:center;">Загрузка...</div>';

    try {
        let url = `${API_BASE_URL}/api/items?type=${type}&page=1`;
        if (type === 'all') url += '&joined=true'; // Для "Моих" во вкладках каталога

        if (window.filterState.categories.length > 0) url += `&cat=${window.filterState.categories.join(',')}`;
        if (window.filterState.tags.length > 0) url += `&tags=${window.filterState.tags.join(',')}`;
        url += `&sort=${window.filterState.sort}`;
        if (window.currentSearchQuery) url += `&q=${encodeURIComponent(window.currentSearchQuery)}`;
        url += `&t=${Date.now()}`;

        const response = await fetch(url, { headers: getHeaders() });
        const items = await response.json();
        
        container.innerHTML = '';
        if (items.length === 0) {
            let msg = "Здесь пока ничего нет...";
            let img = "icons/Ничего нет без фона.png";
            if (window.currentSearchQuery || window.filterState.categories.length > 0) {
                msg = "Ничего не найдено...";
                img = "icons/Поиск без фона.png";
            }
            container.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; height: 50vh;">
                    <img src="${img}" style="width: 140px; margin-bottom: 20px; opacity: 0.9;">
                    <div style="color: #a2a5b9; font-size: 16px; font-weight: 600;">${msg}</div>
                </div>`;
            return;
        }
        items.forEach(item => container.appendChild(createItemCard(item)));
    } catch (error) { 
        console.error("Load Items Error:", error); 
        container.innerHTML = '<div style="padding:20px; text-align:center; color:#ff7675;">Ошибка загрузки</div>';
    }
}

function renderItems(container, items) {
    container.innerHTML = '';
    if (items.length === 0) {
        let img = "icons/Ничего нет без фона.png";
        container.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; height: 50vh;">
                <img src="${img}" style="width: 140px; margin-bottom: 20px; opacity: 0.9;">
                <div style="color: #a2a5b9; font-size: 16px; font-weight: 600;">Список пуст</div>
            </div>`;
        return;
    }
    items.forEach(item => container.appendChild(createItemCard(item)));
}

// --- КАРТОЧКИ ---
function createItemCard(item) {
    const card = document.createElement('div');
    card.className = 'big-card';
    card.onclick = () => openProduct(item.id);
    
    let statusText = "Активная складчина";
    let badgeColor = "#00cec9";
    let percent = 0;
    let barClass = "progress-fill";

    // Логика прогресса
    if (item.needed_participants > 0) {
        if (item.status === 'fundraising') {
            percent = (item.paid_participants / item.needed_participants) * 100;
            barClass += " blue";
        } else {
            percent = (item.current_participants / item.needed_participants) * 100;
            barClass += " gradient";
        }
    }
    if (percent > 100) percent = 100;

    // Логика статусов
    if (item.status === 'published' || item.status === 'active' || item.status === 'scheduled') {
        if (item.is_joined) statusText = "✅ Вы участвуете";
    } else if (item.status === 'fundraising') {
        const endDate = formatDate(item.end_at);
        if (!item.is_joined) {
            statusText = "Идёт сбор средств"; badgeColor = "#0984e3";
        } else {
            if (item.payment_status === 'paid') { statusText = "✅ Взнос оплачен"; badgeColor = "#2ecc71"; }
            else { statusText = `⚠️ Оплатить до ${endDate}`; badgeColor = "#ff7675"; }
        }
    } else if (item.status === 'fundraising_scheduled') {
        const dateStr = formatDate(item.start_at);
        barClass = "progress-fill blue"; percent = 0;
        if (item.is_joined) { statusText = `✅ Сбор с ${dateStr}`; badgeColor = "#2ecc71"; }
        else { statusText = `⚠️ Сбор с ${dateStr}`; badgeColor = "#ff7675"; }
    } else if (item.status === 'completed') {
        statusText = "Завершена"; barClass = "progress-fill blue"; badgeColor = "#a2a5b9"; percent = 100;
        if (item.payment_status === 'paid') { statusText = "✅ Доступно"; badgeColor = "#2ecc71"; }
    }

    const imgSrc = item.cover_url || "icons/Ничего нет без фона.png"; 
    card.innerHTML = `
        <div class="card-media">
            <img src="${imgSrc}" style="width:100%; height:100%; object-fit:cover; opacity:0.8;">
        </div>
        <div class="card-content">
            <div class="item-name">${item.name}</div>
            <div class="progress-section">
                <div class="progress-text">
                    <span>Участники: ${item.current_participants}/${item.needed_participants}</span>
                </div>
                <div class="progress-bar">
                    <div class="${barClass}" style="width: ${percent}%;"></div>
                </div>
            </div>
            <div class="status-badge" style="color: ${badgeColor};"><div>${statusText}</div></div>
        </div>
    `;
    return card;
}

// --- ОТКРЫТИЕ ТОВАРА ---
async function openProduct(id) {
    const bottomNav = document.querySelector('.bottom-nav');
    if(bottomNav) bottomNav.style.display = 'none';
    
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.getElementById('view-product').classList.add('active');
    
    // Сброс UI
    document.getElementById('product-header-title').innerText = "Загрузка...";
    switchVideo('none');
    window.currentItemId = id;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/items/${id}?t=${Date.now()}`, { headers: getHeaders() });
        const item = await response.json();
        
        document.getElementById('product-header-title').innerText = item.name;
        document.getElementById('product-desc').innerText = item.description || "Описание отсутствует";
        
        const linkEl = document.getElementById('product-link-ext');
        linkEl.onclick = (e) => { e.preventDefault(); tg.openLink(item.link); };

        document.getElementById('product-category').innerText = item.category ? "#" + item.category : "";
        document.getElementById('product-tags').innerText = (item.tags || []).map(t => "#" + t).join(" ");
        document.getElementById('product-price-orig').innerText = "$" + item.price;
        
        let contribution = (item.status === 'completed') ? "200₽" : "100₽";
        document.getElementById('product-price-contrib').innerText = contribution;
        
        document.getElementById('participants-count').innerText = `${item.current_participants}/${item.needed_participants}`;
        const paidCount = item.paid_participants || 0;
        const fundCountEl = document.getElementById('fundraising-count');
        if(fundCountEl) fundCountEl.innerText = `${paidCount}/${item.needed_participants}`;

        let percent = 0;
        const bar = document.getElementById('product-progress-fill');
        bar.className = 'progress-fill';

        if (item.needed_participants > 0) {
            if (item.status === 'fundraising') {
                percent = (paidCount / item.needed_participants) * 100;
                bar.classList.add('blue');
            } else {
                percent = (item.current_participants / item.needed_participants) * 100;
                bar.classList.add('gradient');
            }
        }
        if (percent > 100) percent = 100;
        bar.style.width = percent + "%";
        
        updateProductStatusUI(item.status, item.is_joined, item.payment_status, item.start_at, item.end_at);
        
        const coverImg = document.getElementById('product-cover-img');
        coverImg.src = item.cover_url || "icons/Ничего нет без фона.png";

        window.currentVideoLinks = item.videos || {};
        if (Object.keys(window.currentVideoLinks).length > 0) {
            document.getElementById('video-switchers').style.display = 'flex';
            if (window.currentVideoLinks.youtube) switchVideo('youtube');
            else if (window.currentVideoLinks.vk) switchVideo('vk');
            else switchVideo('rutube');
        } else {
            document.getElementById('video-switchers').style.display = 'none';
            switchVideo('none');
        }

    } catch (error) { console.error(error); closeProduct(); }
}

function closeProduct() {
    document.getElementById('main-video-frame').src = "";
    if(window.isMyItemsContext) {
        switchView('my-items');
        loadMyItems(window.currentMyItemsType);
    } else if(window.currentCategoryDetailsId) {
        switchView('category-details');
    } else {
        switchView('catalog');
        loadItems('active');
    }
}

function updateProductStatusUI(status, isJoined, paymentStatus, startAt, endAt) {
    const actionBtn = document.getElementById('product-action-btn');
    const statusText = document.getElementById('product-status-text');
    const fundraisingRow = document.getElementById('fundraising-label-row');
    const leaveBtn = document.getElementById('product-leave-btn');

    if (fundraisingRow) fundraisingRow.style.display = 'none';
    if (leaveBtn) leaveBtn.style.display = 'none';
    statusText.style.color = "";

    // Сброс кнопки
    actionBtn.disabled = false;
    actionBtn.style.opacity = "1";
    actionBtn.style.backgroundColor = ""; 
    actionBtn.onclick = handleProductAction;

    if (status === 'published' || status === 'active' || status === 'scheduled') {
        statusText.innerText = "Активная складчина";
        if (isJoined) {
            actionBtn.innerText = "Вы записаны"; actionBtn.disabled = true; actionBtn.style.opacity = "0.7";
            leaveBtn.style.display = 'flex'; 
        } else { actionBtn.innerText = "Записаться"; }
    } 
    else if (status === 'fundraising_scheduled') {
        const dateStr = formatDate(startAt);
        statusText.innerText = `Сбор средств назначен на ${dateStr}`;
        if (isJoined) {
            actionBtn.innerText = "Вы записаны"; actionBtn.disabled = true; actionBtn.style.opacity = "0.7";
        } else { actionBtn.innerText = "Записаться"; }
    }
    else if (status === 'fundraising') {
        const endDate = formatDate(endAt);
        statusText.innerText = `Идёт сбор средств до ${endDate}`;
        if (fundraisingRow) fundraisingRow.style.display = 'flex';
        
        if (isJoined) {
            if (paymentStatus === 'paid') {
                actionBtn.innerText = "Оплачено"; actionBtn.disabled = true; actionBtn.style.backgroundColor = "#2ecc71";
            } else {
                actionBtn.innerText = "Оплатить взнос";
                actionBtn.onclick = () => checkPenaltyAndPay();
            }
        } else { actionBtn.innerText = "Набор закрыт"; actionBtn.disabled = true; }
    } 
    else if (status === 'completed') {
        statusText.innerText = "Складчина завершена";
        if (isJoined && paymentStatus !== 'paid') {
            actionBtn.innerText = "Оплатить (200₽)";
            actionBtn.style.backgroundColor = "#fdcb6e"; actionBtn.style.color = "#2d3436";
            actionBtn.onclick = () => checkPenaltyAndPay();
        } else {
            actionBtn.innerText = "Завершена"; actionBtn.disabled = true;
        }
    }
}

async function handleProductAction() {
    const btn = document.getElementById('product-action-btn');
    const originalText = btn.innerText;
    btn.innerText = "⏳..."; btn.disabled = true;

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
                updateStatusModal('Штрафник', 0);
                openModal();
            } else {
                alert("Ошибка: " + (result.message || "Не удалось"));
            }
            btn.innerText = originalText; btn.disabled = false;
        }
    } catch (error) {
        console.error(error); alert("Ошибка соединения"); btn.innerText = originalText; btn.disabled = false;
    }
}

async function leaveProduct() {
    if (!confirm("Точно хотите выйти?")) return;
    const btn = document.getElementById('product-leave-btn');
    btn.disabled = true;
    try {
        const response = await fetch(`${API_BASE_URL}/api/leave`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ user_id: USER_ID, item_id: window.currentItemId })
        });
        const result = await response.json();
        if (result.success) openProduct(window.currentItemId);
        else {
            if(result.error === 'locked') alert('Уже нельзя выйти.');
            else alert("Ошибка выхода");
            btn.disabled = false;
        }
    } catch (error) { console.error(error); alert("Ошибка"); btn.disabled = false; }
}

async function selectPaymentMethod(method) {
    if (!window.pendingPaymentType) return;
    const modalContent = document.querySelector('#modal-payment .modal-content');
    modalContent.style.opacity = '0.5';
    try {
        const body = {
            user_id: USER_ID, method: method, type: window.pendingPaymentType,
            item_id: (window.pendingPaymentType === 'item') ? window.currentItemId : 0
        };
        const response = await fetch(`${API_BASE_URL}/api/payment/init`, {
            method: 'POST', headers: getHeaders(), body: JSON.stringify(body)
        });
        const result = await response.json();
        if (result.success) tg.close(); 
        else { alert("Ошибка: " + result.error); modalContent.style.opacity = '1'; }
    } catch (error) { console.error(error); alert("Ошибка"); modalContent.style.opacity = '1'; }
}

// --- ПРОФИЛЬ И ЗАГРУЗЧИКИ ---
async function loadUserProfile() {
    if (!USER_ID) return;
    try {
        const response = await fetch(`${API_BASE_URL}/api/user/${USER_ID}`, { headers: getHeaders() });
        const user = await response.json();
        
        window.currentUserStatus = user.status;
        
        const headerName = document.getElementById('header-username');
        if(headerName) headerName.innerText = user.first_name || user.username || "Пользователь";

        const profileName = document.getElementById('profile-username');
        if(profileName) profileName.innerText = user.first_name || user.username || "Пользователь";

        const profileStatus = document.getElementById('profile-status-text');
        if(profileStatus) profileStatus.innerText = user.status;

        const profileActive = document.getElementById('profile-active-count');
        if(profileActive) profileActive.innerText = user.active_count;

        const profileCompleted = document.getElementById('profile-completed-count');
        if(profileCompleted) profileCompleted.innerText = user.completed_count;

        const dateEl = document.getElementById('profile-join-date');
        if(dateEl && user.registration_date) {
            const d = new Date(user.registration_date);
            dateEl.innerText = `Участник с ${d.toLocaleDateString('ru-RU')}`;
        }
        updateStatusModal(user.status, user.completed_count);
    } catch (e) { console.error("Profile load error:", e); }
}

function updateStatusModal(status, completedCount) {
    const title = document.getElementById('modal-status-title');
    const desc = document.getElementById('modal-status-desc');
    const img = document.getElementById('modal-status-img');
    const okBtn = document.getElementById('modal-status-ok-btn');
    const penaltyBtns = document.getElementById('modal-status-penalty-btns');

    if(title) title.innerText = status;
    if(okBtn) okBtn.style.display = 'block';
    if(penaltyBtns) penaltyBtns.style.display = 'none';

    if (status === 'Новичок') {
        const needed = Math.max(0, 10 - completedCount);
        if(desc) desc.innerText = `Для получения статуса "Опытный" осталось завершить ещё ${needed} складчин`;
        if(img) img.src = "icons/Новичок Без фона.png";
    } else if (status === 'Опытный') {
        if(desc) desc.innerText = "Теперь вы можете оплачивать взносы в завершённых складчинах";
        if(img) img.src = "icons/Супермэн без фона.png";
    } else if (status === 'Штрафник') {
        if(desc) desc.innerText = "Вы не можете записываться в новые складчины и оплачивать взносы, пока не оплатите штраф";
        if(img) img.src = "icons/Штрафник без фона.png";
        if(okBtn) okBtn.style.display = 'none';
        if(penaltyBtns) penaltyBtns.style.display = 'flex';
    }
}

// --- VIDEO PLAYER UTILS ---
function switchVideo(platform) {
    const wrapper = document.getElementById('video-wrapper-el');
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
    
    if (!videoUrl) { showPlaceholder(); return; }

    if (videoUrl.includes('<iframe')) {
        const match = videoUrl.match(/src=["']([^"']+)["']/);
        if (match) videoUrl = match[1];
    }
    
    if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
        if (videoUrl.includes('watch?v=')) videoUrl = videoUrl.replace('watch?v=', 'embed/').split('&')[0];
        else if (videoUrl.includes('youtu.be/')) videoUrl = videoUrl.replace('youtu.be/', 'youtube.com/embed/');
    }
    else if (videoUrl.includes('vk.com/video')) {
        const match = videoUrl.match(/video(-?\d+)_(\d+)/);
        if (match) videoUrl = `https://vk.com/video_ext.php?oid=${match[1]}&id=${match[2]}&hd=2`;
    }
    else if (videoUrl.includes('rutube.ru/video/')) {
        videoUrl = videoUrl.replace('rutube.ru/video/', 'rutube.ru/play/embed/');
    }

    if (platform !== 'none') {
        if (iframe) { iframe.style.display = 'block'; iframe.src = videoUrl; }
        if (placeholder) placeholder.style.display = 'none';
        if (wrapper) wrapper.classList.add('video-mode');
    } else { showPlaceholder(); }
}

function showPlaceholder() {
    const wrapper = document.getElementById('video-wrapper-el');
    const iframe = document.getElementById('main-video-frame');
    const placeholder = document.getElementById('no-video-placeholder');
    if (iframe) iframe.style.display = 'none';
    if (placeholder) placeholder.style.display = 'block';
    if (wrapper) wrapper.classList.remove('video-mode');
}

// --- TABS & FILTERS ---
function selectTab(el) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    let type = 'active';
    if (el.innerText.includes('Завершённые')) type = 'completed';
    else if (el.innerText.includes('Мои')) type = 'all';
    loadItems(type);
}

function selectTabByName(name) {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(t => { if(t.innerText.includes(name)) selectTab(t); });
}

function selectSort(sort, btn) {
    window.filterState.sort = sort;
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function toggleCategory(id, btn) {
    const idx = window.filterState.categories.indexOf(id);
    if(idx===-1) { window.filterState.categories.push(id); btn.classList.add('active'); }
    else { window.filterState.categories.splice(idx,1); btn.classList.remove('active'); }
}

function toggleTag(tag, btn) {
    const idx = window.filterState.tags.indexOf(tag);
    if(idx===-1) { window.filterState.tags.push(tag); btn.classList.add('active'); }
    else { window.filterState.tags.splice(idx,1); btn.classList.remove('active'); }
}

function resetFilter() {
    window.filterState = {sort:'new', categories:[], tags:[]};
    document.querySelectorAll('.sort-btn').forEach(b=>b.classList.remove('active'));
    document.querySelector('.sort-btn').classList.add('active');
    document.querySelectorAll('.chip-btn').forEach(b=>b.classList.remove('active'));
}

function applyFilter() {
    closeFilter();
    let type = 'active';
    const activeTab = document.querySelector('.tab.active');
    if(activeTab && activeTab.innerText.includes('Завершённые')) type = 'completed';
    else if(activeTab && activeTab.innerText.includes('Мои')) type = 'all';
    loadItems(type);
}

function loadCategories() {
    fetch(`${API_BASE_URL}/api/categories`, {headers:getHeaders()}).then(r=>r.json()).then(cats=>{
        const homeGrid = document.querySelector('.categories-grid');
        if(homeGrid) {
            homeGrid.innerHTML = '';
            cats.slice(0,4).forEach(c => {
                const d = document.createElement('div'); d.className='category-card'; d.innerText=c.name;
                d.onclick=()=>{ openCategoryDetails(c.id, c.name); };
                homeGrid.appendChild(d);
            });
        }
        const filterCont = document.getElementById('filter-categories-container');
        if(filterCont) {
            filterCont.innerHTML='';
            cats.forEach(c=>{
                const b=document.createElement('div'); b.className='chip-btn'; b.innerText=c.name;
                b.onclick=()=>toggleCategory(c.id, b);
                filterCont.appendChild(b);
            });
        }
    });
}

function loadTags() {
    fetch(`${API_BASE_URL}/api/tags`, {headers:getHeaders()}).then(r=>r.json()).then(tags=>{
        const cont = document.getElementById('filter-tags-container');
        if(cont) {
            cont.innerHTML='';
            tags.forEach(t=>{
                const b=document.createElement('div'); b.className='chip-btn'; b.innerText=t;
                b.onclick=()=>toggleTag(t,b);
                cont.appendChild(b);
            });
        }
    });
}

function loadHomeItems() {
    const cont = document.getElementById('home-item-container');
    if(!cont) return;
    fetch(`${API_BASE_URL}/api/items?type=active&page=1&sort=new`, {headers:getHeaders()}).then(r=>r.json()).then(items=>{
        cont.innerHTML='';
        if(items.length===0) cont.innerHTML='<div style="padding:20px;text-align:center;">Пусто</div>';
        items.slice(0,5).forEach(i=>cont.appendChild(createItemCard(i)));
    });
}

function performSearch(q) {
    window.currentSearchQuery = q.trim();
    switchView('catalog');
    const activeTab = document.querySelector('.tab.active');
    let type = 'active';
    if(activeTab && activeTab.innerText.includes('Завершённые')) type = 'completed';
    else if(activeTab && activeTab.innerText.includes('Мои')) type = 'all';
    loadItems(type);
}