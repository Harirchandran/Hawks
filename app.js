// Hawks House Manager - Main Application Script
console.log('[SCRIPT START] Script is executing...');

// --- CONSTANTS & CONFIG ---
const SUPABASE_URL = 'https://elxyhkfuuugjskallwsp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVseHloa2Z1dXVnanNrYWxsd3NwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg4MjA5ODksImV4cCI6MjA1NDM5Njk4OX0.BAEvcCVIQiVdsg0m3xX72Xi0p-vnJ4WqfZU0mE_Tuk0';

let supabaseClient = null;
try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (error) {
    console.error("Supabase client failed to initialize:", error);
}

const EVENTS = {
    'on-stage': [
        "Recitation (Malayalam)", "Recitation (English)", "Recitation (Hindi)",
        "Group Song", "Solo Song", "Vanchipattu", "Solo Dance", "Group Dance",
        "Mime", "Nadanpattu", "Fancy Dress", "Spot Choreography",
        "Solo Dance (Cinematic)", "Solo Dance (Classical)",
        "Group Dance (Cinematic)", "Group Dance (Classical)", "Light Music"
    ],
    'off-stage': [
        "Essay Writing (Malayalam)", "Essay Writing (English)", "Essay Writing (Hindi)",
        "Short Story Writing (Malayalam)", "Short Story Writing (English)", "Short Story Writing (Hindi)",
        "Poem Writing (Malayalam)", "Poem Writing (English)", "Poem Writing (Hindi)",
        "Elocution (Malayalam)", "Elocution (English)", "Elocution (Hindi)",
        "Pencil Drawing", "Cartoon Drawing", "Watercolor Painting", "Collage",
        "Mehandi Competition", "Photography Competition", "Reels Competition"
    ],
    'sports': [
        "100m", "200m", "800m", "1500m", "4x100m Relay",
        "Javelin", "Discus Throw", "Shot Put",
        "Cricket", "Football", "Volleyball",
        "Badminton Singles", "Badminton Doubles", "Chess"
    ]
};

// --- STATE ---
let currentUser = 'Hawakian';
let hawksData = [];
let currentView = '';
let realtimeChannel = null;
let newLogCount = 0; // Track new logs for badge

// --- UTILS ---
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const bgClass = type === 'success' ? 'bg-green-600' : 'bg-red-600';
    toast.className = `${bgClass} text-white px-6 py-3 rounded shadow-lg transform transition-all duration-300 translate-x-full opacity-0 flex items-center`;
    toast.innerHTML = `
        <i class="ph ${type === 'success' ? 'ph-check-circle' : 'ph-warning-circle'} mr-2 text-xl"></i>
        <span>${message}</span>
    `;
    container.appendChild(toast);

    // Animate In
    requestAnimationFrame(() => {
        toast.classList.remove('translate-x-full', 'opacity-0');
    });

    // Remove after 3s
    setTimeout(() => {
        toast.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => container.removeChild(toast), 300);
    }, 3000);
}

async function logAction(action, details) {
    if (!currentUser || !supabaseClient) return;
    try {
        await supabaseClient.from('hawks_logs').insert([{
            action: action,
            admin_username: currentUser,
            details: details
        }]);
    } catch (e) {
        console.error("Logging failed", e);
    }
}

function openModal(title, content) {
    document.getElementById('modal-title').innerHTML = title;
    document.getElementById('modal-body').innerHTML = content;
    document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
    document.getElementById('modal-title').innerHTML = '';
    document.getElementById('modal-body').innerHTML = '';
}

// --- DATA HANDLING ---
async function fetchHawksData() {
    // Show loader while fetching initial data
    document.getElementById('content-area').innerHTML = '<div class="flex justify-center items-center h-full"><div class="loader"></div></div>';

    let timeoutTriggered = false;

    // Create a timeout that will force resolution
    const timeoutId = setTimeout(() => {
        timeoutTriggered = true;
        console.error("Data fetch timed out after 3 seconds");
        showToast("Network Timeout - Loading Offline", 'error');
    }, 3000);

    try {
        const { data, error } = await supabaseClient
            .from('hawks_data')
            .select('*')
            .order('name', { ascending: true });

        clearTimeout(timeoutId);

        if (timeoutTriggered) {
            if (data) hawksData = data;
            return hawksData;
        }

        if (error) throw error;
        hawksData = data || [];
        return hawksData;
    } catch (err) {
        clearTimeout(timeoutId);
        console.error("Data fetch error:", err);
        if (!timeoutTriggered) {
            showToast('Failed to connect', 'error');
        }
        return [];
    }
}

async function toggleParticipation(memberId, eventName, isAdding) {
    const member = hawksData.find(m => m.id == memberId);
    if (!member) return;

    const action = isAdding ? 'add' : 'remove';
    const preposition = isAdding ? 'to' : 'from';
    if (!confirm(`Are you sure you want to ${action} ${member.name} ${preposition} ${eventName}?`)) {
        return;
    }

    let events = member.participated_events || [];
    if (!Array.isArray(events)) events = [];

    if (isAdding) {
        if (!events.includes(eventName)) events.push(eventName);
    } else {
        events = events.filter(e => e !== eventName);
    }

    // Optimistic UI Update
    member.participated_events = events;
    renderEventManagement(document.getElementById('event-selector').value, currentView);

    try {
        const { error } = await supabaseClient
            .from('hawks_data')
            .update({ participated_events: events })
            .eq('id', memberId);

        if (error) throw error;

        const toastMessage = isAdding
            ? `Successfully added ${member.name} to ${eventName}`
            : `Successfully deleted ${member.name} from ${eventName}`;

        logAction('UPDATE_PARTICIPATION', `${isAdding ? 'Added' : 'Removed'} ${member.name} in ${eventName}`);
        showToast(toastMessage);
    } catch (err) {
        console.error(err);
        showToast('Update failed, reverting...', 'error');
        await fetchHawksData();
        renderEventManagement(eventName, currentView);
    }
}

// --- ROUTING & RENDERING ---
function initApp() {
    // Check for critical dependencies
    if (!supabaseClient) {
        document.getElementById('content-area').innerHTML = `
            <div class="flex flex-col justify-center items-center h-full text-center p-6">
                <i class="ph ph-warning-circle text-6xl text-red-500 mb-4"></i>
                <h2 class="text-2xl font-bold text-gray-800">System Error</h2>
                <p class="text-gray-600 mt-2">Database connection failed to load.</p>
                <p class="text-sm text-gray-500 mt-1">Please check your internet connection or ad-blockers.</p>
            </div>
        `;
        return;
    }

    document.getElementById('mobile-user-greeting').innerText = `Hi, ${currentUser}`;
    showToast(`Welcome, ${currentUser}!`);

    let hasProceeded = false;

    const proceed = () => {
        if (hasProceeded) return;
        hasProceeded = true;
        clearTimeout(forceTimeout);

        try {
            router('on-stage');
        } catch (e) {
            console.error("Router failed:", e);
            document.getElementById('content-area').innerHTML = `<div class="p-6 text-center text-red-600"><h3 class="font-bold">Application Error</h3><p>${e.message}</p></div>`;
        }

        try { initRealtime(); } catch (e) { console.warn("Realtime init failed:", e); }
    };

    const forceTimeout = setTimeout(() => {
        console.warn("Forced timeout - proceeding without data");
        showToast("Network Timeout - Loading Offline", 'error');
        proceed();
    }, 3000);

    fetchHawksData().then(proceed).catch((e) => {
        console.error("Init error:", e);
        proceed();
    });
}

function initRealtime() {
    if (realtimeChannel) return;

    realtimeChannel = supabaseClient.channel('public-hawks')
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'hawks_logs' },
            (payload) => {
                handleNewLog(payload.new);
            }
        )
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'hawks_data' },
            (payload) => {
                handleDataUpdate(payload.new);
            }
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('Realtime Connected');
            }
        });
}

function handleNewLog(newLog) {
    // If currently viewing logs, show it immediately
    if (currentView === 'logs') {
        const tbody = document.querySelector('tbody');

        if (tbody) {
            const row = `
                <tr class="animate-pulse bg-green-50">
                    <td class="px-6 py-4 whitespace-nowrap text-gray-500">${new Date(newLog.timestamp).toLocaleString()}</td>
                    <td class="px-6 py-4 whitespace-nowrap font-medium text-gray-900">${newLog.admin_username}</td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                            ${newLog.action}
                        </span>
                    </td>
                    <td class="px-6 py-4 text-gray-500">${newLog.details}</td>
                </tr>
            `;
            tbody.insertAdjacentHTML('afterbegin', row);

            setTimeout(() => {
                const el = tbody.firstElementChild;
                if (el) el.classList.remove('animate-pulse', 'bg-green-50');
            }, 2000);
        }
    } else {
        // If not viewing logs, increment the badge counter
        newLogCount++;
        updateLogBadge();
    }
}

function handleDataUpdate(updatedMember) {
    const index = hawksData.findIndex(m => m.id === updatedMember.id);
    if (index !== -1) {
        hawksData[index] = updatedMember;

        const selector = document.getElementById('event-selector');
        if (selector && ['on-stage', 'off-stage', 'sports'].includes(currentView)) {
            renderEventManagement(selector.value, currentView);
        } else if (currentView === 'statistics') {
            renderStatistics();
        }
    }
}

function router(view) {
    console.log('[DEBUG] router called with view:', view);
    currentView = view;

    // Update Desktop Sidebar Active State
    document.querySelectorAll('.nav-item').forEach(el => {
        if (el.dataset.target === view) el.classList.add('bg-green-700');
        else el.classList.remove('bg-green-700');
    });

    // Update Mobile Menu Items
    document.querySelectorAll('.mobile-nav-item').forEach(el => {
        if (el.dataset.target === view) el.classList.add('bg-green-500');
        else el.classList.remove('bg-green-500');
    });

    // Update Mobile Quick Tabs
    document.querySelectorAll('.mobile-quick-tab').forEach(el => {
        if (el.dataset.target === view) {
            el.classList.add('bg-green-600');
        } else {
            el.classList.remove('bg-green-600');
        }
    });

    // Reset log badge when entering logs view
    if (view === 'logs') {
        newLogCount = 0;
        updateLogBadge();
    }

    const content = document.getElementById('content-area');
    console.log('[DEBUG] content-area element:', content);
    content.innerHTML = '<div class="flex justify-center h-full items-center"><div class="loader"></div></div>';

    switch (view) {
        case 'on-stage':
        case 'off-stage':
        case 'sports':
            renderCategoryView(view);
            break;
        case 'statistics':
            renderStatistics();
            break;
        case 'export':
            renderExport();
            break;
        case 'logs':
            renderLogs();
            break;
        default:
            content.innerHTML = '<h2 class="text-2xl text-red-500">404 Not Found</h2>';
    }
}

// Function to update log badge
function updateLogBadge() {
    const badge = document.getElementById('log-badge');
    if (!badge) return;

    if (newLogCount > 0) {
        badge.textContent = newLogCount > 99 ? '99+' : newLogCount;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

function renderCategoryView(category) {
    console.log('[DEBUG] renderCategoryView called with:', category);
    const eventsList = EVENTS[category];
    console.log('[DEBUG] eventsList:', eventsList);
    const content = document.getElementById('content-area');

    content.innerHTML = `
        <div class="max-w-6xl mx-auto">
            <div class="mb-3 md:mb-4">
                <label class="block text-xs md:text-sm font-medium text-gray-700 mb-1">Select Event to Manage</label>
                <select id="event-selector" class="block w-full p-2 md:p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-base md:text-lg">
                    ${eventsList.map((e, idx) => `<option value="${e}" ${idx === 0 ? 'selected' : ''}>${e}</option>`).join('')}
                </select>
            </div>

            <div id="participants-container" class="bg-white rounded-lg md:rounded-xl shadow-sm md:shadow-md p-3 md:p-4 min-h-[500px] md:min-h-[400px]">
                <!-- List injected here -->
            </div>
        </div>
    `;

    const selector = document.getElementById('event-selector');
    selector.addEventListener('change', (e) => renderEventManagement(e.target.value, category));

    renderEventManagement(eventsList[0], category);
}

function renderEventManagement(eventName, category) {
    const container = document.getElementById('participants-container');

    const allMembers = hawksData.map(m => ({
        ...m,
        isParticipating: (m.participated_events || []).includes(eventName)
    })).sort((a, b) => {
        return b.isParticipating - a.isParticipating;
    });

    const participatingCount = allMembers.filter(m => m.isParticipating).length;

    let html = `
        <div class="bg-white rounded-lg border border-gray-200">
            <div class="flex flex-col md:flex-row gap-2 md:gap-3 mb-3">
                <input type="text" placeholder="Search members..." class="flex-1 p-2 text-xs md:text-sm border rounded focus:outline-none focus:border-green-500" onkeyup="filterMembers(this)">
                <span class="bg-green-100 text-green-800 px-2 md:px-3 py-1 md:py-2 rounded-full text-xs md:text-sm font-medium whitespace-nowrap text-center md:text-left">Participating: ${participatingCount}/${allMembers.length}</span>
            </div>
            <ul class="space-y-2 max-h-[450px] md:max-h-[550px] overflow-y-auto pr-2 custom-scrollbar">
                ${allMembers.map(m => `
                    <li class="member-item flex items-center justify-between gap-3 p-2 md:p-3 rounded-lg shadow-sm hover:shadow-md transition ${m.isParticipating ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}">
                        <div class="flex-1 min-w-0">
                            <div class="font-medium text-gray-900 search-name text-sm md:text-base truncate">${m.name}</div>
                            <div class="text-xs text-gray-500 truncate">${m.department}</div>
                        </div>
                        <div class="flex items-center justify-end flex-shrink-0">
                            <button onclick="toggleMemberParticipation('${m.id}', '${eventName}', ${!m.isParticipating})" class="${m.isParticipating ? 'text-green-600 hover:bg-green-100' : 'text-red-600 hover:bg-red-100'} p-2 md:p-3 rounded-full transition" title="${m.isParticipating ? 'Remove' : 'Add'}">
                                <i class="ph ${m.isParticipating ? 'ph-toggle-right' : 'ph-toggle-left'} text-5xl md:text-6xl"></i>
                            </button>
                        </div>
                    </li>
                `).join('')}
            </ul>
        </div>
    `;
    container.innerHTML = html;
}

function filterMembers(input) {
    const filter = input.value.toLowerCase();
    document.querySelectorAll('.member-item').forEach(item => {
        const nameEl = item.querySelector('.search-name');
        const name = nameEl.innerText.toLowerCase();
        item.style.display = name.includes(filter) ? 'flex' : 'none';
    });
}

async function toggleMemberParticipation(memberId, eventName, isAdding) {
    await toggleParticipation(memberId, eventName, isAdding);
}

function renderStatistics() {
    const content = document.getElementById('content-area');

    const memberCounts = hawksData.map(m => ({
        id: m.id,
        name: m.name,
        count: (m.participated_events || []).length,
        dept: m.department
    })).sort((a, b) => b.count - a.count);

    content.innerHTML = `
        <div class="max-w-6xl mx-auto space-y-8">
            <h2 class="text-3xl font-bold text-gray-800 border-b pb-4">Member Leaderboard</h2>

            <div class="bg-white rounded-xl shadow-md overflow-hidden">
                <div class="p-4 bg-gray-50 border-b flex flex-col md:flex-row md:justify-between md:items-center gap-3">
                    <div class="font-semibold text-gray-700 self-start">All Members (${memberCounts.length})</div>
                    <input type="text" placeholder="Search by name or department..." class="w-full md:max-w-xs p-2 text-sm border rounded focus:outline-none focus:border-green-500" onkeyup="filterStatsTable(this)">
                </div>
                <div class="overflow-x-auto hidden md:block">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50 sticky top-0">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rank</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                                <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Event Count</th>
                                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="stats-table-body" class="bg-white divide-y divide-gray-200">
                            ${memberCounts.map((m, i) => `
                                <tr class="stats-row" data-name="${m.name.toLowerCase()}" data-dept="${m.dept.toLowerCase()}">
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">#${i + 1}</td>
                                    <td class="px-6 py-4 whitespace-nowrap font-medium text-gray-900">${m.name}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${m.dept}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-center">
                                        <span class="px-3 py-1 text-sm font-bold rounded-full ${m.count > 0 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}">${m.count}</span>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button onclick="showMemberDetailModal('${m.id}')" class="text-green-600 hover:text-green-800">View Details</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <!-- Mobile Card View -->
                <div id="stats-card-list" class="block md:hidden p-4 space-y-3 bg-gray-50">
                    ${memberCounts.map((m, i) => `
                        <div class="stats-row bg-white p-4 rounded-lg shadow-sm border" data-name="${m.name.toLowerCase()}" data-dept="${m.dept.toLowerCase()}">
                            <div class="flex justify-between items-start">
                                <div>
                                    <div class="font-bold text-gray-800">${m.name}</div>
                                    <div class="text-sm text-gray-500">${m.dept}</div>
                                </div>
                                <div class="text-sm text-gray-400 font-mono">#${i + 1}</div>
                            </div>
                            <div class="flex justify-between items-center mt-3 pt-3 border-t">
                                <span class="px-3 py-1 text-sm font-bold rounded-full ${m.count > 0 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}">Events: ${m.count}</span>
                                <button onclick="showMemberDetailModal('${m.id}')" class="text-green-600 hover:text-green-800 font-semibold text-sm">View Details</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

function filterStatsTable(input) {
    const filter = input.value.toLowerCase();
    document.querySelectorAll('#stats-table-body .stats-row, #stats-card-list .stats-row').forEach(row => {
        const name = row.dataset.name;
        const dept = row.dataset.dept;
        if (name.includes(filter) || dept.includes(filter)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

function showMemberDetailModal(memberId) {
    const member = hawksData.find(m => m.id === memberId);
    if (!member) return;

    const participatingEvents = member.participated_events || [];
    const allEvents = [].concat(...Object.values(EVENTS));
    const availableEvents = allEvents.filter(e => !participatingEvents.includes(e));

    const title = `
        <div>
            <div class="font-bold text-gray-800">${member.name}</div>
            <div class="text-sm text-gray-500 font-normal">${member.department}</div>
        </div>
    `;

    const content = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-3">
                <h4 class="font-semibold text-green-700 flex items-center"><i class="ph ph-check-circle mr-2"></i> Participating In (${participatingEvents.length})</h4>
                ${participatingEvents.length === 0 ? '<p class="text-sm text-gray-400 italic">Not participating in any events.</p>' : ''}
                <ul class="text-sm space-y-1 text-gray-700 list-disc list-inside">
                    ${participatingEvents.map(e => `<li>${e}</li>`).join('')}
                </ul>
            </div>
            <div class="space-y-3">
                <h4 class="font-semibold text-gray-600 flex items-center"><i class="ph ph-user-plus mr-2"></i> Available For (${availableEvents.length})</h4>
                ${availableEvents.length === 0 ? '<p class="text-sm text-green-600 italic font-medium">Participating in all available events!</p>' : ''}
                <ul class="text-sm space-y-1 text-gray-500 list-disc list-inside">
                    ${availableEvents.map(e => `<li>${e}</li>`).join('')}
                </ul>
            </div>
        </div>
    `;

    openModal(title, content);
}

function renderLogs() {
    const content = document.getElementById('content-area');
    content.innerHTML = '<div class="flex justify-center"><div class="loader"></div></div>';

    supabaseClient.from('hawks_logs').select('*').order('timestamp', { ascending: false }).limit(50)
        .then(({ data, error }) => {
            if (error) {
                content.innerHTML = '<p class="text-red-500">Error loading logs</p>';
                return;
            }

            content.innerHTML = `
                <div class="max-w-6xl mx-auto">
                    <h2 class="text-3xl font-bold text-gray-800 border-b pb-4 mb-6">Activity Logs (Last 50)</h2>
                    <!-- Desktop Table View -->
                    <div class="bg-white rounded-xl shadow overflow-hidden hidden md:block">
                        <div class="overflow-x-auto">
                            <table class="min-w-full divide-y divide-gray-200">
                                <thead class="bg-gray-50">
                                    <tr>
                                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Admin</th>
                                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                                    </tr>
                                </thead>
                                <tbody class="bg-white divide-y divide-gray-200 text-sm">
                                    ${data.map(log => `
                                        <tr>
                                            <td class="px-6 py-4 whitespace-nowrap text-gray-500">${new Date(log.timestamp).toLocaleString()}</td>
                                            <td class="px-6 py-4 whitespace-nowrap font-medium text-gray-900">${log.admin_username}</td>
                                            <td class="px-6 py-4 whitespace-nowrap">
                                                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                                                    ${log.action}
                                                </span>
                                            </td>
                                            <td class="px-6 py-4 text-gray-500">${log.details}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <!-- Mobile Card View -->
                    <div class="block md:hidden space-y-3">
                        ${data.map(log => `
                            <div class="bg-white p-4 rounded-lg shadow-sm border">
                                <div class="flex justify-between items-center text-xs text-gray-500 mb-2">
                                    <span>${new Date(log.timestamp).toLocaleString()}</span>
                                    <span class="px-2 py-1 inline-flex font-semibold rounded-full bg-blue-100 text-blue-800">
                                        ${log.action}
                                    </span>
                                </div>
                                <div class="text-sm text-gray-600">
                                    <span class="font-semibold text-gray-800">Admin:</span> ${log.admin_username}
                                </div>
                                <div class="text-sm text-gray-600 mt-1">
                                    <span class="font-semibold text-gray-800">Details:</span> ${log.details}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        });
}

function renderExport() {
    const content = document.getElementById('content-area');
    content.innerHTML = `
        <div class="max-w-3xl mx-auto bg-white p-8 rounded-xl shadow-md mt-10">
            <h2 class="text-2xl font-bold text-gray-800 mb-6">Export Data</h2>
            
            <div class="space-y-6">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Select Export Scope</label>
                    <div class="flex flex-col space-y-2">
                        <label class="flex items-center space-x-2 p-3 border rounded cursor-pointer hover:bg-gray-50">
                            <input type="radio" name="exportScope" value="all" checked class="text-green-600 focus:ring-green-500">
                            <span>All Data (Master List)</span>
                        </label>
                        <label class="flex items-center space-x-2 p-3 border rounded cursor-pointer hover:bg-gray-50">
                            <input type="radio" name="exportScope" value="event-wise-on-stage" class="text-green-600 focus:ring-green-500">
                            <span>Event-wise (On Stage)</span>
                        </label>
                        <label class="flex items-center space-x-2 p-3 border rounded cursor-pointer hover:bg-gray-50">
                            <input type="radio" name="exportScope" value="event-wise-off-stage" class="text-green-600 focus:ring-green-500">
                            <span>Event-wise (Off Stage)</span>
                        </label>
                        <label class="flex items-center space-x-2 p-3 border rounded cursor-pointer hover:bg-gray-50">
                            <input type="radio" name="exportScope" value="event-wise-sports" class="text-green-600 focus:ring-green-500">
                            <span>Event-wise (Sports)</span>
                        </label>
                    </div>
                </div>

                <div class="flex justify-center">
                    <button onclick="handleExport('pdf')" class="flex items-center justify-center space-x-2 py-4 px-8 border border-red-600 text-red-700 rounded-lg hover:bg-red-50 transition">
                        <i class="ph ph-file-pdf text-2xl"></i>
                        <span class="font-bold">Download PDF</span>
                    </button>
                </div>
            </div>
        </div>
    `;
}

function handleExport(format) {
    const scope = document.querySelector('input[name="exportScope"]:checked').value;
    let exportData = {};

    if (scope === 'all') {
        exportData['Master List'] = hawksData.map(m => ({
            Name: m.name,
            Department: m.department,
            'Event Count': (m.participated_events || []).length,
            Events: (m.participated_events || []).join(', ')
        }));
    } else if (scope === 'event-wise-on-stage') {
        EVENTS['on-stage'].forEach(evt => {
            const participants = hawksData.filter(m => (m.participated_events || []).includes(evt));
            if (participants.length > 0) {
                exportData[evt] = participants.map(p => ({
                    Participant: p.name,
                    Department: p.department
                }));
            } else {
                exportData[evt] = [{
                    Participant: 'No participants',
                    Department: '-'
                }];
            }
        });
    } else if (scope === 'event-wise-off-stage') {
        EVENTS['off-stage'].forEach(evt => {
            const participants = hawksData.filter(m => (m.participated_events || []).includes(evt));
            if (participants.length > 0) {
                exportData[evt] = participants.map(p => ({
                    Participant: p.name,
                    Department: p.department
                }));
            } else {
                exportData[evt] = [{
                    Participant: 'No participants',
                    Department: '-'
                }];
            }
        });
    } else if (scope === 'event-wise-sports') {
        EVENTS['sports'].forEach(evt => {
            const participants = hawksData.filter(m => (m.participated_events || []).includes(evt));
            if (participants.length > 0) {
                exportData[evt] = participants.map(p => ({
                    Participant: p.name,
                    Department: p.department
                }));
            } else {
                exportData[evt] = [{
                    Participant: 'No participants',
                    Department: '-'
                }];
            }
        });
    }

    if (format === 'excel') {
        const wb = XLSX.utils.book_new();
        Object.keys(exportData).forEach(sheetName => {
            const ws = XLSX.utils.json_to_sheet(exportData[sheetName]);
            XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31));
        });
        XLSX.writeFile(wb, `Hawks_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
        showToast('Excel downloaded');
    } else {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        let yPosition = 15;

        let categoryHeading = '';
        if (scope === 'event-wise-on-stage') {
            categoryHeading = 'On Stage Events';
        } else if (scope === 'event-wise-off-stage') {
            categoryHeading = 'Off Stage Events';
        } else if (scope === 'event-wise-sports') {
            categoryHeading = 'Sports Events';
        } else {
            categoryHeading = 'All Data';
        }

        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text("Hawks House Data Export", 14, yPosition);
        yPosition += 8;
        doc.setFontSize(12);
        doc.text(categoryHeading, 14, yPosition);
        doc.setFont(undefined, 'normal');
        doc.setFontSize(9);
        yPosition += 8;
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, yPosition);
        yPosition += 10;

        Object.keys(exportData).forEach((eventName) => {
            if (yPosition > 240) {
                doc.addPage();
                yPosition = 15;
            }

            doc.setFontSize(11);
            doc.setFont(undefined, 'bold');
            doc.text(eventName, 14, yPosition);
            yPosition += 6;
            doc.setFont(undefined, 'normal');
            doc.setFontSize(9);

            const tableData = exportData[eventName];
            const headers = Object.keys(tableData[0] || {});
            const body = tableData.map(Object.values);

            doc.autoTable({
                head: [headers],
                body: body,
                startY: yPosition,
                theme: 'grid',
                styles: { fontSize: 8 },
                headStyles: { fillColor: [22, 163, 74] }
            });

            yPosition = doc.lastAutoTable.finalY + 8;
        });

        let filenameSuffix = '';
        if (scope === 'event-wise-on-stage') {
            filenameSuffix = '_OnStage';
        } else if (scope === 'event-wise-off-stage') {
            filenameSuffix = '_OffStage';
        } else if (scope === 'event-wise-sports') {
            filenameSuffix = '_Sports';
        }
        doc.save(`Hawks_Export${filenameSuffix}_${new Date().toISOString().split('T')[0]}.pdf`);
        showToast('PDF downloaded');
    }

    logAction('EXPORT', `Exported data as ${format} (${scope})`);
}

function toggleMobileMenu() {
    const menu = document.getElementById('mobile-menu');
    const contentArea = document.getElementById('content-area');
    const isHidden = menu.classList.contains('hidden');

    if (isHidden) {
        menu.classList.remove('hidden');
        contentArea.addEventListener('click', toggleMobileMenu, { once: true });
    } else {
        menu.classList.add('hidden');
        contentArea.removeEventListener('click', toggleMobileMenu);
    }
}

// Initialize the app when the DOM is ready
document.addEventListener('DOMContentLoaded', initApp);
