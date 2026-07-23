import {
  auth,
  db,
  storage,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  deleteDoc,
  ref,
  uploadBytes,
  getDownloadURL,
  listAll
} from "./firebase-config.js";

/* ═══════════════════════════════════════════════════════
   SYNC & SANDBOX MODE DETECTOR
   ═══════════════════════════════════════════════════════ */

let useLocalFallback = localStorage.getItem("imra_local_fallback") === "true";

export function getSyncMode() {
  return useLocalFallback ? "local" : "cloud";
}

export function resetFallbackMode() {
  useLocalFallback = false;
  localStorage.removeItem("imra_local_fallback");
  triggerModeChange("cloud");
}

function triggerModeChange(mode) {
  window.dispatchEvent(new CustomEvent("imra-mode-change", { detail: { mode } }));
  // Show a console warning or custom log
  console.log(`[ImRa] Database sync mode updated to: ${mode.toUpperCase()}`);
}

function handleDbError(err) {
  if (
    err.code === "permission-denied" || 
    err.message?.toLowerCase().includes("permission") || 
    err.message?.toLowerCase().includes("denied")
  ) {
    if (!useLocalFallback) {
      useLocalFallback = true;
      localStorage.setItem("imra_local_fallback", "true");
      triggerModeChange("local");
    }
    return true;
  }
  return false;
}

function getLocalProfile(uid) {
  const localProfile = localStorage.getItem(`imra_profile_${uid}`);
  return localProfile ? JSON.parse(localProfile) : null;
}

function saveLocalProfile(uid, payload) {
  localStorage.setItem(`imra_profile_${uid}`, JSON.stringify(payload));
  let usersList = JSON.parse(localStorage.getItem("imra_users_list")) || [];
  usersList = usersList.filter(u => u.uid !== uid);
  usersList.push(payload);
  localStorage.setItem("imra_users_list", JSON.stringify(usersList));
}

function getLocalSupervisors() {
  const list = JSON.parse(localStorage.getItem("imra_users_list")) || [];
  return list.filter(u => String(u.role).toLowerCase() === "supervisor" && !["sup_1", "sup_2"].includes(u.uid));
}

async function apiFetch(path, options = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in first.");

  const token = await user.getIdToken();
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || "Request failed");
    error.status = res.status;
    throw error;
  }
  return data;
}

/* ═══════════════════════════════════════════════════════
   MOCK DATA INITIALIZATION FOR LOCAL SANDBOX
   ═══════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════
   USER PROFILES DATA ACCESS
   ═══════════════════════════════════════════════════════ */

export async function fetchProfile(uid) {
  try {
    const data = await apiFetch("/me");
    return data.profile;
  } catch (err) {
    if (handleDbError(err)) {
      return getLocalProfile(uid);
    }
    console.error("fetchProfile error:", err);
    return getLocalProfile(uid);
  }
}

export async function createProfile(uid, data) {
  const payload = { ...data, uid, createdAt: new Date().toISOString() };

  try {
    const result = await apiFetch("/me", {
      method: "PUT",
      body: JSON.stringify(data),
    });
    return result.profile;
  } catch (err) {
    if (handleDbError(err)) {
      saveLocalProfile(uid, payload);
      return payload;
    }
    throw err;
  }
}

export async function updateProfile(uid, data) {
  try {
    await apiFetch("/me", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  } catch (err) {
    if (handleDbError(err)) {
      const current = getLocalProfile(uid) || {};
      const updated = { ...current, ...data };
      saveLocalProfile(uid, updated);
      return;
    }
    throw err;
  }
}

export async function fetchSupervisors() {
  try {
    const data = await apiFetch("/supervisors");
    return data.supervisors || [];
  } catch (err) {
    if (handleDbError(err)) {
      return getLocalSupervisors();
    }
    console.error("fetchSupervisors error:", err);
    return getLocalSupervisors();
  }
}

export async function fetchScholarsForSupervisor(supervisorUid) {
  try {
    const data = await apiFetch("/supervisor/scholars");
    return data.scholars || [];
  } catch (err) {
    if (handleDbError(err)) {
      const list = JSON.parse(localStorage.getItem("imra_users_list")) || [];
      return list.filter(u => String(u.role).toLowerCase() === "scholar" && u.supervisorId === supervisorUid);
    }
    console.error("fetchScholarsForSupervisor error:", err);
    const list = JSON.parse(localStorage.getItem("imra_users_list")) || [];
    return list.filter(u => String(u.role).toLowerCase() === "scholar" && u.supervisorId === supervisorUid);
  }
}

export async function sendSupervisorRequest(supervisorEmail, department = "", message = "") {
  try {
    const result = await apiFetch("/supervisor-requests", {
      method: "POST",
      body: JSON.stringify({ supervisorEmail, department, message }),
    });
    return result.request || { id: result.id, status: result.status };
  } catch (err) {
    if (!handleDbError(err)) throw err;

    const user = auth.currentUser;
    const scholar = getLocalProfile(user?.uid) || {};
    const supervisor = getLocalSupervisors().find(u => String(u.email).toLowerCase() === supervisorEmail);
    const request = {
      id: `req_${Date.now()}`,
      scholarId: user?.uid || scholar.uid || "",
      scholarEmail: user?.email || scholar.email || "",
      scholarName: scholar.displayName || user?.displayName || user?.email || "Scholar",
      supervisorId: supervisor?.uid || "",
      supervisorEmail,
      supervisorName: supervisor?.displayName || supervisorEmail,
      department,
      message,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    const list = JSON.parse(localStorage.getItem("imra_supervisor_requests")) || [];
    list.push(request);
    localStorage.setItem("imra_supervisor_requests", JSON.stringify(list));
    return request;
  }
}

export async function fetchSupervisorRequests() {
  try {
    const data = await apiFetch("/supervisor-requests");
    return data.requests || [];
  } catch (err) {
    if (!handleDbError(err)) {
      console.error("fetchSupervisorRequests error:", err);
    }
    const user = auth.currentUser;
    const profile = getLocalProfile(user?.uid) || {};
    const list = JSON.parse(localStorage.getItem("imra_supervisor_requests")) || [];
    if (String(profile.role).toLowerCase() === "supervisor") {
      return list.filter(item => item.supervisorId === user.uid || item.supervisorEmail === user.email);
    }
    return list.filter(item => !item.scholarId || item.scholarId === user?.uid || item.scholarEmail === user?.email);
  }
}

export async function respondToSupervisorRequest(id, status, responseNote = "") {
  try {
    await apiFetch(`/supervisor-requests/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status, responseNote }),
    });
  } catch (err) {
    if (!handleDbError(err)) throw err;

    const list = JSON.parse(localStorage.getItem("imra_supervisor_requests")) || [];
    const updated = list.map((item) =>
      item.id === id ? { ...item, status, responseNote, updatedAt: new Date().toISOString() } : item
    );
    localStorage.setItem("imra_supervisor_requests", JSON.stringify(updated));
  }
}

/* ═══════════════════════════════════════════════════════
   MILESTONES DATA ACCESS
   ═══════════════════════════════════════════════════════ */

export async function createMilestone(data) {
  if (useLocalFallback) {
    const list = JSON.parse(localStorage.getItem("imra_milestones")) || [];
    const newMilestone = {
      id: `mile_${Date.now()}`,
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    list.push(newMilestone);
    localStorage.setItem("imra_milestones", JSON.stringify(list));
    return { id: newMilestone.id };
  }
  
  try {
    const res = await apiFetch("/milestones", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return { id: res.id };
  } catch (err) {
    if (handleDbError(err)) {
      const list = JSON.parse(localStorage.getItem("imra_milestones")) || [];
      const newMilestone = {
        id: `mile_${Date.now()}`,
        ...data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      list.push(newMilestone);
      localStorage.setItem("imra_milestones", JSON.stringify(list));
      return { id: newMilestone.id };
    }
    throw err;
  }
}

export async function updateMilestone(id, data) {
  if (useLocalFallback) {
    let list = JSON.parse(localStorage.getItem("imra_milestones")) || [];
    list = list.map(m => m.id === id ? { ...m, ...data, updatedAt: new Date().toISOString() } : m);
    localStorage.setItem("imra_milestones", JSON.stringify(list));
    return;
  }
  
  try {
    await apiFetch(`/milestones/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  } catch (err) {
    if (handleDbError(err)) {
      let list = JSON.parse(localStorage.getItem("imra_milestones")) || [];
      list = list.map(m => m.id === id ? { ...m, ...data, updatedAt: new Date().toISOString() } : m);
      localStorage.setItem("imra_milestones", JSON.stringify(list));
      return;
    }
    throw err;
  }
}

export async function fetchMilestonesForScholar(scholarId) {
  if (useLocalFallback) {
    const list = JSON.parse(localStorage.getItem("imra_milestones")) || [];
    return list
      .filter(m => m.scholarId === scholarId)
      .sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0));
  }
  
  try {
    const data = await apiFetch(`/milestones?scholarId=${encodeURIComponent(scholarId)}`);
    return data.milestones || [];
  } catch (err) {
    if (handleDbError(err)) {
      const list = JSON.parse(localStorage.getItem("imra_milestones")) || [];
      return list
        .filter(m => m.scholarId === scholarId)
        .sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0));
    }
    console.error("fetchMilestonesForScholar error:", err);
    return [];
  }
}

export async function fetchMilestonesForSupervisor(supervisorId) {
  if (useLocalFallback) {
    const list = JSON.parse(localStorage.getItem("imra_milestones")) || [];
    return list
      .filter(m => m.supervisorId === supervisorId)
      .sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0));
  }
  
  try {
    const data = await apiFetch("/milestones");
    return data.milestones || [];
  } catch (err) {
    if (handleDbError(err)) {
      const list = JSON.parse(localStorage.getItem("imra_milestones")) || [];
      return list
        .filter(m => m.supervisorId === supervisorId)
        .sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0));
    }
    console.error("fetchMilestonesForSupervisor error:", err);
    return [];
  }
}

/* ═══════════════════════════════════════════════════════
   SUBMISSIONS DATA ACCESS
   ═══════════════════════════════════════════════════════ */

export async function createSubmission(data) {
  if (useLocalFallback) {
    const list = JSON.parse(localStorage.getItem("imra_submissions")) || [];
    const newSub = {
      id: `sub_${Date.now()}`,
      ...data,
      status: "pending_review",
      createdAt: new Date().toISOString()
    };
    list.push(newSub);
    localStorage.setItem("imra_submissions", JSON.stringify(list));
    return { id: newSub.id };
  }
  
  try {
    const res = await apiFetch("/submissions", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return { id: res.id };
  } catch (err) {
    if (handleDbError(err)) {
      const list = JSON.parse(localStorage.getItem("imra_submissions")) || [];
      const newSub = {
        id: `sub_${Date.now()}`,
        ...data,
        status: "pending_review",
        createdAt: new Date().toISOString()
      };
      list.push(newSub);
      localStorage.setItem("imra_submissions", JSON.stringify(list));
      return { id: newSub.id };
    }
    throw err;
  }
}

export async function fetchSubmissionsForScholar(scholarId) {
  if (useLocalFallback) {
    const list = JSON.parse(localStorage.getItem("imra_submissions")) || [];
    return list
      .filter(s => s.scholarId === scholarId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  
  try {
    const data = await apiFetch("/submissions");
    return data.submissions || [];
  } catch (err) {
    if (handleDbError(err)) {
      const list = JSON.parse(localStorage.getItem("imra_submissions")) || [];
      return list
        .filter(s => s.scholarId === scholarId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    console.error("fetchSubmissionsForScholar error:", err);
    return [];
  }
}

export async function fetchSubmissionsForSupervisor(supervisorId) {
  if (useLocalFallback) {
    const list = JSON.parse(localStorage.getItem("imra_submissions")) || [];
    return list
      .filter(s => s.supervisorId === supervisorId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  
  try {
    const data = await apiFetch("/submissions");
    return data.submissions || [];
  } catch (err) {
    if (handleDbError(err)) {
      const list = JSON.parse(localStorage.getItem("imra_submissions")) || [];
      return list
        .filter(s => s.supervisorId === supervisorId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    console.error("fetchSubmissionsForSupervisor error:", err);
    return [];
  }
}

export async function sendSubmissionFeedback(id, feedback) {
  if (useLocalFallback) {
    let list = JSON.parse(localStorage.getItem("imra_submissions")) || [];
    list = list.map(s => 
      s.id === id 
        ? { ...s, feedback, status: "reviewed", reviewedAt: new Date().toISOString() } 
        : s
    );
    localStorage.setItem("imra_submissions", JSON.stringify(list));
    return;
  }
  
  try {
    await apiFetch(`/submissions/${id}/feedback`, {
      method: "PATCH",
      body: JSON.stringify({ feedback }),
    });
  } catch (err) {
    if (handleDbError(err)) {
      let list = JSON.parse(localStorage.getItem("imra_submissions")) || [];
      list = list.map(s => 
        s.id === id 
          ? { ...s, feedback, status: "reviewed", reviewedAt: new Date().toISOString() } 
          : s
      );
      localStorage.setItem("imra_submissions", JSON.stringify(list));
      return;
    }
    throw err;
  }
}

/* ═══════════════════════════════════════════════════════
   MEETINGS DATA ACCESS
   ═══════════════════════════════════════════════════════ */

export async function requestMeeting(data) {
  if (useLocalFallback) {
    const list = JSON.parse(localStorage.getItem("imra_meetings")) || [];
    const newMeeting = {
      id: `meet_${Date.now()}`,
      ...data,
      status: "pending",
      createdAt: new Date().toISOString()
    };
    list.push(newMeeting);
    localStorage.setItem("imra_meetings", JSON.stringify(list));
    return { id: newMeeting.id };
  }
  
  try {
    const res = await apiFetch("/meetings", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return { id: res.id };
  } catch (err) {
    if (handleDbError(err)) {
      const list = JSON.parse(localStorage.getItem("imra_meetings")) || [];
      const newMeeting = {
        id: `meet_${Date.now()}`,
        ...data,
        status: "pending",
        createdAt: new Date().toISOString()
      };
      list.push(newMeeting);
      localStorage.setItem("imra_meetings", JSON.stringify(list));
      return { id: newMeeting.id };
    }
    throw err;
  }
}

export async function fetchMeetingsForScholar(scholarId) {
  if (useLocalFallback) {
    const list = JSON.parse(localStorage.getItem("imra_meetings")) || [];
    return list
      .filter(m => m.scholarId === scholarId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  
  try {
    const data = await apiFetch("/meetings");
    return data.meetings || [];
  } catch (err) {
    if (handleDbError(err)) {
      const list = JSON.parse(localStorage.getItem("imra_meetings")) || [];
      return list
        .filter(m => m.scholarId === scholarId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    console.error("fetchMeetingsForScholar error:", err);
    return [];
  }
}

export async function fetchMeetingsForSupervisor(supervisorId) {
  if (useLocalFallback) {
    const list = JSON.parse(localStorage.getItem("imra_meetings")) || [];
    return list
      .filter(m => m.supervisorId === supervisorId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  
  try {
    const data = await apiFetch("/meetings");
    return data.meetings || [];
  } catch (err) {
    if (handleDbError(err)) {
      const list = JSON.parse(localStorage.getItem("imra_meetings")) || [];
      return list
        .filter(m => m.supervisorId === supervisorId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    console.error("fetchMeetingsForSupervisor error:", err);
    return [];
  }
}

export async function respondToMeeting(id, status, supervisorNote) {
  if (useLocalFallback) {
    let list = JSON.parse(localStorage.getItem("imra_meetings")) || [];
    list = list.map(m => 
      m.id === id 
        ? { ...m, status, supervisorNote: supervisorNote || "" } 
        : m
    );
    localStorage.setItem("imra_meetings", JSON.stringify(list));
    return;
  }
  
  try {
    await apiFetch(`/meetings/${id}/respond`, {
      method: "PATCH",
      body: JSON.stringify({ status, supervisorNote }),
    });
  } catch (err) {
    if (handleDbError(err)) {
      let list = JSON.parse(localStorage.getItem("imra_meetings")) || [];
      list = list.map(m => 
        m.id === id 
          ? { ...m, status, supervisorNote: supervisorNote || "" } 
          : m
      );
      localStorage.setItem("imra_meetings", JSON.stringify(list));
      return;
    }
    throw err;
  }
}

/* ═══════════════════════════════════════════════════════
   CHAT HISTORY DATA ACCESS (PARAMA & PAARU)
   ═══════════════════════════════════════════════════════ */

export async function saveChatMessage(userId, role, text) {
  if (!userId) return;
  
  if (useLocalFallback) {
    const key = `imra_chat_${userId}`;
    const list = JSON.parse(localStorage.getItem(key)) || [];
    list.push({ role, text, timestamp: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(list));
    return;
  }
  
  try {
    await addDoc(collection(db, "chatHistory", userId, "messages"), {
      role,
      text,
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    if (handleDbError(err)) {
      const key = `imra_chat_${userId}`;
      const list = JSON.parse(localStorage.getItem(key)) || [];
      list.push({ role, text, timestamp: new Date().toISOString() });
      localStorage.setItem(key, JSON.stringify(list));
      return;
    }
    console.error("Error saving chat message", err);
  }
}

export async function loadChatHistory(userId, messagesContainer) {
  if (!userId || !messagesContainer) return;
  
  if (useLocalFallback) {
    const key = `imra_chat_${userId}`;
    const list = JSON.parse(localStorage.getItem(key)) || [];
    renderChatMessages(list, messagesContainer);
    return;
  }
  
  try {
    const q = query(
      collection(db, "chatHistory", userId, "messages"),
      orderBy("timestamp")
    );
    const snapshot = await getDocs(q);
    const list = [];
    snapshot.forEach(item => {
      list.push(item.data());
    });
    renderChatMessages(list, messagesContainer);
  } catch (err) {
    if (handleDbError(err)) {
      const key = `imra_chat_${userId}`;
      const list = JSON.parse(localStorage.getItem(key)) || [];
      renderChatMessages(list, messagesContainer);
      return;
    }
    console.error("Error loading chat history", err);
  }
}

export async function saveParuMessage(userId, role, text) {
  if (!userId) return;
  
  if (useLocalFallback) {
    const key = `imra_paru_${userId}`;
    const list = JSON.parse(localStorage.getItem(key)) || [];
    list.push({ role, text, timestamp: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(list));
    return;
  }
  
  try {
    await addDoc(collection(db, "paruHistory", userId, "messages"), {
      role,
      text,
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    if (handleDbError(err)) {
      const key = `imra_paru_${userId}`;
      const list = JSON.parse(localStorage.getItem(key)) || [];
      list.push({ role, text, timestamp: new Date().toISOString() });
      localStorage.setItem(key, JSON.stringify(list));
      return;
    }
    console.error("Error saving Paru message", err);
  }
}

export async function loadParuHistory(userId, messagesContainer, sidebarContainer) {
  if (!userId) return;
  
  let list = [];
  if (useLocalFallback) {
    const key = `imra_paru_${userId}`;
    list = JSON.parse(localStorage.getItem(key)) || [];
  } else {
    try {
      const q = query(
        collection(db, "paruHistory", userId, "messages"),
        orderBy("timestamp")
      );
      const snapshot = await getDocs(q);
      snapshot.forEach(item => {
        list.push(item.data());
      });
    } catch (err) {
      if (handleDbError(err)) {
        const key = `imra_paru_${userId}`;
        list = JSON.parse(localStorage.getItem(key)) || [];
      } else {
        console.error("Error loading Paru history", err);
        return;
      }
    }
  }

  // Render lists
  if (messagesContainer) {
    renderChatMessages(list, messagesContainer);
  }
  
  if (sidebarContainer) {
    if (list.length === 0) {
      sidebarContainer.innerHTML =
        '<div style="text-align:center; padding:20px 0; color:var(--text-muted); font-size:0.8rem;">No history found.</div>';
    } else {
      sidebarContainer.innerHTML = `
        <div class="history-group">
          <h4>Saved Chat</h4>
          <div class="history-item active">
            <div class="history-title">Paaru Conversation</div>
          </div>
        </div>
      `;
    }
  }
}

function renderChatMessages(messages, container) {
  if (!container) return;
  let html = "";
  messages.forEach((data) => {
    const cssClass = data.role === "user" ? "user-msg" : "ai-msg";
    const formatted = data.role === "ai" || data.role === "admin" ? formatAIText(data.text) : escapeHtml(data.text);
    html += `<div class="message ${cssClass}">${formatted}</div>`;
  });
  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;
}

function formatAIText(text = "") {
  return text.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
}

/* ═══════════════════════════════════════════════════════
   CLOUD STORAGE & FILE ACCESS
   ═══════════════════════════════════════════════════════ */

export async function uploadToCloudStorage(userId, file) {
  if (!userId) return null;
  
  if (useLocalFallback) {
    const key = `imra_files_${userId}`;
    const list = JSON.parse(localStorage.getItem(key)) || [];
    
    // In local sandbox, mock file URL by saving metadata and generating a standard object url
    // or mock web URL
    const mockUrl = `https://kanchiuniv.ac.in/mock-storage/users/${userId}/uploads/${encodeURIComponent(file.name)}`;
    const newFile = { name: file.name, url: mockUrl, size: file.size, uploadedAt: new Date().toISOString() };
    
    list.push(newFile);
    localStorage.setItem(key, JSON.stringify(list));
    return mockUrl;
  }
  
  try {
    const buffer = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const result = await apiFetch("/files/upload", {
      method: "POST",
      body: JSON.stringify({
        name: file.name,
        type: file.type || "application/octet-stream",
        contentBase64: btoa(binary),
      }),
    });
    return result.file?.url || null;
  } catch (err) {
    if (handleDbError(err)) {
      const key = `imra_files_${userId}`;
      const list = JSON.parse(localStorage.getItem(key)) || [];
      const mockUrl = `https://kanchiuniv.ac.in/mock-storage/users/${userId}/uploads/${encodeURIComponent(file.name)}`;
      const newFile = { name: file.name, url: mockUrl, size: file.size, uploadedAt: new Date().toISOString() };
      list.push(newFile);
      localStorage.setItem(key, JSON.stringify(list));
      return mockUrl;
    }
    console.error("Upload error:", err);
    return null;
  }
}

export async function loadCloudFiles(userId) {
  if (!userId) return [];
  
  if (useLocalFallback) {
    return JSON.parse(localStorage.getItem(`imra_files_${userId}`)) || [];
  }
  
  try {
    const data = await apiFetch("/files");
    return data.files || [];
  } catch (err) {
    if (handleDbError(err)) {
      return JSON.parse(localStorage.getItem(`imra_files_${userId}`)) || [];
    }
    console.error("Error listing cloud files:", err);
    return [];
  }
}

/* ═══════════════════════════════════════════════════════
   USER DOCUMENTS DATA ACCESS (DRAFTS & NOTES)
   ═══════════════════════════════════════════════════════ */

export async function saveCloudDocument(userId, docId, textContent) {
  if (!userId) return;
  
  if (useLocalFallback) {
    const key = `imra_userDoc_${userId}_${docId}`;
    localStorage.setItem(key, textContent);
    return;
  }
  
  try {
    await setDoc(doc(db, "userDocuments", userId, "documents", docId), {
      content: textContent,
      lastSaved: serverTimestamp(),
    });
  } catch (err) {
    if (handleDbError(err)) {
      const key = `imra_userDoc_${userId}_${docId}`;
      localStorage.setItem(key, textContent);
      return;
    }
    console.error("Save cloud document error:", err);
  }
}

export async function loadCloudDocument(userId, docId) {
  if (!userId) return "";
  
  if (useLocalFallback) {
    return localStorage.getItem(`imra_userDoc_${userId}_${docId}`) || "";
  }
  
  try {
    const snap = await getDoc(doc(db, "userDocuments", userId, "documents", docId));
    return snap.exists() ? snap.data().content || "" : "";
  } catch (err) {
    if (handleDbError(err)) {
      return localStorage.getItem(`imra_userDoc_${userId}_${docId}`) || "";
    }
    console.error("Load cloud document error:", err);
    return "";
  }
}

/* ═══════════════════════════════════════════════════════
   TOOL USAGE HISTORY DATA ACCESS
   ═══════════════════════════════════════════════════════ */

export async function saveToolHistory(userId, toolName, title, content) {
  if (!userId) return;
  
  if (useLocalFallback) {
    const key = `imra_toolHistory_${userId}_${toolName}`;
    const list = JSON.parse(localStorage.getItem(key)) || [];
    list.push({
      id: `tool_${Date.now()}`,
      title,
      content,
      timestamp: new Date().toISOString()
    });
    localStorage.setItem(key, JSON.stringify(list));
    return;
  }
  
  try {
    await addDoc(collection(db, "toolHistory", userId, toolName), {
      title,
      content,
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    if (handleDbError(err)) {
      const key = `imra_toolHistory_${userId}_${toolName}`;
      const list = JSON.parse(localStorage.getItem(key)) || [];
      list.push({
        id: `tool_${Date.now()}`,
        title,
        content,
        timestamp: new Date().toISOString()
      });
      localStorage.setItem(key, JSON.stringify(list));
      return;
    }
    console.error("Error saving tool history:", err);
  }
}

export async function deleteToolHistory(userId, toolName, docId) {
  if (!userId) return;
  
  if (useLocalFallback) {
    const key = `imra_toolHistory_${userId}_${toolName}`;
    let list = JSON.parse(localStorage.getItem(key)) || [];
    list = list.filter(item => item.id !== docId);
    localStorage.setItem(key, JSON.stringify(list));
    return;
  }
  
  try {
    await deleteDoc(doc(db, "toolHistory", userId, toolName, docId));
  } catch (err) {
    if (handleDbError(err)) {
      const key = `imra_toolHistory_${userId}_${toolName}`;
      let list = JSON.parse(localStorage.getItem(key)) || [];
      list = list.filter(item => item.id !== docId);
      localStorage.setItem(key, JSON.stringify(list));
      return;
    }
    console.error("Error deleting tool history:", err);
  }
}

export async function loadToolHistory(userId, toolName) {
  if (!userId) return [];
  
  if (useLocalFallback) {
    return JSON.parse(localStorage.getItem(`imra_toolHistory_${userId}_${toolName}`)) || [];
  }
  
  try {
    const q = query(
      collection(db, "toolHistory", userId, toolName),
      orderBy("timestamp", "desc")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
  } catch (err) {
    if (handleDbError(err)) {
      return JSON.parse(localStorage.getItem(`imra_toolHistory_${userId}_${toolName}`)) || [];
    }
    console.error("Error loading tool history:", err);
    return [];
  }
}
