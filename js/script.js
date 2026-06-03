// ==========================================
// OPEN HOUSE MANAGEMENT SYSTEM - MAIN SCRIPT
// Real-time AJAX updates, no page reloads
// ==========================================
const API_URL = "http://localhost:5000";
let projects = [];
let pollingInterval = null;
let lastFingerprint = "";
const POLL_INTERVAL_MS = 1000; // 1 second - instant live updates


// ==========================================
// DARK THEME TOGGLE — runs immediately on load
// ==========================================
(function initDarkTheme() {
    // Apply saved preference before page renders (no flash)
    if (localStorage.getItem("ohms_dark") === "true") {
        document.body.classList.add("dark");
    }

    // Inject the floating toggle button into every page
    document.addEventListener("DOMContentLoaded", () => {
        const btn = document.createElement("button");
        btn.id = "darkToggleBtn";
        btn.title = "Toggle Dark / Light Theme";
        btn.innerHTML = document.body.classList.contains("dark") ? "☀️" : "🌙";

        btn.addEventListener("click", () => {
            const isDark = document.body.classList.toggle("dark");
            localStorage.setItem("ohms_dark", isDark);
            btn.innerHTML = isDark ? "☀️" : "🌙";
        });

        document.body.appendChild(btn);
    });
})();


// ==========================================
// TOAST NOTIFICATION SYSTEM
// ==========================================
function showToast(message, type = "success") {
    let container = document.getElementById("toastContainer");
    if (!container) {
        container = document.createElement("div");
        container.id = "toastContainer";
        container.style.cssText = `
            position: fixed; bottom: 28px; right: 28px;
            z-index: 99999; display: flex; flex-direction: column; gap: 10px;
        `;
        document.body.appendChild(container);
    }

    const colors = {
        success: { bg: "#16a34a", icon: "✅" },
        error:   { bg: "#ef4444", icon: "❌" },
        info:    { bg: "#2563eb", icon: "ℹ️" },
        warning: { bg: "#f59e0b", icon: "⚠️" }
    };
    const c = colors[type] || colors.success;

    const toast = document.createElement("div");
    toast.style.cssText = `
        background: ${c.bg}; color: white; padding: 14px 20px;
        border-radius: 12px; font-size: 14px; font-weight: 600;
        box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        display: flex; align-items: center; gap: 10px;
        max-width: 360px; min-width: 260px;
        animation: toastIn 0.35s cubic-bezier(0.34,1.56,0.64,1);
        font-family: 'Inter', sans-serif;
    `;
    toast.innerHTML = `<span style="font-size:18px;">${c.icon}</span><span>${message}</span>`;

    if (!document.getElementById("toastKeyframes")) {
        const style = document.createElement("style");
        style.id = "toastKeyframes";
        style.textContent = `
            @keyframes toastIn  { from { opacity:0; transform:translateY(20px) scale(0.9); } to { opacity:1; transform:translateY(0) scale(1); } }
            @keyframes toastOut { from { opacity:1; transform:translateY(0); } to { opacity:0; transform:translateY(10px); } }
            @keyframes cardAppear { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        `;
        document.head.appendChild(style);
    }

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = "toastOut 0.3s ease forwards";
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ==========================================
// PAGE INIT
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    // Sidebar active link highlight
    const currentPath = window.location.pathname.split("/").pop();
    document.querySelectorAll(".sidebar a").forEach(link => {
        if (link.getAttribute("href") === currentPath) link.classList.add("active");
    });

    // Live image preview on add-project / edit-project page
    const projectImageInput = document.getElementById("projectImage");
    const bannerPlaceholder = document.getElementById("bannerPlaceholder");
    const liveImg           = document.getElementById("liveUploadedBannerSrc");
    if (projectImageInput && bannerPlaceholder && liveImg) {
        projectImageInput.addEventListener("change", function () {
            const file = this.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = e => {
                    liveImg.src = e.target.result;
                    liveImg.style.display = "block";
                    bannerPlaceholder.style.display = "none";
                };
                reader.readAsDataURL(file);
            }
        });
    }

    await initPageData();
    startAutoRefresh();  // Begin live polling
    
    // Initialize editing features if on edit-project page
    if (document.getElementById("editProjectForm")) {
        initEditPage();
    }
});

// ==========================================
// FETCH & INIT
// ==========================================
async function fetchProjects() {
    try {
        const res = await fetch(`${API_URL}/api/projects`);
        if (!res.ok) throw new Error("Failed to fetch");
        return await res.json();
    } catch (err) {
        console.error("Error loading projects:", err);
        return [];
    }
}

async function initPageData() {
    const hasDashboard  = document.getElementById("approvedCount");
    const hasGlobal     = document.getElementById("globalProjectsGrid");
    const hasMyProjects = document.getElementById("myProjectsGrid");
    const hasAdmin      = document.getElementById("adminDashboardTable");

    if (hasDashboard || hasGlobal || hasMyProjects || hasAdmin) {
        projects = await fetchProjects();
        // Set initial fingerprint so polling only triggers on real changes
        lastFingerprint = projects.map(p => `${p._id}:${p.status}`).join(",");
        renderCurrentPage();
    }
}

function renderCurrentPage() {
    const hasDashboard  = document.getElementById("approvedCount");
    const hasGlobal     = document.getElementById("globalProjectsGrid");
    const hasMyProjects = document.getElementById("myProjectsGrid");
    const hasAdmin      = document.getElementById("adminDashboardTable");

    if (hasDashboard)   renderUserDashboard();
    if (hasGlobal)      renderGlobalRegistry();
    if (hasMyProjects)  renderMyProjects();
    if (hasAdmin)       renderAdminTable("all");
}

// ==========================================
// AUTO-REFRESH POLLING (every 5 seconds)
// ==========================================
function startAutoRefresh() {
    const hasDashboard  = document.getElementById("approvedCount");
    const hasGlobal     = document.getElementById("globalProjectsGrid");
    const hasMyProjects = document.getElementById("myProjectsGrid");
    const hasAdmin      = document.getElementById("adminDashboardTable");

    if (!hasDashboard && !hasGlobal && !hasMyProjects && !hasAdmin) return;

    addLiveIndicator();

    pollingInterval = setInterval(async () => {
        const freshProjects = await fetchProjects();
        if (!freshProjects) return;

        const freshFingerprint = freshProjects.map(p => `${p._id}:${p.status}`).join(",");

        if (freshFingerprint !== lastFingerprint) {
            const prevCount = projects.length;
            projects = freshProjects;
            lastFingerprint = freshFingerprint;
            renderCurrentPage();

            if (freshProjects.length > prevCount) {
                const user = JSON.parse(localStorage.getItem("loggedInUser"));
                const newest = freshProjects[0];
                if (newest && user && newest.userEmail !== user.email) {
                    showToast(`New project added: "${newest.title}"`, "info");
                }
            }

            if (freshProjects.length === prevCount && prevCount > 0) {
                const user = JSON.parse(localStorage.getItem("loggedInUser"));
                if (user) {
                    const myOld   = projects.filter(p => p.userEmail === user.email);
                    const myFresh = freshProjects.filter(p => p.userEmail === user.email);
                    myFresh.forEach(fp => {
                        const op = myOld.find(o => o._id === fp._id || o.id === fp.id);
                        if (op && op.status !== fp.status) {
                            showToast(`Your project "${fp.title}" was ${fp.status.toLowerCase()}!`,
                                fp.status === "Approved" ? "success" : "error");
                        }
                    });
                }
            }
        }
    }, POLL_INTERVAL_MS);
}

function addLiveIndicator() {
    const header = document.querySelector(".page-header h1");
    if (!header || document.getElementById("liveIndicator")) return;
    const dot = document.createElement("span");
    dot.id = "liveIndicator";
    dot.title = "Auto-refreshing every 5 seconds";
    dot.style.cssText = `
        display:inline-block; width:8px; height:8px; border-radius:50%;
        background:#16a34a; margin-left:10px; vertical-align:middle;
        animation: livePulse 1.5s ease-in-out infinite;
    `;
    if (!document.getElementById("livePulseStyle")) {
        const s = document.createElement("style");
        s.id = "livePulseStyle";
        s.textContent = `@keyframes livePulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.7)} }`;
        document.head.appendChild(s);
    }
    header.appendChild(dot);
}

// ==========================================
// AUTH - SIGNUP & LOGIN SYSTEM
// ==========================================
const signupForm = document.getElementById("signupForm");
if (signupForm) {
    signupForm.addEventListener("submit", async e => {
        e.preventDefault();
        const name     = document.getElementById("name").value.trim();
        const email    = document.getElementById("signupEmail").value.trim();
        const password = document.getElementById("signupPassword").value;
        try {
            const res  = await fetch(`${API_URL}/api/auth/signup`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, password })
            });
            const data = await res.json();
            if (data.success) {
                showToast("Registration successful! Please log in.");
                setTimeout(() => window.location.href = "user-login.html", 1500);
            } else {
                showToast(data.message || "Signup failed.", "error");
            }
        } catch {
            showToast("Connection error. Is the server running?", "error");
        }
    });
}

const loginForm = document.getElementById("loginForm");
if (loginForm) {
    loginForm.addEventListener("submit", async e => {
        e.preventDefault();
        const email    = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;
        try {
            const res  = await fetch(`${API_URL}/api/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (data.success) {
                localStorage.removeItem("organizationLoggedIn");
                localStorage.setItem("loggedInUser", JSON.stringify(data.user));
                localStorage.setItem("role", "user");
                window.location.href = "dashboard.html";
            } else {
                showToast(data.message || "Invalid email or password.", "error");
            }
        } catch {
            showToast("Connection error. Is the server running?", "error");
        }
    });
}

const orgLoginForm = document.getElementById("organizationLogin");
if (orgLoginForm) {
    orgLoginForm.addEventListener("submit", e => {
        e.preventDefault();
        const email    = document.getElementById("adminEmail").value.trim();
        const password = document.getElementById("adminPassword").value;
        if (email === "admin@openhouse.com" && password === "admin123") {
            localStorage.removeItem("loggedInUser");
            localStorage.setItem("organizationLoggedIn", "true");
            localStorage.setItem("role", "admin");
            window.location.href = "organization-dashboard.html";
        } else {
            showToast("Invalid admin credentials.", "error");
        }
    });
}

// ==========================================
// ADD PROJECT - HELPERS
// ==========================================
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        if (!file) resolve("");
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload  = () => resolve(reader.result);
        reader.onerror = err => reject(err);
    });
}

const abstractTA = document.getElementById("description");
if (abstractTA) {
    abstractTA.addEventListener("input", function () {
        const words = this.value.trim().split(/\s+/).filter(w => w.length > 0);
        const wc    = document.getElementById("wordCount");
        if (wc) wc.innerText = `${words.length} / 500 words`;
        this.setCustomValidity(words.length > 500 ? "Maximum 500 words allowed." : "");
    });
}

let activeMemberCount = 0;
const maxMembers      = 5;
const membersContainer = document.getElementById("membersContainer");
const addMemberBtn    = document.getElementById("addMemberBtn");

if (addMemberBtn && membersContainer) {
    addMemberBtn.addEventListener("click", () => {
        if (activeMemberCount >= maxMembers) {
            showToast("Maximum 5 members allowed per project.", "warning");
            return;
        }
        activeMemberCount++;
        generateMemberRow({}, activeMemberCount);
    });
}

function generateMemberRow(memberData = {}, index) {
    const card = document.createElement("div");
    card.className = "member-entry-card";
    card.id = `member_card_wrapper_${index}`;
    card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px dashed #e2e8f0;padding-bottom:8px;">
            <span style="font-weight:700;color:#1e3a8a;font-size:13px;">👤 Member ${index}</span>
            <button type="button" style="background:#ef4444;color:white;border:none;padding:4px 12px;border-radius:6px;font-size:12px;cursor:pointer;font-weight:600;" onclick="purgeMemberNodeElement(${index})">Remove</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:10px;">
            <div class="form-group" style="margin-bottom:0;">
                <label style="display:block;font-size:12px;font-weight:600;margin-bottom:5px;">Member Name *</label>
                <input type="text" class="m-name" required placeholder="Full name" value="${memberData.name || ''}">
            </div>
            <div class="form-group" style="margin-bottom:0;">
                <label style="display:block;font-size:12px;font-weight:600;margin-bottom:5px;">Email Address *</label>
                <input type="email" class="m-email" required placeholder="email@example.com" value="${memberData.email || ''}">
            </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
            <div class="form-group" style="margin-bottom:0;">
                <label style="display:block;font-size:12px;font-weight:600;margin-bottom:5px;">Phone Number *</label>
                <input type="tel" class="m-phone" required placeholder="+92 300 0000000" value="${memberData.phone || ''}">
            </div>
            <div class="form-group" style="margin-bottom:0;">
                <label style="display:block;font-size:12px;font-weight:600;margin-bottom:5px;">Attach CV (PDF) ${memberData.cvName ? '(Saved: ' + memberData.cvName + ')' : '*'}</label>
                <input type="file" class="m-cv" accept="application/pdf" ${memberData.cvData ? '' : 'required'}>
                <input type="hidden" class="m-cv-existing" value="${memberData.cvData || ''}">
                <input type="hidden" class="m-cv-name-existing" value="${memberData.cvName || ''}">
            </div>
        </div>`;
    membersContainer.appendChild(card);
}

function purgeMemberNodeElement(id) {
    const el = document.getElementById(`member_card_wrapper_${id}`);
    if (el) { el.remove(); activeMemberCount--; }
}

// ==========================================
// ADD PROJECT - FORM SUBMIT
// ==========================================
const projectForm = document.getElementById("projectForm");
if (projectForm) {
    projectForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const user = JSON.parse(localStorage.getItem("loggedInUser"));
        if (!user) { window.location.href = "user-login.html"; return; }

        const submitBtn = projectForm.querySelector(".submit-project-master-btn");
        const originalText = submitBtn.textContent;
        submitBtn.textContent = "⏳ Saving project...";
        submitBtn.disabled = true;

        const title      = document.getElementById("title").value;
        const category   = document.getElementById("category").value;
        const abstract   = document.getElementById("description").value;
        const supervisor = document.getElementById("supervisorName").value;
        const imgFile    = document.getElementById("projectImage").files[0];
        const imgB64     = imgFile ? await fileToBase64(imgFile) : "";

        const memberCards = document.querySelectorAll(".member-entry-card");
        const members = [];
        for (const card of memberCards) {
            const cvFile = card.querySelector(".m-cv").files[0];
            members.push({
                name:   card.querySelector(".m-name").value,
                email:  card.querySelector(".m-email").value,
                phone:  card.querySelector(".m-phone").value,
                cvData: cvFile ? await fileToBase64(cvFile) : "",
                cvName: cvFile ? cvFile.name : "CV.pdf"
            });
        }

        const payload = {
            id: 'PROJ-' + Date.now().toString().slice(-6),
            userEmail: user.email,
            userName:  user.name,
            title, category, abstract, supervisor,
            image: imgB64, members
        };

        try {
            const res  = await fetch(`${API_URL}/api/projects`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.success) {
                const savedProject = data.project || { ...payload, status: "Pending", createdAt: new Date().toISOString() };
                projects.unshift(savedProject);
                showToast(`Project "${title}" submitted successfully!`, "success");
                setTimeout(() => window.location.href = "my-projects.html", 1500);
            } else {
                showToast(data.message || "Failed to submit project.", "error");
            }
        } catch {
            showToast("Connection error. Make sure the server is running.", "error");
        } finally {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    });
}

// ==========================================
// RENDER HELPERS
// ==========================================
function buildProjectCard(p, showActions = false) {
    const date = p.createdAt
        ? new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : 'N/A';
    const statusClass = p.status ? p.status.toLowerCase() : 'pending';

    const imgHTML = (p.image && p.image.length > 100)
        ? `<img class="project-card-img" src="${p.image}" alt="${p.title}">`
        : `<div class="project-card-img-placeholder">🚀</div>`;

    // MongoDB project data edit-project.html dashboard link update
    const actionsHTML = showActions
        ? `<div class="project-card-actions" onclick="event.stopPropagation()">
               <button class="action-btn btn-edit btn-sm" onclick="window.location.href='edit-project.html?id=${p.id}'">✏️ Edit</button>
               <button class="action-btn btn-delete btn-sm" onclick="deleteProject('${p.id}')">🗑️ Delete</button>
           </div>`
        : `<span class="badge ${statusClass}">${p.status}</span>`;

    return `
        <div class="project-card" onclick="openProjectModal('${p.id || p._id}')" style="animation: cardAppear 0.4s ease both;">
            ${imgHTML}
            <div class="project-card-body">
                <div class="project-card-top">
                    <div class="project-card-title">${p.title}</div>
                    <span class="project-card-id">${p.id || ''}</span>
                </div>
                <div class="project-card-meta">
                    <span class="project-card-category">📂 ${p.category}</span>
                    <span class="project-card-author">👤 ${p.userName || 'N/A'}</span>
                </div>
                <div class="project-card-desc">${p.abstract || p.description || 'No description provided.'}</div>
                <div class="project-card-footer">
                    <span class="project-card-date">📅 ${date}</span>
                    ${actionsHTML}
                </div>
            </div>
        </div>`;
}

// ==========================================
// RENDER FUNCTIONS (DASHBOARDS)
// ==========================================
function renderUserDashboard() {
    const user = JSON.parse(localStorage.getItem("loggedInUser"));
    if (!user) { window.location.href = "user-login.html"; return; }

    const approved = projects.filter(p => p.status === "Approved");
    const pending  = projects.filter(p => p.status === "Pending");
    const mine     = projects.filter(p => p.userEmail === user.email);

    const ac = document.getElementById("approvedCount"); if (ac) ac.innerText = approved.length;
    const pc = document.getElementById("pendingCount");  if (pc) pc.innerText = pending.length;
    const mc = document.getElementById("myCount");       if (mc) mc.innerText = mine.length;

    const grid = document.getElementById("approvedProjectsGrid");
    if (grid) {
        grid.innerHTML = approved.length === 0
            ? `<div class="empty-state"><div class="empty-icon">📭</div><p>No approved projects yet.</p></div>`
            : approved.map(p => buildProjectCard(p)).join('');
    }
}

function renderGlobalRegistry() {
    const grid = document.getElementById("globalProjectsGrid");
    if (!grid) return;
    const approved = projects.filter(p => p.status === "Approved");
    grid.innerHTML = approved.length === 0
        ? `<div class="empty-state"><div class="empty-icon">📭</div><p>No approved projects found.</p></div>`
        : approved.map(p => buildProjectCard(p)).join('');
}

function renderMyProjects() {
    const user = JSON.parse(localStorage.getItem("loggedInUser"));
    if (!user) { window.location.href = "user-login.html"; return; }

    const grid = document.getElementById("myProjectsGrid");
    if (!grid) return;

    const mine = projects.filter(p => p.userEmail === user.email);

    grid.innerHTML = mine.length === 0
        ? `<div class="empty-state">
               <div class="empty-icon">📁</div>
               <p>You have not submitted any projects yet.</p>
               <a href="add-project.html" class="btn btn-primary" style="margin-top:16px;display:inline-flex;padding:10px 20px;background:#2563eb;color:white;border-radius:8px;text-decoration:none;font-weight:600;">➕ Add Your First Project</a>
           </div>`
        : mine.map(p => buildProjectCard(p, true)).join('');
}

function renderAdminTable(filterMode) {
    const et = document.getElementById("adminTotal");
    const ep = document.getElementById("adminPending");
    const ea = document.getElementById("adminApproved");
    const er = document.getElementById("adminRejected");

    if (et) et.innerText = projects.length;
    if (ep) ep.innerText = projects.filter(p => p.status === "Pending").length;
    if (ea) ea.innerText = projects.filter(p => p.status === "Approved").length;
    if (er) er.innerText = projects.filter(p => p.status === "Rejected").length;

    const tbody = document.getElementById("adminDashboardTable");
    if (!tbody) return;

    const data = filterMode === "all"
        ? projects
        : projects.filter(p => p.status.toLowerCase() === filterMode.toLowerCase());

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:32px;">No projects found for this filter.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(p => {
        const date = p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
        const actions = p.status === "Pending"
            ? `<button class="action-btn btn-approve" onclick="updateStatus('${p.id}','Approved')">✅ Approve</button>
               <button class="action-btn btn-reject"  onclick="updateStatus('${p.id}','Rejected')">❌ Reject</button>`
            : `<span style="color:#94a3b8;font-size:12px;">Decision Made</span>`;
        return `<tr class="clickable-row" onclick="openProjectModal('${p.id || p._id}')">
            <td><b>${p.title}</b><br><small style="color:#94a3b8;">${p.id}</small></td>
            <td>${p.userName || p.userEmail}</td>
            <td>${p.category}</td>
            <td>${date}</td>
            <td><span class="badge ${p.status.toLowerCase()}">${p.status}</span></td>
            <td onclick="event.stopPropagation()">${actions}</td>
        </tr>`;
    }).join('');
}

// ==========================================
// STATUS UPDATE & DELETE
// ==========================================
async function updateStatus(id, newStatus) {
    try {
        const res  = await fetch(`${API_URL}/api/projects/${id}/status`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus })
        });
        const data = await res.json();
        if (data.success) {
            projects = projects.map(p => p.id === id ? { ...p, status: newStatus } : p);
            renderAdminTable("all");
            showToast(`Project ${newStatus.toLowerCase()} successfully.`, newStatus === "Approved" ? "success" : "warning");
        } else {
            showToast(data.message || "Failed to update status.", "error");
        }
    } catch {
        showToast("Connection error.", "error");
    }
}

async function deleteProject(id) {
    if (!confirm("Are you sure you want to delete this project?")) return;
    try {
        const res  = await fetch(`${API_URL}/api/projects/${id}`, { method: "DELETE" });
        const data = await res.json();
        if (data.success) {
            projects = projects.filter(p => p.id !== id);
            renderMyProjects();
            showToast("Project deleted successfully.", "info");
        } else {
            showToast(data.message || "Failed to delete project.", "error");
        }
    } catch {
        showToast("Connection error.", "error");
    }
}

// ==========================================
// LOGOUT
// ==========================================
function logout() {
    clearInterval(pollingInterval);
    localStorage.removeItem("loggedInUser");
    localStorage.removeItem("role");
    window.location.href = "index.html";
}
function logoutOrganization() {
    clearInterval(pollingInterval);
    localStorage.removeItem("organizationLoggedIn");
    localStorage.removeItem("role");
    window.location.href = "index.html";
}

// ==========================================
// PROJECT DETAIL MODAL
// ==========================================
function openProjectModal(projectId) {
    const p = projects.find(x => x.id === projectId || x._id === projectId);
    if (!p) return;
    const overlay = document.getElementById('projectDetailModal');
    if (!overlay) return;

    const date = p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'N/A';
    const statusColors = { Approved: '#15803d', Pending: '#a16207', Rejected: '#b91c1c' };
    const statusBg     = { Approved: '#dcfce7', Pending: '#fef9c3', Rejected: '#fee2e2' };
    const sColor = statusColors[p.status] || '#64748b';
    const sBg    = statusBg[p.status]    || '#f1f5f9';

    const bannerHTML = (p.image && p.image.length > 100) ? `<img src="${p.image}" class="proj-modal-banner" alt="Project Banner">` : `<div class="proj-modal-banner-placeholder">🚀</div>`;

    let membersHTML = '';
    if (p.members && p.members.length > 0) {
        membersHTML = `<div class="proj-modal-members-grid">` + p.members.map(m => {
            const initials = m.name ? m.name.charAt(0).toUpperCase() : '?';
            const cvBtn = (m.cvData && m.cvData.length > 100) ? `<a class="m-cv-link" data-cv="${m.cvData}" data-name="${m.cvName || 'CV.pdf'}" onclick="downloadCV(this)">📄 Download CV</a>` : '';
            return `<div class="proj-modal-member-card">
                <div class="proj-modal-member-avatar">${initials}</div>
                <div class="proj-modal-member-info">
                    <div class="m-name">${m.name || 'Unknown'}</div>
                    <div class="m-detail">✉️ ${m.email || 'N/A'}</div>
                    <div class="m-detail">📞 ${m.phone || 'N/A'}</div>
                    ${cvBtn}
                </div>
            </div>`;
        }).join('') + `</div>`;
    } else {
        membersHTML = `<div class="proj-modal-no-members">No team members found for this project.</div>`;
    }

    overlay.querySelector('.proj-modal-card').innerHTML = `
        ${bannerHTML}
        <button class="proj-modal-close" onclick="closeProjectModal()" title="Close">✕</button>
        <div class="proj-modal-body">
            <div class="proj-modal-meta-row">
                <span class="proj-modal-id-chip">${p.id || 'N/A'}</span>
                <span style="background:${sBg};color:${sColor};padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;">${p.status || 'Pending'}</span>
            </div>
            <h2 class="proj-modal-title">${p.title}</h2>
            <div style="font-size:13px;color:#64748b;margin-bottom:20px;">Category: <b>${p.category}</b> | Supervisor: <b>${p.supervisor || p.supervisorName || 'N/A'}</b></div>
            <div class="proj-modal-section-title">📝 Abstract</div>
            <p class="proj-modal-abstract">${p.abstract || p.description || 'No abstract text.'}</p>
            <div class="proj-modal-section-title">👥 Team Members</div>
            ${membersHTML}
            <div style="font-size:11px;color:#94a3b8;margin-top:20px;text-align:right;">Submitted on ${date}</div>
        </div>`;
    overlay.style.display = 'flex';
}

function closeProjectModal() {
    const overlay = document.getElementById('projectDetailModal');
    if (overlay) overlay.style.display = 'none';
}

// ==========================================
// EDIT PROJECT SYSTEM (MONGODB DYNAMIC DATA)
// ==========================================
async function initEditPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('id');
    if (!projectId) return;

    try {
        // Backend API se single data array se match kar ke nikalte hain
        const allProjs = await fetchProjects();
        const project = allProjs.find(x => x.id === projectId || x._id === projectId);

        if (!project) {
            showToast("Project not found.", "error");
            return;
        }

        // Form Fields Fill karein
        document.getElementById("editProjectId").value = project.id || project._id;
        document.getElementById("title").value = project.title || "";
        document.getElementById("supervisorName").value = project.supervisor || project.supervisorName || "";
        document.getElementById("category").value = project.category || "";
        document.getElementById("description").value = project.abstract || project.description || "";

        // Words counter text reset
        const words = (project.abstract || project.description || "").trim().split(/\s+/).filter(w => w.length > 0);
        const wc = document.getElementById("wordCount");
        if (wc) wc.innerText = `${words.length} / 500 words`;

        // Image template dynamic state setup
        const liveImg = document.getElementById("liveUploadedBannerSrc");
        const placeholder = document.getElementById("bannerPlaceholder");
        if (project.image && project.image.length > 100) {
            liveImg.src = project.image;
            liveImg.style.display = "block";
            if (placeholder) placeholder.style.display = "none";
        }

        // Members list dynamic row append
        const container = document.getElementById("membersContainer");
        if (container && project.members) {
            container.innerHTML = "";
            activeMemberCount = 0;
            project.members.forEach(member => {
                activeMemberCount++;
                generateMemberRow(member, activeMemberCount);
            });
        }
    } catch (err) {
        console.error(err);
        showToast("Error loading project details.", "error");
    }

    // Submit listener for Edit Form
    const editForm = document.getElementById("editProjectForm");
    editForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const currentId = document.getElementById("editProjectId").value;

        const submitBtn = editForm.querySelector(".submit-project-master-btn");
        submitBtn.textContent = "⏳ Updating project...";
        submitBtn.disabled = true;

        const title      = document.getElementById("title").value;
        const category   = document.getElementById("category").value;
        const abstract   = document.getElementById("description").value;
        const supervisor = document.getElementById("supervisorName").value;
        
        const imgFile    = document.getElementById("projectImage").files[0];
        let imgB64 = "";
        if (imgFile) {
            imgB64 = await fileToBase64(imgFile);
        } else {
            const liveImg = document.getElementById("liveUploadedBannerSrc");
            imgB64 = liveImg && liveImg.src.startsWith("data:") ? liveImg.src : "";
        }

        const memberCards = document.querySelectorAll(".member-entry-card");
        const members = [];
        for (const card of memberCards) {
            const cvFile = card.querySelector(".m-cv").files[0];
            let cvData = card.querySelector(".m-cv-existing").value;
            let cvName = card.querySelector(".m-cv-name-existing").value || "CV.pdf";

            if (cvFile) {
                cvData = await fileToBase64(cvFile);
                cvName = cvFile.name;
            }

            members.push({
                name:  card.querySelector(".m-name").value,
                email: card.querySelector(".m-email").value,
                phone: card.querySelector(".m-phone").value,
                cvData: cvData,
                cvName: cvName
            });
        }

        // MongoDB data schema package construction
        const updatePayload = {
            title, category, abstract, supervisor,
            image: imgB64, members
        };

        try {
            // MongoDB update server route method PUT request send execution
            const res = await fetch(`${API_URL}/api/projects/${currentId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatePayload)
            });
            const data = await res.json();

            if (data.success) {
                showToast("Project updated successfully!", "success");
                setTimeout(() => window.location.href = "my-projects.html", 1500);
            } else {
                showToast(data.message || "Failed to update project.", "error");
            }
        } catch {
            showToast("Server connection error during database update.", "error");
        } finally {
            submitBtn.textContent = "💾 Update Project";
            submitBtn.disabled = false;
        }
    });
}