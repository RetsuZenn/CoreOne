// ====================================================================
//  CoreOne - Daily Essentials App
//  Main JavaScript File - PHP/MySQL Backend
// ====================================================================

// ===== GLOBAL STATE =====
let todos = [];
let notes = [];
let users = {};
let currentUser = null;
let currentFilter = 'all';
let currentPage = 1;
const ITEMS_PER_PAGE = 10;
let deleteCallback = null;
let currentViewNoteId = null;
let editingNoteId = null;
let notifTimers = [];
let currentAlarmTask = null;
let dbPromise = null;
let adminStats = {};
let adminUsers = [];
let adminTodos = [];
let adminNotes = [];
let adminDashboardLoaded = false;

// ===== CALCULATOR STATE =====
let calcCurrent = '0';
let calcPrevious = '';
let calcOperation = null;
let calcNewNumber = true;

// ===== NOTIFICATION SETTINGS =====
let notifSettings = {
    enabled: true,
    sound: true,
    reminderBefore: 5
};

const API_BASE = 'api';

async function apiRequest(path, options = {}) {
    const hasBody = options.body !== undefined && options.body !== null;
    const response = await fetch(`${API_BASE}/${path}`, {
        credentials: 'same-origin',
        ...options,
        headers: {
            Accept: 'application/json',
            ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
            ...(options.headers || {})
        }
    });

    let data;
    try {
        data = await response.json();
    } catch (error) {
        throw new Error('Invalid server response.');
    }

    if (!response.ok || !data.success) {
        throw new Error(data.message || 'Request failed.');
    }

    return data;
}

const DB_NAME = 'coreone_offline_db';
const DB_VERSION = 1;
const META_KEYS = {
    CURRENT_USER: 'currentUser',
    MIGRATION_DONE: 'migrationDone'
};

function requestToPromise(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function transactionToPromise(transaction) {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
    });
}

function openDatabase() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;

            if (!db.objectStoreNames.contains('users')) {
                db.createObjectStore('users', { keyPath: 'username' });
            }
            if (!db.objectStoreNames.contains('todos')) {
                db.createObjectStore('todos', { keyPath: 'username' });
            }
            if (!db.objectStoreNames.contains('notes')) {
                db.createObjectStore('notes', { keyPath: 'username' });
            }
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings', { keyPath: 'username' });
            }
            if (!db.objectStoreNames.contains('appMeta')) {
                db.createObjectStore('appMeta', { keyPath: 'key' });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

    return dbPromise;
}

async function getRecord(storeName, key) {
    const db = await openDatabase();
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const result = await requestToPromise(store.get(key));
    await transactionToPromise(transaction);
    return result;
}

async function putRecord(storeName, value) {
    const db = await openDatabase();
    const transaction = db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(value);
    await transactionToPromise(transaction);
}

async function getAllRecords(storeName) {
    const db = await openDatabase();
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const result = await requestToPromise(store.getAll());
    await transactionToPromise(transaction);
    return result;
}

async function saveCurrentSession(user) {
    await putRecord('appMeta', {
        key: META_KEYS.CURRENT_USER,
        value: user || null
    });
}

async function loadCurrentSession() {
    const meta = await getRecord('appMeta', META_KEYS.CURRENT_USER);
    return meta ? meta.value : null;
}

async function loadUsersFromDatabase() {
    const records = await getAllRecords('users');
    return records.reduce((acc, user) => {
        acc[user.username] = user;
        return acc;
    }, {});
}

async function migrateLocalStorageToDatabase() {
    const migrationMeta = await getRecord('appMeta', META_KEYS.MIGRATION_DONE);
    if (migrationMeta?.value) return;

    const legacyUsers = JSON.parse(localStorage.getItem('coreone_users') || '{}');
    const legacyCurrentUser = JSON.parse(localStorage.getItem('coreone_current_user') || 'null');

    for (const user of Object.values(legacyUsers)) {
        await putRecord('users', user);

        const todosKey = `coreone_todos_${user.username}`;
        const notesKey = `coreone_notes_${user.username}`;
        const settingsKey = `coreone_settings_${user.username}`;

        const storedTodos = JSON.parse(localStorage.getItem(todosKey) || '[]');
        const storedNotes = JSON.parse(localStorage.getItem(notesKey) || '[]');
        const storedSettings = JSON.parse(localStorage.getItem(settingsKey) || 'null');

        await putRecord('todos', { username: user.username, items: storedTodos });
        await putRecord('notes', { username: user.username, items: storedNotes });

        if (storedSettings) {
            await putRecord('settings', { username: user.username, value: storedSettings });
        }
    }

    if (legacyCurrentUser) {
        await saveCurrentSession(legacyCurrentUser);
    }

    await putRecord('appMeta', {
        key: META_KEYS.MIGRATION_DONE,
        value: true
    });
}

async function initializeOfflineDatabase() {
    await openDatabase();
    await migrateLocalStorageToDatabase();
    users = await loadUsersFromDatabase();
    currentUser = await loadCurrentSession();
}

// ====================================================================
//  PASSWORD VISIBILITY TOGGLE
// ====================================================================
function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    const button = event.target;
    
    if (input.type === 'password') {
        input.type = 'text';
        button.textContent = 'Hide';
    } else {
        input.type = 'password';
        button.textContent = 'Show';
    }
}

// ====================================================================
//  INITIALIZATION
// ====================================================================
document.addEventListener('DOMContentLoaded', function () {
    createParticles();
    showLoginPage();
    checkAuth().catch(error => console.error(error));
    setGreeting();
    requestNotificationPermission();
});

// ===== CREATE PARTICLES =====
function createParticles() {
    const container = document.getElementById('particles');
    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDuration = (Math.random() * 15 + 10) + 's';
        particle.style.animationDelay = (Math.random() * 10) + 's';
        particle.style.width = (Math.random() * 3 + 2) + 'px';
        particle.style.height = particle.style.width;
        container.appendChild(particle);
    }
}

// ===== SET GREETING =====
function setGreeting() {
    const hour = new Date().getHours();
    let greeting = 'Morning';
    if (hour >= 12 && hour < 17) greeting = 'Afternoon';
    else if (hour >= 17 && hour < 21) greeting = 'Evening';
    else if (hour >= 21 || hour < 5) greeting = 'Night';

    const el = document.getElementById('greeting');
    if (el) el.textContent = greeting;

    const dateEl = document.getElementById('todayDate');
    if (dateEl) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dateEl.textContent = new Date().toLocaleDateString('en-US', options);
    }
}

// ====================================================================
//  AUTHENTICATION (PHP/MySQL)
// ====================================================================
async function checkAuth() {
    showLoginPage();

    try {
        const data = await apiRequest('auth/me.php', {
            method: 'GET'
        });

        currentUser = data.user;
        await showMainApp();
    } catch (error) {
        currentUser = null;
        showLoginPage();
    }
}


function showLoginPage() {
    document.getElementById('loginPage').classList.add('active');
    document.getElementById('signupPage').classList.remove('active');
    document.getElementById('mainContent').classList.remove('active');
    document.getElementById('bottomNav').classList.remove('active');
    const adminBtn = document.getElementById('adminDashboardBtn');
    if (adminBtn) adminBtn.style.display = 'none';
}

function showSignup() {
    document.getElementById('loginPage').classList.remove('active');
    document.getElementById('signupPage').classList.add('active');
    document.getElementById('mainContent').classList.remove('active');
    document.getElementById('bottomNav').classList.remove('active');
}

function showLogin() {
    document.getElementById('signupPage').classList.remove('active');
    document.getElementById('loginPage').classList.add('active');
    document.getElementById('mainContent').classList.remove('active');
    document.getElementById('bottomNav').classList.remove('active');
}

async function showMainApp() {
    document.getElementById('loginPage').classList.remove('active');
    document.getElementById('signupPage').classList.remove('active');
    document.getElementById('mainContent').classList.add('active');
    document.getElementById('bottomNav').classList.add('active');

    // Update user display
    if (currentUser) {
        const displayName = currentUser.username || 'User';
        document.getElementById('displayName').textContent = displayName;
        document.getElementById('welcomeName').textContent = displayName;
        document.getElementById('menuUserName').textContent = displayName;
        document.getElementById('menuUserEmail').textContent = currentUser.email || '';
    }

    const adminBtn = document.getElementById('adminDashboardBtn');
    if (adminBtn) adminBtn.style.display = currentUser?.is_admin ? 'flex' : 'none';
    adminDashboardLoaded = false;

    // Load data from the backend
    await Promise.all([
        loadTodosFromStorage(),
        loadNotesFromStorage(),
        loadSettingsFromStorage()
    ]);

    updateStats();
    renderTodos();
    renderNotes();
    renderUpcoming();
    startNotificationChecker();
    if (currentUser?.is_admin) {
        adminStatusMessage('Admin tools ready.');
    }
}

// ===== EMAIL LOGIN (PHP/MySQL) =====
async function loginWithEmail() {
    const userInput = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value.trim();

    if (!userInput) {
        shakeElement(document.getElementById('loginEmail'));
        showToast('Error', 'Please enter email or username');
        return;
    }
    if (!password) {
        shakeElement(document.getElementById('loginPassword'));
        showToast('Error', 'Please enter password');
        return;
    }

    try {
        const data = await apiRequest('auth/login.php', {
            method: 'POST',
            body: JSON.stringify({
                identifier: userInput,
                password
            })
        });

        currentUser = data.user;

        document.getElementById('loginEmail').value = '';
        document.getElementById('loginPassword').value = '';

        showToast('Success', 'Logged in successfully!');
        await showMainApp();
    } catch (error) {
        showToast('Login Failed', error.message || 'Invalid credentials');
        shakeElement(document.getElementById('loginEmail'));
    }
}

// ===== SIGNUP (PHP/MySQL) =====
async function signupWithEmail() {
    const username = document.getElementById('signupUsername').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value.trim();

    if (!username) {
        shakeElement(document.getElementById('signupUsername'));
        showToast('Error', 'Please enter username');
        return;
    }
    if (!email) {
        shakeElement(document.getElementById('signupEmail'));
        showToast('Error', 'Please enter email');
        return;
    }
    if (!password) {
        shakeElement(document.getElementById('signupPassword'));
        showToast('Error', 'Please enter password');
        return;
    }

    try {
        await apiRequest('auth/signup.php', {
            method: 'POST',
            body: JSON.stringify({
                username,
                email,
                password
            })
        });

        showToast('Success', 'Account created! Please sign in.');

        document.getElementById('signupUsername').value = '';
        document.getElementById('signupEmail').value = '';
        document.getElementById('signupPassword').value = '';

        showLogin();
    } catch (error) {
        showToast('Error', error.message || 'Could not create account');
        shakeElement(document.getElementById('signupUsername'));
    }
}

async function logout() {
    try {
        await apiRequest('auth/logout.php', {
            method: 'POST'
        });
    } catch (error) {
        console.error(error);
    }

    currentUser = null;
    todos = [];
    notes = [];
    adminStats = {};
    adminUsers = [];
    adminTodos = [];
    adminNotes = [];
    adminDashboardLoaded = false;
    document.getElementById('userMenu').classList.remove('active');
    showLoginPage();
    clearNotifTimers();
    showToast('Logged out', 'See you soon!');
}

function toggleUserMenu() {
    document.getElementById('userMenu').classList.toggle('active');
}

document.addEventListener('click', function (e) {
    const userMenu = document.getElementById('userMenu');
    const userSection = document.querySelector('.user-section');
    if (userMenu && !userMenu.contains(e.target) && !userSection.contains(e.target)) {
        userMenu.classList.remove('active');
    }
});

// ====================================================================
//  STORAGE LOADERS (PHP/MySQL)
// ====================================================================
async function loadTodosFromStorage() {
    if (!currentUser) {
        todos = [];
        return;
    }

    try {
        const data = await apiRequest('todos/load.php', {
            method: 'GET'
        });
        todos = Array.isArray(data.items) ? data.items : [];
    } catch (error) {
        todos = [];
        console.error(error);
        showToast('Tasks', 'Could not load tasks from the database.');
    }
}

async function loadNotesFromStorage() {
    if (!currentUser) {
        notes = [];
        return;
    }

    try {
        const data = await apiRequest('notes/load.php', {
            method: 'GET'
        });
        notes = Array.isArray(data.items) ? data.items : [];
    } catch (error) {
        notes = [];
        console.error(error);
        showToast('Notes', 'Could not load notes from the database.');
    }
}

async function loadSettingsFromStorage() {
    if (!currentUser) {
        return;
    }

    try {
        const data = await apiRequest('settings/get.php', {
            method: 'GET'
        });
        if (data.settings) {
            notifSettings = data.settings;
        }
    } catch (error) {
        console.error(error);
    }

    document.getElementById('enableReminders').checked = notifSettings.enabled;
    document.getElementById('enableSound').checked = notifSettings.sound;
    document.getElementById('reminderBefore').value = notifSettings.reminderBefore;
}

async function saveTodosToStorage() {
    if (!currentUser) return;

    try {
        await apiRequest('todos/sync.php', {
            method: 'POST',
            body: JSON.stringify({
                items: todos
            })
        });
    } catch (error) {
        console.error(error);
        showToast('Tasks', error.message || 'Could not save tasks.');
    }
}

async function saveNotesToStorage() {
    if (!currentUser) return;

    try {
        await apiRequest('notes/sync.php', {
            method: 'POST',
            body: JSON.stringify({
                items: notes
            })
        });
    } catch (error) {
        console.error(error);
        showToast('Notes', error.message || 'Could not save notes.');
    }
}

async function saveSettingsToStorage() {
    if (!currentUser) return;

    try {
        await apiRequest('settings/save.php', {
            method: 'POST',
            body: JSON.stringify(notifSettings)
        });
    } catch (error) {
        console.error(error);
    }
}

function adminStatusMessage(message) {
    const status = document.getElementById('adminStatus');
    if (status) status.textContent = message;
}

function truncateText(text, limit) {
    const value = String(text || '');
    if (value.length <= limit) return value;
    return `${value.slice(0, limit - 1)}...`;
}

async function loadAdminDashboard(force = false) {
    if (!currentUser?.is_admin) return;
    if (adminDashboardLoaded && !force) {
        renderAdminDashboard();
        return;
    }

    try {
        const [statsData, usersData, todosData, notesData] = await Promise.all([
            apiRequest('admin/stats.php', { method: 'GET' }),
            apiRequest('admin/users.php', { method: 'GET' }),
            apiRequest('admin/todos.php', { method: 'GET' }),
            apiRequest('admin/notes.php', { method: 'GET' })
        ]);

        adminStats = statsData.stats || {};
        adminUsers = usersData.users || [];
        adminTodos = todosData.todos || [];
        adminNotes = notesData.notes || [];
        adminDashboardLoaded = true;
        renderAdminDashboard();
        adminStatusMessage(`Signed in as ${currentUser.username}.`);
    } catch (error) {
        console.error(error);
        adminStatusMessage(error.message || 'Could not load admin dashboard.');
        showToast('Admin', error.message || 'Could not load admin data.');
    }
}

function renderAdminDashboard() {
    renderAdminStats();
    renderAdminUsers();
    renderAdminTodos();
    renderAdminNotes();
}

function renderAdminStats() {
    const container = document.getElementById('adminStatsGrid');
    if (!container) return;

    const cards = [
        { label: 'Users', value: adminStats.users || 0 },
        { label: 'Admins', value: adminStats.admins || 0 },
        { label: 'Tasks', value: adminStats.todos || 0 },
        { label: 'Pending Tasks', value: adminStats.pendingTodos || 0 },
        { label: 'Completed Tasks', value: adminStats.completedTodos || 0 },
        { label: 'Notes', value: adminStats.notes || 0 }
    ];

    container.innerHTML = cards.map(card => `
        <div class="admin-stat-card">
            <div class="label">${escapeHTML(card.label)}</div>
            <div class="value">${escapeHTML(String(card.value))}</div>
        </div>
    `).join('');
}

function renderAdminUsers() {
    const body = document.getElementById('adminUsersTableBody');
    if (!body) return;

    if (adminUsers.length === 0) {
        body.innerHTML = '<tr><td colspan="5">No users found.</td></tr>';
        return;
    }

    body.innerHTML = adminUsers.map(user => `
        <tr>
            <td>
                <div>${escapeHTML(user.username)}</div>
                <div style="color: rgba(255,255,255,0.35); font-size: 0.72rem;">${escapeHTML(user.email)}</div>
            </td>
            <td>
                <span class="admin-role-badge ${user.is_admin ? 'admin' : 'user'}">
                    ${user.is_admin ? 'Admin' : 'User'}
                </span>
            </td>
            <td>${escapeHTML(String(user.todoCount || 0))}</td>
            <td>${escapeHTML(String(user.noteCount || 0))}</td>
            <td>
                <div class="admin-actions">
                    <button class="admin-action-btn primary" onclick="toggleAdminRole(${user.id}, ${!user.is_admin})">
                        ${user.is_admin ? 'Remove Admin' : 'Make Admin'}
                    </button>
                    <button class="admin-action-btn danger" onclick="deleteAdminUser(${user.id})" ${currentUser && user.id === currentUser.id ? 'disabled' : ''}>
                        Delete
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function renderAdminTodos() {
    const body = document.getElementById('adminTodosTableBody');
    if (!body) return;

    if (adminTodos.length === 0) {
        body.innerHTML = '<tr><td colspan="5">No tasks found.</td></tr>';
        return;
    }

    body.innerHTML = adminTodos.map(todo => `
        <tr>
            <td>
                <div>${escapeHTML(todo.username)}</div>
                <div style="color: rgba(255,255,255,0.35); font-size: 0.72rem;">${escapeHTML(todo.email)}</div>
            </td>
            <td>
                <div>${escapeHTML(truncateText(todo.title, 40))}</div>
                <div style="color: rgba(255,255,255,0.35); font-size: 0.72rem;">${escapeHTML(truncateText(todo.desc || '', 60) || 'No description')}</div>
            </td>
            <td>
                <span class="admin-pill ${todo.priority || 'neutral'}">${escapeHTML(todo.priority || 'neutral')}</span>
            </td>
            <td>
                <span class="admin-role-badge ${todo.completed ? 'admin' : 'user'}">
                    ${todo.completed ? 'Completed' : 'Pending'}
                </span>
            </td>
            <td>
                <div class="admin-actions">
                    <button class="admin-action-btn danger" onclick="deleteAdminTodo(${todo.id})">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function renderAdminNotes() {
    const body = document.getElementById('adminNotesTableBody');
    if (!body) return;

    if (adminNotes.length === 0) {
        body.innerHTML = '<tr><td colspan="5">No notes found.</td></tr>';
        return;
    }

    body.innerHTML = adminNotes.map(note => `
        <tr>
            <td>
                <div>${escapeHTML(note.username)}</div>
                <div style="color: rgba(255,255,255,0.35); font-size: 0.72rem;">${escapeHTML(note.email)}</div>
            </td>
            <td>
                <div>${escapeHTML(truncateText(note.title, 40))}</div>
                <div style="color: rgba(255,255,255,0.35); font-size: 0.72rem;">${escapeHTML(truncateText(note.content || '', 60))}</div>
            </td>
            <td>
                <span class="admin-pill neutral">${escapeHTML(note.color || 'blue')}</span>
            </td>
            <td>${escapeHTML(new Date(note.updatedAt || note.createdAt).toLocaleString())}</td>
            <td>
                <div class="admin-actions">
                    <button class="admin-action-btn danger" onclick="deleteAdminNote(${note.id})">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function refreshAdminDashboard() {
    adminDashboardLoaded = false;
    loadAdminDashboard(true);
}

async function toggleAdminRole(userId, makeAdmin) {
    try {
        await apiRequest('admin/toggle_admin.php', {
            method: 'POST',
            body: JSON.stringify({ userId, isAdmin: makeAdmin })
        });
        showToast('Admin', 'User role updated.');
        refreshAdminDashboard();
    } catch (error) {
        showToast('Admin', error.message || 'Could not update role.');
    }
}

function deleteAdminUser(userId) {
    showDeleteConfirm(async function () {
        try {
            await apiRequest('admin/delete_user.php', {
                method: 'POST',
                body: JSON.stringify({ userId })
            });
            showToast('Admin', 'User deleted.');
            refreshAdminDashboard();
        } catch (error) {
            showToast('Admin', error.message || 'Could not delete user.');
        }
    });
}

function deleteAdminTodo(todoId) {
    showDeleteConfirm(async function () {
        try {
            await apiRequest('admin/delete_todo.php', {
                method: 'POST',
                body: JSON.stringify({ todoId })
            });
            showToast('Admin', 'Task deleted.');
            refreshAdminDashboard();
        } catch (error) {
            showToast('Admin', error.message || 'Could not delete task.');
        }
    });
}

function deleteAdminNote(noteId) {
    showDeleteConfirm(async function () {
        try {
            await apiRequest('admin/delete_note.php', {
                method: 'POST',
                body: JSON.stringify({ noteId })
            });
            showToast('Admin', 'Note deleted.');
            refreshAdminDashboard();
        } catch (error) {
            showToast('Admin', error.message || 'Could not delete note.');
        }
    });
}

// ====================================================================
//  NAVIGATION (unchanged)
// ====================================================================
function switchPage(page) {
    if (page === 'admin' && !currentUser?.is_admin) {
        showToast('Access denied', 'Admin access only.');
        return;
    }

    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
    const pageMap = {
        'home': 'homePage',
        'todo': 'todoPage',
        'notes': 'notesPage',
        'noteView': 'noteViewPage',
        'calc': 'calcPage',
        'admin': 'adminPage'
    };
    const targetEl = document.getElementById(pageMap[page]);
    if (targetEl) targetEl.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const navBtn = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (navBtn) navBtn.classList.add('active');
    if (page === 'home') { updateStats(); renderUpcoming(); }
    if (page === 'todo') renderTodos();
    if (page === 'notes') renderNotes();
    if (page === 'admin') loadAdminDashboard();
}

// ====================================================================
//  TO-DO LIST (PHP/MySQL)
// ====================================================================
function toggleTodoForm() {
    const form = document.getElementById('todoForm');
    form.classList.toggle('active');
    if (form.classList.contains('active')) {
        document.getElementById('todoTitle').focus();
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('todoDate').value = today;
    }
}

function saveTodo() {
    const title = document.getElementById('todoTitle').value.trim();
    const desc = document.getElementById('todoDesc').value.trim();
    const date = document.getElementById('todoDate').value;
    const time = document.getElementById('todoTime').value;
    const priority = document.getElementById('todoPriority').value;
    const notification = document.getElementById('todoNotification').checked;

    if (!title) {
        shakeElement(document.getElementById('todoTitle'));
        return;
    }

    const newTodo = {
        id: Date.now(),
        title,
        desc,
        date,
        time,
        priority,
        notification,
        notified: false,
        completed: false,
        createdAt: new Date().toISOString()
    };

    todos.unshift(newTodo);
    saveTodosToStorage();
    clearTodoForm();
    renderTodos();
    updateStats();
    renderUpcoming();
    showToast('Task Added', `"${title}" has been saved.`);
}

function clearTodoForm() {
    document.getElementById('todoTitle').value = '';
    document.getElementById('todoDesc').value = '';
    document.getElementById('todoDate').value = '';
    document.getElementById('todoTime').value = '';
    document.getElementById('todoPriority').value = 'medium';
    document.getElementById('todoNotification').checked = true;
    
    // Reset save button to original state
    const saveBtn = document.querySelector('.save-btn');
    saveBtn.textContent = 'Save Task';
    saveBtn.onclick = saveTodo;
    
    document.getElementById('todoForm').classList.remove('active');
}

function toggleTodoComplete(id) {
    const todo = todos.find(t => t.id === id);
    if (todo) {
        todo.completed = !todo.completed;
        saveTodosToStorage();
        renderTodos();
        updateStats();
        renderUpcoming();
    }
}

function deleteTodo(id) {
    showDeleteConfirm(function () {
        todos = todos.filter(t => t.id !== id);
        saveTodosToStorage();
        renderTodos();
        updateStats();
        renderUpcoming();
        showToast('Task Deleted', 'The task has been removed.');
    });
}

// ===== SORTING FUNCTIONS =====
let currentSort = 'created-desc';

function setSort(sortValue) {
    currentSort = sortValue;
    currentPage = 1; // Reset to first page
    renderTodos();
}

function sortTodos(todoList) {
    return todoList.sort((a, b) => {
        switch (currentSort) {
            case 'created-asc':
                return new Date(a.createdAt) - new Date(b.createdAt);
            case 'created-desc':
                return new Date(b.createdAt) - new Date(a.createdAt);
            case 'title-asc':
                return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
            case 'title-desc':
                return b.title.toLowerCase().localeCompare(a.title.toLowerCase());
            case 'priority-desc':
                const priorityOrder = { high: 3, medium: 2, low: 1 };
                return priorityOrder[b.priority] - priorityOrder[a.priority];
            case 'priority-asc':
                const priorityOrderAsc = { high: 3, medium: 2, low: 1 };
                return priorityOrderAsc[a.priority] - priorityOrderAsc[b.priority];
            default:
                return 0;
        }
    });
}

// ===== BULK ACTIONS =====
function toggleSelectAll() {
    const checkboxes = document.querySelectorAll('.todo-select');
    const selectAllBtn = document.querySelector('.select-all-btn');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    
    checkboxes.forEach(cb => cb.checked = !allChecked);
    selectAllBtn.textContent = allChecked ? 'Select All' : 'Deselect All';
    updateBulkActions();
}

function updateBulkActions() {
    const checkedBoxes = document.querySelectorAll('.todo-select:checked');
    const deleteBtn = document.querySelector('.delete-all-btn');
    deleteBtn.disabled = checkedBoxes.length === 0;
}

function deleteSelectedTasks() {
    const checkedBoxes = document.querySelectorAll('.todo-select:checked');
    if (checkedBoxes.length === 0) return;
    
    const selectedIds = Array.from(checkedBoxes).map(cb => parseInt(cb.dataset.id));
    
    showDeleteConfirm(function () {
        todos = todos.filter(t => !selectedIds.includes(t.id));
        saveTodosToStorage();
        renderTodos();
        updateStats();
        renderUpcoming();
        showToast('Tasks Deleted', `${selectedIds.length} task(s) have been removed.`);
    });
}

// ===== EDIT TODO =====
function editTodo(id) {
    const todo = todos.find(t => t.id === id);
    if (!todo) return;
    
    // Populate form with existing data
    document.getElementById('todoTitle').value = todo.title;
    document.getElementById('todoDesc').value = todo.desc || '';
    document.getElementById('todoDate').value = todo.date || '';
    document.getElementById('todoTime').value = todo.time || '';
    document.getElementById('todoPriority').value = todo.priority;
    document.getElementById('todoNotification').checked = todo.notification;
    
    // Change save button to update mode
    const saveBtn = document.querySelector('.save-btn');
    saveBtn.textContent = 'Update Task';
    saveBtn.onclick = () => updateTodo(id);
    
    // Show form
    document.getElementById('todoForm').classList.add('active');
    document.getElementById('todoTitle').focus();
}

function updateTodo(id) {
    const title = document.getElementById('todoTitle').value.trim();
    const desc = document.getElementById('todoDesc').value.trim();
    const date = document.getElementById('todoDate').value;
    const time = document.getElementById('todoTime').value;
    const priority = document.getElementById('todoPriority').value;
    const notification = document.getElementById('todoNotification').checked;

    if (!title) {
        shakeElement(document.getElementById('todoTitle'));
        return;
    }

    const todo = todos.find(t => t.id === id);
    if (todo) {
        todo.title = title;
        todo.desc = desc;
        todo.date = date;
        todo.time = time;
        todo.priority = priority;
        todo.notification = notification;
        todo.notified = false;
        
        saveTodosToStorage();
        clearTodoForm();
        renderTodos();
        updateStats();
        renderUpcoming();
        showToast('Task Updated', `"${title}" has been updated.`);
    }
}

// ====================================================================
//  NOTES (PHP/MySQL)
// ====================================================================
function toggleNoteForm() {
    const form = document.getElementById('noteForm');
    form.classList.toggle('active');
    editingNoteId = null;
    if (form.classList.contains('active')) {
        document.getElementById('noteTitle').focus();
    }
}

function saveNote() {
    const title = document.getElementById('noteTitle').value.trim();
    const content = document.getElementById('noteContent').value.trim();
    const color = document.getElementById('noteColor').value;

    if (!title) { shakeElement(document.getElementById('noteTitle')); return; }
    if (!content) { shakeElement(document.getElementById('noteContent')); return; }

    if (editingNoteId) {
        // Update existing note
        const note = notes.find(n => n.id === editingNoteId);
        if (note) {
            note.title = title;
            note.content = content;
            note.color = color;
            note.updatedAt = new Date().toISOString();
        }
        editingNoteId = null;
        showToast('Note Updated', `"${title}" has been updated.`);
    } else {
        // Create new note
        const newNote = {
            id: Date.now(),
            title,
            content,
            color,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        notes.unshift(newNote);
        showToast('Note Saved', `"${title}" has been saved.`);
    }

    saveNotesToStorage();
    clearNoteForm();
    renderNotes();
    updateStats();
}

function clearNoteForm() {
    document.getElementById('noteTitle').value = '';
    document.getElementById('noteContent').value = '';
    document.getElementById('noteColor').value = 'blue';
    document.getElementById('noteForm').classList.remove('active');
    editingNoteId = null;
}

function deleteNote(id, event) {
    if (event) event.stopPropagation();
    showDeleteConfirm(function () {
        notes = notes.filter(n => n.id !== id);
        saveNotesToStorage();
        renderNotes();
        updateStats();
        if (currentViewNoteId === id) switchPage('notes');
        showToast('Note Deleted', 'Note has been removed.');
    });
}

function openNote(id) {
    const note = notes.find(n => n.id === id);
    if (!note) return;

    currentViewNoteId = id;

    const viewContent = document.getElementById('noteViewContent');
    const dateStr = new Date(note.updatedAt || note.createdAt).toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    viewContent.innerHTML = `
        <h2>${escapeHTML(note.title)}</h2>
        <p class="view-date">Last updated: ${dateStr}</p>
        <div class="view-body">${escapeHTML(note.content)}</div>
    `;

    switchPage('noteView');
}

function editCurrentNote() {
    const note = notes.find(n => n.id === currentViewNoteId);
    if (!note) return;

    switchPage('notes');

    editingNoteId = note.id;
    document.getElementById('noteTitle').value = note.title;
    document.getElementById('noteContent').value = note.content;
    document.getElementById('noteColor').value = note.color;
    document.getElementById('noteForm').classList.add('active');
    document.getElementById('noteTitle').focus();
}

function deleteCurrentNote() {
    deleteNote(currentViewNoteId);
}

// ===== TODO LIST RENDERING & FILTERING =====
function setFilter(filter, btn) {
    currentFilter = filter;
    currentPage = 1;
    
    // Update button states
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    
    renderTodos();
}

function filterTodos() {
    renderTodos();
}

function renderTodos() {
    const search = document.getElementById('todoSearch')?.value.toLowerCase() || '';
    let filtered = [...todos];

    // Filter by search
    if (search) {
        filtered = filtered.filter(t => 
            t.title.toLowerCase().includes(search) || 
            (t.desc && t.desc.toLowerCase().includes(search))
        );
    }

    // Filter by status/priority
    if (currentFilter === 'pending') {
        filtered = filtered.filter(t => !t.completed);
    } else if (currentFilter === 'completed') {
        filtered = filtered.filter(t => t.completed);
    } else if (['high', 'medium', 'low'].includes(currentFilter)) {
        filtered = filtered.filter(t => t.priority === currentFilter);
    }

    // Apply sorting
    filtered = sortTodos(filtered);

    // Pagination
    const total = filtered.length;
    const pages = Math.ceil(total / ITEMS_PER_PAGE);
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginated = filtered.slice(start, start + ITEMS_PER_PAGE);

    const list = document.getElementById('todoList');
    const empty = document.getElementById('todoEmpty');
    const pagination = document.getElementById('todoPagination');

    if (paginated.length === 0) {
        list.innerHTML = '';
        empty.style.display = total === 0 ? 'flex' : 'none';
        pagination.innerHTML = '';
        return;
    }

    empty.style.display = 'none';
    
    list.innerHTML = paginated.map(todo => {
        const dateStr = todo.date ? new Date(todo.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
        const timeStr = todo.time ? formatTime12(todo.time) : '';
        const priorityLabel = { high: 'High', medium: 'Medium', low: 'Low' }[todo.priority] || 'Priority';
        
        return `
            <div class="todo-item ${todo.completed ? 'completed' : ''}">
                <input type="checkbox" class="todo-select" data-id="${todo.id}" onchange="updateBulkActions()">
                <div class="todo-text todo-complete-toggle" onclick="toggleTodoComplete(${todo.id})" title="Mark task as complete">
                    <h4>${escapeHTML(todo.title)}</h4>
                    ${todo.desc ? `<p>${escapeHTML(todo.desc)}</p>` : ''}
                </div>
                <div class="todo-meta">
                    <span class="todo-tag tag-priority-${todo.priority}">${priorityLabel}</span>
                    ${dateStr ? `<span class="todo-tag tag-date">Date: ${dateStr}</span>` : ''}
                    ${timeStr ? `<span class="todo-tag tag-time">Time: ${timeStr}</span>` : ''}
                    ${todo.notification ? `<span class="todo-tag tag-notif">Reminder</span>` : ''}
                </div>
                <button class="todo-edit" onclick="editTodo(${todo.id})" title="Edit task">Edit</button>
                <button class="todo-delete" onclick="deleteTodo(${todo.id})">Delete</button>
            </div>
        `;
    }).join('');

    // Pagination buttons
    if (pages > 1) {
        let paginationHTML = '';
        for (let i = 1; i <= pages; i++) {
            paginationHTML += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="currentPage = ${i}; renderTodos()">${i}</button>`;
        }
        pagination.innerHTML = `<div class="pagination">${paginationHTML}<div class="page-info">Page ${currentPage} of ${pages}</div></div>`;
    } else {
        pagination.innerHTML = '';
    }
}

function filterNotes() {
    renderNotes();
}

function renderNotes() {
    const search = document.getElementById('notesSearch')?.value.toLowerCase() || '';
    let filtered = [...notes];

    if (search) {
        filtered = filtered.filter(n =>
            n.title.toLowerCase().includes(search) ||
            n.content.toLowerCase().includes(search)
        );
    }

    const grid = document.getElementById('notesGrid');
    const empty = document.getElementById('notesEmpty');

    if (filtered.length === 0) {
        grid.innerHTML = '';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';
    grid.innerHTML = filtered.map(note => {
        const dateStr = new Date(note.createdAt).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric'
        });
        return `
            <div class="note-card color-${note.color}" onclick="openNote(${note.id})">
                <button class="note-delete-btn" onclick="deleteNote(${note.id}, event)" title="Delete note">Delete</button>
                <h4>${escapeHTML(note.title)}</h4>
                <p>${escapeHTML(note.content)}</p>
                <div class="note-date">${dateStr}</div>
            </div>
        `;
    }).join('');
}

function saveNotes() {
    saveNotesToStorage();
}

// ====================================================================
//  HOME PAGE
// ====================================================================
function updateStats() {
    const total = todos.length;
    const completed = todos.filter(t => t.completed).length;
    const pending = total - completed;

    document.getElementById('totalTasks').textContent = total;
    document.getElementById('completedTasks').textContent = completed;
    document.getElementById('pendingTasks').textContent = pending;
    document.getElementById('totalNotes').textContent = notes.length;

    updateBadge();
}

function updateBadge() {
    const pending = todos.filter(t => !t.completed).length;
    const badge = document.getElementById('todoBadge');
    if (badge) {
        if (pending > 0) {
            badge.textContent = pending;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }
}

function renderUpcoming() {
    const container = document.getElementById('upcomingTasks');
    const now = new Date();

    const upcoming = todos
        .filter(t => !t.completed && t.date)
        .sort((a, b) => {
            const dateA = new Date(a.date + (a.time ? 'T' + a.time : 'T23:59'));
            const dateB = new Date(b.date + (b.time ? 'T' + b.time : 'T23:59'));
            return dateA - dateB;
        })
        .filter(t => {
            const taskDate = new Date(t.date + (t.time ? 'T' + t.time : 'T23:59'));
            return taskDate >= new Date(now.getFullYear(), now.getMonth(), now.getDate());
        })
        .slice(0, 5);

    if (upcoming.length === 0) {
        container.innerHTML = '<div class="empty-state-small">No upcoming tasks</div>';
        return;
    }

    container.innerHTML = upcoming.map(todo => {
        const taskDate = new Date(todo.date + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const diffDays = Math.floor((taskDate - today) / (1000 * 60 * 60 * 24));
        let timeLabel = '';

        if (diffDays === 0) {
            timeLabel = todo.time ? formatTime12(todo.time) : 'Today';
        } else if (diffDays === 1) {
            timeLabel = 'Tomorrow';
        } else {
            timeLabel = taskDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }

        return `
            <div class="upcoming-item">
                <div class="time-badge">${timeLabel}</div>
                <div class="task-info">
                    <h4>${escapeHTML(todo.title)}</h4>
                    <p>${todo.desc ? escapeHTML(todo.desc.substring(0, 50)) : 'No description'}</p>
                </div>
            </div>
        `;
    }).join('');
}

// ====================================================================
//  NOTIFICATIONS & ALARMS
// ====================================================================
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function startNotificationChecker() {
    clearNotifTimers();

    // Check every 5 seconds for more responsive notifications
    const timer = setInterval(checkTaskNotifications, 5000);
    notifTimers.push(timer);

    // Also check immediately
    checkTaskNotifications();
}

function clearNotifTimers() {
    notifTimers.forEach(t => clearInterval(t));
    notifTimers = [];
}

function checkTaskNotifications() {
    if (!notifSettings.enabled) return;

    const now = new Date();
    const reminderMinutes = notifSettings.reminderBefore || 0;

    todos.forEach(todo => {
        if (todo.completed || !todo.notification || !todo.date || !todo.time || todo.notified) return;

        const taskDateTime = new Date(todo.date + 'T' + todo.time);
        const reminderTime = new Date(taskDateTime.getTime() - reminderMinutes * 60 * 1000);

        const diffMs = reminderTime.getTime() - now.getTime();

        // Trigger if within 60 seconds of reminder time
        if (diffMs <= 0 && diffMs > -60000) {
            triggerAlarm(todo);
            todo.notified = true;
            saveTodosToStorage();
        }
    });
}

function triggerAlarm(todo) {
    currentAlarmTask = todo;

    // Show alarm overlay
    document.getElementById('alarmTaskName').textContent = todo.title;
    document.getElementById('alarmTaskTime').textContent =
        `${todo.date} at ${formatTime12(todo.time)}`;
    document.getElementById('alarmOverlay').classList.add('active');

    // Play sound
    if (notifSettings.sound) {
        playNotifSound();
    }

    // Browser notification
    sendBrowserNotification(todo);

    // Also show toast
    showToast('Task Reminder', `"${todo.title}" is due now!`);
}

function dismissAlarm() {
    document.getElementById('alarmOverlay').classList.remove('active');
    currentAlarmTask = null;
    stopNotifSound();
}

function snoozeAlarm() {
    if (currentAlarmTask) {
        // Snooze for 5 minutes
        const todo = todos.find(t => t.id === currentAlarmTask.id);
        if (todo) {
            todo.notified = false;
            const now = new Date();
            now.setMinutes(now.getMinutes() + 5);
            todo.time = now.toTimeString().slice(0, 5);
            todo.date = now.toISOString().split('T')[0];
            saveTodosToStorage();
        }
        showToast('Snoozed', 'Reminder snoozed for 5 minutes.');
    }
    dismissAlarm();
}

function scheduleNotification(todo) {
    if (!todo.notification || !todo.date || !todo.time) return;
    // The interval checker will pick it up
}

function sendBrowserNotification(todo) {
    if ('Notification' in window && Notification.permission === 'granted') {
        const notification = new Notification('CoreOne - Task Reminder', {
            body: `"${todo.title}" is due now!\n${todo.date} at ${formatTime12(todo.time)}`,
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="%230a1628"/><text x="50" y="65" text-anchor="middle" font-size="50">!</text></svg>',
            tag: 'coreone-reminder-' + todo.id,
            requireInteraction: true,
            vibrate: [200, 100, 200, 100, 200]
        });

        notification.onclick = function () {
            window.focus();
            switchPage('todo');
            notification.close();
        };

        // Auto close after 30 seconds
        setTimeout(() => notification.close(), 30000);
    }
}

function playNotifSound() {
    try {
        // Create a simple beep using Web Audio API
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        function playBeep(freq, startTime, duration) {
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            oscillator.frequency.value = freq;
            oscillator.type = 'sine';
            gainNode.gain.setValueAtTime(0.3, startTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
            oscillator.start(startTime);
            oscillator.stop(startTime + duration);
        }

        const now = audioCtx.currentTime;
        playBeep(800, now, 0.2);
        playBeep(1000, now + 0.25, 0.2);
        playBeep(800, now + 0.5, 0.2);
        playBeep(1000, now + 0.75, 0.2);
        playBeep(1200, now + 1.0, 0.4);
    } catch (e) {
        console.log('Could not play notification sound:', e);
    }
}

function stopNotifSound() {
    // Sound auto-stops from Web Audio API
}

function toggleNotifSettings() {
    const panel = document.getElementById('notifSettingsPanel');
    panel.classList.toggle('active');
    document.getElementById('userMenu').classList.remove('active');

    if (panel.classList.contains('active')) {
        document.getElementById('enableReminders').checked = notifSettings.enabled;
        document.getElementById('enableSound').checked = notifSettings.sound;
        document.getElementById('reminderBefore').value = notifSettings.reminderBefore;
    }
}

async function saveNotifSettings() {
    notifSettings.enabled = document.getElementById('enableReminders').checked;
    notifSettings.sound = document.getElementById('enableSound').checked;
    notifSettings.reminderBefore = parseInt(document.getElementById('reminderBefore').value);
    await saveSettingsToStorage();
    checkTaskNotifications();
}

function testNotification() {
    showToast('Test Notification', 'Notifications are working! You will be reminded of your tasks.');
    playNotifSound();

    // Also test browser notification
    if ('Notification' in window) {
        if (Notification.permission === 'granted') {
            new Notification('CoreOne - Test', {
                body: 'Browser notifications are working!',
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="%230a1628"/><text x="50" y="65" text-anchor="middle" font-size="50">!</text></svg>'
            });
        } else if (Notification.permission === 'default') {
            Notification.requestPermission().then(perm => {
                if (perm === 'granted') {
                    new Notification('CoreOne - Enabled', {
                        body: 'You will now receive task reminders!'
                    });
                }
            });
        }
    }
}

// ====================================================================
//  TOAST NOTIFICATIONS (In-App)
// ====================================================================
function showToast(title, message) {
    const toast = document.getElementById('notificationToast');
    document.getElementById('notifTitle').textContent = title;
    document.getElementById('notifMessage').textContent = message;

    toast.classList.remove('hiding');
    toast.classList.add('active');

    // Auto close after 4 seconds
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        closeNotification();
    }, 4000);
}

function closeNotification() {
    const toast = document.getElementById('notificationToast');
    toast.classList.add('hiding');
    setTimeout(() => {
        toast.classList.remove('active', 'hiding');
    }, 400);
}

// ====================================================================
//  CALCULATOR
// ====================================================================
function calcDigit(digit) {
    if (calcCurrent === 'Error') calcCurrent = '0';

    if (calcNewNumber) {
        calcCurrent = digit;
        calcNewNumber = false;
    } else {
        if (calcCurrent.length >= 15) return;
        calcCurrent = calcCurrent === '0' ? digit : calcCurrent + digit;
    }

    updateCalcDisplay();
}

function calcDecimal() {
    if (calcCurrent === 'Error') calcCurrent = '0';

    if (calcNewNumber) {
        calcCurrent = '0.';
        calcNewNumber = false;
    } else if (!calcCurrent.includes('.')) {
        calcCurrent += '.';
    }

    updateCalcDisplay();
}

function calcBackspace() {
    if (calcCurrent === 'Error') {
        calcClear();
        return;
    }

    if (calcNewNumber) return;

    if (calcCurrent.length <= 1 || (calcCurrent.length === 2 && calcCurrent.startsWith('-'))) {
        calcCurrent = '0';
        calcNewNumber = true;
    } else {
        calcCurrent = calcCurrent.slice(0, -1);
    }

    updateCalcDisplay();
}

function calcOperator(op) {
    if (calcCurrent === 'Error') return;

    if (calcOperation && !calcNewNumber) {
        calcEquals();
    }

    calcPrevious = calcCurrent;
    calcOperation = op;
    calcNewNumber = true;

    const symbolMap = { '+': '+', '-': '−', '*': '×', '/': '÷', '^': '^' };
    document.getElementById('calcExpression').textContent = `${calcPrevious} ${symbolMap[op] || op}`;
}

function calcEquals() {
    if (!calcOperation || calcNewNumber) return;

    const prev = parseFloat(calcPrevious);
    const curr = parseFloat(calcCurrent);
    const symbolMap = { '+': '+', '-': '−', '*': '×', '/': '÷', '^': '^' };

    if (Number.isNaN(prev) || Number.isNaN(curr)) {
        calcCurrent = 'Error';
        calcOperation = null;
        calcPrevious = '';
        calcNewNumber = true;
        updateCalcDisplay();
        return;
    }

    let result;
    switch (calcOperation) {
        case '+':
            result = prev + curr;
            break;
        case '-':
            result = prev - curr;
            break;
        case '*':
            result = prev * curr;
            break;
        case '/':
            result = curr !== 0 ? prev / curr : NaN;
            break;
        case '^':
            result = Math.pow(prev, curr);
            break;
        default:
            result = NaN;
    }

    if (!Number.isFinite(result)) {
        calcCurrent = 'Error';
        calcOperation = null;
        calcPrevious = '';
        calcNewNumber = true;
        document.getElementById('calcExpression').textContent = 'Math error';
        document.getElementById('calcHistory').textContent = '';
        updateCalcDisplay();
        return;
    }

    const normalizedResult = normalizeCalcNumber(result);
    const expression = `${calcPrevious} ${symbolMap[calcOperation] || calcOperation} ${calcCurrent} =`;
    document.getElementById('calcExpression').textContent = expression;
    document.getElementById('calcHistory').textContent = `${expression} ${normalizedResult}`;

    calcCurrent = normalizedResult;
    calcOperation = null;
    calcPrevious = '';
    calcNewNumber = true;
    updateCalcDisplay();
}

function calcClear() {
    calcCurrent = '0';
    calcPrevious = '';
    calcOperation = null;
    calcNewNumber = true;

    document.getElementById('calcExpression').textContent = '';
    document.getElementById('calcHistory').textContent = '';
    updateCalcDisplay();
}

function calcToggleSign() {
    if (calcCurrent !== '0' && calcCurrent !== 'Error') {
        calcCurrent = calcCurrent.startsWith('-') ? calcCurrent.slice(1) : '-' + calcCurrent;
        updateCalcDisplay();
    }
}

function calcPercent() {
    if (calcCurrent === 'Error') return;

    const value = parseFloat(calcCurrent);
    if (Number.isNaN(value)) return;

    calcCurrent = normalizeCalcNumber(value / 100);
    calcNewNumber = true;
    updateCalcDisplay();
}

function calcConstant(name) {
    const constants = {
        pi: Math.PI,
        e: Math.E
    };

    if (!(name in constants)) return;

    calcCurrent = normalizeCalcNumber(constants[name]);
    calcNewNumber = false;
    updateCalcDisplay();
}

function calcScientific(action) {
    if (calcCurrent === 'Error') return;

    const value = parseFloat(calcCurrent);
    if (Number.isNaN(value)) return;

    let result;
    const radians = value * (Math.PI / 180);
    const actionLabel = {
        sin: 'sin',
        cos: 'cos',
        tan: 'tan',
        ln: 'ln',
        log: 'log',
        square: 'x²',
        sqrt: '√',
        inverse: '1/x'
    };

    switch (action) {
        case 'sin':
            result = Math.sin(radians);
            break;
        case 'cos':
            result = Math.cos(radians);
            break;
        case 'tan':
            result = Math.tan(radians);
            break;
        case 'ln':
            if (value <= 0) {
                calcCurrent = 'Error';
                updateCalcDisplay();
                return;
            }
            result = Math.log(value);
            break;
        case 'log':
            if (value <= 0) {
                calcCurrent = 'Error';
                updateCalcDisplay();
                return;
            }
            result = Math.log10(value);
            break;
        case 'square':
            result = value * value;
            break;
        case 'sqrt':
            if (value < 0) {
                calcCurrent = 'Error';
                updateCalcDisplay();
                return;
            }
            result = Math.sqrt(value);
            break;
        case 'inverse':
            if (value === 0) {
                calcCurrent = 'Error';
                updateCalcDisplay();
                return;
            }
            result = 1 / value;
            break;
        default:
            return;
    }

    if (!Number.isFinite(result)) {
        calcCurrent = 'Error';
        updateCalcDisplay();
        return;
    }

    const normalizedResult = normalizeCalcNumber(result);
    const label = actionLabel[action] || action;

    document.getElementById('calcExpression').textContent = `${label}(${value})`;
    document.getElementById('calcHistory').textContent = `${label}(${value}) = ${normalizedResult}`;

    calcCurrent = normalizedResult;
    calcOperation = null;
    calcPrevious = '';
    calcNewNumber = true;
    updateCalcDisplay();
}

function normalizeCalcNumber(value) {
    if (!Number.isFinite(value)) return 'Error';

    const clampedZero = Math.abs(value) < 1e-12 ? 0 : value;
    return parseFloat(clampedZero.toPrecision(12)).toString();
}

function updateCalcDisplay() {
    const display = document.getElementById('calcResult');
    let displayValue = calcCurrent;

    if (displayValue !== 'Error' && !Number.isNaN(Number(displayValue))) {
        if (displayValue.includes('e') || displayValue.includes('E')) {
            display.textContent = displayValue;
            return;
        }

        const num = parseFloat(displayValue);
        if (displayValue.includes('.') && displayValue.endsWith('.')) {
            const intPart = displayValue.slice(0, -1);
            displayValue = `${Number(intPart).toLocaleString()}.`;
        } else if (Number.isInteger(num) && !displayValue.includes('.')) {
            displayValue = num.toLocaleString();
        } else {
            const parts = displayValue.split('.');
            parts[0] = Number(parts[0]).toLocaleString();
            displayValue = parts.join('.');
        }
    }

    display.textContent = displayValue;
}

// ====================================================================
//  UTILITY FUNCTIONS
// ====================================================================
function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatTime12(time24) {
    if (!time24) return '';
    const [hours, minutes] = time24.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
}

function shakeElement(el) {
    el.style.animation = 'shake 0.4s ease';
    el.style.borderColor = '#ff4757';
    setTimeout(() => {
        el.style.animation = '';
        el.style.borderColor = '';
    }, 500);
}

// ===== DELETE CONFIRMATION =====
function showDeleteConfirm(callback) {
    deleteCallback = callback;
    document.getElementById('confirmOverlay').classList.add('active');
}

function confirmDelete() {
    if (deleteCallback) {
        deleteCallback();
    }
    document.getElementById('confirmOverlay').classList.remove('active');
    deleteCallback = null;
}

function cancelDelete() {
    document.getElementById('confirmOverlay').classList.remove('active');
    deleteCallback = null;
}

// ====================================================================
//  KEYBOARD SHORTCUTS
// ====================================================================
document.addEventListener('keydown', function (e) {
    // Escape to close modals
    if (e.key === 'Escape') {
        cancelDelete();
        dismissAlarm();
        document.getElementById('notifSettingsPanel').classList.remove('active');
        document.getElementById('userMenu').classList.remove('active');
    }
});


