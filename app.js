import {
  auth,
  provider,
  signInWithPopup,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged
} from "./src/firebase-config.js";

import {
  INSTITUTE_DOMAIN,
  isInstituteEmail,
  toast,
  escapeHtml,
  safeFirstName,
  initials,
  fmtDate,
  fmtDateTime,
  isOverdue,
  formatAIText,
  extractTextFromMultiplePDFs,
  extractTextFromDocx
} from "./src/utils.js";

import {
  getFirestoreSetupHTML,
  getDashboardHTML,
  getLiteratureHTML,
  getLitReviewHTML,
  getResearchGapHTML,
  getProblemStmtHTML,
  getJournalFinderHTML,
  getLibraryHTML,
  getNotesHTML,
  getDraftHTML,
  getLatexHTML,
  getEditingHTML,
  getChatPdfHTML,
  getParuHTML,
  getSupervisorDashboardHTML,
  getScholarsViewHTML,
  getScholarMilestoneDetailsHTML
} from "./src/templates.js";

import {
  getSyncMode,
  resetFallbackMode,
  clearLocalSandboxData,
  fetchProfile,
  createProfile,
  updateProfile,
  fetchSupervisors,
  fetchScholarsForSupervisor,
  sendSupervisorRequest,
  fetchSupervisorRequests,
  respondToSupervisorRequest,
  createMilestone,
  updateMilestone,
  fetchMilestonesForScholar,
  fetchMilestonesForSupervisor,
  createSubmission,
  fetchSubmissionsForScholar,
  fetchSubmissionsForSupervisor,
  sendSubmissionFeedback,
  requestMeeting,
  fetchMeetingsForScholar,
  fetchMeetingsForSupervisor,
  respondToMeeting,
  saveChatMessage,
  loadChatHistory,
  saveParuMessage,
  loadParuHistory,
  uploadToCloudStorage,
  loadCloudFiles,
  saveCloudDocument,
  loadCloudDocument,
  saveToolHistory,
  deleteToolHistory,
  loadToolHistory
} from "./src/services.js";

/* -------------------------------------------------------
   Global App States
------------------------------------------------------- */
let myProfile = null;
let currentPdfTextContext = "";

/* -------------------------------------------------------
   Backend API Client
------------------------------------------------------- */
async function callApi(endpoint, payload) {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = data.details ? ` ${data.details}` : "";
      throw new Error(`${data.error || "Request failed"}${detail}`);
    }
    return data.result || data;
  } catch (err) {
    console.error(`API Call failed [${endpoint}]:`, err);
    throw err;
  }
}

/* ═══════════════════════════════════════════════════════
   SCHOLAR & SUPERVISOR REGISTRATION SETUP CHECK
   ═══════════════════════════════════════════════════════ */

async function checkScholarSupervisorSetup() {
  if (myProfile.role !== "scholar" || myProfile.supervisorId) return true;

  const dashboardContent = document.getElementById("dashboard-content");
  if (!dashboardContent) return false;

  const existingRequests = await fetchSupervisorRequests().catch(() => []);
  const pendingRequest = existingRequests.find((item) => item.status === "pending");
  if (pendingRequest) return true;

  const supervisors = await fetchSupervisors().catch(() => []);
  const supervisorOptions = supervisors
    .map((supervisor) => {
      const name = supervisor.displayName || supervisor.email || "Supervisor";
      const department = supervisor.department ? ` - ${supervisor.department}` : "";
      return `<option value="${escapeHtml(supervisor.email || "")}">${escapeHtml(name)}${escapeHtml(department)}</option>`;
    })
    .join("");

  dashboardContent.innerHTML = `
    <div class="dashboard-header">
      <h2>Welcome to ImRa, Scholar!</h2>
      <p>Select your research supervisor and send a request for approval.</p>
    </div>
    <div class="workflow-card glass-panel" style="max-width:540px; margin-top:20px; padding:24px;">
      <h3 style="margin-bottom:16px;">Supervisor Request</h3>
      ${pendingRequest ? `
        <div class="status-pill pending" style="margin-bottom:14px;">Pending approval from ${escapeHtml(pendingRequest.supervisorEmail || "supervisor")}</div>
      ` : ""}
      <div class="form-grid">
        <div>
          <label style="font-size:0.85rem; font-weight:600; display:block; margin-bottom:6px;">Supervisor</label>
          ${supervisors.length ? `
            <select id="setup-supervisor-email" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--glass-border); outline:none; background:white;">
              <option value="">Choose a supervisor</option>
              ${supervisorOptions}
            </select>
          ` : `
            <div class="status-pill pending" style="display:block; line-height:1.5; margin-bottom:8px;">No supervisor accounts are available yet.</div>
            <input type="email" id="setup-supervisor-email" placeholder="supervisor@kanchiuniv.ac.in" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--glass-border); outline:none; background:white;" />
          `}
        </div>
        <div>
          <label style="font-size:0.85rem; font-weight:600; display:block; margin-bottom:6px;">Academic Department</label>
          <input type="text" id="setup-department" value="${escapeHtml(myProfile.department || "")}" placeholder="e.g. Computer Science" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--glass-border); outline:none; background:white;" />
        </div>
        <div>
          <label style="font-size:0.85rem; font-weight:600; display:block; margin-bottom:6px;">Message</label>
          <textarea id="setup-request-message" placeholder="Please accept me as your scholar." style="width:100%; min-height:90px; padding:10px; border-radius:8px; border:1px solid var(--glass-border); outline:none; background:white;"></textarea>
        </div>
        <button class="primary-btn" id="save-setup-btn" style="margin-top:16px; width:100%; padding:12px;">Send Request</button>
      </div>
    </div>
  `;

  document.getElementById("save-setup-btn").onclick = async () => {
    const supervisorEmail = document.getElementById("setup-supervisor-email").value.trim().toLowerCase();
    const department = document.getElementById("setup-department").value.trim();
    const message = document.getElementById("setup-request-message").value.trim();

    if (!supervisorEmail) {
      return alert("Please choose a supervisor.");
    }

    if (!supervisorEmail.endsWith("@kanchiuniv.ac.in")) {
      return alert("Please enter a valid @kanchiuniv.ac.in supervisor email.");
    }

    const btn = document.getElementById("save-setup-btn");
    btn.disabled = true;
    btn.textContent = "Sending...";

    try {
      await updateProfile(auth.currentUser.uid, { department });
      await sendSupervisorRequest(supervisorEmail, department, message);
      myProfile.department = department;
      toast("Request sent to supervisor.", "success");
      alert("Request sent to supervisor.");
      loadView("dashboard");
    } catch (error) {
      console.error("Supervisor request failed:", error);
      alert(`Request failed: ${error.message}`);
      btn.disabled = false;
      btn.textContent = "Send Request";
    }
  };

  return false;
}

/* ═══════════════════════════════════════════════════════
   SYNC MODE UI UPDATER
   ═══════════════════════════════════════════════════════ */

function updateSyncStatusBadge(mode) {
  const badge = document.getElementById("sync-status-indicator");
  if (!badge) return;
  if (mode === "local") {
    badge.innerHTML = `
      <i class="ri-database-2-line" style="color:#d97706; font-size:1.2rem;"></i>
      <span class="storage-text" style="color:#d97706;">Local Sandbox</span>
      <div class="tooltip">Firebase permissions blocked. Saving data in browser local storage. Click to retry Cloud Sync.</div>
    `;
  } else {
    badge.innerHTML = `
      <i class="ri-google-drive-fill" style="color:#34A853; font-size:1.2rem;"></i>
      <span class="storage-text">Cloud Sync Active</span>
      <div class="tooltip">All files are stored securely online. Laptop storage not used.</div>
    `;
  }
}

/* ═══════════════════════════════════════════════════════
   SIDEBAR RENDERER
   ═══════════════════════════════════════════════════════ */

function renderSidebarNav(role) {
  const navMenu = document.getElementById("sidebar-nav");
  if (!navMenu) return;

  if (role === "supervisor") {
    navMenu.innerHTML = `
      <div class="nav-section">MAIN</div>
      <a href="javascript:void(0)" class="nav-link active" data-target="dashboard">
        <i class="ri-dashboard-line"></i> Dashboard
      </a>
      <a href="javascript:void(0)" class="nav-link" data-target="scholars">
        <i class="ri-group-line"></i> Scholars &amp; Milestones
      </a>
      <div class="nav-section">AI ASSISTANTS</div>
      <a href="javascript:void(0)" class="nav-link" data-target="paru">
        <i class="ri-sparkling-line"></i> Paaru
      </a>
    `;
  } else {
    navMenu.innerHTML = `
      <div class="nav-section">MAIN</div>
      <a href="javascript:void(0)" class="nav-link active" data-target="dashboard">
        <i class="ri-dashboard-line"></i> Dashboard
      </a>
      <a href="javascript:void(0)" class="nav-link" data-target="literature">
        <i class="ri-book-open-line"></i> Literature &amp; Ideas
      </a>
      <a href="javascript:void(0)" class="nav-link" data-target="library">
        <i class="ri-folder-line"></i> Library
      </a>
      <a href="javascript:void(0)" class="nav-link" data-target="chatpdf">
        <i class="ri-file-pdf-line"></i> Chat with PDF
      </a>
      <div class="nav-section">WRITING SUITE</div>
      <a href="javascript:void(0)" class="nav-link" data-target="draft">
        <i class="ri-file-text-line"></i> Thesis Draft
      </a>
      <a href="javascript:void(0)" class="nav-link" data-target="notes">
        <i class="ri-quill-pen-line"></i> Notes &amp; Equations
      </a>
      <a href="javascript:void(0)" class="nav-link" data-target="latex">
        <i class="ri-file-word-line"></i> Word to LaTeX
      </a>
      <a href="javascript:void(0)" class="nav-link" data-target="editing">
        <i class="ri-magic-line"></i> AI Editing Tools
      </a>
      <div class="nav-section">AI ASSISTANTS</div>
      <a href="javascript:void(0)" class="nav-link" data-target="chatbot">
        <i class="ri-robot-line"></i> Parama
      </a>
      <a href="javascript:void(0)" class="nav-link" data-target="paru">
        <i class="ri-sparkling-line"></i> Paaru
      </a>
    `;
  }
}

/* ═══════════════════════════════════════════════════════
   VIEW ROUTER
   ═══════════════════════════════════════════════════════ */

function loadView(target) {
  const url = new URL(window.location);
  url.searchParams.forEach((val, key) => url.searchParams.delete(key));

  if (target !== "dashboard") {
    url.searchParams.set("page", target);
  }
  window.history.pushState({}, "", url);
  loadViewByRoute();
}

function toggleIsolatedViewLayout(isIsolated) {
  const appLayout = document.querySelector(".app-layout");
  const sidebar = document.querySelector(".sidebar");
  const topbar = document.querySelector(".topbar");
  const mainContent = document.querySelector(".main-content");

  if (isIsolated) {
    if (sidebar) sidebar.style.display = "none";
    if (topbar) topbar.style.display = "none";
    if (appLayout) {
      appLayout.style.gridTemplateColumns = "1fr";
      appLayout.style.gridTemplateRows = "1fr";
    }
    if (mainContent) {
      mainContent.style.gridColumn = "1 / 2";
      mainContent.style.gridRow = "1 / 2";
      mainContent.style.paddingTop = "32px";
    }
  } else {
    if (sidebar) sidebar.style.display = "";
    if (topbar) topbar.style.display = "";
    if (appLayout) {
      appLayout.style.gridTemplateColumns = "";
      appLayout.style.gridTemplateRows = "";
    }
    if (mainContent) {
      mainContent.style.gridColumn = "";
      mainContent.style.gridRow = "";
      mainContent.style.paddingTop = "";
    }
  }
}

async function loadViewByRoute() {
  const dashboardContent = document.getElementById("dashboard-content");
  if (!dashboardContent) return;

  if (myProfile.role === "scholar") {
    const setupCompleted = await checkScholarSupervisorSetup();
    if (!setupCompleted) return;
  }

  const params = new URLSearchParams(window.location.search);
  const page = params.get("page");
  const tool = params.get("tool");

  // Reset side menu highlight
  document.querySelectorAll("#sidebar-nav .nav-link").forEach((nav) => nav.classList.remove("active"));

  const isolatedTools = ["lit-review", "lit-gap", "lit-problem", "lit-publish"];
  toggleIsolatedViewLayout(isolatedTools.includes(tool));

  if (myProfile.role === "supervisor") {
    if (page === "scholars") {
      document.querySelector('[data-target="scholars"]')?.classList.add("active");
      dashboardContent.innerHTML = getScholarsViewHTML();
      setupSupervisorScholarsInteractions();
    } else if (page === "paru") {
      document.querySelector('[data-target="paru"]')?.classList.add("active");
      dashboardContent.innerHTML = getParuHTML();
      setupParuInteractions();
    } else {
      document.querySelector('[data-target="dashboard"]')?.classList.add("active");
      dashboardContent.innerHTML = getSupervisorDashboardHTML(myProfile);
      setupSupervisorDashboardInteractions();
    }
  } else {
    // Scholar
    if (page === "literature") {
      document.querySelector('[data-target="literature"]')?.classList.add("active");
      dashboardContent.innerHTML = getLiteratureHTML();
      setupLiteratureInteractions();
    } else if (tool === "lit-review") {
      dashboardContent.innerHTML = getLitReviewHTML();
      setupLitReviewInteractions();
    } else if (tool === "lit-gap") {
      dashboardContent.innerHTML = getResearchGapHTML();
      setupResearchGapInteractions();
    } else if (tool === "lit-problem") {
      dashboardContent.innerHTML = getProblemStmtHTML();
      setupProblemStmtInteractions();
    } else if (tool === "lit-publish") {
      dashboardContent.innerHTML = getJournalFinderHTML();
      setupJournalFinderInteractions();
    } else if (page === "library") {
      document.querySelector('[data-target="library"]')?.classList.add("active");
      dashboardContent.innerHTML = getLibraryHTML();
      setupLibraryInteractions();
    } else if (page === "chatpdf") {
      document.querySelector('[data-target="chatpdf"]')?.classList.add("active");
      dashboardContent.innerHTML = getChatPdfHTML();
      setupChatPdfInteractions();
    } else if (page === "draft") {
      document.querySelector('[data-target="draft"]')?.classList.add("active");
      dashboardContent.innerHTML = getDraftHTML();
      setupDraftInteractions();
    } else if (page === "notes") {
      document.querySelector('[data-target="notes"]')?.classList.add("active");
      dashboardContent.innerHTML = getNotesHTML();
      setupNotesInteractions();
    } else if (page === "latex") {
      document.querySelector('[data-target="latex"]')?.classList.add("active");
      dashboardContent.innerHTML = getLatexHTML();
      setupLatexInteractions();
    } else if (page === "editing") {
      document.querySelector('[data-target="editing"]')?.classList.add("active");
      dashboardContent.innerHTML = getEditingHTML();
      setupEditingInteractions();
    } else if (page === "paru") {
      document.querySelector('[data-target="paru"]')?.classList.add("active");
      dashboardContent.innerHTML = getParuHTML();
      setupParuInteractions();
    } else {
      document.querySelector('[data-target="dashboard"]')?.classList.add("active");
      dashboardContent.innerHTML = getDashboardHTML(myProfile);
      setupDashboardInteractions();
    }
  }
}

/* ═══════════════════════════════════════════════════════
   TOOL HISTORY HANDLERS
   ═══════════════════════════════════════════════════════ */

async function loadToolHistoryInUI(toolName, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!auth.currentUser) return;

  const history = await loadToolHistory(auth.currentUser.uid, toolName);
  if (history.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:20px 0; color:var(--text-muted); font-size:0.8rem;">No saved history.</div>';
    return;
  }

  container.innerHTML = history.map(item => {
    const safeContent = encodeURIComponent(item.content || "");
    return `
      <div class="history-item" data-id="${item.id}">
        <div class="history-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
        <div class="history-actions">
          <i class="ri-file-copy-line history-copy-btn" data-content="${safeContent}" title="Copy"></i>
          <i class="ri-download-line history-download-btn" data-title="${escapeHtml(item.title)}" data-content="${safeContent}" title="Download"></i>
          <i class="ri-delete-bin-line text-red history-delete-btn" data-tool="${toolName}" data-id="${item.id}" title="Delete"></i>
        </div>
      </div>
    `;
  }).join("");

  // Copy click
  container.querySelectorAll(".history-copy-btn").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const text = decodeURIComponent(btn.getAttribute("data-content"));
      navigator.clipboard.writeText(text);
      toast("Copied to clipboard.");
    };
  });

  // Download click
  container.querySelectorAll(".history-download-btn").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const text = decodeURIComponent(btn.getAttribute("data-content"));
      const title = (btn.getAttribute("data-title") || "document").replace(/[^a-z0-9]/gi, "_").toLowerCase();
      const blob = new Blob([text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    };
  });

  // Delete click
  container.querySelectorAll(".history-delete-btn").forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const tool = btn.getAttribute("data-tool");
      const id = btn.getAttribute("data-id");
      if (confirm("Delete this saved item?")) {
        await deleteToolHistory(auth.currentUser.uid, tool, id);
        loadToolHistoryInUI(tool, containerId);
      }
    };
  });

  // Viewer click
  container.querySelectorAll(".history-item").forEach(item => {
    item.onclick = (e) => {
      if (e.target.tagName === "I") return;
      const title = item.querySelector(".history-title")?.innerText || "Saved item";
      const content = decodeURIComponent(item.querySelector(".history-copy-btn")?.getAttribute("data-content") || "");
      openHistoryViewer(title, content);
    };
  });
}

function openHistoryViewer(title, rawText) {
  const mainArea = document.querySelector(".main-tool-area");
  if (!mainArea) return;

  Array.from(mainArea.children).forEach((child) => {
    if (!child.classList.contains("history-viewer-overlay")) {
      child.style.display = "none";
      child.classList.add("hidden-by-viewer");
    }
  });

  const oldViewer = mainArea.querySelector(".history-viewer-overlay");
  if (oldViewer) oldViewer.remove();

  const viewer = document.createElement("div");
  viewer.className = "history-viewer-overlay glass-panel";
  viewer.style.cssText = "height:100%; display:flex; flex-direction:column; padding:0;";
  viewer.innerHTML = `
    <div class="panel-header" style="padding:20px; border-bottom:1px solid rgba(0,0,0,0.1); display:flex; justify-content:space-between; align-items:center;">
      <h2 style="margin:0; font-size:1.2rem;">${escapeHtml(title)}</h2>
      <button class="secondary-btn" id="close-viewer-btn">Close View</button>
    </div>
    <div class="viewer-content" style="flex-grow:1; padding:20px; overflow-y:auto; line-height:1.6;">
      ${formatAIText(rawText)}
    </div>
  `;
  mainArea.appendChild(viewer);

  document.getElementById("close-viewer-btn").onclick = () => {
    viewer.remove();
    Array.from(mainArea.children).forEach((child) => {
      if (child.classList.contains("hidden-by-viewer")) {
        child.style.display = "";
        child.classList.remove("hidden-by-viewer");
      }
    });
  };
}

/* ═══════════════════════════════════════════════════════
   SCHOLAR INTERACTIONS
   ═══════════════════════════════════════════════════════ */

function setupDashboardInteractions() {
  loadScholarDashboardStats();

  const uploadBtn = document.getElementById("dash-upload-btn");
  const fileInput = document.getElementById("dash-file-input");
  const askBtn = document.getElementById("dash-ask-parama-btn");
  const editBtn = document.getElementById("dash-editing-btn");
  const viewLibBtn = document.getElementById("dash-view-library");

  if (uploadBtn && fileInput) {
    uploadBtn.onclick = () => fileInput.click();
    fileInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const original = uploadBtn.innerHTML;
      uploadBtn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Uploading...';
      await uploadToCloudStorage(auth.currentUser.uid, file);
      uploadBtn.innerHTML = original;
      loadScholarDashboardStats();
      toast("File uploaded successfully.");
    };
  }

  if (askBtn) {
    askBtn.onclick = () => document.getElementById("parama-float-btn")?.click();
  }
  if (editBtn) {
    editBtn.onclick = () => loadView("editing");
  }
  if (viewLibBtn) {
    viewLibBtn.onclick = () => loadView("library");
  }
}

async function loadScholarDashboardStats() {
  const uid = auth.currentUser.uid;

  // Cloud Files count
  const files = await loadCloudFiles(uid);
  const papersEl = document.getElementById("stats-papers-count");
  if (papersEl) papersEl.innerText = files.length;

  // Submissions count
  const subs = await fetchSubmissionsForScholar(uid);
  const subsEl = document.getElementById("stats-submissions-count");
  if (subsEl) subsEl.innerText = subs.length;

  // Milestones progress
  const milestones = await fetchMilestonesForScholar(uid);
  const completed = milestones.filter(m => m.status === "completed").length;
  const percent = milestones.length ? Math.round((completed / milestones.length) * 100) : 0;

  const textEl = document.getElementById("stats-progress-text");
  const circleEl = document.getElementById("stats-progress-circle");
  if (textEl) textEl.innerText = `${percent}%`;
  if (circleEl) circleEl.setAttribute("stroke-dasharray", `${percent}, 100`);

  const subEl = document.getElementById("stats-progress-sub");
  if (subEl) subEl.innerText = `${completed} of ${milestones.length} milestones done`;

  // Render recent files
  const recentFilesList = document.getElementById("dash-recent-files-list");
  if (recentFilesList) {
    if (files.length === 0) {
      recentFilesList.innerHTML = `<li style="color:var(--text-muted); font-size:0.9rem; justify-content:center;">No cloud files uploaded yet.</li>`;
    } else {
      recentFilesList.innerHTML = files.slice(0, 3).map(f => {
        const icon = f.name.endsWith(".pdf") ? "ri-file-pdf-line text-blue" : "ri-file-word-line text-blue";
        return `<li><i class="${icon}"></i> <a href="${f.url}" target="_blank" style="color:inherit; text-decoration:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(f.name)}</a></li>`;
      }).join("");
    }
  }
}

function setupLiteratureInteractions() {
  const reviewCard = document.getElementById("hub-card-review");
  if (reviewCard) reviewCard.onclick = () => window.open("/?tool=lit-review", "_blank");

  const gapCard = document.getElementById("hub-card-gap");
  if (gapCard) gapCard.onclick = () => window.open("/?tool=lit-gap", "_blank");

  const probCard = document.getElementById("hub-card-problem");
  if (probCard) probCard.onclick = () => window.open("/?tool=lit-problem", "_blank");

  const pubCard = document.getElementById("hub-card-publish");
  if (pubCard) pubCard.onclick = () => window.open("/?tool=lit-publish", "_blank");
}

function attachLitBackBtn() {
  const btn = document.getElementById("lit-back-btn");
  if (btn) {
    btn.onclick = () => window.close();
  }
}

function subToolLoading(toolId, msg) {
  const outArea = document.getElementById(`${toolId}-output-area`);
  const outContent = document.getElementById(`${toolId}-output-content`);
  if (!outArea || !outContent) return null;
  outArea.style.display = "block";
  outContent.innerHTML = `<i class="ri-loader-4-line ri-spin"></i> ${msg}...`;
  outArea.scrollIntoView({ behavior: "smooth" });
  return outContent;
}

function bindCopyAndDownload(toolId, title) {
  const copyBtn = document.getElementById(`${toolId}-copy-btn`);
  const downloadBtn = document.getElementById(`${toolId}-download-btn`);
  const content = document.getElementById(`${toolId}-output-content`);

  if (copyBtn && content) {
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(content.innerText);
      toast("Copied to clipboard.");
    };
  }

  if (downloadBtn && content) {
    downloadBtn.onclick = () => {
      const html =
        "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'></head><body>" +
        `<div style="font-family:Arial, sans-serif;">${content.innerHTML}</div>` +
        "</body></html>";
      const url = "data:application/vnd.ms-word;charset=utf-8," + encodeURIComponent(html);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.doc`;
      a.click();
    };
  }
}

function setupLitReviewInteractions() {
  loadToolHistoryInUI("lit-review", "lit-review-history-list");
  attachLitBackBtn();
  const reviewFile = document.getElementById("lit-review-file");
  if (reviewFile) {
    reviewFile.onchange = async (e) => {
      if (!e.target.files.length) return;
      const outContent = subToolLoading("lit-review", "Extracting papers and generating literature review");
      const text = await extractTextFromMultiplePDFs(e.target.files);
      if (!text.trim()) {
        outContent.innerHTML = `<span style="color:red;">Error: No readable text found in the uploaded PDF. Please try a text-based PDF, not a scanned image PDF.</span>`;
        return;
      }
      
      try {
        const response = await callApi("/api/literature/review", { text: text.substring(0, 20000) });
        outContent.innerHTML = formatAIText(response);
        await saveToolHistory(auth.currentUser.uid, "lit-review", "Literature Review", response);
        loadToolHistoryInUI("lit-review", "lit-review-history-list");
        bindCopyAndDownload("lit-review", "Literature Review");
      } catch (err) {
        outContent.innerHTML = `<span style="color:red;">Error: ${err.message}</span>`;
      }
    };
  }
}

function setupResearchGapInteractions() {
  loadToolHistoryInUI("lit-gap", "lit-gap-history-list");
  attachLitBackBtn();
  const gapFile = document.getElementById("lit-gap-file");
  if (gapFile) {
    gapFile.onchange = async (e) => {
      if (!e.target.files.length) return;
      if (e.target.files.length > 10) {
        return alert("Please upload a maximum of 10 papers.");
      }
      const outContent = subToolLoading("lit-gap", "Analyzing papers for research gaps");
      const text = await extractTextFromMultiplePDFs(e.target.files);

      try {
        const response = await callApi("/api/literature/gap", { text: text.substring(0, 20000) });
        outContent.innerHTML = formatAIText(response);
        await saveToolHistory(auth.currentUser.uid, "lit-gap", "Research Gap Analysis", response);
        loadToolHistoryInUI("lit-gap", "lit-gap-history-list");
        bindCopyAndDownload("lit-gap", "Research Gaps");
      } catch (err) {
        outContent.innerHTML = `<span style="color:red;">Error: ${err.message}</span>`;
      }
    };
  }
}

function setupProblemStmtInteractions() {
  loadToolHistoryInUI("lit-problem", "lit-problem-history-list");
  attachLitBackBtn();
  const fileInput = document.getElementById("lit-problem-file");
  if (fileInput) {
    fileInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const outContent = subToolLoading("lit-problem", "Reading document and formulating statement");
      const text = await extractTextFromDocx(file);

      try {
        const response = await callApi("/api/literature/problem-statement", { text: text.substring(0, 15000) });
        outContent.innerHTML = formatAIText(response);
        await saveToolHistory(auth.currentUser.uid, "lit-problem", "Problem Statements", response);
        loadToolHistoryInUI("lit-problem", "lit-problem-history-list");
        bindCopyAndDownload("lit-problem", "Problem Statement");
      } catch (err) {
        outContent.innerHTML = `<span style="color:red;">Error: ${err.message}</span>`;
      }
    };
  }
}

function setupJournalFinderInteractions() {
  loadToolHistoryInUI("lit-publish", "lit-publish-history-list");
  attachLitBackBtn();
  const btn = document.getElementById("lit-publish-btn");
  const textarea = document.getElementById("lit-publish-text");
  if (btn && textarea) {
    btn.onclick = async () => {
      const text = textarea.value.trim();
      if (!text) return alert("Please paste your abstract first.");
      const outContent = subToolLoading("lit-publish", "Searching journals matching abstract");

      try {
        const response = await callApi("/api/literature/journal-finder", { abstract: text.substring(0, 5000) });
        outContent.innerHTML = formatAIText(response);
        await saveToolHistory(auth.currentUser.uid, "lit-publish", "Journal Finder Suggestions", response);
        loadToolHistoryInUI("lit-publish", "lit-publish-history-list");
        bindCopyAndDownload("lit-publish", "Journal Finder");
      } catch (err) {
        outContent.innerHTML = `<span style="color:red;">Error: ${err.message}</span>`;
      }
    };
  }
}

function setupLibraryInteractions() {
  const uploadInput = document.getElementById("file-upload");
  const uploadStatus = document.getElementById("upload-status");

  if (uploadInput) {
    uploadInput.onchange = async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      uploadStatus.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Uploading files...';
      for (const file of files) {
        await uploadToCloudStorage(auth.currentUser.uid, file);
      }
      uploadStatus.innerHTML = `${files.length} file(s) uploaded successfully.`;
      await renderCloudFiles();
    };
  }

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      document.querySelectorAll(".tab-content .file-list").forEach((list) => list.classList.remove("active"));

      const map = {
        all: "all-files",
        pdfs: "pdf-files",
        docs: "doc-files",
        others: "other-files",
      };
      document.getElementById(map[btn.dataset.tab])?.classList.add("active");
    };
  });

  renderCloudFiles();
}

async function renderCloudFiles() {
  const allList = document.getElementById("all-file-list");
  const pdfList = document.getElementById("pdf-file-list");
  const docList = document.getElementById("doc-file-list");
  const otherList = document.getElementById("other-file-list");
  if (!allList || !pdfList || !docList || !otherList) return;

  const files = await loadCloudFiles(auth.currentUser.uid);

  allList.innerHTML = "";
  pdfList.innerHTML = "";
  docList.innerHTML = "";
  otherList.innerHTML = "";

  if (!files.length) {
    allList.innerHTML = "<li>No files uploaded yet.</li>";
    return;
  }

  files.forEach((file) => {
    const itemHtml = `<li><i class="ri-file-line"></i> <a href="${file.url}" target="_blank" style="color:inherit; text-decoration:none;">${escapeHtml(file.name)}</a></li>`;
    allList.innerHTML += itemHtml;

    const lower = file.name.toLowerCase();
    if (lower.endsWith(".pdf")) pdfList.innerHTML += itemHtml;
    else if (lower.endsWith(".doc") || lower.endsWith(".docx") || lower.endsWith(".txt") || lower.endsWith(".md")) docList.innerHTML += itemHtml;
    else otherList.innerHTML += itemHtml;
  });
}

function setupNotesInteractions() {
  loadToolHistoryInUI("notes", "notes-history-list");
  const textarea = document.getElementById("notes-textarea");
  const saveBtn = document.getElementById("notes-save-btn");
  const preview = document.getElementById("notes-math-preview");

  if (textarea) {
    loadCloudDocument(auth.currentUser.uid, "notes").then(val => {
      textarea.value = val;
      // Trigger preview on load
      textarea.dispatchEvent(new Event("input"));
    });
    
    // Live preview
    textarea.addEventListener("input", () => {
      const val = textarea.value;
      const matches = val.match(/\$\$(.*?)\$\$/g);
      const equations = [];
      if (matches) {
        matches.forEach(m => equations.push(m.slice(2, -2)));
      }
      if (equations.length === 0) {
        preview.innerHTML = "<p>Live LaTeX rendering enabled. Wrap equations in $$ (e.g. $$E=mc^2$$) to preview.</p>";
      } else {
        preview.innerHTML = `
          <h4>Rendered Equations</h4>
          <div style="display:flex; flex-direction:column; gap:12px; margin-top:10px;">
            ${equations.map(eq => `<div style="background:rgba(255,255,255,0.8); color:black; padding:15px; border-radius:8px; text-align:center; font-family:'Courier New', monospace; font-size:1.1rem; border:1px solid var(--glass-border);">${escapeHtml(eq)}</div>`).join("")}
          </div>
        `;
      }
    });
  }

  if (saveBtn && textarea) {
    saveBtn.onclick = async () => {
      const content = textarea.value;
      await saveCloudDocument(auth.currentUser.uid, "notes", content);
      await saveToolHistory(auth.currentUser.uid, "notes", "Research Notes Save", content);
      loadToolHistoryInUI("notes", "notes-history-list");
      toast("Notes saved successfully.");
    };
  }

  // Bind note toolbar buttons
  document.getElementById("editor-bold-btn").onclick = () => wrapTextSelection(textarea, "**", "**");
  document.getElementById("editor-italic-btn").onclick = () => wrapTextSelection(textarea, "*", "*");
  document.getElementById("editor-header-btn").onclick = () => wrapTextSelection(textarea, "# ", "");
  document.getElementById("editor-math-btn").onclick = () => wrapTextSelection(textarea, "$$", "$$");
}

function wrapTextSelection(textarea, prefix, suffix) {
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const selected = text.substring(start, end);
  const replacement = prefix + selected + suffix;
  textarea.value = text.substring(0, start) + replacement + text.substring(end);
  textarea.focus();
  textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
  textarea.dispatchEvent(new Event("input"));
}

function setupDraftInteractions() {
  loadToolHistoryInUI("draft", "draft-history-list");
  const textarea = document.getElementById("draft-textarea");
  const saveBtn = document.getElementById("draft-save-btn");
  const submitBtn = document.getElementById("draft-submit-btn");
  
  const paraBtn = document.getElementById("draft-paraphrase-btn");
  const expandBtn = document.getElementById("draft-expand-btn");
  const grammarBtn = document.getElementById("draft-grammar-btn");

  if (textarea) {
    loadCloudDocument(auth.currentUser.uid, "draft").then(val => {
      textarea.value = val;
    });
  }

  if (saveBtn && textarea) {
    saveBtn.onclick = async () => {
      const content = textarea.value;
      await saveCloudDocument(auth.currentUser.uid, "draft", content);
      await saveToolHistory(auth.currentUser.uid, "draft", "Draft Save", content);
      loadToolHistoryInUI("draft", "draft-history-list");
      toast("Draft saved successfully.");
    };
  }

  if (submitBtn && textarea) {
    submitBtn.onclick = async () => {
      if (!textarea.value.trim()) return alert("Please write a draft before submitting.");
      if (!myProfile.supervisorId) return alert("Select a supervisor first in profile setup.");

      const title = prompt("Enter chapter title / description:", "Thesis Chapter Draft");
      if (!title) return;

      await createSubmission({
        scholarId: auth.currentUser.uid,
        supervisorId: myProfile.supervisorId,
        title,
        content: textarea.value,
        type: "draft"
      });
      toast("Draft submitted to supervisor successfully!");
    };
  }

  // AI draft helpers
  if (paraBtn && textarea) {
    paraBtn.onclick = async () => {
      const selectedText = getSelectionOrAll(textarea);
      if (!selectedText) return;
      const originalBtnText = paraBtn.innerText;
      paraBtn.innerText = "Processing...";
      try {
        const response = await callApi("/api/draft/paraphrase", { text: selectedText });
        replaceSelectionOrAll(textarea, response);
        toast("Paraphrased selection.");
      } catch (err) {
        alert(err.message);
      } finally {
        paraBtn.innerText = originalBtnText;
      }
    };
  }

  if (expandBtn && textarea) {
    expandBtn.onclick = async () => {
      const selectedText = getSelectionOrAll(textarea);
      if (!selectedText) return;
      const originalBtnText = expandBtn.innerText;
      expandBtn.innerText = "Processing...";
      try {
        const response = await callApi("/api/draft/expand", { text: selectedText });
        replaceSelectionOrAll(textarea, response);
        toast("Expanded selection.");
      } catch (err) {
        alert(err.message);
      } finally {
        expandBtn.innerText = originalBtnText;
      }
    };
  }

  if (grammarBtn && textarea) {
    grammarBtn.onclick = async () => {
      const selectedText = getSelectionOrAll(textarea);
      if (!selectedText) return;
      const originalBtnText = grammarBtn.innerText;
      grammarBtn.innerText = "Processing...";
      try {
        const response = await callApi("/api/draft/grammar", { text: selectedText });
        replaceSelectionOrAll(textarea, response);
        toast("Grammar checked.");
      } catch (err) {
        alert(err.message);
      } finally {
        grammarBtn.innerText = originalBtnText;
      }
    };
  }

  // Toolbar
  document.getElementById("draft-bold-btn").onclick = () => wrapTextSelection(textarea, "**", "**");
  document.getElementById("draft-italic-btn").onclick = () => wrapTextSelection(textarea, "*", "*");
  document.getElementById("draft-underline-btn").onclick = () => wrapTextSelection(textarea, "<u>", "</u>");
}

function getSelectionOrAll(textarea) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  if (start === end) return textarea.value.trim();
  return textarea.value.substring(start, end).trim();
}

function replaceSelectionOrAll(textarea, replacement) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  if (start === end) {
    textarea.value = replacement;
  } else {
    textarea.value = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);
  }
}

function setupLatexInteractions() {
  loadToolHistoryInUI("latex", "latex-history-list");
  const fileInput = document.getElementById("latex-upload-file");
  const outArea = document.getElementById("latex-output-area");
  const outContent = document.getElementById("latex-output-content");
  const copyBtn = document.getElementById("latex-copy-btn");

  if (fileInput) {
    fileInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      outArea.style.display = "block";
      outContent.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Converting manuscript...';
      const text = await extractTextFromDocx(file);

      try {
        const response = await callApi("/api/latex/convert", { text: text.substring(0, 15000) });
        outContent.innerText = response;
        await saveToolHistory(auth.currentUser.uid, "latex", "LaTeX conversion", response);
        loadToolHistoryInUI("latex", "latex-history-list");
      } catch (err) {
        outContent.innerHTML = `<span style="color:red;">Error: ${err.message}</span>`;
      }
    };
  }

  if (copyBtn && outContent) {
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(outContent.innerText);
      toast("LaTeX code copied.");
    };
  }
}

function setupEditingInteractions() {
  const content = document.getElementById("dashboard-content");

  const e1 = document.getElementById("hub-edit-grammar");
  if (e1) e1.onclick = () => { content.innerHTML = getGrammarHTML(); setupGrammarInteractions(); };

  const e2 = document.getElementById("hub-edit-plag-scan");
  if (e2) e2.onclick = () => { content.innerHTML = getPlagScanHTML(); setupPlagScanInteractions(); };

  const e3 = document.getElementById("hub-edit-plag-rem");
  if (e3) e3.onclick = () => { content.innerHTML = getPlagRemHTML(); setupPlagRemInteractions(); };

  const e4 = document.getElementById("hub-edit-para");
  if (e4) e4.onclick = () => { content.innerHTML = getParaphraseHTML(); setupParaphraseInteractions(); };

  const e5 = document.getElementById("hub-edit-ai-chk");
  if (e5) e5.onclick = () => { content.innerHTML = getAiCheckHTML(); setupAiCheckInteractions(); };

  const e6 = document.getElementById("hub-edit-reduce");
  if (e6) e6.onclick = () => { content.innerHTML = getAiReduceHTML(); setupAiReduceInteractions(); };
}

function attachEditBackBtn() {
  const btn = document.getElementById("edit-back-btn");
  if (btn) {
    btn.onclick = () => {
      document.getElementById("dashboard-content").innerHTML = getEditingHTML();
      setupEditingInteractions();
    };
  }
}

function bindCopySimple(toolId) {
  const btn = document.getElementById(`${toolId}-copy-btn`);
  const content = document.getElementById(`${toolId}-output-content`);
  if (btn && content) {
    btn.onclick = () => {
      navigator.clipboard.writeText(content.innerText);
      toast("Result copied.");
    };
  }
}

function setupGrammarInteractions() {
  loadToolHistoryInUI("edit-grammar", "edit-grammar-history-list");
  attachEditBackBtn();
  const btn = document.getElementById("edit-grammar-btn");
  const textarea = document.getElementById("edit-grammar-text");
  if (btn && textarea) {
    btn.onclick = async () => {
      const text = textarea.value.trim();
      if (!text) return alert("Enter text first.");
      const out = subToolLoading("edit-grammar", "Reviewing text structure");

      try {
        const response = await callApi("/api/editing/grammar", { text });
        out.innerHTML = formatAIText(response);
        await saveToolHistory(auth.currentUser.uid, "edit-grammar", "Grammar Check", response);
        loadToolHistoryInUI("edit-grammar", "edit-grammar-history-list");
        bindCopySimple("edit-grammar");
      } catch (err) {
        out.innerHTML = `<span style="color:red;">Error: ${err.message}</span>`;
      }
    };
  }
}

function setupPlagScanInteractions() {
  loadToolHistoryInUI("edit-plag-scan", "edit-plag-scan-history-list");
  attachEditBackBtn();
  const btn = document.getElementById("edit-plag-scan-btn");
  const textarea = document.getElementById("edit-plag-scan-text");
  if (btn && textarea) {
    btn.onclick = async () => {
      const text = textarea.value.trim();
      if (!text) return alert("Enter text first.");
      const out = subToolLoading("edit-plag-scan", "Scanning for matches");

      try {
        const response = await callApi("/api/editing/plagiarism-scan", { text });
        out.innerHTML = formatAIText(response);
        await saveToolHistory(auth.currentUser.uid, "edit-plag-scan", "Plagiarism Scan", response);
        loadToolHistoryInUI("edit-plag-scan", "edit-plag-scan-history-list");
        bindCopySimple("edit-plag-scan");
      } catch (err) {
        out.innerHTML = `<span style="color:red;">Error: ${err.message}</span>`;
      }
    };
  }
}

function setupPlagRemInteractions() {
  loadToolHistoryInUI("edit-plag-rem", "edit-plag-rem-history-list");
  attachEditBackBtn();
  const btn = document.getElementById("edit-plag-rem-btn");
  const textarea = document.getElementById("edit-plag-rem-text");
  if (btn && textarea) {
    btn.onclick = async () => {
      const text = textarea.value.trim();
      if (!text) return alert("Enter text first.");
      const out = subToolLoading("edit-plag-rem", "Rewriting content");

      try {
        const response = await callApi("/api/editing/plagiarism-remove", { text });
        out.innerHTML = formatAIText(response);
        await saveToolHistory(auth.currentUser.uid, "edit-plag-rem", "Plagiarism Rewrite", response);
        loadToolHistoryInUI("edit-plag-rem", "edit-plag-rem-history-list");
        bindCopySimple("edit-plag-rem");
      } catch (err) {
        out.innerHTML = `<span style="color:red;">Error: ${err.message}</span>`;
      }
    };
  }
}

function setupParaphraseInteractions() {
  loadToolHistoryInUI("edit-para", "edit-para-history-list");
  attachEditBackBtn();
  const btn = document.getElementById("edit-para-btn");
  const textarea = document.getElementById("edit-para-text");
  if (btn && textarea) {
    btn.onclick = async () => {
      const text = textarea.value.trim();
      if (!text) return alert("Enter text first.");
      const out = subToolLoading("edit-para", "Varying sentence vocabulary");

      try {
        const response = await callApi("/api/editing/paraphrase", { text });
        out.innerHTML = formatAIText(response);
        await saveToolHistory(auth.currentUser.uid, "edit-para", "Paraphrase", response);
        loadToolHistoryInUI("edit-para", "edit-para-history-list");
        bindCopySimple("edit-para");
      } catch (err) {
        out.innerHTML = `<span style="color:red;">Error: ${err.message}</span>`;
      }
    };
  }
}

function setupAiCheckInteractions() {
  loadToolHistoryInUI("edit-ai-chk", "edit-ai-chk-history-list");
  attachEditBackBtn();
  const btn = document.getElementById("edit-ai-chk-btn");
  const textarea = document.getElementById("edit-ai-chk-text");
  if (btn && textarea) {
    btn.onclick = async () => {
      const text = textarea.value.trim();
      if (!text) return alert("Enter text first.");
      const out = subToolLoading("edit-ai-chk", "Checking probability signatures");

      try {
        const response = await callApi("/api/editing/ai-check", { text });
        out.innerHTML = formatAIText(response);
        await saveToolHistory(auth.currentUser.uid, "edit-ai-chk", "AI Classifier Scan", response);
        loadToolHistoryInUI("edit-ai-chk", "edit-ai-chk-history-list");
        bindCopySimple("edit-ai-chk");
      } catch (err) {
        out.innerHTML = `<span style="color:red;">Error: ${err.message}</span>`;
      }
    };
  }
}

function setupAiReduceInteractions() {
  loadToolHistoryInUI("edit-reduce", "edit-reduce-history-list");
  attachEditBackBtn();
  const btn = document.getElementById("edit-reduce-btn");
  const textarea = document.getElementById("edit-reduce-text");
  if (btn && textarea) {
    btn.onclick = async () => {
      const text = textarea.value.trim();
      if (!text) return alert("Enter text first.");
      const out = subToolLoading("edit-reduce", "Extracting core paragraphs");

      try {
        const response = await callApi("/api/editing/reduce", { text });
        out.innerHTML = formatAIText(response);
        await saveToolHistory(auth.currentUser.uid, "edit-reduce", "Condensation summary", response);
        loadToolHistoryInUI("edit-reduce", "edit-reduce-history-list");
        bindCopySimple("edit-reduce");
      } catch (err) {
        out.innerHTML = `<span style="color:red;">Error: ${err.message}</span>`;
      }
    };
  }
}

function setupChatPdfInteractions() {
  loadToolHistoryInUI("chatpdf", "chatpdf-history-list");

  const uploadBtn = document.getElementById("pdf-upload-btn");
  const fileInput = document.getElementById("pdf-upload-input");
  const renderArea = document.getElementById("pdf-render-area");

  if (uploadBtn && fileInput) {
    uploadBtn.onclick = () => fileInput.click();
    fileInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file || file.type !== "application/pdf") return;

      renderArea.innerHTML = '<div style="text-align:center; margin-top:50px; color:var(--text-muted);"><i class="ri-loader-4-line ri-spin"></i> Extracting text via PDF.js...</div>';

      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        let text = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          text += content.items.map((item) => item.str).join(" ") + "\n";
        }

        currentPdfTextContext = "The user uploaded a document with the following text:\n\n" + text.substring(0, 15000);

        const fileUrl = URL.createObjectURL(file);
        renderArea.innerHTML = `
          <object data="${fileUrl}#toolbar=0" type="application/pdf" width="100%" height="100%" style="border-radius:0 0 8px 8px;">
            <p style="padding:20px;">PDF preview unavailable. <a href="${fileUrl}" target="_blank">Open PDF</a>.</p>
          </object>
        `;

        await uploadToCloudStorage(auth.currentUser.uid, file);
      } catch (err) {
        console.error("PDF parse error", err);
        renderArea.innerHTML = '<div style="text-align:center; padding:20px; color:red;">Failed to parse PDF.</div>';
      }
    };
  }

  const sendBtn = document.getElementById("pdf-chat-send-btn");
  const input = document.getElementById("pdf-chat-input");
  const msgContainer = document.getElementById("pdf-chat-messages");

  if (sendBtn && input && msgContainer) {
    const handleSend = async () => {
      const userText = input.value.trim();
      if (!userText) return;
      if (!currentPdfTextContext) {
        msgContainer.innerHTML += '<div class="message ai-msg">Please upload a PDF first.</div>';
        return;
      }

      msgContainer.innerHTML += `<div class="message user-msg">${escapeHtml(userText)}</div>`;
      input.value = "";
      msgContainer.scrollTop = msgContainer.scrollHeight;

      const typingId = "typing-" + Date.now();
      msgContainer.innerHTML += `<div class="message ai-msg" id="${typingId}"><i class="ri-loader-4-line ri-spin"></i> Reviewing document...</div>`;

      try {
        const response = await callApi("/api/pdf/ask", { question: userText, context: currentPdfTextContext });
        document.getElementById(typingId)?.remove();
        msgContainer.innerHTML += `<div class="message ai-msg">${formatAIText(response)}</div>`;
        msgContainer.scrollTop = msgContainer.scrollHeight;
        await saveToolHistory(auth.currentUser.uid, "chatpdf", "PDF Q&A", `User: ${userText}\n\nAI: ${response}`);
        loadToolHistoryInUI("chatpdf", "chatpdf-history-list");
      } catch (err) {
        document.getElementById(typingId)?.remove();
        msgContainer.innerHTML += `<div class="message ai-msg" style="color:red;">Error: ${err.message}</div>`;
      }
    };

    sendBtn.onclick = handleSend;
    input.onkeypress = (e) => {
      if (e.key === "Enter") handleSend();
    };
  }
}

function setupParuInteractions() {
  const input = document.getElementById("paru-chat-input");
  const sendBtn = document.getElementById("paru-send-btn");
  const msgContainer = document.getElementById("paru-chat-messages");
  const sidebar = document.getElementById("paru-history-list");
  
  if (!input || !sendBtn) return;

  if (auth.currentUser) {
    loadParuHistory(auth.currentUser.uid, msgContainer, sidebar);
  }

  const handleSend = async () => {
    const userText = input.value.trim();
    if (!userText) return;

    msgContainer.innerHTML += `<div class="message user-msg">${escapeHtml(userText)}</div>`;
    input.value = "";
    msgContainer.scrollTop = msgContainer.scrollHeight;

    if (auth.currentUser) await saveParuMessage(auth.currentUser.uid, "user", userText);

    const typingId = "typing-" + Date.now();
    msgContainer.innerHTML += `<div class="message ai-msg" id="${typingId}"><i class="ri-loader-4-line ri-spin"></i> Paru is thinking...</div>`;

    try {
      // Build conversation history format for Paru
      const recentHistory = [];
      const msgElements = msgContainer.querySelectorAll(".message");
      // Pick last 6 messages
      const sliceStart = Math.max(0, msgElements.length - 7); // exclude the newly added typing message
      const sliceEnd = msgElements.length - 1;
      for (let i = sliceStart; i < sliceEnd; i++) {
        const el = msgElements[i];
        recentHistory.push({
          role: el.classList.contains("user-msg") ? "user" : "model",
          text: el.innerText
        });
      }

      const response = await callApi("/api/paru/chat", { message: userText, history: recentHistory });
      
      document.getElementById(typingId)?.remove();
      msgContainer.innerHTML += `<div class="message ai-msg">${formatAIText(response)}</div>`;
      msgContainer.scrollTop = msgContainer.scrollHeight;

      if (auth.currentUser) {
        await saveParuMessage(auth.currentUser.uid, "ai", response);
        loadParuHistory(auth.currentUser.uid, msgContainer, sidebar);
      }
    } catch (err) {
      document.getElementById(typingId)?.remove();
      msgContainer.innerHTML += `<div class="message ai-msg" style="color:red;">Error: ${err.message}</div>`;
    }
  };

  sendBtn.onclick = handleSend;
  input.onkeypress = (e) => {
    if (e.key === "Enter") handleSend();
  };

  const newChatBtn = document.getElementById("new-paru-chat");
  if (newChatBtn) {
    newChatBtn.onclick = () => {
      msgContainer.innerHTML = '<div class="message ai-msg">New Paaru conversation started. How can I assist you with your research today?</div>';
      toast("Conversation cleared locally.");
    };
  }
}

/* ═══════════════════════════════════════════════════════
   SUPERVISOR INTERACTIONS
   ═══════════════════════════════════════════════════════ */

function setupSupervisorDashboardInteractions() {
  loadSupervisorDashboardStats();
}

async function loadSupervisorDashboardStats() {
  const uid = auth.currentUser.uid;

  const requests = await fetchSupervisorRequests();
  const pendingRequests = requests.filter((item) => item.status === "pending");
  const requestsContainer = document.getElementById("sup-requests-list");
  if (requestsContainer) {
    if (pendingRequests.length === 0) {
      requestsContainer.innerHTML = `<p style="color:var(--text-muted); font-size:0.9rem; text-align:center; padding:12px;">No new scholar requests.</p>`;
    } else {
      requestsContainer.innerHTML = pendingRequests.map((request) => `
        <div class="student-card" style="padding:15px;">
          <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
            <div>
              <h4 style="margin:0;">${escapeHtml(request.scholarName || "Scholar request")}</h4>
              <p style="font-size:0.85rem; color:var(--text-muted); margin-top:3px;">${escapeHtml(request.scholarEmail || "")}</p>
              <p style="font-size:0.85rem; margin-top:8px;">${escapeHtml(request.message || "Please accept me as your scholar.")}</p>
              ${request.department ? `<p style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;">Department: ${escapeHtml(request.department)}</p>` : ""}
            </div>
            <span class="status-pill pending">New</span>
          </div>
          <div class="inline-actions" style="margin-top:12px;">
            <button class="primary-btn accept-supervisor-request" data-id="${request.id}" style="padding:6px 12px;">Accept</button>
            <button class="secondary-btn reject-supervisor-request" data-id="${request.id}" style="padding:6px 12px; border-color:#ef4444; color:#ef4444;">Reject</button>
          </div>
        </div>
      `).join("");

      requestsContainer.querySelectorAll(".accept-supervisor-request").forEach((btn) => {
        btn.onclick = async () => {
          await respondToSupervisorRequest(btn.dataset.id, "accepted", "Accepted by supervisor.");
          toast("Scholar request accepted.");
          loadSupervisorDashboardStats();
        };
      });
      requestsContainer.querySelectorAll(".reject-supervisor-request").forEach((btn) => {
        btn.onclick = async () => {
          await respondToSupervisorRequest(btn.dataset.id, "rejected", "Rejected by supervisor.");
          toast("Scholar request rejected.", "error");
          loadSupervisorDashboardStats();
        };
      });
    }
  }

  const scholars = await fetchScholarsForSupervisor(uid);
  const scholarsEl = document.getElementById("sup-stats-scholars");
  if (scholarsEl) scholarsEl.innerText = scholars.length;

  const submissions = await fetchSubmissionsForSupervisor(uid);
  const pendingSubs = submissions.filter(s => s.status === "pending_review");
  const subsEl = document.getElementById("sup-stats-submissions");
  if (subsEl) subsEl.innerText = pendingSubs.length;

  const meetings = await fetchMeetingsForSupervisor(uid);
  const pendingMeetings = meetings.filter(m => m.status === "pending");
  const meetingsEl = document.getElementById("sup-stats-meetings");
  if (meetingsEl) meetingsEl.innerText = pendingMeetings.length;

  // Render assigned scholars list
  const scholarsListContainer = document.getElementById("sup-scholars-list");
  if (scholarsListContainer) {
    if (scholars.length === 0) {
      scholarsListContainer.innerHTML = `<p style="color:var(--text-muted); font-size:0.9rem; text-align:center; margin:auto;">No scholars assigned to you.</p>`;
    } else {
      scholarsListContainer.innerHTML = scholars.map(s => `
        <div class="student-card" style="padding:15px; margin-bottom:8px;">
          <h4 style="margin:0;">${escapeHtml(s.displayName)}</h4>
          <p style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">${escapeHtml(s.email)} | Department: ${escapeHtml(s.department || "N/A")}</p>
          <button class="btn-text view-scholar-milestones-btn" data-scholar-uid="${s.uid}" style="font-size:0.8rem; padding:6px 0; margin-top:6px; background:none;">Manage Milestones →</button>
        </div>
      `).join("");

      // Bind click handlers
      scholarsListContainer.querySelectorAll(".view-scholar-milestones-btn").forEach(btn => {
        btn.onclick = () => {
          const scholarUid = btn.getAttribute("data-scholar-uid");
          loadView(`scholars&scholar=${scholarUid}`);
        };
      });
    }
  }

  // Render pending meeting requests list
  const meetingsListContainer = document.getElementById("sup-meetings-list");
  if (meetingsListContainer) {
    if (pendingMeetings.length === 0) {
      meetingsListContainer.innerHTML = `<p style="color:var(--text-muted); font-size:0.9rem; text-align:center; margin:auto;">No pending meeting requests.</p>`;
    } else {
      meetingsListContainer.innerHTML = pendingMeetings.map(m => {
        const scholarName = scholars.find(s => s.uid === m.scholarId)?.displayName || "Scholar";
        return `
          <div class="meeting-card" style="padding:15px; margin-bottom:8px;">
            <h4 style="margin:0;">Meeting Request from ${escapeHtml(scholarName)}</h4>
            <p style="font-size:0.85rem; margin-top:4px;"><strong>Date:</strong> ${escapeHtml(m.requestedDate)} | <strong>Time:</strong> ${escapeHtml(m.requestedTime)}</p>
            <p style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;"><strong>Agenda:</strong> ${escapeHtml(m.agenda)}</p>
            <div class="inline-actions" style="margin-top:10px;">
              <button class="primary-btn approve-meeting-btn" data-id="${m.id}" style="padding:5px 12px; font-size:0.8rem;">Approve</button>
              <button class="secondary-btn decline-meeting-btn" data-id="${m.id}" style="padding:5px 12px; font-size:0.8rem; border-color:red; color:red;">Decline</button>
            </div>
          </div>
        `;
      }).join("");

      meetingsListContainer.querySelectorAll(".approve-meeting-btn").forEach(btn => {
        btn.onclick = async () => {
          const id = btn.getAttribute("data-id");
          await respondToMeeting(id, "approved", "Approved by supervisor.");
          toast("Meeting approved.");
          loadSupervisorDashboardStats();
        };
      });

      meetingsListContainer.querySelectorAll(".decline-meeting-btn").forEach(btn => {
        btn.onclick = async () => {
          const id = btn.getAttribute("data-id");
          await respondToMeeting(id, "declined", "Declined by supervisor.");
          toast("Meeting declined.", "error");
          loadSupervisorDashboardStats();
        };
      });
    }
  }

  // Render submissions pending review list
  const subsListContainer = document.getElementById("sup-submissions-list");
  if (subsListContainer) {
    if (pendingSubs.length === 0) {
      subsListContainer.innerHTML = `<p style="color:var(--text-muted); font-size:0.9rem; text-align:center; padding:20px;">No pending submissions to review.</p>`;
    } else {
      subsListContainer.innerHTML = pendingSubs.map(s => {
        const scholarName = scholars.find(sc => sc.uid === s.scholarId)?.displayName || "Scholar";
        return `
          <div class="submission-card" style="padding:20px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
              <div>
                <h4 style="margin:0; font-size:1.15rem;">${escapeHtml(s.title)}</h4>
                <p style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">Submitted by ${escapeHtml(scholarName)} on ${fmtDate(s.createdAt)}</p>
              </div>
              <span class="status-pill pending">Pending Review</span>
            </div>
            <div style="background:rgba(0,0,0,0.02); border-radius:8px; padding:12px; margin-top:12px; font-size:0.9rem; line-height:1.5; white-space:pre-wrap; border:1px solid var(--glass-border);">${escapeHtml(s.content)}</div>
            
            <div class="feedback-input-container" style="margin-top:16px;">
              <textarea class="sup-feedback-textarea" placeholder="Write review feedback here..." style="width:100%; height:80px; padding:10px; border-radius:8px; border:1px solid var(--glass-border); outline:none; resize:vertical; background:white; font-family:inherit;"></textarea>
              <button class="primary-btn submit-feedback-btn" data-id="${s.id}" style="margin-top:8px; padding:6px 16px;">Submit Review</button>
            </div>
          </div>
        `;
      }).join("");

      subsListContainer.querySelectorAll(".submit-feedback-btn").forEach(btn => {
        btn.onclick = async () => {
          const id = btn.getAttribute("data-id");
          const card = btn.closest(".submission-card");
          const feedback = card.querySelector(".sup-feedback-textarea").value.trim();
          if (!feedback) return alert("Please enter review feedback first.");
          await sendSubmissionFeedback(id, feedback);
          toast("Feedback submitted successfully.");
          loadSupervisorDashboardStats();
        };
      });
    }
  }
}

async function setupSupervisorScholarsInteractions() {
  const uid = auth.currentUser.uid;
  const scholars = await fetchScholarsForSupervisor(uid);

  const sidebarList = document.getElementById("scholar-select-list");
  if (!sidebarList) return;

  if (scholars.length === 0) {
    sidebarList.innerHTML = `<p style="color:var(--text-muted); font-size:0.85rem; text-align:center; padding-top:20px;">No assigned scholars.</p>`;
    return;
  }

  // Parse active scholar from URL
  const params = new URLSearchParams(window.location.search);
  const activeScholarUid = params.get("scholar");

  sidebarList.innerHTML = scholars.map(s => {
    const activeClass = s.uid === activeScholarUid ? "active" : "";
    return `
      <div class="history-item ${activeClass} sup-scholar-item" data-uid="${s.uid}">
        <div class="history-title">${escapeHtml(s.displayName)}</div>
      </div>
    `;
  }).join("");

  // Bind sidebar select clicks
  sidebarList.querySelectorAll(".sup-scholar-item").forEach(item => {
    item.onclick = () => {
      const scholarUid = item.getAttribute("data-uid");
      const url = new URL(window.location);
      url.searchParams.set("page", "scholars");
      url.searchParams.set("scholar", scholarUid);
      window.history.pushState({}, "", url);
      loadViewByRoute();
    };
  });

  if (activeScholarUid) {
    const selectedScholar = scholars.find(s => s.uid === activeScholarUid);
    if (selectedScholar) {
      const milestones = await fetchMilestonesForScholar(activeScholarUid);
      renderScholarMilestoneDetails(selectedScholar, milestones);
    }
  }
}

function renderScholarMilestoneDetails(scholar, milestones) {
  const container = document.getElementById("scholar-details-container");
  if (!container) return;

  container.innerHTML = getScholarMilestoneDetailsHTML(scholar, milestones);

  // Bind status changes
  container.querySelectorAll(".milestone-status-select").forEach(select => {
    select.onchange = async (e) => {
      const row = select.closest("tr");
      const id = row.getAttribute("data-milestone-id");
      const status = e.target.value;
      await updateMilestone(id, { status });
      toast("Milestone status updated.");
      setupSupervisorScholarsInteractions(); // Reload milestones list
    };
  });

  // Bind add milestone buttons
  const addBtn = document.getElementById("sup-add-milestone-btn");
  const formContainer = document.getElementById("add-milestone-form-container");
  if (addBtn && formContainer) {
    addBtn.onclick = () => {
      formContainer.style.display = "block";
      formContainer.scrollIntoView({ behavior: "smooth" });
    };
  }

  const cancelBtn = document.getElementById("cancel-milestone-btn");
  if (cancelBtn && formContainer) {
    cancelBtn.onclick = () => {
      formContainer.style.display = "none";
    };
  }

  const saveBtn = document.getElementById("save-milestone-btn");
  if (saveBtn && formContainer) {
    saveBtn.onclick = async () => {
      const title = document.getElementById("new-milestone-title").value.trim();
      const dueDate = document.getElementById("new-milestone-due").value;
      const note = document.getElementById("new-milestone-note").value.trim();

      if (!title || !dueDate) {
        return alert("Please enter title and due date.");
      }

      await createMilestone({
        scholarId: scholar.uid,
        supervisorId: auth.currentUser.uid,
        title,
        dueDate,
        status: "pending",
        note,
        supervisorNote: ""
      });

      toast("Milestone added successfully.");
      setupSupervisorScholarsInteractions(); // Reload
    };
  }
}

/* ═══════════════════════════════════════════════════════
   MAIN APP BOOTSTRAP
   ═══════════════════════════════════════════════════════ */

document.addEventListener("DOMContentLoaded", () => {
  const googleLoginBtn = document.getElementById("google-login-btn");
  const loginLoader = document.getElementById("login-loader");
  const loginView = document.getElementById("login-view");
  const emailInput = document.getElementById("email-input");
  const passwordInput = document.getElementById("password-input");
  const emailSigninBtn = document.getElementById("email-signin-btn");
  const emailSignupBtn = document.getElementById("email-signup-btn");
  const appView = document.getElementById("app-view");
  const btnText = googleLoginBtn?.querySelector("span");
  const userAvatar = document.getElementById("user-avatar");

  // Floating chatbot elements
  const floatingBtn = document.getElementById("parama-float-btn");
  const floatingPopup = document.getElementById("parama-chat-popup");
  const closeParamaBtn = document.getElementById("close-parama-btn");
  const floatingInput = document.getElementById("floating-chat-input");
  const floatingSend = document.getElementById("floating-send-btn");
  const floatingMessages = document.getElementById("floating-chat-messages");

  // Initialize Sync status badge
  updateSyncStatusBadge(getSyncMode());

  function hideAuthLoader() {
    const loader = document.getElementById("auth-loader");
    if (!loader) return;
    loader.classList.add("fade-out");
    setTimeout(() => loader.classList.add("hidden"), 450);
  }

  const authFallbackTimer = setTimeout(() => {
    if (auth.currentUser) return;
    hideAuthLoader();
    appView.classList.add("hidden");
    loginView.classList.remove("hidden");
    loginView.classList.add("active-view");
    toast("Session check took too long. Please sign in again.", "error");
  }, 8000);

  // Listen to mode changes
  window.addEventListener("imra-mode-change", (e) => {
    updateSyncStatusBadge(e.detail.mode);
  });

  // Re-sync click handler
  const badge = document.getElementById("sync-status-indicator");
  if (badge) {
    badge.onclick = () => {
      if (getSyncMode() === "local") {
        if (confirm("Retry Cloud Sync and clear old local sandbox profile data?")) {
          clearLocalSandboxData();
          window.location.reload();
        }
      }
    };
  }

  function toggleChatPopup() {
    floatingPopup.classList.toggle("hidden");
    if (!floatingPopup.classList.contains("hidden")) floatingInput?.focus();
  }

  async function bootstrapUserProfile(user) {
    if (!user?.email || !isInstituteEmail(user.email)) {
      await signOut(auth);
      throw new Error(`Please sign in with your @${INSTITUTE_DOMAIN} account.`);
    }

    let profile = await fetchProfile(user.uid);
    if (profile) {
      profile.role = String(profile.role || "scholar").toLowerCase();
      return profile;
    }

    const selectedRole = document.querySelector(".role-tab.active")?.dataset.role || "scholar";
    profile = await createProfile(user.uid, {
      email: user.email,
      displayName: user.displayName || user.email.split("@")[0],
      photoURL: user.photoURL || "",
      role: selectedRole === "supervisor" ? "supervisor" : "scholar",
      supervisorId: "",
      department: "",
    });
    profile.role = String(profile.role || "scholar").toLowerCase();
    return profile;
  }

  function showFirestoreSetup(user, error) {
    console.error("Firestore profile bootstrap failed:", error);
    const dashboardContent = document.getElementById("dashboard-content");
    if (dashboardContent) {
      dashboardContent.innerHTML = getFirestoreSetupHTML(user?.email || "");
      document.getElementById("retry-profile-btn")?.addEventListener("click", () => window.location.reload());
      document.getElementById("permission-signout-btn")?.addEventListener("click", () => signOut(auth));
    }
    toast("Signed in, but Firestore permissions are blocking the profile.", "error");
  }

  // Auth monitoring
  onAuthStateChanged(auth, async (user) => {
    clearTimeout(authFallbackTimer);
    hideAuthLoader();

    if (user) {
      loginView.classList.add("hidden");
      loginView.classList.remove("active-view");
      appView.classList.remove("hidden");

      if (userAvatar) {
        userAvatar.src = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || "Scholar")}&background=random&color=fff`;
      }

      setTimeout(() => {
        appView.classList.add("active-view");
      }, 50);

      try {
        myProfile = await bootstrapUserProfile(user);
        myProfile.role = String(myProfile.role || "scholar").toLowerCase();
        renderSidebarNav(myProfile.role);
        loadViewByRoute();
      } catch (error) {
        showFirestoreSetup(user, error);
      }

      if (floatingMessages) loadChatHistory(user.uid, floatingMessages);
    } else {
      appView.classList.remove("active-view");
      setTimeout(() => {
        appView.classList.add("hidden");
        loginView.classList.remove("hidden");
        setTimeout(() => loginView.classList.add("active-view"), 50);
      }, 500);
    }
  });

  // Login event handlers
  if (emailSigninBtn) {
    emailSigninBtn.addEventListener("click", () => {
      const email = emailInput.value.trim();
      const password = passwordInput.value.trim();
      if (!email || !password) return alert("Please enter both email and password.");
      if (!isInstituteEmail(email)) return alert("Please use your @kanchiuniv.ac.in email.");
      emailSigninBtn.innerHTML = "Signing in...";
      emailSigninBtn.style.pointerEvents = "none";

      signInWithEmailAndPassword(auth, email, password)
        .catch((error) => {
          console.error(error);
          alert("Sign-in Failed: " + error.message);
        })
        .finally(() => {
          emailSigninBtn.innerHTML = "Sign In";
          emailSigninBtn.style.pointerEvents = "auto";
        });
    });
  }

  if (emailSignupBtn) {
    emailSignupBtn.addEventListener("click", () => {
      const email = emailInput.value.trim();
      const password = passwordInput.value.trim();
      if (!email || !password) return alert("Please enter both email and password.");
      if (!isInstituteEmail(email)) return alert("Please use your @kanchiuniv.ac.in email.");
      emailSignupBtn.innerHTML = "Creating...";
      emailSignupBtn.style.pointerEvents = "none";

      createUserWithEmailAndPassword(auth, email, password)
        .catch((error) => {
          console.error(error);
          alert("Sign-up Failed: " + error.message);
        })
        .finally(() => {
          emailSignupBtn.innerHTML = "Sign Up";
          emailSignupBtn.style.pointerEvents = "auto";
        });
    });
  }

  if (googleLoginBtn) {
    googleLoginBtn.addEventListener("click", () => {
      loginLoader.classList.remove("hidden");
      if (btnText) btnText.textContent = "Authenticating Cloud...";
      googleLoginBtn.style.pointerEvents = "none";

      signInWithPopup(auth, provider)
        .then(async (result) => {
          if (!isInstituteEmail(result.user?.email || "")) {
            await signOut(auth);
            alert("Google login is allowed only for @kanchiuniv.ac.in accounts.");
          }
        })
        .catch((error) => {
          console.error(error);
          alert("Login Failed: " + error.message);
        })
        .finally(() => {
          loginLoader.classList.add("hidden");
          if (btnText) btnText.textContent = "Continue with Google";
          googleLoginBtn.style.pointerEvents = "auto";
        });
    });
  }

  if (userAvatar) {
    userAvatar.onclick = () => {
      if (confirm("Do you want to sign out?")) signOut(auth);
    };
  }

  // Floating Chatbot widgets
  if (floatingBtn) floatingBtn.onclick = toggleChatPopup;
  if (closeParamaBtn) closeParamaBtn.onclick = () => floatingPopup.classList.add("hidden");

  if (floatingSend) {
    const handleFloatingSend = async () => {
      const userText = floatingInput.value.trim();
      if (!userText) return;

      floatingMessages.innerHTML += `<div class="message user-msg">${escapeHtml(userText)}</div>`;
      floatingInput.value = "";
      floatingMessages.scrollTop = floatingMessages.scrollHeight;

      const currentUser = auth.currentUser;
      if (currentUser) await saveChatMessage(currentUser.uid, "user", userText);

      const typingId = "typing-" + Date.now();
      floatingMessages.innerHTML += `<div class="message ai-msg" id="${typingId}"><i class="ri-loader-4-line ri-spin"></i> Parama is thinking...</div>`;

      try {
        const aiResponse = await callApi("/api/ai/chat", { message: userText });
        if (currentUser) await saveChatMessage(currentUser.uid, "ai", aiResponse);

        document.getElementById(typingId)?.remove();
        floatingMessages.innerHTML += `<div class="message ai-msg">${formatAIText(aiResponse)}</div>`;
        floatingMessages.scrollTop = floatingMessages.scrollHeight;
      } catch (err) {
        document.getElementById(typingId)?.remove();
        floatingMessages.innerHTML += `<div class="message ai-msg" style="color:red;">Error: ${err.message}</div>`;
      }
    };

    floatingSend.onclick = handleFloatingSend;
    floatingInput.onkeypress = (e) => {
      if (e.key === "Enter") handleFloatingSend();
    };
  }

  // Dynamic Sidebar nav click delegate
  const navMenu = document.getElementById("sidebar-nav");
  if (navMenu) {
    navMenu.addEventListener("click", (e) => {
      const link = e.target.closest(".nav-link");
      if (!link) return;
      e.preventDefault();

      const target = link.getAttribute("data-target");
      if (target === "chatbot") {
        toggleChatPopup();
        return;
      }

      loadView(target);
    });
  }

  // Login view role buttons toggle
  const roleTabs = document.querySelector(".role-tabs");
  if (roleTabs) {
    roleTabs.addEventListener("click", (e) => {
      const tab = e.target.closest(".role-tab");
      if (!tab) return;
      roleTabs.querySelectorAll(".role-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
    });
  }
});
