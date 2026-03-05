// ==========================================
// ЧАСТЬ 1: НАСТРОЙКИ, НАВИГАЦИЯ, МОДАЛКИ
// ==========================================

const API_BASE_URL = "https://api.splitstock.ru";

const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// --- ВСТАВИТЬ В НАЧАЛО script.js ---
function showPreloader(state) {
    const p = document.getElementById('preloader');
    if (p) p.style.display = state ? 'flex' : 'none';
}

// Утилита для задержки вызова функции (дебаунс)
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// --- ИНИЦИАЛИЗАЦИЯ ПОЛЬЗОВАТЕЛЯ И ПАРАМЕТРОВ ---
const urlParams = new URLSearchParams(window.location.search);

let USER_ID = tg.initDataUnsafe?.user?.id;
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
window.filterState = { sort: 'new', categories: [], tags: [], programs: [] };
window.tempFilterState = { sort: 'new', categories: [], tags: [], programs: [] };
window.isHomeContext = false; // Флаг перехода с Главной
window.currentCatalogTabType = 'active'; // <--- ДОБАВИТЬ ЭТУ СТРОКУ

// --- ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ (LOADING) ---
document.addEventListener("DOMContentLoaded", async () => {
    try {
        console.log("DOM Loaded. Starting App Initialization...");

        // --- ПРОВЕРКА НА ТЕЛЕГРАМ ОВЕРОЛЕЙ ---
        // Если initDataUnsafe или initData отсутствует/пуст - значит открыто в обычном браузере
        if (!tg.initDataUnsafe || !tg.initDataUnsafe.user) {
            console.warn("Opened outside of Telegram. Blocking access.");

            // Скрываем прелоадер
            const p = document.getElementById('preloader');
            if (p) p.style.display = 'none';

            // Скрываем все views
            document.querySelectorAll('.view').forEach(v => {
                v.classList.remove('active', 'loaded');
                v.style.display = 'none';
            });

            // Показываем заглушку
            const botOverlay = document.getElementById('non-tg-overlay');
            if (botOverlay) {
                botOverlay.style.display = 'flex';
                botOverlay.classList.add('active', 'loaded');
            }

            // Прячем меню
            const bottomNav = document.querySelector('.bottom-nav');
            if (bottomNav) bottomNav.style.display = 'none';

            return; // Прерываем загрузку данных
        }

        // Показываем прелоадер (хотя он и так есть в HTML, для надежности)
        const preloader = document.getElementById('preloader');
        if (preloader) preloader.style.opacity = '1';

        // 1. Сначала железно загружаем профиль, чтобы знать статус (Новичок/Опытный)
        await loadUserProfile();

        // 2. Теперь, когда статус известен, грузим всё остальное (включая баннеры)
        await Promise.all([
            loadBanners(),
            loadCategories(),
            loadPrograms(),
            loadTags(),
            loadHomeItems(),
            loadItems('active')
        ]);

        const searchInput = document.querySelector('.search-input');
        const filterBtn = document.querySelector('.filter-btn');

        if (searchInput) {
            const debouncedSearch = debounce((val) => performSearch(val), 1500);

            searchInput.addEventListener('input', function () {
                const val = this.value.trim();
                // Если мы на главной, переключаем в каталог только если введено > 2 символов
                if (document.getElementById('view-home').classList.contains('active')) {
                    if (val.length > 2) {
                        debouncedSearch(val);
                    }
                } else {
                    debouncedSearch(val);
                }
            });

            searchInput.addEventListener('keypress', function (e) {
                if (e.key === 'Enter') {
                    performSearch(this.value);
                    this.blur();
                }
            });
        }
        if (filterBtn) filterBtn.onclick = openFilter;

        // Пытаемся восстановить состояние после рефреша
        let restored = false;
        const savedStateStr = sessionStorage.getItem('ss_nav_state');

        // Если ЕСТЬ стартовый товар из URL (Deep Link) - он в приоритете!
        if (window.currentItemId) {
            await openProduct(window.currentItemId);
            restored = true;
        }
        // Иначе пытаемся восстановить из sessionStorage
        else if (savedStateStr) {
            try {
                const state = JSON.parse(savedStateStr);
                console.log("Restoring state:", state);

                if (state.tabType) window.currentCatalogTabType = state.tabType;

                if (state.view === 'product' && state.itemId) {
                    window.isHomeContext = state.isHome;
                    window.isMyItemsContext = state.isMyItems;
                    window.currentMyItemsType = state.myItemsType;
                    await openProduct(state.itemId);
                    restored = true;
                } else if (state.view === 'category-details' && state.catId) {
                    window.isHomeContext = state.isHome;
                    openCategoryDetails(state.catId, state.catName || "", state.catTab || 'active');
                    restored = true;
                } else if (state.view === 'my-items' && state.myItemsType) {
                    openMyItems(state.myItemsType);
                    restored = true;
                } else if (state.view && state.view !== 'home') {
                    switchView(state.view);
                    restored = true;
                }
            } catch (e) {
                console.error("Restore state error:", e);
            }
        }

        // Все загружено, скрываем прелоадер
        if (preloader) {
            preloader.style.opacity = '0';
            setTimeout(() => {
                preloader.style.display = 'none';

                // Плавно показываем основной вид
                const activeView = document.querySelector('.view.active');
                if (activeView) activeView.classList.add('loaded');

            }, 300); // Ждем пока пройдет анимация opacity
        }

    } catch (e) {
        console.error("Init error:", e);
        // Даже если ошибка, убираем прелоадер, чтобы не висел вечно
        const preloader = document.getElementById('preloader');
        if (preloader) preloader.style.display = 'none';
        showCustomAlert("Ошибка загрузки данных. Проверьте интернет.", "Ошибка");
    }
});

// --- ЛОГИКА ДИНАМИЧЕСКОЙ ШАПКИ (STICKY SCROLLED) ---
window.addEventListener('scroll', () => {
    const isScrolled = window.scrollY > 10;
    const activeView = document.querySelector('.view.active');
    if (activeView) {
        // Ищем любую шапку в активном экране
        const header = activeView.querySelector('.header, .filter-header, .product-header');
        if (header) {
            header.classList.toggle('scrolled', isScrolled);
        }
    }
}, { passive: true });

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

function saveNavState(viewName) {
    const state = {
        view: viewName,
        itemId: window.currentItemId,
        catId: window.currentCategoryDetailsId,
        catName: document.getElementById('cat-details-title')?.innerText || "",
        catTab: window.currentCategoryTabType || 'active',
        myItemsType: window.currentMyItemsType,
        isHome: window.isHomeContext,
        isMyItems: window.isMyItemsContext,
        tabType: window.currentCatalogTabType
    };
    sessionStorage.setItem('ss_nav_state', JSON.stringify(state));
    console.log("Nav state saved:", state);
}

function switchView(viewName) {
    // 1. Сбрасываем активные классы у всех экранов
    document.querySelectorAll('.view').forEach(el => {
        el.classList.remove('active');
        el.classList.remove('loaded');
    });

    // 2. Активируем нужный экран
    const target = document.getElementById(`view-${viewName}`);
    if (target) {
        target.classList.add('active');
        // Небольшая задержка для анимации opacity
        setTimeout(() => target.classList.add('loaded'), 10);
    }

    // 3. Управление видимостью нижнего меню
    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) {
        // Скрываем меню на внутренних страницах
        if (['product', 'filter', 'categories', 'category-details', 'my-items'].includes(viewName)) {
            bottomNav.style.display = 'none';
        } else {
            bottomNav.style.display = 'flex';
        }
    }

    // 4. Обновляем иконки в нижнем меню (активная/неактивная)
    if (['home', 'catalog', 'profile'].includes(viewName)) {
        updateBottomNav(viewName);
    }

    // 5. Если перешли в категории - грузим их список
    if (viewName === 'categories') {
        loadFullCategoriesList();
    }

    // 6. Обновление страницы профиля при переходе
    if (viewName === 'profile') {
        loadUserProfile();
    }

    // --- ИСПРАВЛЕНИЕ НАВИГАЦИИ ---
    if (viewName === 'catalog' || viewName === 'home') {
        window.isMyItemsContext = false;
        window.currentCategoryDetailsId = null;
        window.currentMyItemsType = null;
        window.isHomeContext = false; // <-- ДОБАВЛЕНО ИЗ ВТОРОЙ ВЕРСИИ
    }

    // --- СБРОС СОСТОЯНИЯ ШАПКИ ПРИ ПЕРЕХОДЕ ---
    document.querySelectorAll('.header, .filter-header, .product-header').forEach(h => {
        h.classList.remove('scrolled');
    });

    // Сохраняем состояние для восстановления после рефреша
    saveNavState(viewName);
}

function updateBottomNav(activeView) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const iconHome = document.getElementById('icon-home');
    const iconCatalog = document.getElementById('icon-catalog');
    const iconProfile = document.getElementById('icon-profile');

    if (iconHome) iconHome.src = 'icons/home.svg';
    if (iconCatalog) iconCatalog.src = 'icons/apps.svg';
    if (iconProfile) iconProfile.src = 'icons/user.svg';

    if (activeView === 'home') {
        document.querySelector('.nav-item:nth-child(2)')?.classList.add('active');
        if (iconHome) iconHome.src = 'icons/home active.svg';
    } else if (activeView === 'catalog') {
        document.querySelector('.nav-item:nth-child(1)')?.classList.add('active');
        if (iconCatalog) iconCatalog.src = 'icons/apps active.svg';
    } else if (activeView === 'profile') {
        document.querySelector('.nav-item:nth-child(3)')?.classList.add('active');
        if (iconProfile) iconProfile.src = 'icons/user active.svg';
    }
}

function showCustomAlert(msg, title = "SplitStockBot") {
    const el = document.getElementById('modal-alert');
    const titleEl = document.getElementById('modal-alert-title');
    const msgEl = document.getElementById('modal-alert-msg');

    if (titleEl) titleEl.innerText = title;
    if (msgEl) msgEl.innerText = msg;
    if (el) el.classList.add('open');
}

function closeAlertModal() {
    const el = document.getElementById('modal-alert');
    if (el) el.classList.remove('open');
}

function openModal() { document.getElementById('modal-status').classList.add('open'); }
// Функция закрытия статуса
async function closeModal() {
    document.getElementById('modal-status').classList.remove('open');
    // Тоже проверяем, не изменился ли статус
    await loadUserProfile();

    if (document.getElementById('view-product').classList.contains('active') && window.currentItemId) {
        openProduct(window.currentItemId);
    }
}

function openPaymentModal(type) {
    window.pendingPaymentType = type;
    if (type === 'penalty') {
        window.currentItemId = 0;
    }
    document.getElementById('modal-payment').classList.add('open');
}

// Функция закрытия оплаты
async function closePaymentModal() {
    document.getElementById('modal-payment').classList.remove('open');
    window.pendingPaymentType = null;

    // Обновляем статус пользователя, вдруг он оплатил
    await loadUserProfile();

    // Обновляем кнопку товара, если мы на нём
    if (document.getElementById('view-product').classList.contains('active') && window.currentItemId) {
        // Вызываем открытие заново - это быстро обновит данные
        openProduct(window.currentItemId);
    }
}

function openMyItems(type) {
    window.isMyItemsContext = true;
    window.currentCategoryDetailsId = null;
    window.currentMyItemsType = type;

    // --- ДОБАВЛЕНО: Кнопка "Назад" ведет в Профиль ---
    const backBtn = document.querySelector('#view-my-items .back-btn');
    if (backBtn) backBtn.onclick = () => switchView('profile');
    // -------------------------------------------------

    const titleEl = document.getElementById('my-items-title');
    if (titleEl) {
        if (type === 'active') titleEl.innerText = 'Мои активные складчины';
        else if (type === 'completed') titleEl.innerText = 'Мои завершённые складчины';
        else if (type === 'unpaid') titleEl.innerText = 'Неоплаченные складчины';
    }
    switchView('my-items');
    loadMyItems(type);
}

// --- НОВАЯ ФУНКЦИЯ ДЛЯ БАННЕРА ---
async function openHotItems() {
    // Используем тот же экран, что и для "Моих складчин", но меняем контент
    window.isMyItemsContext = true;
    window.currentMyItemsType = 'hot'; // Специальный тип, чтобы знать, что обновлять

    // 1. Настраиваем заголовок и кнопку "Назад"
    const titleEl = document.getElementById('my-items-title');
    if (titleEl) titleEl.innerText = 'Осталось чуть-чуть (90-99%)';

    const backBtn = document.querySelector('#view-my-items .back-btn');
    // Важно: кнопка "Назад" должна возвращать на ГЛАВНУЮ, где был баннер
    if (backBtn) backBtn.onclick = () => switchView('home');

    switchView('my-items');

    // 2. Показываем загрузку
    const container = document.getElementById('my-items-container');
    if (!container) return;
    container.innerHTML = '<div style="padding:20px; text-align:center;">Загрузка горящих предложений...</div>';

    try {
        // 3. Загружаем популярные активные (обычно они и есть горящие)
        // Берем с запасом (50 штук), чтобы после фильтрации что-то осталось
        const r = await fetch(`${API_BASE_URL}/api/items?type=active&page=1&items_per_page=50&sort=popular`, { headers: getHeaders() });
        const allItems = await r.json();

        // 4. Фильтруем на клиенте (90% <= x < 100%)
        const hotItems = allItems.filter(item => {
            if (item.needed_participants <= 0) return false;
            const ratio = item.current_participants / item.needed_participants;
            return ratio >= 0.9 && ratio < 1.0;
        });

        // 5. Рисуем
        renderItems(container, hotItems);

    } catch (e) {
        console.error(e);
        container.innerHTML = '<div style="padding:20px; text-align:center;">Ошибка загрузки</div>';
    }
}

function openCategoryDetails(id, name, tabType = 'active') {
    window.currentCategoryDetailsId = id;
    window.currentCategoryTabType = tabType;
    window.isMyItemsContext = false;
    const titleEl = document.getElementById('cat-details-title');
    if (titleEl) titleEl.innerText = name;

    // Настраиваем кнопку "Назад" в зависимости от того, откуда пришли
    const backBtn = document.getElementById('cat-details-back-btn');
    if (backBtn) {
        if (window.isHomeContext) {
            backBtn.onclick = () => switchView('home');
        } else {
            backBtn.onclick = () => switchView('categories');
        }
    }

    document.querySelectorAll('#view-category-details .tab').forEach(t => t.classList.remove('active'));
    const targetTab = document.getElementById(tabType === 'completed' ? 'tab-cat-completed' : 'tab-cat-active');
    if (targetTab) targetTab.classList.add('active');

    switchView('category-details');
    loadCategoryItems(tabType);
}

function openFilter() {
    // Копируем текущее состояние во временное
    window.tempFilterState = JSON.parse(JSON.stringify(window.filterState));
    syncFilterUI();
    switchView('filter');
}
function closeFilter() { switchView('catalog'); }

function syncFilterUI() {
    const s = window.tempFilterState;

    // Сортировка
    document.querySelectorAll('.sort-btn').forEach(btn => {
        const onclick = btn.getAttribute('onclick');
        if (!onclick) return;
        const match = onclick.match(/'([^']+)'/);
        if (match && s.sort === match[1]) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    // Категории
    document.querySelectorAll('#filter-categories-container .chip-btn').forEach(btn => {
        const id = parseInt(btn.getAttribute('data-id'));
        if (s.categories.includes(id)) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    // Теги
    document.querySelectorAll('#filter-tags-container .chip-btn').forEach(btn => {
        const val = btn.getAttribute('data-val');
        if (s.tags.includes(val)) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    // Программы
    document.querySelectorAll('#filter-programs-container .chip-btn').forEach(btn => {
        const val = btn.getAttribute('data-val');
        if (s.programs.includes(val)) btn.classList.add('active');
        else btn.classList.remove('active');
    });
}

function performSearch(query) {
    const cleanQuery = query ? query.trim() : "";
    window.currentSearchQuery = cleanQuery;

    // Переходим в каталог, если мы были на другом экране
    switchView('catalog');

    // Загружаем товары с учетом нового поиска
    loadItems(window.currentCatalogTabType || 'active');
}

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
            if (el) el.innerText = user.first_name || user.username || "Пользователь";
        });

        const els = {
            'profile-status-text': user.status,
            'profile-active-count': user.active_count,
            'profile-completed-count': user.completed_count
        };
        for (const [id, val] of Object.entries(els)) {
            const el = document.getElementById(id);
            if (el) el.innerText = val;
        }

        const dateEl = document.getElementById('profile-join-date');
        if (dateEl && user.registration_date) {
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
    if (!container) return;
    container.innerHTML = '<div style="padding:20px; text-align:center;">Загрузка...</div>';
    try {
        let url = `${API_BASE_URL}/api/items?type=${type}&page=1`;
        if (type === 'all') url += '&joined=true';
        if (window.filterState.categories.length > 0) url += `&cat=${window.filterState.categories.join(',')}`;
        if (window.filterState.tags.length > 0) url += `&tags=${window.filterState.tags.join(',')}`;
        if (window.filterState.programs.length > 0) url += `&programs=${window.filterState.programs.join(',')}`;
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
        if (window.currentSearchQuery) img = "icons/Поиск без фона.png";

        // ИЗМЕНЕНИЕ: width увеличили с 140px до 210px
        container.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:40px 20px; height:50vh;">
                <img src="${img}" style="width:210px; margin-bottom:20px; opacity:0.9;">
                <div style="color:#a2a5b9; font-size:16px; font-weight:600;">Ничего нет</div>
            </div>
        `;
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
            percent = (item.paid_count / item.needed_participants) * 100;
            barClass += " blue";
        } else {
            percent = (item.current_participants / item.needed_participants) * 100;
            barClass += " gradient";
        }
    }
    if (percent > 100) percent = 100;

    if (item.status_text) {
        statusText = item.status_text;
    } else {
        // Fallback если вдруг API старое
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
        } else if (item.status === 'scheduled_fundraising') {
            const dateStr = formatDate(item.start_at);
            barClass = "progress-fill blue"; percent = 0;
            if (item.is_joined) { statusText = `✅ Сбор с ${dateStr}`; badgeColor = "#2ecc71"; }
            else { statusText = `⚠️ Сбор с ${dateStr}`; badgeColor = "#ff7675"; }
        } else if (item.status === 'completed') {
            statusText = "Завершена"; barClass = "progress-fill blue"; badgeColor = "#a2a5b9"; percent = 100;
            if (item.payment_status === 'paid') { statusText = "✅ Доступно"; badgeColor = "#2ecc71"; }
        }
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

function formatDate(isoString) {
    if (!isoString) return "";
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
    } catch (e) { return ""; }
}

async function openProduct(id) {
    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) bottomNav.style.display = 'none';

    // 1. ОЧИСТКА ДАННЫХ (Чтобы не было видно текста с прошлой складчины)
    document.getElementById('product-header-title').innerText = "";
    document.getElementById('product-desc').innerHTML = "";
    document.getElementById('product-price-orig').innerText = "";
    document.getElementById('product-price-contrib').innerText = "";
    document.getElementById('product-cover-img').src = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="; // Пустая прозрачная картинка

    // Сбрасываем кнопку
    const btn = document.getElementById('product-action-btn');
    btn.innerText = "";
    btn.disabled = true;

    // Скрываем теги и статус
    const tagsContainer = document.getElementById('product-tags');
    if (tagsContainer) tagsContainer.innerHTML = '';
    document.getElementById('product-status-text').innerText = '';

    // 2. ПЕРЕКЛЮЧЕНИЕ ЭКРАНА
    switchView('product');
    window.scrollTo(0, 0);

    window.currentItemId = id;
    saveNavState('product'); // Явно сохраняем после установки ID
    showPreloader(true);

    try {
        const headers = getHeaders();
        if (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) {
            headers['X-Telegram-User-Id'] = window.Telegram.WebApp.initDataUnsafe.user.id;
        }

        // Запрос (теперь он будет быстрым благодаря правке в main.py)
        const r = await fetch(`${API_BASE_URL}/api/items/${id}?t=${Date.now()}`, { headers: headers });
        if (!r.ok) throw new Error(`Server Error: ${r.status}`);

        const item = await r.json();

        // 3. ЗАПОЛНЕНИЕ ДАННЫХ
        document.getElementById('product-header-title').innerText = item.name;
        document.getElementById('product-desc').innerHTML = item.description ? item.description.replace(/\n/g, '<br>') : 'Описание отсутствует';

        const linkEl = document.getElementById('product-link-ext');
        linkEl.onclick = (e) => { e.preventDefault(); tg.openLink(item.link); };

        document.getElementById('product-category').innerText = item.category ? "#" + item.category : "";

        // Теги
        if (tagsContainer) {
            tagsContainer.innerHTML = '';
            let tagsList = [];
            if (Array.isArray(item.tags)) tagsList = item.tags;
            else if (typeof item.tags === 'string' && item.tags.trim() !== '') tagsList = item.tags.split(',').map(t => t.trim());

            // Программы --- отображаем перед тегами
            let progsList = [];
            if (Array.isArray(item.programs)) progsList = item.programs;
            else if (typeof item.programs === 'string' && item.programs.trim() !== '') progsList = item.programs.split(',').map(p => p.trim());

            progsList.forEach(prog => {
                if (prog) {
                    const sp = document.createElement('span');
                    sp.className = 'tag-list';
                    sp.style.fontWeight = '600';
                    sp.innerText = '#' + prog + ' ';
                    tagsContainer.appendChild(sp);
                }
            });

            if (tagsList.length > 0) {
                tagsList.forEach(tag => {
                    const cleanTag = tag.replace(/[\[\]"']/g, '');
                    if (cleanTag) {
                        const sp = document.createElement('span');
                        sp.className = 'tag-list';
                        sp.innerText = "#" + cleanTag + " ";
                        tagsContainer.appendChild(sp);
                    }
                });
            }
        }

        // Цены
        document.getElementById('product-price-orig').innerText = "$" + item.price;
        const contribution = (item.status === 'completed') ? "200₽" : "100₽";
        document.getElementById('product-price-contrib').innerText = contribution;

        // Участники
        const currentPart = item.current_participants || 0;
        const neededPart = item.needed_participants || item.participants_needed || 1;
        document.getElementById('participants-count').innerText = `${currentPart}/${neededPart}`;

        // Прогресс
        const bar = document.getElementById('product-progress-fill');
        bar.className = 'progress-fill';
        let percent = 0;
        if (neededPart > 0) {
            const cur = (item.status === 'fundraising') ? (item.paid_count || 0) : currentPart;
            percent = (cur / neededPart) * 100;
            if (item.status === 'fundraising') bar.classList.add('blue');
            else bar.classList.add('gradient');
        }
        bar.style.width = Math.min(100, percent) + "%";

        // КАРТИНКА (Простая логика: что сервер дал, то и ставим)
        const coverImg = document.getElementById('product-cover-img');
        if (coverImg) {
            coverImg.onerror = null;
            // Если сервер вернул url - отлично. Если нет - заглушка.
            coverImg.src = item.cover_url || "icons/Ничего нет без фона.png";
        }

        // Видео
        window.currentVideoLinks = item.videos || {};
        if (Object.keys(window.currentVideoLinks).length > 0) {
            document.getElementById('video-switchers').style.display = 'flex';
            if (window.currentVideoLinks.vk) switchVideo('vk');
            else if (window.currentVideoLinks.youtube) switchVideo('youtube');
            else switchVideo('rutube');
        } else {
            document.getElementById('video-switchers').style.display = 'none';
            switchVideo('none');
        }

        // Кнопки и статусы
        const leaveBtn = document.getElementById('product-leave-btn');
        const statusText = document.getElementById('product-status-text');
        const fundLabel = document.getElementById('fundraising-label-row');

        if (fundLabel) fundLabel.style.display = 'none';
        if (leaveBtn) leaveBtn.style.display = 'none';

        btn.disabled = false;
        btn.style.opacity = "1";
        btn.className = 'btn-primary';
        btn.style.backgroundColor = "";
        btn.onclick = null;

        const isJoined = item.is_joined;
        const pStatus = item.payment_status;

        // --- НОВАЯ ЛОГИКА: Используем конфиг с сервера (api.py) ---
        if (item.button_config) {
            const cfg = item.button_config;
            console.log("Button Config received:", cfg);
            btn.innerText = cfg.text;
            btn.disabled = cfg.disabled;
            if (cfg.disabled) btn.style.opacity = "0.6";

            // Очищаем старые обработчики
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            const activeBtn = document.getElementById('product-action-btn');

            // Цвета кнопок
            if (cfg.text === "Вы записаны" || cfg.text === "Оплачено" || cfg.text === "Получить файлы") {
                activeBtn.style.backgroundColor = "#2ecc71"; // Зеленый
            } else if (cfg.text === "Оплатить" || cfg.text === "Оплатить взнос" || cfg.text === "Оплатить (200₽)") {
                activeBtn.style.backgroundColor = "#0984e3"; // Синий
            } else if (cfg.text === "Купить" || cfg.text === "Купить запись" || cfg.text === "Купить (200₽)") {
                activeBtn.style.backgroundColor = "#fdcb6e"; // Желтый
                activeBtn.style.color = "#ffffff";
            } else if (cfg.action.startsWith('alert_')) {
                activeBtn.style.opacity = "0.6";
                activeBtn.style.backgroundColor = "var(--text-secondary)";
            }

            // Действия
            if (cfg.action === 'join') {
                activeBtn.onclick = () => handleProductAction();
            } else if (cfg.action === 'pay' || cfg.action === 'buy' || cfg.action === 'join_pay') {
                activeBtn.onclick = () => {
                    if (window.currentUserStatus === 'Штрафник') {
                        updateStatusModal('Штрафник', 0);
                        openModal();
                    } else {
                        // Для buy и pay открываем модалку оплаты
                        openPaymentModal(cfg.action === 'buy' ? 'buy' : 'pay');
                    }
                };
            } else if (cfg.action === 'alert_novice') {
                activeBtn.onclick = () => tg.showAlert("Покупка материалов в завершённых складчинах доступна только ОПЫТНЫМ пользователям");
            } else if (cfg.action === 'alert_wait') {
                activeBtn.onclick = () => tg.showAlert("Оплатить взнос в завершённой складчине можно будет через неделю после её завершения");
            } else if (cfg.action === 'alert_closed') {
                activeBtn.onclick = () => tg.showAlert("Записываться в складчины можно только до начала сбора средств!");
            } else if (cfg.action === 'files') {
                activeBtn.onclick = () => getFiles();
            }
        } else {
            console.warn("No button_config in item details!");
        }

        if (item.status_text) {
            statusText.innerText = item.status_text;
        }

        // Доп. элементы для специфичных статусов
        if (item.status === 'active' || item.status === 'published' || item.status === 'scheduled' || item.status === 'scheduled_fundraising') {
            if (isJoined && leaveBtn) leaveBtn.style.display = 'flex';
        }

        if (item.status === 'fundraising') {
            if (fundLabel) fundLabel.style.display = 'flex';
            if (document.getElementById('fundraising-count'))
                document.getElementById('fundraising-count').innerText = `${item.paid_count || 0}/${neededPart}`;
        }

        // --- СТАРАЯ ЛОГИКА (DISABLE) ---
        /*
        // Логика кнопок
        if (['published', 'active', 'scheduled'].includes(item.status)) {
            statusText.innerText = "Активная складчина";
            if (isJoined) {
                btn.innerText = "Вы записаны";
                btn.style.backgroundColor = "#2ecc71";
                if(leaveBtn) leaveBtn.style.display = 'flex';
            } else {
                btn.innerText = "Записаться";
                btn.onclick = () => handleProductAction();
            }
        }
        ...
        */
    } catch (e) {
        console.error(e);
        showCustomAlert("Ошибка: " + e.message, "Ошибка WebApp");
    } finally {
        showPreloader(false);
    }
}

function closeProduct() {
    // Останавливаем видео
    document.getElementById('main-video-frame').src = "";

    if (window.isMyItemsContext) {
        // Если пришли из профиля или из списка "Горящие"
        switchView('my-items');

        // Если это был список Hot Items - перезагружаем его спец. функцией
        if (window.currentMyItemsType === 'hot') {
            openHotItems();
        } else {
            loadMyItems(window.currentMyItemsType);
        }
    }
    else if (window.currentCategoryDetailsId) {
        // Если пришли из категории
        switchView('category-details');
    }
    else if (window.isHomeContext) {
        // --- НОВОЕ: Если пришли с Главной (Топ 5) ---
        switchView('home');
    }
    else {
        // Иначе (по умолчанию) в Каталог
        switchView('catalog');
        loadItems(window.currentCatalogTabType || 'active');
    }
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
            if (result.error === 'penalty') {
                updateStatusModal('Штрафник', 0);
                openModal();
            }
            else { showCustomAlert(result.message || "Не удалось", "Ошибка"); }
            btn.innerText = originalText; btn.disabled = false;
        }
    } catch (error) { showCustomAlert("Ошибка соединения", "Ошибка"); btn.innerText = originalText; btn.disabled = false; }
}

async function leaveProduct() {
    console.log("leaveProduct called for item:", window.currentItemId);
    if (!window.currentItemId) {
        showCustomAlert("Критическая ошибка: ID складчины не найден.", "Ошибка");
        return;
    }

    if (!tg) {
        console.error("Telegram WebApp object not found!");
        return;
    }

    tg.showConfirm("Точно хотите выйти из складчины?", async (ok) => {
        if (!ok) return;

        const btn = document.getElementById('product-leave-btn');
        if (btn) btn.disabled = true;

        try {
            const response = await fetch(`${API_BASE_URL}/api/leave`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({
                    user_id: USER_ID,
                    item_id: window.currentItemId
                })
            });

            const result = await response.json();
            console.log("Leave result:", result);

            if (result.success) {
                // Пытаемся перезагрузить данные товара для обновления UI
                await openProduct(window.currentItemId);
            } else {
                if (result.error === 'locked') {
                    showCustomAlert('После объявления сбора средств выйти нельзя.', 'Внимание');
                } else {
                    showCustomAlert(result.error || "Ошибка выхода", "Ошибка");
                }
                if (btn) btn.disabled = false;
            }
        } catch (e) {
            console.error("Leave error:", e);
            showCustomAlert("Ошибка соединения", "Ошибка");
            if (btn) btn.disabled = false;
        }
    });
}

// --- ОТКРЫТИЕ МЕНЮ БОТА (ЕДИНЫЙ СПОСОБ) ---
async function selectPaymentMethod(method) {
    if (!USER_ID) return;

    const isPenalty = window.pendingPaymentType === 'penalty';
    const itemId = isPenalty ? 0 : window.currentItemId;
    const payType = isPenalty ? 'penalty' : 'item';

    if (itemId === undefined || itemId === null) {
        showCustomAlert("Ошибка: ID товара не найден", "Ошибка");
        return;
    }

    // Показываем индикатор загрузки на кнопке
    let btn;
    if (method === 'yoomoney') btn = document.querySelector('.pay-method-btn.yoo');
    else if (method === 'crypto') btn = document.querySelector('.pay-method-btn.crypto');
    else if (method === 'manual') btn = document.querySelector('.pay-method-btn.manual');

    let ogText = "";
    if (btn) {
        ogText = btn.innerHTML;
        btn.innerHTML = '<span>⏳...</span>';
        btn.disabled = true;
    }

    try {
        const payload = {
            user_id: USER_ID,
            method: method,
            type: payType,
            item_id: itemId
        };

        const res = await fetch(`${API_BASE_URL}/api/payment/init`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'telegram-data': tg.initData || ''
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (btn) {
            btn.innerHTML = ogText;
            btn.disabled = false;
        }

        if (data.success) {
            tg.close();
        } else {
            if (data.error === 'novice_restriction') {
                showCustomAlert("Покупка в завершённых складчинах доступна только Опытным пользователям.", "Внимание");
                closePaymentModal();
            } else if (data.error === 'wait_restriction') {
                showCustomAlert("Оплатить взнос в завершённой складчине можно будет через неделю.", "Внимание");
                closePaymentModal();
            } else {
                showCustomAlert(data.error || "Ошибка инициализации оплаты", "Ошибка");
            }
        }
    } catch (e) {
        console.error(e);
        if (btn) {
            btn.innerHTML = ogText;
            btn.disabled = false;
        }
        showCustomAlert("Произошла ошибка при обращении к серверу", "Ошибка");
    }
}

function updateStatusModal(status, completedCount) {
    const title = document.getElementById('modal-status-title');
    const desc = document.getElementById('modal-status-desc');
    const img = document.getElementById('modal-status-img');
    const okBtn = document.getElementById('modal-status-ok-btn');
    const penaltyBtns = document.getElementById('modal-status-penalty-btns');
    if (title) title.innerText = status;
    if (okBtn) okBtn.style.display = 'block';
    if (penaltyBtns) penaltyBtns.style.display = 'none';
    if (status === 'Новичок' || status === 'Novice') {
        const needed = Math.max(0, 10 - completedCount);
        if (desc) desc.innerText = `Для получения статуса «Опытный» осталось завершить ещё ${needed} складчин.`;
        if (img) img.src = "icons/Новичок Без фона.png";
    } else if (status === 'Опытный' || status === 'Experienced') {
        if (desc) desc.innerText = "Теперь вы можете оплачивать взносы в завершённых складчинах";
        if (img) {
            img.src = "icons/Супермэн без фона.png";
            // --- ПЕРСОНАЛЬНЫЕ НАСТРОЙКИ ДЛЯ РОБОТА ---
            img.style.width = "242px";        // +10%
            img.style.height = "242px";
            img.style.transform = "translateX(30px)"; // Сдвиг вправо
        }
    } else if (status === 'Штрафник' || status === 'Penalty' || status === 'Shrafnik') {
        if (desc) desc.innerText = "Вы не можете записываться в новые складчины и оплачивать взносы, пока не оплатите штраф";
        if (img) img.src = "icons/Штрафник без фона.png";
        if (okBtn) okBtn.style.display = 'none';
        if (penaltyBtns) penaltyBtns.style.display = 'flex';
    }
}

function switchVideo(platform) {
    const wrapper = document.getElementById('video-wrapper-el');
    const iframe = document.getElementById('main-video-frame');
    const placeholder = document.getElementById('no-video-placeholder');
    const btns = document.querySelectorAll('.platform-btn');
    btns.forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`btn-${platform}`);
    if (btn) btn.classList.add('active');
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
    } else if (videoUrl.includes('vk.com/video') || videoUrl.includes('vkvideo.ru/video')) {
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
    else if (el.innerText.includes('Мои')) type = 'all'; // "Мои складчины" в общем каталоге

    // Запоминаем выбор
    window.currentCatalogTabType = type;

    loadItems(type);
}
function selectCategoryInnerTab(type) {
    // 1. Переключаем визуальный класс active
    const tabActive = document.getElementById('tab-cat-active');
    const tabCompleted = document.getElementById('tab-cat-completed');

    if (tabActive) tabActive.classList.remove('active');
    if (tabCompleted) tabCompleted.classList.remove('active');

    if (type === 'active' && tabActive) {
        tabActive.classList.add('active');
    } else if (type === 'completed' && tabCompleted) {
        tabCompleted.classList.add('active');
    }

    window.currentCategoryTabType = type;
    saveNavState('category-details');

    // 2. Загружаем данные
    loadCategoryItems(type);
}
function selectTabByName(name) {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(t => { if (t.innerText.includes(name)) selectTab(t); });
}
function selectSort(sort, btn) {
    window.tempFilterState.sort = sort;
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}
function toggleCategory(id, btn) {
    const idx = window.tempFilterState.categories.indexOf(id);
    if (idx === -1) { window.tempFilterState.categories.push(id); btn.classList.add('active'); }
    else { window.tempFilterState.categories.splice(idx, 1); btn.classList.remove('active'); }
}
function toggleTag(tag, btn) {
    const idx = window.tempFilterState.tags.indexOf(tag);
    if (idx === -1) { window.tempFilterState.tags.push(tag); btn.classList.add('active'); }
    else { window.tempFilterState.tags.splice(idx, 1); btn.classList.remove('active'); }
}
function toggleProgram(prog, btn) {
    const idx = window.tempFilterState.programs.indexOf(prog);
    if (idx === -1) { window.tempFilterState.programs.push(prog); btn.classList.add('active'); }
    else { window.tempFilterState.programs.splice(idx, 1); btn.classList.remove('active'); }
}
function resetFilter() {
    window.tempFilterState = { sort: 'new', categories: [], tags: [], programs: [] };
    syncFilterUI();
}
function applyFilter() {
    window.filterState = JSON.parse(JSON.stringify(window.tempFilterState));
    closeFilter();
    let type = window.currentCatalogTabType || 'active';
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
                const d = document.createElement('div'); d.className = 'category-card'; d.innerText = c.name;
                d.onclick = () => {
                    window.isHomeContext = true;
                    openCategoryDetails(c.id, c.name);
                };
                homeGrid.appendChild(d);
            });
        }
        const filterCont = document.getElementById('filter-categories-container');
        if (filterCont) {
            filterCont.innerHTML = '';
            cats.forEach(c => {
                const b = document.createElement('div'); b.className = 'chip-btn'; b.innerText = c.name;
                b.setAttribute('data-id', c.id);
                b.onclick = () => toggleCategory(c.id, b);
                filterCont.appendChild(b);
            });
        }
    } catch (e) { console.error(e); }
}
async function loadTags() {
    try {
        const r = await fetch(`${API_BASE_URL}/api/tags`, { headers: getHeaders() });
        const tags = await r.json();
        const cont = document.getElementById('filter-tags-container');
        if (cont) {
            cont.innerHTML = '';
            tags.forEach(t => {
                const b = document.createElement('div'); b.className = 'chip-btn'; b.innerText = t;
                b.setAttribute('data-val', t);
                b.onclick = () => toggleTag(t, b);
                cont.appendChild(b);
            });
        }
    } catch (e) { console.error(e); }
}
async function loadPrograms() {
    try {
        const r = await fetch(`${API_BASE_URL}/api/programs`, { headers: getHeaders() });
        const programs = await r.json();
        const cont = document.getElementById('filter-programs-container');
        if (cont) {
            cont.innerHTML = '';
            programs.forEach(p => {
                const b = document.createElement('div'); b.className = 'chip-btn'; b.innerText = p;
                b.setAttribute('data-val', p);
                b.onclick = () => toggleProgram(p, b);
                cont.appendChild(b);
            });
        }
    } catch (e) { console.error(e); }
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

    // Ставим флаг, что открываем с Главной
    card.onclick = () => {
        window.isHomeContext = true;
        openProduct(item.id);
    };

    // Определяем текст подзаголовка
    let metaText = "";
    let statusColor = "#00cec9"; // По умолчанию бирюзовый

    if (item.status === 'completed') {
        metaText = "Завершена • Файлы доступны";
        statusColor = "#fdcb6e"; // Желтый
        if (item.payment_status === 'paid') {
            statusColor = "#2ecc71"; // Зеленый
            metaText = "Куплено вами";
        }
    } else if (item.status === 'fundraising') {
        metaText = `Участников: ${item.paid_count}/${item.needed_participants}`;
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
            row.onclick = () => {
                window.isHomeContext = false;
                openCategoryDetails(cat.id, cat.name);
            };
            container.appendChild(row);
        });
    } catch (e) { console.error(e); }
}

// ==========================================
// ЛОГИКА БАННЕРОВ
// ==========================================

async function loadBanners() {
    const container = document.getElementById('banner-container');
    if (!container) return;
    container.innerHTML = '';

    const DEBUG_MODE = false;

    // 1. Получаем статус пользователя (если еще не загрузился, считаем Новичком)
    const status = window.currentUserStatus || 'Новичок';

    // Заглушка для подписки (пока считаем, что не подписан)
    const isSubscriber = false;

    // 2. ПРОВЕРКА: Неоплаченные складчины
    let hasUnpaidItems = false;
    try {
        const rMy = await fetch(`${API_BASE_URL}/api/items?type=active&joined=true`, { headers: getHeaders() });
        const myItems = await rMy.json();
        // Ищем: статус 'fundraising' (сбор идет) И статус участника НЕ 'paid'
        hasUnpaidItems = myItems.some(i => i.status === 'fundraising' && i.payment_status !== 'paid');
    } catch (e) { console.error("Err unpaid:", e); }

    // 3. ПРОВЕРКА: Горящие складчины (90%+)
    let hasHotItems = false;
    try {
        const rHot = await fetch(`${API_BASE_URL}/api/items?type=active&page=1&items_per_page=50&sort=popular`, { headers: getHeaders() });
        const hotItemsList = await rHot.json();
        hasHotItems = hotItemsList.some(item => {
            if (item.needed_participants <= 0) return false;
            const ratio = item.current_participants / item.needed_participants;
            // Строго: больше или равно 0.9 И меньше 1.0 (то есть не 100%)
            return ratio >= 0.9 && ratio < 1.0;
        });
    } catch (e) { console.error("Err hot:", e); }

    // --- БАЗА ВСЕХ БАННЕРОВ ---
    const allBanners = {
        'penalty': {
            type: 'penalty',
            onClick: "openPaymentModal('penalty')",
            html: `
                <div class="banner-content">
                    <div class="banner-title">Ты стал Штрафником</div>
                </div>
                <img src="icons/500 Без фона.png" class="banner-img">
            `
        },
        'unpaid': {
            type: 'unpaid',
            onClick: "openMyItems('unpaid')",
            html: `
                <div class="banner-content">
                    <div class="banner-title">Не забудь оплатить!</div>
                </div>
                <img src="icons/Времени мало без фона.png" class="banner-img">
            `
        },
        'subscribe': {
            type: 'subscribe',
            onClick: "Telegram.WebApp.openTelegramLink('https://t.me/+iTqdmfAbMb41YTli')",
            html: `
                <div class="banner-content">
                    <div class="banner-title">Подписывайся на наш канал</div>
                </div>
                <img src="icons/Телеграм без фона.png" class="banner-img">
            `
        },
        'payment_info': {
            type: 'payment',
            html: `
                <div class="banner-content">
                    <div class="banner-title">Оплата картой или криптой</div>
                </div>
                <img src="icons/Оплата Без фона.png" class="banner-img">
            `
        },
        'help_promo': {
            type: 'info',
            onClick: "requestHelp()",
            html: `
                <div class="banner-content">
                    <div class="banner-title">Посмотри обучающие видео</div>
                </div>
                <img src="icons/Учитель без фона.png" class="banner-img">
            `
        },
        'novice_tip': {
            type: 'success',
            onClick: "openModal()",
            html: `
                <div class="banner-content">
                    <div class="banner-title">Как стать Опытным пользователем?</div>
                </div>
                <img src="icons/Супермэн 2 без фона.png" class="banner-img">
            `
        },
        'hot_items': {
            type: 'hot',
            onClick: "openHotItems()",
            html: `
                <div class="banner-content">
                    <div class="banner-title">Горящие складчины: осталось чуть-чуть</div>
                </div>
                <img src="icons/Загрузка-без-фона.png" class="banner-img">
            `
        }
    };

    // --- ЛОГИКА ОТРИСОВКИ ---

    if (DEBUG_MODE) {
        Object.values(allBanners).forEach(b => renderOneBanner(container, b));
        return;
    }

    // 1. ШТРАФНИК (Высший приоритет)
    if (status === 'Штрафник') {
        renderOneBanner(container, allBanners['penalty']);
        return; // Остальные не показываем
    }

    // 2. ДОЛЖНИК (Высокий приоритет)
    if (hasUnpaidItems) {
        renderOneBanner(container, allBanners['unpaid']);
        return; // Остальные не показываем
    }

    // 3. РОТАЦИЯ (Обычный режим)
    const rotationPool = [];

    rotationPool.push(allBanners['payment_info']);
    rotationPool.push(allBanners['help_promo']);

    if (!isSubscriber) {
        rotationPool.push(allBanners['subscribe']);
    }

    if (status === 'Новичок') {
        rotationPool.push(allBanners['novice_tip']);
    }

    if (hasHotItems) {
        rotationPool.push(allBanners['hot_items']);
    }

    if (rotationPool.length > 0) {
        const randomBanner = rotationPool[Math.floor(Math.random() * rotationPool.length)];
        renderOneBanner(container, randomBanner);
    }
}

function renderOneBanner(container, bannerData) {
    const div = document.createElement('div');
    div.className = `banner ${bannerData.type}`;
    if (bannerData.onClick) {
        div.setAttribute('onclick', bannerData.onClick);
        div.style.cursor = 'pointer';
    }
    div.innerHTML = bannerData.html;
    container.appendChild(div);
}


function requestHelp() {
    // Отправляем данные боту
    tg.sendData("cmd_help");
    // Закрываем окно
    // (на самом деле sendData и так часто закрывает окно, но для надежности)
}

function sendAltPayRequest() {
    selectPaymentMethod('manual');
}
