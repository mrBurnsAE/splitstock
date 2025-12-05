// ==========================================
// ЧАСТЬ 1: НАСТРОЙКИ, НАВИГАЦИЯ, МОДАЛКИ
// ==========================================

const API_BASE_URL = "https://api.splitstock.ru";

const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// --- ИНИЦИАЛИЗАЦИЯ ПОЛЬЗОВАТЕЛЯ И ПАРАМЕТРОВ ---
const urlParams = new URLSearchParams(window.location.search);

let USER_ID = tg.initDataUnsafe?.user?.id;
const debugId = urlParams.get('uid');
if (debugId) USER_ID = parseInt(debugId);
if (!USER_ID) USER_ID = 0;

let startItemId = urlParams.get('item_id');
if (!startItemId && tg.initDataUnsafe?.start_param) {
    const param = tg.initDataUnsafe.start_param;
    if (param.startsWith('open_item_')) {
        startItemId = param.replace('open_item_', '');
    }
}

if (startItemId) {
    window.currentItemId = parseInt(startItemId);
}

console.log("WebApp initialized. User ID:", USER_ID, "Start Item:", startItemId);

window.currentVideoLinks = {};
window.currentSearchQuery = "";
window.pendingPaymentType = null;
window.currentUserStatus = null; 
window.currentCategoryDetailsId = null;
window.isMyItemsContext = false;
window.currentMyItemsType = 'active';
window.filterState = { sort: 'new', categories: [], tags: [] };

// --- ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ (LOADING) ---
document.addEventListener("DOMContentLoaded", async () => {
    try {
        console.log("DOM Loaded. Starting App Initialization...");
        
        // Показываем прелоадер (хотя он и так есть в HTML, для надежности)
        const preloader = document.getElementById('preloader');
        if(preloader) preloader.style.opacity = '1';

        // Запускаем все запросы параллельно и ждем их выполнения
        await Promise.all([
            loadUserProfile(),
            loadBanners(),
            loadCategories(),
            loadTags(),
            loadHomeItems(),
            loadItems('active')
        ]);

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

        // Если есть стартовый товар - открываем его
        if (window.currentItemId) {
            await openProduct(window.currentItemId);
        }

        // Все загружено, скрываем прелоадер
        if(preloader) {
            preloader.style.opacity = '0';
            setTimeout(() => {
                preloader.style.display = 'none';
                
                // Плавно показываем основной вид
                const activeView = document.querySelector('.view.active');
                if(activeView) activeView.classList.add('loaded');
                
            }, 300); // Ждем пока пройдет анимация opacity
        }

    } catch (e) { 
        console.error("Init error:", e);
        // Даже если ошибка, убираем прелоадер, чтобы не висел вечно
        const preloader = document.getElementById('preloader');
        if(preloader) preloader.style.display = 'none';
        showCustomAlert("Ошибка загрузки данных. Проверьте интернет.", "Ошибка");
    }
});

function getHeaders() {
    const uidStr = USER_ID ? USER_ID.toString() : "0";
    return { 'Content-Type': 'application/json', 'X-Telegram-User-Id': uidStr };
}

function checkPenaltyAndPay() {
    if (window.currentUserStatus === 'Штрафник') {
        updateStatusModal('Штрафник', 0);
        openModal();
    } else {
        openPaymentModal('item');
    }
}

async function getFiles() {
    const btn = document.getElementById('product-action-btn');
    const originalText = btn.innerText;
    btn.innerText = "Отправка...";
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/api/files/get`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ user_id: USER_ID, item_id: window.currentItemId })
        });
        const result = await response.json();
        
        if (result.success) {
            showCustomAlert("Файлы отправлены вам в личные сообщения ботом.", "Успешно");
            tg.close();
        } else {
            showCustomAlert("Ошибка: " + (result.error || "Не удалось получить файлы"), "Ошибка");
        }
    } catch (e) {
        showCustomAlert("Ошибка соединения", "Ошибка");
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

function switchView(viewName) {
    document.querySelectorAll('.view').forEach(el => {
        el.classList.remove('active');
        el.classList.remove('loaded'); // Сбрасываем анимацию
    });
    
    const target = document.getElementById(`view-${viewName}`);
    if (target) {
        target.classList.add('active');
        // Небольшой хак для плавного появления при переключении
        setTimeout(() => target.classList.add('loaded'), 10);
    }
    
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

function showCustomAlert(msg, title = "SplitStockBot") {
    const el = document.getElementById('modal-alert');
    const titleEl = document.getElementById('modal-alert-title');
    const msgEl = document.getElementById('modal-alert-msg');
    
    if(titleEl) titleEl.innerText = title;
    if(msgEl) msgEl.innerText = msg;
    if(el) el.classList.add('open');
}

function closeAlertModal() {
    const el = document.getElementById('modal-alert');
    if(el) el.classList.remove('open');
}

function openModal() { document.getElementById('modal-status').classList.add('open'); }
function closeModal() { document.getElementById('modal-status').classList.remove('open'); }

function openPaymentModal(type) {
    window.pendingPaymentType = type;
    document.getElementById('modal-payment').classList.add('open');
}

function closePaymentModal() {
    document.getElementById('modal-payment').classList.remove('open');
    window.pendingPaymentType = null;
}

function openMyItems(type) {
    window.isMyItemsContext = true;
    window.currentCategoryDetailsId = null;
    window.currentMyItemsType = type;
    const titleEl = document.getElementById('my-items-title');
    if (titleEl) titleEl.innerText = (type === 'active') ? 'Мои активные складчины' : 'Мои завершённые складчины';
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

// ==========================================
// ЧАСТЬ 2: ЗАГРУЗКА И UI
// ==========================================

async function loadUserProfile() {
    if (!USER_ID) return;
    try {
        const response = await fetch(`${API_BASE_URL}/api/user/${USER_ID}?t=${Date.now()}`, { headers: getHeaders() });
        const user = await response.json();
        
        window.currentUserStatus = user.status;
        
        const ids = ['header-username', 'profile-username'];
        ids.forEach(id => { 
            const el = document.getElementById(id); 
            if(el) el.innerText = user.first_name || user.username || "Пользователь"; 
        });
        
        const els = { 
            'profile-status-text': user.status, 
            'profile-active-count': user.active_count, 
            'profile-completed-count': user.completed_count 
        };
        for (const [id, val] of Object.entries(els)) { 
            const el = document.getElementById(id); 
            if(el) el.innerText = val; 
        }
        
        const dateEl = document.getElementById('profile-join-date');
        if(dateEl && user.registration_date) { 
            const d = new Date(user.registration_date); 
            dateEl.innerText = `Участник с ${d.toLocaleDateString('ru-RU')}`; 
        }
        
        if (user.avatar_url) {
            const headerAvatar = document.getElementById('header-avatar');
            const profileAvatar = document.getElementById('profile-avatar');
            const avatarSrc = `${user.avatar_url}?v=${new Date().getTime()}`;
            
            if (headerAvatar) {
                headerAvatar.src = avatarSrc;
                headerAvatar.style.opacity = '1';
            }
            if (profileAvatar) {
                profileAvatar.src = avatarSrc;
                profileAvatar.style.opacity = '1';
            }
        } else {
            // Если аватарки нет, показываем заглушку
            const headerAvatar = document.getElementById('header-avatar');
            const profileAvatar = document.getElementById('profile-avatar');
            if (headerAvatar) headerAvatar.style.opacity = '1';
            if (profileAvatar) profileAvatar.style.opacity = '1';
        }

        updateStatusModal(user.status, user.completed_count);
    } catch (e) { console.error("Profile load error:", e); }
}

async function loadMyItems(type) {
    const container = document.getElementById('my-items-container');
    if (!container) return;
    container.innerHTML = '<div style="padding:20px; text-align:center;">Загрузка...</div>';
    try {
        let url = `${API_BASE_URL}/api/items?type=${type}&joined=true&page=1&sort=new&t=${Date.now()}`;
        const response = await fetch(url, { headers: getHeaders() });
        const items = await response.json();
        renderItems(container, items);
    } catch (error) { container.innerHTML = '<div style="padding:20px; text-align:center;">Ошибка загрузки</div>'; }
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
    } catch (error) { container.innerHTML = '<div style="padding:20px; text-align:center;">Ошибка загрузки</div>'; }
}

async function loadItems(type) {
    const container = document.querySelector('#view-catalog .item-container');
    if(!container) return;
    container.innerHTML = '<div style="padding:20px; text-align:center;">Загрузка...</div>';
    try {
        let url = `${API_BASE_URL}/api/items?type=${type}&page=1`;
        if (type === 'all') url += '&joined=true';
        if (window.filterState.categories.length > 0) url += `&cat=${window.filterState.categories.join(',')}`;
        if (window.filterState.tags.length > 0) url += `&tags=${window.filterState.tags.join(',')}`;
        url += `&sort=${window.filterState.sort}`;
        if (window.currentSearchQuery) url += `&q=${encodeURIComponent(window.currentSearchQuery)}`;
        url += `&t=${Date.now()}`;
        const response = await fetch(url, { headers: getHeaders() });
        const items = await response.json();
        renderItems(container, items);
    } catch (error) { container.innerHTML = '<div style="padding:20px; text-align:center;">Ошибка загрузки</div>'; }
}

function renderItems(container, items) {
    container.innerHTML = '';
    if (items.length === 0) {
        let img = "icons/Ничего нет без фона.png";
        if(window.currentSearchQuery) img = "icons/Поиск без фона.png";
        container.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:40px 20px; height:50vh;"><img src="${img}" style="width:140px; margin-bottom:20px; opacity:0.9;"><div style="color:#a2a5b9; font-size:16px; font-weight:600;">Ничего нет</div></div>`;
        return;
    }
    items.forEach(item => container.appendChild(createItemCard(item)));
}

function createItemCard(item) {
    const card = document.createElement('div');
    card.className = 'big-card';
    card.onclick = () => openProduct(item.id);
    
    let statusText = "Активная складчина";
    let badgeColor = "#00cec9";
    let percent = 0;
    let barClass = "progress-fill";

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
            <img src="${imgSrc}" style="width:100%; height:auto; display:block; border-radius: 16px 16px 0 0;">
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

function updateProductStatusUI(status, isJoined, paymentStatus, startAt, endAt) {
    const actionBtn = document.getElementById('product-action-btn');
    const statusText = document.getElementById('product-status-text');
    const fundraisingRow = document.getElementById('fundraising-label-row');
    const leaveBtn = document.getElementById('product-leave-btn');

    if (fundraisingRow) fundraisingRow.style.display = 'none';
    
    if (leaveBtn) leaveBtn.style.display = 'none';
    statusText.style.color = "";

    actionBtn.disabled = false;
    actionBtn.style.opacity = "1";
    actionBtn.style.backgroundColor = ""; 
    actionBtn.onclick = handleProductAction;

    if (status === 'published' || status === 'active' || status === 'scheduled') {
        statusText.innerText = "Активная складчина";
        if (isJoined) {
            actionBtn.innerText = "Вы записаны"; actionBtn.disabled = true; actionBtn.style.opacity = "0.7";
            if(leaveBtn) leaveBtn.style.display = 'flex'; 
        } else { actionBtn.innerText = "Записаться"; }
    } 
    else if (status === 'fundraising_scheduled') {
        const dateStr = formatDate(startAt);
        statusText.innerText = `Сбор средств назначен на ${dateStr} (МСК)`;
        if (isJoined) {
            actionBtn.innerText = "Вы записаны"; actionBtn.disabled = true; actionBtn.style.opacity = "0.7";
        } else { actionBtn.innerText = "Записаться"; }
    }
    else if (status === 'fundraising') {
        const endDate = formatDate(endAt);
        statusText.innerText = `Идёт сбор средств до ${endDate} (МСК)`;
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
        
        if (paymentStatus === 'paid') {
            actionBtn.innerText = "Получить файлы";
            actionBtn.style.backgroundColor = "#2ecc71";
            actionBtn.disabled = false;
            actionBtn.onclick = () => getFiles();
        } 
        else {
            const endDate = new Date(endAt);
            const now = new Date();
            const diffDays = (now - endDate) / (1000 * 60 * 60 * 24);

            if (diffDays > 10) {
                actionBtn.innerText = "Купить (200₽)";
                actionBtn.style.backgroundColor = "#fdcb6e"; actionBtn.style.color = "#2d3436";
                actionBtn.disabled = false;
                actionBtn.onclick = () => checkPenaltyAndPay();
            } else {
                actionBtn.innerText = "Завершена";
                actionBtn.disabled = true;
            }
        }
    }
}

function formatDate(isoString) {
    if(!isoString) return "";
    try {
        const d = new Date(isoString);
        const mskOffset = 3 * 60 * 60 * 1000;
        const mskDate = new Date(d.getTime() + mskOffset);

        const day = String(mskDate.getUTCDate()).padStart(2, '0');
        const month = String(mskDate.getUTCMonth() + 1).padStart(2, '0');
        const year = mskDate.getUTCFullYear();
        const hours = String(mskDate.getUTCHours()).padStart(2, '0');
        const minutes = String(mskDate.getUTCMinutes()).padStart(2, '0');
        
        return `${hours}:${minutes} ${day}.${month}.${year}`;
    } catch(e) { return ""; }
}

async function openProduct(id) {
    const bottomNav = document.querySelector('.bottom-nav');
    if(bottomNav) bottomNav.style.display = 'none';
    
    // --- ИСПРАВЛЕНИЕ: Сбрасываем классы active и loaded у всех view ---
    document.querySelectorAll('.view').forEach(el => {
        el.classList.remove('active');
        el.classList.remove('loaded');
    });
    
    const viewProduct = document.getElementById('view-product');
    viewProduct.classList.add('active');
    
    // Добавляем класс loaded с небольшой задержкой для анимации появления
    setTimeout(() => {
        viewProduct.classList.add('loaded');
    }, 10);
    // ------------------------------------------------------------------
    
    document.getElementById('product-header-title').innerText = "Загрузка...";
    switchVideo('none');
    window.currentItemId = id;
    
    try {
        // Добавляем timestamp для сброса кэша
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
    } catch (error) { 
        console.error(error); 
        closeProduct(); 
    }
}

function closeProduct() {
    document.getElementById('main-video-frame').src = "";
    if(window.isMyItemsContext) { switchView('my-items'); loadMyItems(window.currentMyItemsType); }
    else if(window.currentCategoryDetailsId) { switchView('category-details'); }
    else { switchView('catalog'); loadItems('active'); }
}

async function handleProductAction() {
    const btn = document.getElementById('product-action-btn');
    const originalText = btn.innerText;
    btn.innerText = "⏳..."; btn.disabled = true;
    try {
        const response = await fetch(`${API_BASE_URL}/api/join`, {
            method: 'POST', headers: getHeaders(), body: JSON.stringify({ user_id: USER_ID, item_id: window.currentItemId })
        });
        const result = await response.json();
        if (result.success) { openProduct(window.currentItemId); }
        else {
            if (result.error === 'penalty') { updateStatusModal('Штрафник', 0); openModal(); }
            else { showCustomAlert(result.message || "Не удалось", "Ошибка"); }
            btn.innerText = originalText; btn.disabled = false;
        }
    } catch (error) { showCustomAlert("Ошибка соединения", "Ошибка"); btn.innerText = originalText; btn.disabled = false; }
}

async function leaveProduct() {
    tg.showConfirm("Точно хотите выйти из складчины?", (ok) => {
        if (!ok) return;
        const btn = document.getElementById('product-leave-btn');
        btn.disabled = true;
        fetch(`${API_BASE_URL}/api/leave`, {
            method: 'POST', headers: getHeaders(), body: JSON.stringify({ user_id: USER_ID, item_id: window.currentItemId })
        }).then(r => r.json()).then(result => {
            if (result.success) openProduct(window.currentItemId);
            else {
                if(result.error === 'locked') showCustomAlert('После объявления сбора средств выйти нельзя.', 'Внимание');
                else showCustomAlert(result.error || "Ошибка выхода", "Ошибка");
                btn.disabled = false;
            }
        }).catch(e => { showCustomAlert("Ошибка соединения"); btn.disabled = false; });
    });
}

async function selectPaymentMethod(method) {
    if (!window.pendingPaymentType) return;
    const modalContent = document.querySelector('#modal-payment .modal-content');
    modalContent.style.opacity = '0.5';
    try {
        const body = { user_id: USER_ID, method: method, type: window.pendingPaymentType, item_id: (window.pendingPaymentType === 'item') ? window.currentItemId : 0 };
        const response = await fetch(`${API_BASE_URL}/api/payment/init`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(body) });
        const result = await response.json();
        if (result.success) tg.close(); 
        else { showCustomAlert("Ошибка: " + result.error, "Ошибка"); modalContent.style.opacity = '1'; }
    } catch (error) { showCustomAlert("Ошибка соединения", "Ошибка"); modalContent.style.opacity = '1'; }
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
    } else if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
        if (videoUrl.includes('watch?v=')) videoUrl = videoUrl.replace('watch?v=', 'embed/').split('&')[0];
        else if (videoUrl.includes('youtu.be/')) videoUrl = videoUrl.replace('youtu.be/', 'youtube.com/embed/');
    } else if (videoUrl.includes('vk.com/video')) {
        const match = videoUrl.match(/video(-?\d+)_(\d+)/);
        if (match) videoUrl = `https://vk.com/video_ext.php?oid=${match[1]}&id=${match[2]}&hd=2`;
    } else if (videoUrl.includes('rutube.ru/video/')) {
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
    loadItems(type);
}
async function loadCategories() {
    try {
        const r = await fetch(`${API_BASE_URL}/api/categories`, { headers: getHeaders() });
        const cats = await r.json();
        const homeGrid = document.querySelector('.categories-grid');
        if (homeGrid) {
            homeGrid.innerHTML = '';
            cats.slice(0, 4).forEach(c => {
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
    } catch(e){ console.error(e); }
}
async function loadTags() {
    try {
        const r = await fetch(`${API_BASE_URL}/api/tags`, { headers: getHeaders() });
        const tags = await r.json();
        const cont = document.getElementById('filter-tags-container');
        if(cont) {
            cont.innerHTML='';
            tags.forEach(t=>{
                const b=document.createElement('div'); b.className='chip-btn'; b.innerText=t;
                b.onclick=()=>toggleTag(t,b);
                cont.appendChild(b);
            });
        }
    } catch(e){ console.error(e); }
}
async function loadHomeItems() {
    // 1. Загружаем НОВЫЕ (Active)
    loadCompactList('active', 'home-new-container');
    
    // 2. Загружаем ЗАВЕРШЕННЫЕ (Completed)
    loadCompactList('completed', 'home-completed-container');
}

// Универсальная функция для загрузки компактных списков
async function loadCompactList(type, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    try {
        // Запрашиваем топ-5, сортировка по новизне
        const r = await fetch(`${API_BASE_URL}/api/items?type=${type}&page=1&sort=new`, { headers: getHeaders() });
        const items = await r.json();
        
        container.innerHTML = '';
        
        if (items.length === 0) {
            container.innerHTML = '<div style="padding:10px; color:#a2a5b9; font-size:14px;">Пока пусто...</div>';
            return;
        }

        // Берем только первые 5 штук
        items.slice(0, 5).forEach(item => {
            container.appendChild(createCompactCard(item));
        });
        
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div style="padding:10px; color:#ff7675; font-size:14px;">Ошибка загрузки</div>';
    }
}

// Функция создания HTML для компактной карточки
function createCompactCard(item) {
    const card = document.createElement('div');
    card.className = 'compact-card';
    card.onclick = () => openProduct(item.id);

    // Определяем текст подзаголовка
    let metaText = "";
    let statusColor = "#00cec9"; // По умолчанию бирюзовый

    if (item.status === 'completed') {
        metaText = "Завершена • Файлы доступны";
        statusColor = "#fdcb6e"; // Желтый/Оранжевый для завершенных
        if(item.payment_status === 'paid') {
             statusColor = "#2ecc71"; // Зеленый если куплено
             metaText = "Куплено вами";
        }
    } else if (item.status === 'fundraising') {
        metaText = `Участников: ${item.paid_participants}/${item.needed_participants}`;
        statusColor = "#0984e3"; // Синий
    } else {
        // Active / Published
        metaText = `Участников: ${item.current_participants}/${item.needed_participants}`;
        statusColor = "#00cec9"; // Бирюзовый
    }

    const imgSrc = item.cover_url || "icons/Ничего нет без фона.png";

    card.innerHTML = `
        <img src="${imgSrc}" class="compact-thumb" onerror="this.src='icons/Ничего нет без фона.png'">
        <div class="compact-info">
            <div class="compact-title">${item.name}</div>
            <div class="compact-meta">
                <span class="compact-status" style="background-color: ${statusColor};"></span>
                ${metaText}
            </div>
        </div>
    `;
    
    return card;
}

async function loadFullCategoriesList() {
    const container = document.getElementById('all-categories-container');
    if (!container) return;
    try {
        const r = await fetch(`${API_BASE_URL}/api/categories`, { headers: getHeaders() });
        const cats = await r.json();
        container.innerHTML = '';
        cats.forEach(cat => {
            const row = document.createElement('div');
            row.className = 'category-row';
            const iconSrc = cat.icon_url || "icons/folder.svg";
            row.innerHTML = `
                <img src="${iconSrc}" class="cat-icon" onerror="this.src='icons/folder.svg'">
                <div class="cat-info">
                    <div class="cat-name">${cat.name}</div>
                    <div class="cat-stats">
                        <span style="color: #00cec9;">Активные: ${cat.active_count || 0}</span>
                        <span style="color: #a2a5b9; margin-left: 8px;">Завершённые: ${cat.completed_count || 0}</span>
                    </div>
                </div>
            `;
            row.onclick = () => openCategoryDetails(cat.id, cat.name);
            container.appendChild(row);
        });
    } catch(e){ console.error(e); }
}

// ==========================================
// ЛОГИКА БАННЕРОВ
// ==========================================

async function loadBanners() {
    const container = document.getElementById('banner-container');
    if (!container) return;
    container.innerHTML = '';

    // 🔥 РЕЖИМ ОТЛАДКИ: Если true - показывает ВСЕ баннеры сразу
    const DEBUG_MODE = true; 

    // Данные для логики (в реальной работе)
    const status = window.currentUserStatus || 'Новичок';
    const isSubscriber = true; // Пока заглушка, в будущем проверять API
    
    // Получаем список неоплаченных (для логики приоритета)
    let hasUnpaidItems = false;
    try {
        const r = await fetch(`${API_BASE_URL}/api/items?type=active&joined=true`, { headers: getHeaders() });
        const myItems = await r.json();
        // Ищем item, где мы участник, статус fundraising, а payment_status != paid
        hasUnpaidItems = myItems.some(i => i.status === 'fundraising' && i.payment_status !== 'paid');
    } catch (e) {}

    // --- БАЗА БАННЕРОВ ---
    const allBanners = [
        {
            id: 'penalty',
            type: 'penalty',
            // Показываем, только если юзер Штрафник (или для теста можно поставить true)
            condition: () => status === 'Штрафник',
            html: `
                <div class="banner-content">
                    <div class="banner-title">Ты стал<br>Штрафником</div>
                    <div class="banner-subtitle" style="line-height: 1.3;">
                        Оплати штраф 500₽,<br>
                        чтобы продолжить<br>
                        пользоваться ботом!
                    </div>
                    <button class="banner-btn" onclick="openPaymentModal('penalty')">
                        Оплатить штраф
                    </button>
                </div>
                <img src="icons/500 Без фона.png" class="banner-img">
            `
        },
        {
            id: 'unpaid',
            type: 'unpaid',
            condition: () => hasUnpaidItems && status !== 'Штрафник',
            html: `
                <div class="banner-content">
                    <div class="banner-title">Не забудь<br>оплатить!</div>
                    <div class="banner-subtitle" style="line-height: 1.3;">
                        Оплати взнос,<br>
                        чтобы не стать<br>
                        Штрафником
                    </div>
                    <button class="banner-btn" onclick="openMyItems('active')">
                        Оплатить
                    </button>
                </div>
                <img src="icons/Времени мало без фона.png" class="banner-img">
            `
        },
        {
            id: 'subscribe',
            type: 'subscribe',
            condition: () => !isSubscriber && status !== 'Штрафник',
            html: `
                <div class="banner-content">
                    <div class="banner-title">Не забудь<br>подписаться<br>на канал</div>
                    <div class="banner-subtitle" style="line-height: 1.3;">
                        с новостями и<br>
                        анонсами новых<br>
                        складчин
                    </div>
                    <button class="banner-btn" onclick="Telegram.WebApp.openTelegramLink('https://t.me/+iTqdmfAbMb41YTli')">
                        <img src="icons/tg.svg" width="18"> Подписаться
                    </button>
                </div>
                <img src="icons/Телеграм без фона.png" class="banner-img">
            `
        },
        {
            id: 'novice_tip',
            type: 'success',
            // Показываем только Новичкам
            condition: () => status === 'Новичок',
            html: `
                <div class="banner-content">
                    <div class="banner-title">Получи статус<br>Опытного<br>пользователя</div>
                    <div class="banner-subtitle" style="line-height: 1.3;">
                        чтобы оплачивать взносы<br>
                        в завершённых<br>
                        складчинах
                    </div>
                    <button class="banner-btn" onclick="openModal()">
                        Проверить статус
                    </button>
                </div>
                <img src="icons/Супермэн 2 без фона.png" class="banner-img">
            `
        },
        {
            id: 'hot_items',
            type: 'hot',
            condition: () => true, 
            html: `
                <div class="banner-content">
                    <div class="banner-title">Осталось совсем<br>чуть-чуть</div>
                    <div class="banner-subtitle" style="line-height: 1.3;">
                        Посмотри складчины,<br>
                        в которых уже собралось<br>
                        90% участников.
                    </div>
                    <button class="banner-btn" onclick="openHotItems()">
                        Смотреть
                    </button>
                </div>
                <img src="icons/Загрузка-без-фона.png" class="banner-img">
            `
        },
        {
            id: 'payment_info',
            type: 'payment',
            condition: () => true,
            html: `
                <div class="banner-content">
                    <div class="banner-title">Оплата</div>
                    <div class="banner-subtitle">Принимаем карты РФ (ЮMoney) и криптовалюту.</div>
                </div>
                <img src="icons/Оплата Без фона.png" class="banner-img">
            `
        },
        {
            id: 'help_promo',
            type: 'info',
            condition: () => true,
            html: `
                <div class="banner-content">
                    <div class="banner-title">Обучение</div>
                    <div class="banner-subtitle">Посмотри видео, чтобы узнать как пользоваться.</div>
                    <button class="banner-btn" onclick="Telegram.WebApp.openLink('https://youtube.com')">
                        Инструкции
                    </button>
                </div>
                <img src="icons/info.svg" class="banner-img" style="opacity:0.5; filter: invert(1);">
            `
        }
    ];

    // --- ЛОГИКА ОТРИСОВКИ ---
    
    if (DEBUG_MODE) {
        // Выводим ВСЕ баннеры подряд
        allBanners.forEach(banner => {
            const div = document.createElement('div');
            div.className = `banner ${banner.type}`;
            div.innerHTML = banner.html;
            container.appendChild(div);
        });
        return;
    }

    // --- ЛОГИКА ПРИОРИТЕТОВ (Production) ---
    // 1. Если Штрафник -> ТОЛЬКО баннер штрафа
    const penaltyBanner = allBanners.find(b => b.id === 'penalty');
    if (penaltyBanner.condition()) {
        renderOneBanner(container, penaltyBanner);
        return;
    }

    // 2. Если есть неоплаченные -> ТОЛЬКО баннер оплаты
    const unpaidBanner = allBanners.find(b => b.id === 'unpaid');
    if (unpaidBanner.condition()) {
        renderOneBanner(container, unpaidBanner);
        return;
    }

    // 3. Ротация остальных (Случайный из доступных)
    // Исключаем те, что уже проверили (penalty, unpaid)
    const rotationPool = allBanners.filter(b => 
        b.id !== 'penalty' && 
        b.id !== 'unpaid' && 
        b.condition()
    );

    if (rotationPool.length > 0) {
        // Берем случайный баннер из пула (можно менять логику, например раз в день)
        const randomBanner = rotationPool[Math.floor(Math.random() * rotationPool.length)];
        renderOneBanner(container, randomBanner);
    }
}

function renderOneBanner(container, bannerData) {
    const div = document.createElement('div');
    div.className = `banner ${bannerData.type}`;
    div.innerHTML = bannerData.html;
    container.appendChild(div);
}

async function openHotItems() {
    switchView('catalog');
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    
    const container = document.querySelector('#view-catalog .item-container');
    if(container) container.innerHTML = '<div style="padding:20px; text-align:center;">Ищем горящие предложения...</div>';
    
    try {
        // Загружаем 100 активных складчин для фильтрации
        let url = `${API_BASE_URL}/api/items?type=active&page=1&items_per_page=100&t=${Date.now()}`;
        const response = await fetch(url, { headers: getHeaders() });
        const items = await response.json();
        
        // Фильтруем >= 90%
        const hotItems = items.filter(item => {
            if (item.needed_participants <= 0) return false;
            const progress = item.current_participants / item.needed_participants;
            return progress >= 0.9;
        });
        
        renderItems(container, hotItems);
        
    } catch (error) {
        console.error(error);
        if(container) container.innerHTML = '<div style="padding:20px; text-align:center;">Ошибка загрузки</div>';
    }
}