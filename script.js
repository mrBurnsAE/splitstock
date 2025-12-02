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

// --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ СОСТОЯНИЯ ---
window.currentVideoLinks = {};
window.currentItemId = null;
window.currentSearchQuery = "";
window.pendingPaymentType = null;

// Состояние фильтра
window.filterState = {
    sort: 'new',
    categories: [], // массив ID
    tags: []        // массив строк
};

document.addEventListener("DOMContentLoaded", () => {
    try {
        loadUserProfile();
        loadCategories(); // Грузит категории и на главную, и в фильтр
        loadTags();       // Грузит теги в фильтр
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
        
        // Кнопка открытия фильтра
        if (filterBtn) {
            filterBtn.onclick = openFilter;
        }

    } catch (e) { console.error("Init error:", e); }
});

function getHeaders() {
    const uidStr = USER_ID ? USER_ID.toString() : "0";
    return { 'Content-Type': 'application/json', 'X-Telegram-User-Id': uidStr };
}

// --- NAVIGATION ---
function switchView(viewName) {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${viewName}`).classList.add('active');
    
    // Скрываем/показываем нижнее меню
    const bottomNav = document.querySelector('.bottom-nav');
    if(viewName === 'product' || viewName === 'filter') {
        if(bottomNav) bottomNav.style.display = 'none';
    } else {
        if(bottomNav) bottomNav.style.display = 'flex';
    }

    if (viewName === 'home' || viewName === 'catalog' || viewName === 'profile') {
        updateBottomNav(viewName);
    }
}

function updateBottomNav(activeView) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const iconHome = document.getElementById('icon-home');
    const iconCatalog = document.getElementById('icon-catalog');
    const iconProfile = document.getElementById('icon-profile');
    
    // Сброс иконок
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
    
    // При переключении таба применяем текущий фильтр (или сбрасываем, по желанию)
    // Давайте применять текущий фильтр к новому табу
    const tabName = tabElement.innerText;
    let type = 'active';
    if (tabName.includes("Завершённые")) type = 'completed';
    // "Мои" пока грузим как активные (фильтрация на бэке нужна отдельная для "my")
    // Пока просто грузим active
    
    loadItems(type);
}

// --- FILTER LOGIC ---

function openFilter() {
    switchView('filter');
}

function closeFilter() {
    // Возвращаемся в каталог
    switchView('catalog');
}

// Выбор сортировки
window.selectSort = function(sortType, btnElement) {
    window.filterState.sort = sortType;
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    btnElement.classList.add('active');
}

// Выбор категории (чип)
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

// Выбор тега (чип)
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
    
    // Сброс UI
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.sort-btn:nth-child(1)').classList.add('active'); // New
    
    document.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
}

window.applyFilter = function() {
    closeFilter();
    // Перезагружаем список с новыми параметрами
    // Определяем текущий таб
    let targetType = 'active';
    const activeTab = document.querySelector('.tab.active');
    if (activeTab && activeTab.innerText.includes('Завершённые')) targetType = 'completed';
    
    loadItems(targetType);
}

// --- LOADERS ---

async function loadCategories() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/categories`, { headers: getHeaders() });
        const categories = await response.json();
        
        // 1. Рендер на главной (грид)
        const homeGrid = document.querySelector('.categories-grid');
        if (homeGrid) {
            homeGrid.innerHTML = '';
            categories.forEach(cat => {
                const div = document.createElement('div');
                div.className = 'category-card';
                div.innerText = cat.name;
                div.onclick = () => { 
                    // Быстрый переход в каталог с фильтром по этой категории
                    window.filterState.categories = [cat.id]; // Устанавливаем фильтр
                    switchView('catalog'); 
                    loadItems('active'); 
                };
                homeGrid.appendChild(div);
            });
        }
        
        // 2. Рендер в фильтре
        const filterContainer = document.getElementById('filter-categories-container');
        if (filterContainer) {
            filterContainer.innerHTML = '';
            categories.forEach(cat => {
                const btn = document.createElement('div');
                btn.className = 'chip-btn';
                btn.innerText = cat.name;
                // Проверяем, выбран ли
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

async function loadItems(type) {
    try {
        let url = `${API_BASE_URL}/api/items?type=${type}&page=1`;
        
        // Добавляем параметры фильтра
        if (window.filterState.categories.length > 0) {
            url += `&cat=${window.filterState.categories.join(',')}`;
        }
        if (window.filterState.tags.length > 0) {
            url += `&tags=${window.filterState.tags.join(',')}`;
        }
        url += `&sort=${window.filterState.sort}`;
        
        if (window.currentSearchQuery) {
            url += `&q=${encodeURIComponent(window.currentSearchQuery)}`;
        }
        url += `&t=${Date.now()}`;

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
            // Если ничего нет
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
            container.appendChild(card);
        });
    } catch (error) { console.error("Load Items Error:", error); }
}

function performSearch(query) {
    window.currentSearchQuery = query.trim();
    switchView('catalog'); 
    let activeTabType = 'active';
    const activeTab = document.querySelector('.tab.active');
    if(activeTab && activeTab.innerText.includes('Завершённые')) activeTabType = 'completed';
    loadItems(activeTabType);
}

async function openProduct(id) {
    const bottomNav = document.querySelector('.bottom-nav');
    if(bottomNav) bottomNav.style.display = 'none';
    
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    const productView = document.getElementById('view-product');
    productView.classList.add('active');
    
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
        alert("Не удалось загрузить товар. Проверьте интернет.");
        closeProduct();
    }
}

function closeProduct() {
    document.getElementById('main-video-frame').src = "";
    loadItems('active');
    switchView('catalog');
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

    // 1. АКТИВНАЯ
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
    // 2. СБОР НАЗНАЧЕН
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
    // 3. ИДЁТ СБОР
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
    // 4. ЗАВЕРШЕНА
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

// --- PAYMENT FUNCTIONS ---
function openPaymentModal(type) {
    window.pendingPaymentType = type; // 'item' или 'penalty'
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