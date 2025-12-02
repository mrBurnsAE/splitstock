// --- НАСТРОЙКИ ---
const API_BASE_URL = "https://api.splitstock.ru";

const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

let USER_ID = tg.initDataUnsafe?.user?.id;
const urlParams = new URLSearchParams(window.location.search);
const debugId = urlParams.get('uid');
if (debugId) USER_ID = parseInt(debugId);
if (!USER_ID) USER_ID = 0;

console.log("WebApp initialized. User ID:", USER_ID);

// --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ СОСТОЯНИЯ ---
window.currentVideoLinks = {};
window.currentItemId = null;
window.currentSearchQuery = "";
window.pendingPaymentType = null;

// Контекст навигации (откуда пришли)
window.currentCategoryDetailsId = null; // Если мы внутри категории
window.isMyItemsContext = false;        // Если мы в "Моих складчинах"
window.currentMyItemsType = 'active';   // Какой тип моих складчин смотрим

// Состояние главного фильтра
window.filterState = {
    sort: 'new',
    categories: [],
    tags: []
};

document.addEventListener("DOMContentLoaded", () => {
    try {
        console.log("DOM Loaded. Starting init...");
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

// --- ЛОГИКА "МОИ СКЛАДЧИНЫ" (ПРОФИЛЬ) ---

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

async function loadMyItems(type) {
    const container = document.getElementById('my-items-container');
    if (!container) return;
    
    container.innerHTML = '<div style="padding:20px; text-align:center;">Загрузка...</div>';
    
    try {
        // Добавляем параметр joined=true
        let url = `${API_BASE_URL}/api/items?type=${type}&joined=true&page=1&sort=new&t=${Date.now()}`;
        
        const response = await fetch(url, { headers: getHeaders() });
        const items = await response.json();
        
        container.innerHTML = '';
        
        if (items.length === 0) {
            let msg = "Список пуст";
            let img = "icons/Ничего нет без фона.png";
            container.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; height: 50vh;">
                    <img src="${img}" style="width: 140px; margin-bottom: 20px; opacity: 0.9;">
                    <div style="color: #a2a5b9; font-size: 16px; font-weight: 600;">${msg}</div>
                </div>`;
            return;
        }

        items.forEach(item => {
            const card = createItemCard(item);
            container.appendChild(card);
        });
        
    } catch (error) {
        console.error("My items load error:", error);
        container.innerHTML = '<div style="padding:20px; text-align:center;">Ошибка загрузки</div>';
    }
}

// --- ЛОГИКА "ВНУТРИ КАТЕГОРИИ" ---

function openCategoryDetails(id, name) {
    window.currentCategoryDetailsId = id;
    window.isMyItemsContext = false; // Сбрасываем контекст "Моих"
    
    const titleEl = document.getElementById('cat-details-title');
    if (titleEl) titleEl.innerText = name;
    
    // Сброс табов
    document.querySelectorAll('#view-category-details .tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-cat-active').classList.add('active');
    
    switchView('category-details');
    loadCategoryItems('active');
}

function selectCategoryInnerTab(type) {
    document.querySelectorAll('#view-category-details .tab').forEach(t => t.classList.remove('active'));
    const activeTabId = type === 'active' ? 'tab-cat-active' : 'tab-cat-completed';
    document.getElementById(activeTabId).classList.add('active');
    loadCategoryItems(type);
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
        
        container.innerHTML = '';
        
        if (items.length === 0) {
            let msg = "Здесь пока ничего нет...";
            let img = "icons/Ничего нет без фона.png";
            container.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; height: 50vh;">
                    <img src="${img}" style="width: 140px; margin-bottom: 20px; opacity: 0.9;">
                    <div style="color: #a2a5b9; font-size: 16px; font-weight: 600;">${msg}</div>
                </div>`;
            return;
        }

        items.forEach(item => {
            const card = createItemCard(item);
            container.appendChild(card);
        });
    } catch (error) {
        console.error("Cat items load error:", error);
        container.innerHTML = '<div style="padding:20px; text-align:center;">Ошибка загрузки</div>';
    }
}

// --- СПИСОК ВСЕХ КАТЕГОРИЙ ---
async function loadFullCategoriesList() {
    const container = document.getElementById('all-categories-container');
    if (!container) return;
    
    if (!container.hasChildNodes()) {
        container.innerHTML = '<div style="padding:20px; text-align:center; color:#8e92a8;">Загрузка...</div>';
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/categories`, { headers: getHeaders() });
        const categories = await response.json();

        container.innerHTML = '';

        if (categories.length === 0) {
            container.innerHTML = '<div style="padding:20px; text-align:center; color:#8e92a8;">Категорий нет</div>';
            return;
        }

        categories.forEach(cat => {
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

    } catch (e) {
        console.error("Full categories load error:", e);
        container.innerHTML = '<div style="padding:20px; text-align:center; color:#ff7675;">Ошибка загрузки</div>';
    }
}

// --- ГЛАВНАЯ И ОБЩИЙ КАТАЛОГ ---
async function loadCategories() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/categories`, { headers: getHeaders() });
        const categories = await response.json();
        
        const homeGrid = document.querySelector('.categories-grid');
        if (homeGrid) {
            homeGrid.innerHTML = '';
            categories.slice(0, 4).forEach(cat => {
                const div = document.createElement('div');
                div.className = 'category-card';
                div.innerText = cat.name;
                div.onclick = () => openCategoryDetails(cat.id, cat.name);
                homeGrid.appendChild(div);
            });
        }
        
        const filterContainer = document.getElementById('filter-categories-container');
        if (filterContainer) {
            filterContainer.innerHTML = '';
            categories.forEach(cat => {
                const btn = document.createElement('div');
                btn.className = 'chip-btn';
                btn.innerText = cat.name;
                if(window.filterState.categories.includes(cat.id)) btn.classList.add('active');
                btn.onclick = () => toggleCategory(cat.id, btn);
                filterContainer.appendChild(btn);
            });
        }
    } catch (error) { console.error("Err cat:", error); }
}

async function loadTags() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/tags`, { headers: getHeaders() });
        const tags = await response.json();
        const filterContainer = document.getElementById('filter-tags-container');
        if (filterContainer) {
            filterContainer.innerHTML = '';
            tags.forEach(tag => {
                const btn = document.createElement('div');
                btn.className = 'chip-btn';
                btn.innerText = tag;
                if(window.filterState.tags.includes(tag)) btn.classList.add('active');
                btn.onclick = () => toggleTag(tag, btn);
                filterContainer.appendChild(btn);
            });
        }
    } catch (e) { console.error("Err tags:", e); }
}

async function loadHomeItems() {
    const container = document.getElementById('home-item-container');
    if(!container) return;
    container.innerHTML = '';
    try {
        const response = await fetch(`${API_BASE_URL}/api/items?type=active&page=1&sort=new`, { headers: getHeaders() });
        const items = await response.json();
        if (items.length === 0) {
            container.innerHTML = '<div style="padding:20px; text-align:center; color:#555;">Пока пусто</div>';
            return;
        }
        items.slice(0, 5).forEach(item => {
            const card = createItemCard(item);
            container.appendChild(card);
        });
    } catch (e) { console.error("Home load error:", e); }
}

async function loadItems(type) {
    const catalogView = document.getElementById('view-catalog');
    let container = catalogView.querySelector('.item-container');
    container.innerHTML = '<div style="padding:20px; text-align:center;">Загрузка...</div>';

    try {
        // Формируем URL
        let url = `${API_BASE_URL}/api/items?type=${type}&page=1`;
        
        // --- НОВОЕ: Если тип 'all' (вкладка "Мои"), добавляем joined=true ---
        if (type === 'all') {
            url += '&joined=true';
        }
        // ---------------------------------------------------------------------

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

        items.forEach(item => {
            const card = createItemCard(item);
            container.appendChild(card);
        });
    } catch (error) { console.error("Load Items Error:", error); }
}

// --- КАРТОЧКА ТОВАРА И ФУНКЦИОНАЛ ---
function createItemCard(item) {
    const card = document.createElement('div');
    card.className = 'big-card';
    card.onclick = () => openProduct(item.id);
    
    let statusText = "";
    let badgeColor = "";
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

    if (item.status === 'published' || item.status === 'active' || item.status === 'scheduled') {
        statusText = "Активная складчина";
        badgeColor = "#00cec9";
        if (item.is_joined) statusText = "✅ Вы участвуете";
    } else if (item.status === 'fundraising') {
        const endDate = formatDate(item.end_at);
        if (!item.is_joined) {
            statusText = "Идёт сбор средств";
            badgeColor = "#0984e3";
        } else {
            if (item.payment_status === 'paid') {
                statusText = "✅ Взнос оплачен";
                badgeColor = "#2ecc71";
            } else {
                statusText = `⚠️ Оплатить до ${endDate}`;
                badgeColor = "#ff7675";
            }
        }
    } else if (item.status === 'fundraising_scheduled') {
        const dateStr = formatDate(item.start_at);
        barClass = "progress-fill blue"; percent = 0;
        if (!item.is_joined) {
            statusText = `⚠️ Объявлен сбор средств с ${dateStr}`;
            badgeColor = "#ff7675";
        } else {
            statusText = `✅ Объявлен сбор средств с ${dateStr}`;
            badgeColor = "#2ecc71";
        }
    } else if (item.status === 'completed') {
        statusText = "Завершена";
        barClass = "progress-fill blue"; badgeColor = "#a2a5b9"; percent = 100;
        if (item.payment_status === 'paid') {
            statusText = "✅ Доступно (Куплено)"; badgeColor = "#2ecc71";
        }
    }
    if (percent > 100) percent = 100;
    const imgSrc = item.cover_url || "icons/Ничего нет без фона.png"; 

    card.innerHTML = `
        <div class="card-media">
            <img src="${imgSrc}" style="width:100%; height:100%; object-fit:cover; opacity:0.8;">
        </div>
        <div class="card-content">
            <div class="item-name">${item.name}</div>
            <div class="progress-section">
                <div class="progress-text">
                    <span>Количество участников: ${item.current_participants}/${item.needed_participants}</span>
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

// --- UTILS & SEARCH ---
function performSearch(query) {
    window.currentSearchQuery = query.trim();
    switchView('catalog'); 
    let activeTabType = 'active';
    const activeTab = document.querySelector('.tab.active');
    if(activeTab && activeTab.innerText.includes('Завершённые')) activeTabType = 'completed';
    loadItems(activeTabType);
}

function formatDate(isoString) {
    if(!isoString) return "";
    try {
        const d = new Date(isoString);
        return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    } catch(e) { return ""; }
}

// --- ОТКРЫТИЕ ТОВАРА ---
async function openProduct(id) {
    const bottomNav = document.querySelector('.bottom-nav');
    if(bottomNav) bottomNav.style.display = 'none';
    
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
        linkEl.className = "btn-subtle";
        linkEl.innerHTML = '<img src="icons/link.svg"> Подробная информация';
        linkEl.onclick = (e) => {
            e.preventDefault();
            tg.openLink(item.link);
        };

        document.getElementById('product-category').innerText = item.category ? "#" + item.category : "";
        document.getElementById('product-tags').innerText = (item.tags || []).map(t => "#" + t).join(" ");
        document.getElementById('product-price-orig').innerText = "$" + item.price;
        
        let contribution = "100₽"; 
        if (item.status === 'completed') contribution = "200₽"; 
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
        closeProduct();
    }
}

function closeProduct() {
    document.getElementById('main-video-frame').src = "";
    
    // ЛОГИКА ВОЗВРАТА
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

// ... Остальные функции (switchVideo, updateProductStatusUI и т.д.) без изменений ...
// Я их включил в полный код выше, но здесь сокращаю для читаемости, так как они такие же.
// Но в полный файл копируй то, что ВЫШЕ в блоке кода.

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
        if (iframe) iframe.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';
        if (iframe) iframe.src = videoUrl;
        if (wrapper) wrapper.classList.add('video-mode');
    } else {
        showPlaceholder();
    }
}

function showPlaceholder() {
    const wrapper = document.getElementById('video-wrapper-el');
    const iframe = document.getElementById('main-video-frame');
    const placeholder = document.getElementById('no-video-placeholder');
    if (iframe) iframe.style.display = 'none';
    if (placeholder) placeholder.style.display = 'block';
    if (iframe) iframe.src = "";
    if (wrapper) wrapper.classList.remove('video-mode');
}

function updateProductStatusUI(status, isJoined, paymentStatus, startAt, endAt) {
    const actionBtn = document.getElementById('product-action-btn');
    const statusText = document.getElementById('product-status-text');
    const fundraisingRow = document.getElementById('fundraising-label-row');
    const leaveBtn = document.getElementById('product-leave-btn');

    if (fundraisingRow) fundraisingRow.style.display = 'none';
    if (leaveBtn) leaveBtn.style.display = 'none';
    
    statusText.style.color = "";

    if (actionBtn) {
        actionBtn.disabled = false;
        actionBtn.style.opacity = "1";
        actionBtn.style.backgroundColor = ""; 
        actionBtn.onclick = handleProductAction;
    }

    if (status === 'published' || status === 'active' || status === 'scheduled') {
        if(statusText) statusText.innerText = "Активная складчина";
        
        if (isJoined) {
            if(actionBtn) {
                actionBtn.innerText = "Вы записаны";
                actionBtn.disabled = true;
                actionBtn.style.opacity = "0.7";
            }
            if(leaveBtn) leaveBtn.style.display = 'flex'; 
        } else {
            if(actionBtn) actionBtn.innerText = "Записаться";
        }
    } 
    else if (status === 'fundraising_scheduled') {
        const dateStr = formatDate(startAt);
        if(statusText) {
            if (dateStr) statusText.innerText = `Сбор средств назначен на ${dateStr}`;
            else statusText.innerText = `Сбор средств скоро начнётся`;
        }
        
        if (isJoined) {
            if(actionBtn) {
                actionBtn.innerText = "Вы записаны";
                actionBtn.disabled = true;
                actionBtn.style.opacity = "0.7";
            }
            if(leaveBtn) leaveBtn.style.display = 'none'; 
        } else {
            if(actionBtn) {
                actionBtn.innerText = "Записаться";
                actionBtn.disabled = false;
            }
        }
    }
    else if (status === 'fundraising') {
        const endDate = formatDate(endAt);
        if(statusText) {
            if(endDate) statusText.innerText = `Идёт сбор средств до ${endDate}`;
            else statusText.innerText = "Идёт сбор средств";
        }
        if (fundraisingRow) fundraisingRow.style.display = 'flex';
        
        if (isJoined) {
            if (paymentStatus === 'paid') {
                if(actionBtn) {
                    actionBtn.innerText = "Оплачено";
                    actionBtn.disabled = true;
                    actionBtn.style.opacity = "1";
                    actionBtn.style.backgroundColor = "#2ecc71";
                }
            } else {
                if(actionBtn) {
                    actionBtn.innerText = "Оплатить взнос";
                    actionBtn.onclick = () => openPaymentModal('item');
                }
            }
            if(leaveBtn) leaveBtn.style.display = 'none';
        } else {
            if(actionBtn) {
                actionBtn.innerText = "Набор закрыт";
                actionBtn.disabled = true;
            }
        }
    } 
    else if (status === 'completed') {
        if(actionBtn) {
            actionBtn.innerText = "Завершена";
            actionBtn.disabled = true;
        }
        if(statusText) statusText.innerText = "Складчина завершена";
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

function openPaymentModal(type) {
    window.pendingPaymentType = type;
    document.getElementById('modal-payment').classList.add('open');
}

function closePaymentModal() {
    document.getElementById('modal-payment').classList.remove('open');
    window.pendingPaymentType = null;
}

async function selectPaymentMethod(method) {
    if (!window.pendingPaymentType) return;
    
    const modalContent = document.querySelector('#modal-payment .modal-content');
    modalContent.style.opacity = '0.5';
    
    try {
        const body = {
            user_id: USER_ID,
            method: method,
            type: window.pendingPaymentType,
            item_id: (window.pendingPaymentType === 'item') ? window.currentItemId : 0
        };

        const response = await fetch(`${API_BASE_URL}/api/payment/init`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(body)
        });
        
        const result = await response.json();
        
        if (result.success) {
            tg.close(); 
        } else {
            alert("Ошибка создания счета: " + (result.error || "Unknown"));
            modalContent.style.opacity = '1';
        }
    } catch (error) {
        console.error(error);
        alert("Ошибка соединения");
        modalContent.style.opacity = '1';
    }
}

// --- ЗАГРУЗКА ПРОФИЛЯ ---
async function loadUserProfile() {
    if (!USER_ID) return;
    try {
        const response = await fetch(`${API_BASE_URL}/api/user/${USER_ID}`, { headers: getHeaders() });
        const user = await response.json();
        
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
            const date = new Date(user.registration_date);
            const dateStr = date.toLocaleDateString('ru-RU');
            dateEl.innerText = `Участник с ${dateStr}`;
        }

        updateStatusModal(user.status, user.completed_count);

    } catch (e) { console.error("Profile load error:", e); }
}

function updateStatusModal(status, completedCount) {
    const title = document.getElementById('modal-status-title');
    const desc = document.getElementById('modal-status-desc');
    const img = document.getElementById('modal-status-img');

    if(title) title.innerText = status;
    
    if (status === 'Новичок') {
        const needed = Math.max(0, 10 - completedCount);
        if(desc) desc.innerText = `Для получения статуса "Опытный" осталось завершить ещё ${needed} складчин`;
        if(img) img.src = "icons/Новичок Без фона.png";
    } else if (status === 'Опытный') {
        if(desc) desc.innerText = "Теперь вы можете оплачивать взносы в завершённых складчинах";
        if(img) img.src = "icons/Супермэн без фона.png";
    } else if (status === 'Штрафник') {
        if(desc) desc.innerText = "Вы не можете записываться в новые складчины, пока не оплатите штраф";
        if(img) img.src = "icons/Штрафник без фона.png";
    }
}

// --- НАВИГАЦИЯ ---
function switchView(viewName) {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${viewName}`).classList.add('active');
    
    const bottomNav = document.querySelector('.bottom-nav');
    // Скрываем меню на вложенных страницах: товар, фильтр, список категорий, внутри категории, мои товары
    if(['product', 'filter', 'categories', 'category-details', 'my-items'].includes(viewName)) {
        if(bottomNav) bottomNav.style.display = 'none';
    } else {
        if(bottomNav) bottomNav.style.display = 'flex';
    }

    if (viewName === 'home' || viewName === 'catalog' || viewName === 'profile') {
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

function selectTab(tabElement) {
    document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
    tabElement.classList.add('active');
    
    const tabName = tabElement.innerText;
    let type = 'active';
    
    if (tabName.includes("Завершённые")) {
        type = 'completed';
    } else if (tabName.includes("Мои")) {
        // Для вкладки "Мои складчины" используем тип 'all' (все статусы)
        type = 'all'; 
    }
    
    loadItems(type);
}

function selectTabByName(name) {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(t => {
        if(t.innerText.includes(name)) {
            selectTab(t);
        }
    });
}

// --- ФИЛЬТРЫ ---
function openFilter() { switchView('filter'); }
function closeFilter() { switchView('catalog'); }

window.selectSort = function(sortType, btnElement) {
    window.filterState.sort = sortType;
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    btnElement.classList.add('active');
}

function toggleCategory(catId, btnElement) {
    const index = window.filterState.categories.indexOf(catId);
    if (index === -1) {
        window.filterState.categories.push(catId);
        btnElement.classList.add('active');
    } else {
        window.filterState.categories.splice(index, 1);
        btnElement.classList.remove('active');
    }
}

function toggleTag(tag, btnElement) {
    const index = window.filterState.tags.indexOf(tag);
    if (index === -1) {
        window.filterState.tags.push(tag);
        btnElement.classList.add('active');
    } else {
        window.filterState.tags.splice(index, 1);
        btnElement.classList.remove('active');
    }
}

window.resetFilter = function() {
    window.filterState = { sort: 'new', categories: [], tags: [] };
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.sort-btn:nth-child(1)').classList.add('active'); 
    document.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
}

window.applyFilter = function() {
    closeFilter();
    let targetType = 'active';
    const activeTab = document.querySelector('.tab.active');
    if (activeTab && activeTab.innerText.includes('Завершённые')) targetType = 'completed';
    loadItems(targetType);
}

// --- ОБЩИЕ ЗАГРУЗЧИКИ ---
async function loadCategories() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/categories`, { headers: getHeaders() });
        const categories = await response.json();
        
        const homeGrid = document.querySelector('.categories-grid');
        if (homeGrid) {
            homeGrid.innerHTML = '';
            categories.slice(0, 4).forEach(cat => {
                const div = document.createElement('div');
                div.className = 'category-card';
                div.innerText = cat.name;
                div.onclick = () => openCategoryDetails(cat.id, cat.name);
                homeGrid.appendChild(div);
            });
        }
        
        const filterContainer = document.getElementById('filter-categories-container');
        if (filterContainer) {
            filterContainer.innerHTML = '';
            categories.forEach(cat => {
                const btn = document.createElement('div');
                btn.className = 'chip-btn';
                btn.innerText = cat.name;
                if(window.filterState.categories.includes(cat.id)) btn.classList.add('active');
                btn.onclick = () => toggleCategory(cat.id, btn);
                filterContainer.appendChild(btn);
            });
        }
    } catch (error) { console.error("Err cat:", error); }
}

async function loadTags() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/tags`, { headers: getHeaders() });
        const tags = await response.json();
        const filterContainer = document.getElementById('filter-tags-container');
        if (filterContainer) {
            filterContainer.innerHTML = '';
            tags.forEach(tag => {
                const btn = document.createElement('div');
                btn.className = 'chip-btn';
                btn.innerText = tag;
                if(window.filterState.tags.includes(tag)) btn.classList.add('active');
                btn.onclick = () => toggleTag(tag, btn);
                filterContainer.appendChild(btn);
            });
        }
    } catch (e) { console.error("Err tags:", e); }
}

async function loadHomeItems() {
    const container = document.getElementById('home-item-container');
    if(!container) return;
    container.innerHTML = '';
    try {
        const response = await fetch(`${API_BASE_URL}/api/items?type=active&page=1&sort=new`, { headers: getHeaders() });
        const items = await response.json();
        if (items.length === 0) {
            container.innerHTML = '<div style="padding:20px; text-align:center; color:#555;">Пока пусто</div>';
            return;
        }
        items.slice(0, 5).forEach(item => {
            const card = createItemCard(item);
            container.appendChild(card);
        });
    } catch (e) { console.error("Home load error:", e); }
}

async function loadItems(type) {
    const catalogView = document.getElementById('view-catalog');
    let container = catalogView.querySelector('.item-container');
    container.innerHTML = '<div style="padding:20px; text-align:center;">Загрузка...</div>';

    try {
        let url = `${API_BASE_URL}/api/items?type=${type}&page=1`;
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
        items.forEach(item => {
            const card = createItemCard(item);
            container.appendChild(card);
        });
    } catch (error) { console.error("Load Items Error:", error); }
}