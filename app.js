import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, serverTimestamp, setDoc, doc, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, listAll } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyBCDcwKKePwTPOf0iNsAuQxrq84AZcuYC8",
    authDomain: "imra---research-agent.firebaseapp.com",
    projectId: "imra---research-agent",
    storageBucket: "imra---research-agent.firebasestorage.app",
    messagingSenderId: "512102709729",
    appId: "1:512102709729:web:c9e068b536409a70a83aa0",
    measurementId: "G-6WLXP4EDD6"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });
const db = getFirestore(app);
const storage = getStorage(app);

async function saveChatMessage(userId, role, text) {
    if(!userId) return;
    try {
        await addDoc(collection(db, "chatHistory", userId, "messages"), {
            role: role,
            text: text,
            timestamp: serverTimestamp()
        });
    } catch(err) {
        console.error("Error saving message", err);
    }
}

async function loadChatHistory(userId, messagesContainer) {
    if(!userId || !messagesContainer) return;
    try {
        const q = query(collection(db, "chatHistory", userId, "messages"), orderBy("timestamp"));
        const snapshot = await getDocs(q);
        
        if(!snapshot.empty) {
            let html = '';
            snapshot.forEach(doc => {
                const data = doc.data();
                const cssClass = data.role === 'user' ? 'user-msg' : 'ai-msg';
                let formattedResponse = data.text;
                if(data.role === 'ai') {
                    formattedResponse = formattedResponse.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
                }
                html += `<div class="message ${cssClass}">${formattedResponse}</div>`;
            });
            messagesContainer.innerHTML = html;
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    } catch(err) {
        console.error("Error loading chat history", err);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    
    // UI Elements
    const googleLoginBtn = document.getElementById('google-login-btn');
    const loginLoader = document.getElementById('login-loader');
    const loginView = document.getElementById('login-view');
    const emailInput = document.getElementById('email-input');
    const passwordInput = document.getElementById('password-input');
    const emailSigninBtn = document.getElementById('email-signin-btn');
    const emailSignupBtn = document.getElementById('email-signup-btn');
    const appView = document.getElementById('app-view');
    const btnText = googleLoginBtn?.querySelector('span');
    const navLinks = document.querySelectorAll('.nav-link');
    const dashboardContent = document.getElementById('dashboard-content');
    const userAvatar = document.getElementById('user-avatar');

    // ---------------------------------
    // Authentication State Listener
    // ---------------------------------
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // User is signed in
            loginView.classList.add('hidden');
            loginView.classList.remove('active-view');
            appView.classList.remove('hidden');
            if(userAvatar) userAvatar.src = user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}&background=random&color=fff`;
            setTimeout(() => { appView.classList.add('active-view'); }, 50);
            
            // Re-render dashboard to show real name
            if(dashboardContent.innerHTML.includes('Welcome back')) {
                const firstName = user.displayName ? user.displayName.split(' ')[0] : 'Scholar';
                dashboardContent.innerHTML = getDashboardHTML().replace('Scholar', firstName);
            }
            
            // Load chat history for floating chat
            const floatingMessages = document.getElementById('floating-chat-messages');
            if(floatingMessages) {
                loadChatHistory(user.uid, floatingMessages);
            }
        } else {
            // User is signed out
            appView.classList.remove('active-view');
            setTimeout(() => {
                appView.classList.add('hidden');
                loginView.classList.remove('hidden');
                setTimeout(() => { loginView.classList.add('active-view'); }, 50);
            }, 500);
        }
    });

    // ---------------------------------
    // Login Flow
    // ---------------------------------
    if(emailSigninBtn) {
        emailSigninBtn.addEventListener('click', () => {
            const email = emailInput.value.trim();
            const password = passwordInput.value.trim();
            if(!email || !password) return alert("Please enter both email and password.");
            emailSigninBtn.innerHTML = "Signing in...";
            emailSigninBtn.style.pointerEvents = 'none';
            signInWithEmailAndPassword(auth, email, password).catch((error) => {
                console.error(error);
                alert("Sign-in Failed: " + error.message);
                emailSigninBtn.innerHTML = "Sign In";
                emailSigninBtn.style.pointerEvents = 'auto';
            }).then(() => {
                if(auth.currentUser) emailSigninBtn.innerHTML = "Sign In";
                emailSigninBtn.style.pointerEvents = 'auto';
            });
        });
    }

    if(emailSignupBtn) {
        emailSignupBtn.addEventListener('click', () => {
            const email = emailInput.value.trim();
            const password = passwordInput.value.trim();
            if(!email || !password) return alert("Please enter both email and password.");
            emailSignupBtn.innerHTML = "Creating...";
            emailSignupBtn.style.pointerEvents = 'none';
            createUserWithEmailAndPassword(auth, email, password).catch((error) => {
                console.error(error);
                alert("Sign-up Failed: " + error.message);
                emailSignupBtn.innerHTML = "Sign Up";
                emailSignupBtn.style.pointerEvents = 'auto';
            }).then(() => {
                if(auth.currentUser) emailSignupBtn.innerHTML = "Sign Up";
                emailSignupBtn.style.pointerEvents = 'auto';
            });
        });
    }

    if(googleLoginBtn) {
        googleLoginBtn.addEventListener('click', () => {
            loginLoader.classList.remove('hidden');
            btnText.textContent = 'Authenticating Cloud...';
            googleLoginBtn.style.pointerEvents = 'none';

            signInWithPopup(auth, provider).catch((error) => {
                console.error(error);
                alert("Login Failed. Make sure you are running this from a web server or Netlify link! Error: " + error.message);
                loginLoader.classList.add('hidden');
                btnText.textContent = 'Continue with Google';
                googleLoginBtn.style.pointerEvents = 'auto';
            });
        });
    }

    if(userAvatar) {
        userAvatar.addEventListener('click', () => {
            if(confirm("Do you want to sign out?")) {
                signOut(auth);
            }
        });
    }

    // ---------------------------------
    // Floating Chatbot Logic
    // ---------------------------------
    const floatingBtn = document.getElementById('parama-float-btn');
    const floatingPopup = document.getElementById('parama-chat-popup');
    const closeParamaBtn = document.getElementById('close-parama-btn');
    const floatingInput = document.getElementById('floating-chat-input');
    const floatingSend = document.getElementById('floating-send-btn');
    const floatingMessages = document.getElementById('floating-chat-messages');

    function toggleChatPopup() {
        floatingPopup.classList.toggle('hidden');
        if(!floatingPopup.classList.contains('hidden')) floatingInput.focus();
    }

    if(floatingBtn) floatingBtn.addEventListener('click', toggleChatPopup);
    if(closeParamaBtn) closeParamaBtn.addEventListener('click', () => floatingPopup.classList.add('hidden'));

    if(floatingSend) {
        floatingSend.addEventListener('click', async () => {
            if(floatingInput.value.trim() !== '') {
                const userText = floatingInput.value;
                floatingMessages.innerHTML += '<div class="message user-msg">' + userText + '</div>';
                floatingInput.value = '';
                floatingMessages.scrollTop = floatingMessages.scrollHeight;
                
                const currentUser = auth.currentUser;
                if (currentUser) saveChatMessage(currentUser.uid, 'user', userText);
                
                const typingId = "typing-" + Date.now();
                floatingMessages.innerHTML += '<div class="message ai-msg" id="' + typingId + '">Parama is thinking...</div>';
                floatingMessages.scrollTop = floatingMessages.scrollHeight;
                
                const aiResponse = await fetchGeminiResponse(userText);
                
                if (currentUser) saveChatMessage(currentUser.uid, 'ai', aiResponse);
                
                const typingEl = document.getElementById(typingId);
                if(typingEl) typingEl.remove();
                
                const formattedResponse = aiResponse.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
                floatingMessages.innerHTML += '<div class="message ai-msg">' + formattedResponse + '</div>';
                floatingMessages.scrollTop = floatingMessages.scrollHeight;
            }
        });
        
        floatingInput.addEventListener('keypress', (e) => {
            if(e.key === 'Enter') floatingSend.click();
        });
    }

    // ---------------------------------
    // SPA Routing Simulation
    // ---------------------------------
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            
            const target = link.getAttribute('data-target');
            
            // If they click Parama in sidebar, just pop open the floating widget!
            if (target === 'chatbot') {
                toggleChatPopup();
                return;
            }
            
            navLinks.forEach(nav => nav.classList.remove('active'));
            link.classList.add('active');

            dashboardContent.style.opacity = '0';
            setTimeout(() => {
                if (target === 'dashboard') { dashboardContent.innerHTML = getDashboardHTML(); setupDashboardInteractions(); }
                else if (target === 'literature') { dashboardContent.innerHTML = getLiteratureHTML(); setupLiteratureInteractions(); }
                else if (target === 'library') { dashboardContent.innerHTML = getLibraryHTML(); setupLibraryInteractions(); }
                else if (target === 'pdf-viewer') { dashboardContent.innerHTML = getPdfViewerHTML(); setupPdfViewerInteractions(); }
                else if (target === 'notes') { dashboardContent.innerHTML = getNotesHTML(); setupNotesInteractions(); }
                else if (target === 'latex') { dashboardContent.innerHTML = getLatexHTML(); setupLatexInteractions(); }
                else if (target === 'editing') { dashboardContent.innerHTML = getEditingHTML(); setupEditingInteractions(); }
                else if (target === 'chatpdf') { dashboardContent.innerHTML = getChatPdfHTML(); setupChatInteractions(); setupChatPdfInteractions(); }
                else if (target === 'draft') { dashboardContent.innerHTML = getDraftHTML(); setupDraftInteractions(); }
                else if (target === 'paru') {
                    dashboardContent.innerHTML = getParuHTML();
                    setupParuInteractions();
                }
                dashboardContent.style.opacity = '1';
            }, 300);
        });
    });

    // ---------------------------------
    // View Templates
    // ---------------------------------
    function getDashboardHTML() {
        return `
            <div class="dashboard-header">
                <h2>Welcome back, Scholar!</h2>
                <p>Here is an overview of your research progress synced from your cloud storage.</p>
            </div>
            <div class="stats-grid">
                <div class="stat-card glass-panel">
                    <div class="stat-icon" style="background: rgba(99, 102, 241, 0.2); color: var(--accent-primary);"><i class="ri-folders-line"></i></div>
                    <div class="stat-info"><h3>Papers Uploaded</h3><p class="stat-value">142</p><span class="stat-sub">Safely stored in Cloud DB</span></div>
                </div>
                <div class="stat-card glass-panel">
                    <div class="stat-icon" style="background: rgba(236, 72, 153, 0.2); color: var(--accent-secondary);"><i class="ri-article-line"></i></div>
                    <div class="stat-info"><h3>Published Articles</h3><p class="stat-value">3</p><span class="stat-sub">+1 in review process</span></div>
                </div>
                <div class="stat-card glass-panel progress-card">
                    <div class="progress-info"><h3>Research Progress</h3><p class="stat-sub">Thesis Completion</p></div>
                    <div class="circular-progress">
                        <svg viewBox="0 0 36 36" class="circular-chart">
                            <path class="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                            <path class="circle" stroke-dasharray="65, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                            <text x="18" y="20.35" class="percentage">65%</text>
                        </svg>
                    </div>
                </div>
            </div>
            <div class="dashboard-bottom">
                <div class="recent-files glass-panel">
                    <div class="panel-header"><h3>Recent Online Files</h3><button class="btn-text">View All</button></div>
                    <ul class="file-list">
                        <li><i class="ri-file-pdf-line text-blue"></i> Attention_Is_All_You_Need.pdf <span>2 hrs ago</span></li>
                        <li><i class="ri-quill-pen-line text-purple"></i> Draft_Chapter_3_Methodology.tex <span>5 hrs ago</span></li>
                        <li><i class="ri-file-word-line text-blue"></i> Related_Work_Notes.docx <span>Yesterday</span></li>
                    </ul>
                </div>
                <div class="quick-actions glass-panel">
                    <div class="panel-header"><h3>AI Shortcuts</h3></div>
                    <div class="action-buttons">
                        <button class="action-btn" id="dash-upload-btn"><i class="ri-upload-cloud-2-line"></i> Upload to Cloud</button>
                        <input type="file" id="dash-file-input" style="display:none;" accept=".pdf,.doc,.docx" />
                        <button class="action-btn" onclick="document.querySelector('[data-target=\\'chatbot\\']').click()"><i class="ri-robot-line"></i> Ask Parama</button>
                        <button class="action-btn" onclick="document.querySelector('[data-target=\\'editing\\']').click()"><i class="ri-magic-line"></i> Paraphrase Draft</button>
                    </div>
                </div>
            </div>
        `;
    }

    function getLiteratureHTML() {
        return `
            <div class="dashboard-header" style="margin-bottom: 16px;">
                <h2>Literature & Ideas Engine</h2>
                <p>Select a tool below to synthesize literature, find gaps, and formulate problem statements.</p>
            </div>
            <div class="tool-grid">
                <div class="tool-card glass-panel" style="background: rgba(0,0,0,0.2); cursor:pointer;" id="hub-card-review">
                    <i class="ri-book-read-line tool-icon text-blue"></i>
                    <h3>Literature Review Generator</h3>
                    <p>Upload PDFs to let AI synthesize related work.</p>
                </div>
                <div class="tool-card glass-panel" style="background: rgba(0,0,0,0.2); cursor:pointer;" id="hub-card-gap">
                    <i class="ri-crosshair-2-line tool-icon text-purple"></i>
                    <h3>Research Gap Finder</h3>
                    <p>Analyze papers to highlight unexplored methodologies.</p>
                </div>
                <div class="tool-card glass-panel" style="background: rgba(0,0,0,0.2); cursor:pointer;" id="hub-card-problem">
                    <i class="ri-edit-circle-line tool-icon text-green"></i>
                    <h3>Problem Statement Formulator</h3>
                    <p>Draft compelling problem statements using your own Word draft as context.</p>
                </div>
                <div class="tool-card glass-panel" style="background: rgba(0,0,0,0.2); cursor:pointer;" id="hub-card-publish">
                    <i class="ri-global-line tool-icon text-pink"></i>
                    <h3>Where to Publish?</h3>
                    <p>Get AI suggestions for Journals matching your abstract.</p>
                </div>
            </div>
        `;
    }

    function getLibraryHTML() {
        return `
            <div class="dashboard-header" style="margin-bottom: 16px;">
                <h2>Library</h2>
                <p>Upload and manage your research files and folders.</p>
            </div>
            <div class="upload-section glass-panel">
                <h3>Upload Files</h3>
                <input type="file" multiple id="file-upload" accept=".pdf,.doc,.docx,.txt,.md">
                <p>Select multiple files to upload to your cloud library.</p>
                <div id="upload-actions" style="display: none; margin-top: 10px;">
                    <button id="save-upload" class="primary-btn">Save</button>
                    <button id="cancel-upload" class="secondary-btn" style="margin-left: 10px;">Cancel</button>
                </div>
                <div id="upload-status" style="margin-top: 10px; color: var(--text-main); font-size: 0.95rem;"></div>
            </div>
            <div class="upload-section glass-panel">
                <h3>Upload Folder</h3>
                <input type="file" webkitdirectory multiple id="folder-upload">
                <p>Select a folder to upload all its contents to your cloud library.</p>
                <div id="folder-upload-actions" style="display: none; margin-top: 10px;">
                    <button id="save-folder-upload" class="primary-btn">Save</button>
                    <button id="cancel-folder-upload" class="secondary-btn" style="margin-left: 10px;">Cancel</button>
                </div>
                <div id="folder-upload-status" style="margin-top: 10px; color: var(--text-main); font-size: 0.95rem;"></div>
            </div>
            <div class="library-tabs glass-panel">
                <div class="tab-buttons">
                    <button class="tab-btn active" data-tab="all">All Files</button>
                    <button class="tab-btn" data-tab="pdfs">PDFs</button>
                    <button class="tab-btn" data-tab="docs">Documents</button>
                    <button class="tab-btn" data-tab="others">Others</button>
                </div>
                <div class="tab-content">
                    <div id="all-files" class="file-list active">
                        <ul id="all-file-list"></ul>
                    </div>
                    <div id="pdf-files" class="file-list">
                        <ul id="pdf-file-list"></ul>
                    </div>
                    <div id="doc-files" class="file-list">
                        <ul id="doc-file-list"></ul>
                    </div>
                    <div id="other-files" class="file-list">
                        <ul id="other-file-list"></ul>
                    </div>
                </div>
            </div>
        `;
    }

    function getPdfViewerHTML() {
        return `
            <div class="dashboard-header" style="margin-bottom: 16px; display:flex; justify-content:space-between; align-items:flex-start;">
                <div><h2>PDF Viewer</h2><p>View your uploaded PDF document.</p></div>
                <button class="secondary-btn" id="pdf-viewer-back-btn"><i class="ri-arrow-left-line"></i> Back to Library</button>
            </div>
            <div class="pdf-viewer-full glass-panel">
                <div id="pdf-viewer-render-area" style="height: 70vh; display:flex; justify-content:center; align-items:center;">
                    <div style="color: var(--text-muted);">Loading PDF...</div>
                </div>
            </div>
        `;
    }

    function getLitSubToolFrame(toolId, title, desc, historyLabel, inputsHTML) {
        return `
            <div class="dashboard-header" style="margin-bottom: 16px; display:flex; justify-content:space-between; align-items:flex-start;">
                <div><h2>${title}</h2><p>${desc}</p></div>
                <button class="secondary-btn" id="lit-back-btn"><i class="ri-arrow-left-line"></i> Back to Hub</button>
            </div>
            <div class="tool-layout">
                <div class="history-sidebar glass-panel" style="padding: 20px;">
                    <div class="panel-header" style="padding-bottom:10px; margin-bottom:10px;">
                        <h3 style="font-size: 1rem;">${historyLabel}</h3>
                    </div>
                    <div id="${toolId}-history-list" style="overflow-y:auto; flex-grow:1; padding-right: 5px;">
                    </div>
                </div>
                <div class="main-tool-area glass-panel" style="padding: 20px; overflow-y: auto;">
                    ${inputsHTML}
                    <div id="${toolId}-output-area" style="margin-top: 24px; display: none;">
                        <h3 style="margin-bottom: 12px; border-bottom: 1px solid rgba(0,0,0,0.1); padding-bottom: 10px;">AI Output</h3>
                        <div class="message ai-msg" id="${toolId}-output-content" style="white-space: pre-wrap; margin-top: 10px; margin-bottom: 15px; width:100%; max-width:100%;"></div>
                        <div style="display:flex; justify-content:flex-end; gap:10px;">
                            <button class="action-btn" onclick="copyToClipboard('${toolId}-output-content')" style="padding: 8px 16px; font-size: 0.95rem; border-color:var(--accent-primary); color:var(--accent-primary); background:transparent;"><i class="ri-file-copy-line"></i> Copy Text</button>
                            <button class="primary-btn" onclick="downloadAsWord('${toolId}-output-content', '${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}')" style="padding: 8px 16px; font-size: 0.95rem; display:flex; align-items:center; gap:8px;"><i class="ri-download-line"></i> Download .doc</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function getLitReviewHTML() {
        return getLitSubToolFrame('lit-review', 'Literature Review Generator', 'Upload multi-PDFs to let AI synthesize related work.', 'Past Reviews', `
            <div class="upload-zone text-center" style="border:1px dashed rgba(255,255,255,0.2); padding: 40px; border-radius:12px;">
                <i class="ri-file-pdf-line" style="font-size: 3rem; color: var(--accent-secondary);"></i>
                <h3 style="margin: 10px 0;">Upload Papers (.pdf)</h3>
                <input type="file" id="lit-review-file" accept=".pdf" multiple style="display:none;">
                <button class="primary-btn mt-10" onclick="document.getElementById('lit-review-file').click()">Select PDFs & Start</button>
            </div>
        `);
    }

    function getResearchGapHTML() {
        return getLitSubToolFrame('lit-gap', 'Research Gap Finder', 'Analyze papers to highlight unexplored methodologies (Max 10 papers).', 'Gaps Found', `
            <div class="upload-zone text-center" style="border:1px dashed rgba(255,255,255,0.2); padding: 40px; border-radius:12px;">
                <i class="ri-crosshair-2-line" style="font-size: 3rem; color: var(--accent-secondary);"></i>
                <h3 style="margin: 10px 0;">Upload Up To 10 Papers (.pdf)</h3>
                <input type="file" id="lit-gap-file" accept=".pdf" multiple style="display:none;">
                <button class="primary-btn mt-10" onclick="document.getElementById('lit-gap-file').click()">Upload & Analyze</button>
            </div>
        `);
    }

    function getProblemStmtHTML() {
        return getLitSubToolFrame('lit-problem', 'Problem Statement Formulator', 'Upload your Word draft (.docx) and let AI draft compelling problem statements.', 'Saved Statements', `
            <div class="upload-zone text-center" style="border:1px dashed rgba(255,255,255,0.2); padding: 40px; border-radius:12px;">
                <i class="ri-file-word-line" style="font-size: 3rem; color: var(--accent-secondary);"></i>
                <h3 style="margin: 10px 0;">Upload Your Ideas Draft (.docx)</h3>
                <input type="file" id="lit-problem-file" accept=".docx" style="display:none;">
                <button class="primary-btn mt-10" onclick="document.getElementById('lit-problem-file').click()">Read Doc & Draft Statement</button>
            </div>
        `);
    }

    function getJournalFinderHTML() {
        return getLitSubToolFrame('lit-publish', 'Where to Publish?', 'Paste your abstract to find top journals.', 'Journal Results', `
            <div class="upload-zone text-center" style="border:1px dashed rgba(255,255,255,0.2); padding: 40px; border-radius:12px;">
                <i class="ri-global-line" style="font-size: 3rem; color: var(--accent-secondary);"></i>
                <h3 style="margin: 10px 0;">Paste Your Abstract</h3>
                <textarea id="lit-publish-text" style="width: 100%; height: 150px; background: rgba(0,0,0,0.2); border: 1px solid var(--glass-border); padding: 15px; color: white; border-radius: 8px;" placeholder="Paste your abstract here..."></textarea>
                <button class="primary-btn mt-10" id="lit-publish-btn" style="width:100%;">Suggest Journals</button>
            </div>
        `);
    }

    function getNotesHTML() {
        return `
            <div class="dashboard-header" style="margin-bottom: 16px;">
                <h2>Notes & Equations Editor</h2>
                <p>Write your ideas seamlessly with interactive equation support.</p>
            </div>
            <div class="tool-layout">
                <div class="history-sidebar glass-panel" style="padding: 20px;">
                    <div class="panel-header" style="padding-bottom:10px; margin-bottom:10px;">
                        <h3 style="font-size: 1rem;">Saved Notes</h3>
                    </div>
                    <div id="notes-history-list" style="overflow-y:auto; flex-grow:1; padding-right: 5px;"></div>
                </div>
                <div class="main-tool-area">
                    <div class="editor-layout">
                        <div class="editor-panel glass-panel">
                            <div class="editor-toolbar">
                                <button><i class="ri-bold"></i></button><button><i class="ri-italic"></i></button>
                                <button><i class="ri-h-1"></i></button><button><i class="ri-omega"></i> Insert Math</button>
                            </div>
                            <textarea class="note-textarea" placeholder="Start typing your research notes... Use $$ for equations."></textarea>
                        </div>
                        <div class="preview-panel glass-panel">
                            <h3>Equation Preview</h3>
                            <div class="equation-rendered">
                                <p>Live LaTeX rendering enabled.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function getDraftHTML() {
        return `
            <div class="dashboard-header" style="margin-bottom: 16px;">
                <h2>Thesis Draft Writing</h2>
                <p>Draft your thesis chapters with AI assistance.</p>
            </div>
            <div class="tool-layout">
                <div class="history-sidebar glass-panel" style="padding: 20px;">
                    <div class="panel-header" style="padding-bottom:10px; margin-bottom:10px;">
                        <h3 style="font-size: 1rem;">Saved Drafts</h3>
                    </div>
                    <div id="draft-history-list" style="overflow-y:auto; flex-grow:1; padding-right: 5px;"></div>
                </div>
                <div class="main-tool-area">
                    <div class="editor-layout">
                        <div class="editor-panel glass-panel" style="flex: 2;">
                            <div class="editor-toolbar">
                                <button><i class="ri-bold"></i></button><button><i class="ri-italic"></i></button>
                                <button><i class="ri-underline"></i></button>
                                <div style="width: 1px; height: 20px; background: rgba(255,255,255,0.2); margin: 0 10px;"></div>
                                <button><i class="ri-h-1"></i></button><button><i class="ri-h-2"></i></button>
                                <button><i class="ri-list-unordered"></i></button><button><i class="ri-list-ordered"></i></button>
                            </div>
                            <textarea id="draft-textarea" class="note-textarea" style="height: 60vh; font-family: 'Inter', sans-serif;" placeholder="Begin writing your thesis draft here... AI can help you paraphrase, expand, or summarize your work."></textarea>
                        </div>
                        <div class="action-panel glass-panel" style="flex: 1; display: flex; flex-direction: column; gap: 15px;">
                            <h3>AI Writing Assistant</h3>
                            <button class="action-btn" style="width: 100%; justify-content: center;"><i class="ri-text-wrap"></i> Paraphrase Selection</button>
                            <button class="action-btn" style="width: 100%; justify-content: center;"><i class="ri-menu-add-line"></i> Expand Selection</button>
                            <button class="action-btn" style="width: 100%; justify-content: center;"><i class="ri-check-double-line"></i> Check Grammar</button>
                            <hr style="border-color: rgba(255,255,255,0.1); margin: 10px 0;">
                            <button id="draft-save-btn" class="primary-btn" style="width: 100%;">Save to Cloud</button>
                            <button class="secondary-btn" style="width: 100%; background: transparent; border: 1px solid var(--glass-border); color: white; padding: 10px; border-radius: 8px;">Export as PDF</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function getLatexHTML() {
        return `
            <div class="dashboard-header" style="margin-bottom: 16px;">
                <h2>Word to LaTeX Converter</h2>
                <p>Convert your .docx manuscripts into journal-ready LaTeX code instantly.</p>
            </div>
            <div class="tool-layout">
                <div class="history-sidebar glass-panel" style="padding: 20px;">
                    <div class="panel-header" style="padding-bottom:10px; margin-bottom:10px;">
                        <h3 style="font-size: 1rem;">Past Conversions</h3>
                    </div>
                    <div id="latex-history-list" style="overflow-y:auto; flex-grow:1; padding-right: 5px;"></div>
                </div>
                <div class="main-tool-area">
                    <div class="upload-zone glass-panel text-center">
                        <i class="ri-file-word-line" style="font-size: 4rem; color: #3b82f6;"></i>
                        <h3 style="margin-top: 20px;">Drag & Drop your Word Document</h3>
                        <p class="stat-sub" style="margin: 10px 0 20px;">Supports .doc, .docx (Equations and Images preserved)</p>
                        <button class="primary-btn">Browse Cloud Files</button>
                    </div>
                </div>
            </div>
        `;
    }

    function getEditingHTML() {
        return `
            <div class="dashboard-header" style="margin-bottom: 16px;">
                <h2>AI Editing Tools Suite</h2>
                <p>Select a tool below to perfect your manuscript with our advanced AI agents.</p>
            </div>
            <div class="tool-grid">
                <div class="tool-card glass-panel" style="background: rgba(0,0,0,0.2); cursor:pointer;" id="hub-edit-grammar">
                    <i class="ri-spellcheck tool-icon"></i><h3>Grammar Checker</h3><p>Fix grammatical errors and enhance clarity.</p>
                </div>
                <div class="tool-card glass-panel" style="background: rgba(0,0,0,0.2); cursor:pointer;" id="hub-edit-plag-scan">
                    <i class="ri-file-shield-2-line tool-icon text-green"></i><h3>Plagiarism Checker</h3><p>Scan document for unoriginal content.</p>
                </div>
                <div class="tool-card glass-panel" style="background: rgba(0,0,0,0.2); cursor:pointer;" id="hub-edit-plag-rem">
                    <i class="ri-eraser-line tool-icon text-red"></i><h3>Plagiarism Remover</h3><p>Re-write sections to ensure originality.</p>
                </div>
                <div class="tool-card glass-panel" style="background: rgba(0,0,0,0.2); cursor:pointer;" id="hub-edit-para">
                    <i class="ri-text-wrap tool-icon text-purple"></i><h3>Paraphrasing Tool</h3><p>Enhance the flow and vocabulary of a section.</p>
                </div>
                <div class="tool-card glass-panel" style="background: rgba(0,0,0,0.2); cursor:pointer;" id="hub-edit-ai-chk">
                    <i class="ri-robot-2-line tool-icon text-blue"></i><h3>AI Checker</h3><p style="font-size:0.8rem; margin:10px 0;">Check if text is AI-generated.</p>
                </div>
                <div class="tool-card glass-panel" style="background: rgba(0,0,0,0.2); cursor:pointer;" id="hub-edit-reduce">
                    <i class="ri-compress-right-line tool-icon text-pink"></i><h3>AI Reducer</h3><p style="font-size:0.8rem; margin:10px 0;">Summarize and condense lengthy text.</p>
                </div>
            </div>
        `;
    }

    function getEditSubToolFrame(toolId, title, desc, historyLabel, inputsHTML) {
        return `
            <div class="dashboard-header" style="margin-bottom: 16px; display:flex; justify-content:space-between; align-items:flex-start;">
                <div><h2>${title}</h2><p>${desc}</p></div>
                <button class="secondary-btn" id="edit-back-btn"><i class="ri-arrow-left-line"></i> Back to Hub</button>
            </div>
            <div class="tool-layout">
                <div class="history-sidebar glass-panel" style="padding: 20px;">
                    <div class="panel-header" style="padding-bottom:10px; margin-bottom:10px;">
                        <h3 style="font-size: 1rem;">${historyLabel}</h3>
                    </div>
                    <div id="${toolId}-history-list" style="overflow-y:auto; flex-grow:1; padding-right: 5px;">
                        <div class="history-item"><div class="history-title">Chapter 3 Editing</div></div>
                        <div class="history-item"><div class="history-title">Conclusion Rewrite</div></div>
                    </div>
                </div>
                <div class="main-tool-area glass-panel" style="padding: 20px; overflow-y: auto;">
                    ${inputsHTML}
                    <div id="${toolId}-output-area" style="margin-top: 24px; display: none;">
                        <h3 style="margin-bottom: 12px; border-bottom: 1px solid rgba(0,0,0,0.1); padding-bottom: 10px;">AI Result</h3>
                        <div class="message ai-msg" id="${toolId}-output-content" style="white-space: pre-wrap; margin-top: 10px; margin-bottom: 15px; width:100%; max-width:100%;"></div>
                        <div style="display:flex; justify-content:flex-end; gap:10px;">
                            <button class="action-btn" onclick="copyToClipboard('${toolId}-output-content')" style="padding: 8px 16px; font-size: 0.95rem; border-color:var(--accent-primary); color:var(--accent-primary); background:transparent;"><i class="ri-file-copy-line"></i> Copy Text</button>
                            <button class="primary-btn" onclick="downloadAsWord('${toolId}-output-content', '${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}')" style="padding: 8px 16px; font-size: 0.95rem; display:flex; align-items:center; gap:8px;"><i class="ri-download-line"></i> Download .doc</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function getGrammarHTML() {
        return getEditSubToolFrame('edit-grammar', 'Grammar Checker', 'Paste text to check and fix grammatical errors.', 'Past Checks', `
            <textarea id="edit-grammar-text" style="width: 100%; height: 200px; background: rgba(0,0,0,0.2); border: 1px solid var(--glass-border); padding: 15px; color: white; border-radius: 8px;" placeholder="Paste text here..."></textarea>
            <button class="primary-btn mt-10" id="edit-grammar-btn" style="width:100%;">Check Grammar</button>
        `);
    }

    function getPlagScanHTML() {
        return getEditSubToolFrame('edit-plag-scan', 'Plagiarism Checker', 'Paste text to scan for unoriginal content patterns.', 'Past Scans', `
            <textarea id="edit-plag-scan-text" style="width: 100%; height: 200px; background: rgba(0,0,0,0.2); border: 1px solid var(--glass-border); padding: 15px; color: white; border-radius: 8px;" placeholder="Paste text here..."></textarea>
            <button class="primary-btn mt-10" id="edit-plag-scan-btn" style="width:100%;">Scan Document</button>
        `);
    }

    function getPlagRemHTML() {
        return getEditSubToolFrame('edit-plag-rem', 'Plagiarism Remover', 'Paste flagged text to rewrite ensure originality.', 'Saved Rewrites', `
            <textarea id="edit-plag-rem-text" style="width: 100%; height: 200px; background: rgba(0,0,0,0.2); border: 1px solid var(--glass-border); padding: 15px; color: white; border-radius: 8px;" placeholder="Paste text here..."></textarea>
            <button class="primary-btn mt-10" id="edit-plag-rem-btn" style="width:100%;">Rewrite Text</button>
        `);
    }

    function getParaphraseHTML() {
        return getEditSubToolFrame('edit-para', 'Paraphrasing Tool', 'Enhance the flow and vocabulary of a section.', 'Past Paraphrases', `
            <textarea id="edit-para-text" style="width: 100%; height: 200px; background: rgba(0,0,0,0.2); border: 1px solid var(--glass-border); padding: 15px; color: white; border-radius: 8px;" placeholder="Paste text here..."></textarea>
            <button class="primary-btn mt-10" id="edit-para-btn" style="width:100%;">Paraphrase Section</button>
        `);
    }

    function getAiCheckHTML() {
        return getEditSubToolFrame('edit-ai-chk', 'AI Content Checker', 'Check if a manuscript section was likely AI-generated.', 'Past Checks', `
            <textarea id="edit-ai-chk-text" style="width: 100%; height: 200px; background: rgba(0,0,0,0.2); border: 1px solid var(--glass-border); padding: 15px; color: white; border-radius: 8px;" placeholder="Paste text here..."></textarea>
            <button class="primary-btn mt-10" id="edit-ai-chk-btn" style="width:100%;">Analyze AI Likelihood</button>
        `);
    }

    function getAiReduceHTML() {
        return getEditSubToolFrame('edit-reduce', 'AI Reducer', 'Summarize and condense lengthy text.', 'Past Summaries', `
            <textarea id="edit-reduce-text" style="width: 100%; height: 200px; background: rgba(0,0,0,0.2); border: 1px solid var(--glass-border); padding: 15px; color: white; border-radius: 8px;" placeholder="Paste lengthy text here..."></textarea>
            <button class="primary-btn mt-10" id="edit-reduce-btn" style="width:100%;">Summarize Text</button>
        `);
    }

    function getChatPdfHTML() {
        return `
            <div class="dashboard-header" style="margin-bottom: 16px;">
                <h2>Chat with PDF</h2>
                <p>Upload a document and interact with it intelligently.</p>
            </div>
            <div class="tool-layout">
                <div class="history-sidebar glass-panel" style="padding: 20px;">
                    <div class="panel-header" style="padding-bottom:10px; margin-bottom:10px;">
                        <h3 style="font-size: 1rem;">Past Documents</h3>
                    </div>
                    <div id="chatpdf-history-list" style="overflow-y:auto; flex-grow:1; padding-right: 5px;"></div>
                </div>
                <div class="main-tool-area">
                    <div class="split-view">
                        <div class="pdf-viewer glass-panel" style="display:flex; flex-direction:column;">
                            <div class="panel-header" style="flex-shrink:0;"><h3>PDF Viewer</h3>
                                <input type="file" id="pdf-upload-input" accept=".pdf" style="display:none;">
                                <button class="icon-btn" id="pdf-upload-btn" title="Upload PDF"><i class="ri-upload-cloud-2-line"></i></button>
                            </div>
                            <div class="mock-pdf" id="pdf-render-area" style="flex-grow:1; display:flex; padding:0;">
                                <div style="margin: auto; color: var(--text-muted); padding: 20px;">Please upload a PDF to interact with it.</div>
                            </div>
                        </div>
                        <div class="chat-interface glass-panel">
                            <div class="chat-messages">
                                <div class="message ai-msg">Upload a PDF using the cloud button to get started!</div>
                            </div>
                            <div class="chat-input-area">
                                <input type="text" placeholder="Ask about this paper...">
                                <button class="send-btn"><i class="ri-send-plane-fill"></i></button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function getChatbotHTML() {
        return `
            <div class="chatbot-container glass-panel">
                <div class="chatbot-header">
                    <div class="bot-avatar" style="padding:0; overflow:hidden; border-radius:50%;">
                        <svg width="100%" height="100%" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                          <defs>
                            <radialGradient id="galaxy-bg" cx="50%" cy="50%" r="50%">
                              <stop offset="0%" style="stop-color:#8A2BE2;stop-opacity:1" />
                              <stop offset="50%" style="stop-color:#0000FF;stop-opacity:1" />
                              <stop offset="100%" style="stop-color:#000000;stop-opacity:1" />
                            </radialGradient>
                            <linearGradient id="metallic-gold" x1="0%" y1="0%" x2="100%" y2="0%">
                              <stop offset="0%" style="stop-color:#FFD700" />
                              <stop offset="50%" style="stop-color:#FFA500" />
                              <stop offset="100%" style="stop-color:#FFD700" />
                            </linearGradient>
                          </defs>
                          <circle cx="50" cy="50" r="50" fill="url(#galaxy-bg)" />
                          <circle cx="20" cy="20" r="1" fill="white" />
                          <circle cx="80" cy="15" r="1" fill="white" />
                          <circle cx="15" cy="70" r="1" fill="white" />
                          <circle cx="85" cy="80" r="1" fill="white" />
                          <circle cx="50" cy="10" r="1" fill="white" />
                          <circle cx="90" cy="50" r="1" fill="white" />
                          <circle cx="10" cy="50" r="1" fill="white" />
                          <circle cx="50" cy="90" r="1" fill="white" />
                          <circle cx="50" cy="50" r="40" fill="none" stroke="url(#metallic-gold)" stroke-width="3" />
                          <circle cx="50" cy="50" r="30" fill="none" stroke="url(#metallic-gold)" stroke-width="3" />
                          <circle cx="50" cy="50" r="20" fill="none" stroke="url(#metallic-gold)" stroke-width="3" />
                          <circle cx="50" cy="50" r="3" fill="url(#metallic-gold)" />
                        </svg>
                    </div>
                    <div>
                        <h3>Parama</h3>
                        <p class="stat-sub">ImRa Chief AI Assistant</p>
                    </div>
                </div>
                <div class="chat-messages full-chat">
                    <div class="message ai-msg">Greetings, Scholar! I am Parama. I can guide you through ImRa, help you brainstorm problem statements, or analyze your research data. How can I assist you today?</div>
                </div>
                <div class="chat-input-area">
                    <button class="attach-btn"><i class="ri-attachment-2"></i></button>
                    <input type="text" placeholder="Type a message to Parama...">
                    <button class="send-btn"><i class="ri-send-plane-fill"></i></button>
                </div>
            </div>
        `;
    }

    function getParuHTML() {
        return `
            <div class="dashboard-header" style="margin-bottom: 16px;">
                <h2>Paru 🌟 - Advanced Multi-Role AI</h2>
                <p>Creator, Author, Researcher, and Helper. Powered by advanced reasoning.</p>
            </div>
            <div class="paru-layout">
                <div class="history-sidebar glass-panel" style="padding: 20px;">
                    <div class="panel-header" style="padding-bottom:10px; margin-bottom:10px;">
                        <h3 style="font-size: 1rem;">Chat History</h3>
                        <button class="icon-btn" id="new-paru-chat" title="New Chat"><i class="ri-add-line"></i></button>
                    </div>
                    <div id="paru-history-list" style="overflow-y:auto; flex-grow:1; padding-right: 5px;">
                        <!-- Groups injected via JS -->
                        <div style="text-align:center; padding: 20px 0; color:var(--text-muted); font-size:0.8rem;">Loading history...</div>
                    </div>
                </div>
                <div class="chat-interface glass-panel">
                    <div class="chatbot-header" style="padding: 12px 20px;">
                        <div class="bot-avatar" style="padding:0; overflow:hidden; border-radius:50%;">
                            <svg width="100%" height="100%" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                              <defs>
                                <radialGradient id="paru-galaxy-bg" cx="50%" cy="50%" r="50%">
                                  <stop offset="0%" style="stop-color:#87CEFA;stop-opacity:1" />
                                  <stop offset="50%" style="stop-color:#00BFFF;stop-opacity:1" />
                                  <stop offset="100%" style="stop-color:#000022;stop-opacity:1" />
                                </radialGradient>
                                <linearGradient id="paru-metallic" x1="0%" y1="0%" x2="100%" y2="0%">
                                  <stop offset="0%" style="stop-color:#B0E0E6" />
                                  <stop offset="50%" style="stop-color:#ADD8E6" />
                                  <stop offset="100%" style="stop-color:#B0E0E6" />
                                </linearGradient>
                              </defs>
                              <circle cx="50" cy="50" r="50" fill="url(#paru-galaxy-bg)" />
                              <circle cx="20" cy="20" r="1" fill="white" />
                              <circle cx="80" cy="15" r="1" fill="white" />
                              <circle cx="15" cy="70" r="1" fill="white" />
                              <circle cx="85" cy="80" r="1" fill="white" />
                              <circle cx="50" cy="10" r="1" fill="white" />
                              <circle cx="90" cy="50" r="1" fill="white" />
                              <circle cx="10" cy="50" r="1" fill="white" />
                              <circle cx="50" cy="90" r="1" fill="white" />
                              <circle cx="50" cy="50" r="40" fill="none" stroke="url(#paru-metallic)" stroke-width="3" />
                              <circle cx="50" cy="50" r="30" fill="none" stroke="url(#paru-metallic)" stroke-width="3" />
                              <circle cx="50" cy="50" r="20" fill="none" stroke="url(#paru-metallic)" stroke-width="3" />
                              <circle cx="50" cy="50" r="3" fill="url(#paru-metallic)" />
                            </svg>
                        </div>
                        <div>
                            <h3 style="margin-bottom:0;">Paaru 🌟</h3>
                            <p class="stat-sub" style="margin-top:2px;">Advanced Mode Active</p>
                        </div>
                    </div>
                    <div class="chat-messages" id="paru-chat-messages" style="height: auto; flex-grow: 1;">
                        <div class="message ai-msg">Welcome! I am Paru. I am ready to assist you as a creator, an author, a researcher, or a helper depending on what you need. What shall we explore today?</div>
                    </div>
                    <div class="chat-input-area">
                        <input type="text" id="paru-chat-input" placeholder="Ask Paru for deep analysis or creative writing...">
                        <button class="send-btn" id="paru-send-btn"><i class="ri-send-plane-fill"></i></button>
                    </div>
                </div>
            </div>
        `;
    }

    function setupChatInteractions() {
        const inputs = document.querySelectorAll('.chat-input-area input');
        const sendBtns = document.querySelectorAll('.send-btn');
        
        sendBtns.forEach((btn, index) => {
            // Only affect the default general chat interactions (like ChatPDF), skip Paru which is handled separately
            if(btn.id === 'paru-send-btn') return;
            
            btn.addEventListener('click', async () => {
                const input = inputs[index];
                if(input.value.trim() !== '') {
                    const userText = input.value;
                    const msgContainer = input.closest('.glass-panel').querySelector('.chat-messages');
                    msgContainer.innerHTML += '<div class="message user-msg">' + userText + '</div>';
                    input.value = '';
                    msgContainer.scrollTop = msgContainer.scrollHeight;
                    
                    const currentUser = auth.currentUser;
                    if(currentUser) saveChatMessage(currentUser.uid, 'user', userText);
                    
                    const typingId = "typing-" + Date.now();
                    msgContainer.innerHTML += '<div class="message ai-msg" id="' + typingId + '">Parama is thinking...</div>';
                    msgContainer.scrollTop = msgContainer.scrollHeight;
                    
                    const aiResponse = await fetchGeminiResponse(userText);
                    
                    if(currentUser) saveChatMessage(currentUser.uid, 'ai', aiResponse);
                    
                    const typingEl = document.getElementById(typingId);
                    if(typingEl) typingEl.remove();
                    
                    const formattedResponse = aiResponse.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
                    msgContainer.innerHTML += '<div class="message ai-msg">' + formattedResponse + '</div>';
                    msgContainer.scrollTop = msgContainer.scrollHeight;
                }
            });
        });
    }

    async function fetchGeminiResponse(prompt) {
        try {
            const genAI = new GoogleGenerativeAI("AIzaSyBYNhCMj8o0me2Wh9p-Mfz006LbLAvLpxY");
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
            const result = await model.generateContent("You are Parama, the highly intelligent MALE Chief AI Assistant for the ImRa Research platform. You identify as a male assistant. Be helpful, enthusiastic, clear, and academic. The user says: " + prompt);
            return result.response.text();
        } catch(err) {
            console.error(err);
            return "Connection Error: Please ensure you are running via VS Code Live Server. " + err.message;
        }
    }

    async function fetchProfessionalResponse(prompt) {
        try {
            const genAI = new GoogleGenerativeAI("AIzaSyBYNhCMj8o0me2Wh9p-Mfz006LbLAvLpxY");
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
            const result = await model.generateContent("You are a professional academic research assistant. Provide direct, clear, and well-structured responses. Do not introduce yourself or use unnecessary preamble. Focus on delivering substantive, academic content. " + prompt);
            return result.response.text();
        } catch(err) {
            console.error(err);
            return "Connection Error: Please ensure you are running via VS Code Live Server. " + err.message;
        }
    }

    // --- Paru Integration ---

    async function saveParuMessage(userId, role, text) {
        if(!userId) return;
        try {
            await addDoc(collection(db, "paruHistory", userId, "messages"), {
                role: role,
                text: text,
                timestamp: serverTimestamp()
            });
        } catch(err) {
            console.error("Error saving Paru message", err);
        }
    }

    async function loadParuHistory(userId) {
        if(!userId) return;
        const historyList = document.getElementById('paru-history-list');
        const messagesContainer = document.getElementById('paru-chat-messages');
        if(!historyList || !messagesContainer) return;
        
        try {
            const q = query(collection(db, "paruHistory", userId, "messages"), orderBy("timestamp"));
            const snapshot = await getDocs(q);
            
            if(snapshot.empty) {
                historyList.innerHTML = '<div style="text-align:center; padding: 20px 0; color:var(--text-muted); font-size:0.8rem;">No history found.</div>';
                return;
            }

            const grouped = {};
            let htmlMsg = '';
            
            snapshot.forEach(doc => {
                const data = doc.data();
                if(!data.timestamp) return;
                const d = data.timestamp.toDate();
                const dateKey = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                
                if(!grouped[dateKey]) grouped[dateKey] = [];
                grouped[dateKey].push(data);
                
                const cssClass = data.role === 'user' ? 'user-msg' : 'ai-msg';
                let formattedResponse = data.text;
                if(data.role === 'ai') {
                    formattedResponse = formattedResponse.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
                }
                htmlMsg += `<div class="message ${cssClass}">${formattedResponse}</div>`;
            });
            
            let htmlSidebar = '';
            Object.keys(grouped).reverse().forEach(date => {
                htmlSidebar += `<div class="history-group">
                    <h4>${date}</h4>
                    <div class="history-item">Chat spanning ${grouped[dateKey].length} messages</div>
                </div>`;
            });
            
            historyList.innerHTML = htmlSidebar;
            
            if(htmlMsg !== '') {
                messagesContainer.innerHTML = htmlMsg;
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
            
        } catch(err) {
            console.error("Error loading Paru history", err);
            historyList.innerHTML = '<div style="text-align:center; padding: 20px 0; color:var(--text-muted); font-size:0.8rem;">Failed to load.</div>';
        }
    }

    // --- Global Tool History & Export Managers ---
    
    window.copyToClipboard = function(elementId) {
        const el = document.getElementById(elementId);
        if(el) {
            navigator.clipboard.writeText(el.innerText).then(() => {
                alert("Copied directly to your clipboard!");
            });
        }
    };

    window.downloadAsWord = function(elementId, filename) {
        const el = document.getElementById(elementId);
        if(!el) return;
        const preHtml = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Export</title></head><body>";
        const postHtml = "</body></html>";
        const html = preHtml + "<div style='font-family: Arial, sans-serif;'>" + el.innerHTML + "</div>" + postHtml;
        const blob = new Blob(['\\ufeff', html], { type: 'application/msword' });
        const url = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(html);
        const name = filename ? filename + '.doc' : 'document.doc';
        const downloadLink = document.createElement("a");
        document.body.appendChild(downloadLink);
        if(navigator.msSaveOrOpenBlob){
            navigator.msSaveOrOpenBlob(blob, name);
        }else{
            downloadLink.href = url;
            downloadLink.download = name;
            downloadLink.click();
        }
        document.body.removeChild(downloadLink);
    };

    window.openHistoryViewer = function(title, rawText) {
        const mainArea = document.querySelector('.main-tool-area');
        if(!mainArea) return;
        
        Array.from(mainArea.children).forEach(child => {
            if(!child.classList.contains('history-viewer-overlay')) {
                // Save original display style in a data attribute if needed, but usually empty string restores it.
                if(!child.hasAttribute('data-original-display')) {
                    child.setAttribute('data-original-display', child.style.display);
                }
                child.style.display = 'none';
                child.classList.add('hidden-by-viewer');
            }
        });
        
        const oldViewer = mainArea.querySelector('.history-viewer-overlay');
        if(oldViewer) oldViewer.remove();
        
        const viewer = document.createElement('div');
        viewer.className = 'history-viewer-overlay glass-panel';
        viewer.style.cssText = 'height: 100%; display: flex; flex-direction: column; padding: 0; animation: fadeIn 0.3s ease;';
        
        const formatted = rawText.replace(/\\n/g, '<br>').replace(/\\*\\*(.*?)\\*\\*/g, '<b>$1</b>');
        
        viewer.innerHTML = `
            <div class="panel-header" style="padding: 20px; border-bottom:1px solid rgba(255,255,255,0.1); display:flex; justify-content:space-between; align-items:center;">
                <h2 style="margin:0; font-size: 1.4rem;">${title}</h2>
                <button class="secondary-btn" onclick="closeHistoryViewer()" style="font-size:0.85rem; padding: 6px 12px;"><i class="ri-arrow-left-line"></i> Close View</button>
            </div>
            <div class="viewer-content" style="flex-grow:1; padding: 20px; overflow-y:auto; line-height:1.6; font-size: 0.95rem;">
                ${formatted}
            </div>
        `;
        
        mainArea.appendChild(viewer);
    };

    window.closeHistoryViewer = function() {
        const mainArea = document.querySelector('.main-tool-area');
        if(!mainArea) return;
        
        const viewer = mainArea.querySelector('.history-viewer-overlay');
        if(viewer) viewer.remove();
        
        Array.from(mainArea.children).forEach(child => {
            if(child.classList.contains('hidden-by-viewer')) {
                const orig = child.getAttribute('data-original-display');
                child.style.display = orig || '';
                child.classList.remove('hidden-by-viewer');
            }
        });
    };

    async function saveToolHistory(toolName, title, content) {
        if(!auth.currentUser) return;
        try {
            await addDoc(collection(db, "toolHistory", auth.currentUser.uid, toolName), {
                title: title,
                content: content,
                timestamp: serverTimestamp()
            });
            loadToolHistory(toolName, `${toolName}-history-list`);
        } catch(err) {
            console.error("Error saving tool history", err);
        }
    }

    async function deleteToolHistory(toolName, docId) {
        if(!auth.currentUser) return;
        try {
            await deleteDoc(doc(db, "toolHistory", auth.currentUser.uid, toolName, docId));
            loadToolHistory(toolName, `${toolName}-history-list`);
        } catch(err) {
            console.error("Error deleting history", err);
        }
    }

    async function loadToolHistory(toolName, containerId) {
        const container = document.getElementById(containerId);
        if(!container) return;
        
        if(!auth.currentUser) {
            container.innerHTML = '<div style="text-align:center; padding: 20px 0; color:var(--text-muted); font-size:0.8rem;">Please sign in to view history.</div>';
            return;
        }
        
        try {
            const q = query(collection(db, "toolHistory", auth.currentUser.uid, toolName), orderBy("timestamp", "desc"));
            const snapshot = await getDocs(q);
            
            if(snapshot.empty) {
                container.innerHTML = '<div style="text-align:center; padding: 20px 0; color:var(--text-muted); font-size:0.8rem;">No saved history.</div>';
                return;
            }

            let htmlSidebar = '';
            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                const docId = docSnap.id;
                const safeContent = encodeURIComponent(data.content);
                htmlSidebar += `
                <div class="history-item" data-id="${docId}">
                    <div class="history-title" title="${data.title}">${data.title}</div>
                    <div class="history-actions">
                        <i class="ri-file-copy-line history-copy-btn" data-content="${safeContent}" title="Copy"></i>
                        <i class="ri-download-line history-download-btn" data-title="${data.title}" data-content="${safeContent}" title="Download"></i>
                        <i class="ri-delete-bin-line text-red history-delete-btn" data-tool="${toolName}" data-id="${docId}" title="Delete"></i>
                    </div>
                </div>`;
            });
            
            container.innerHTML = htmlSidebar;
            
            container.querySelectorAll('.history-copy-btn').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const text = decodeURIComponent(e.target.getAttribute('data-content'));
                    navigator.clipboard.writeText(text);
                    e.target.className = 'ri-check-line history-copy-btn';
                    setTimeout(() => e.target.className = 'ri-file-copy-line history-copy-btn', 2000);
                };
            });
            
            container.querySelectorAll('.history-download-btn').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const text = decodeURIComponent(e.target.getAttribute('data-content'));
                    const titleStr = e.target.getAttribute('data-title').replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    const blob = new Blob([text], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${titleStr}.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                };
            });
            
            container.querySelectorAll('.history-delete-btn').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    if(confirm("Delete this saved item?")) {
                        const tool = e.target.getAttribute('data-tool');
                        const id = e.target.getAttribute('data-id');
                        deleteToolHistory(tool, id);
                    }
                };
            });
            
            container.querySelectorAll('.history-item').forEach(item => {
                item.onclick = (e) => {
                    if(e.target.tagName === 'I') return; 
                    const title = item.querySelector('.history-title').innerText;
                    const contentBtn = item.querySelector('.history-copy-btn');
                    if(contentBtn) {
                        const text = decodeURIComponent(contentBtn.getAttribute('data-content'));
                        openHistoryViewer(title, text);
                    }
                };
            });
            
        } catch(err) {
            console.error("Error loading tool history", err);
            container.innerHTML = '<div style="text-align:center; padding: 20px 0; color:var(--text-muted); font-size:0.8rem;">Failed to load.</div>';
        }
    }

    function setupParuInteractions() {
        const input = document.getElementById('paru-chat-input');
        const sendBtn = document.getElementById('paru-send-btn');
        const msgContainer = document.getElementById('paru-chat-messages');
        if(!input || !sendBtn) return;
        
        const currentUser = auth.currentUser;
        if(currentUser) {
            loadParuHistory(currentUser.uid);
        } else {
            document.getElementById('paru-history-list').innerHTML = '<div style="text-align:center; padding: 20px 0; color:var(--text-muted); font-size:0.8rem;">Please log in.</div>';
        }
        
        const handleSend = async () => {
            if(input.value.trim() !== '') {
                const userText = input.value;
                msgContainer.innerHTML += '<div class="message user-msg">' + userText + '</div>';
                input.value = '';
                msgContainer.scrollTop = msgContainer.scrollHeight;
                
                if(currentUser) saveParuMessage(currentUser.uid, 'user', userText);
                
                const typingId = "typing-" + Date.now();
                msgContainer.innerHTML += '<div class="message ai-msg" id="' + typingId + '">Paru is thinking...</div>';
                msgContainer.scrollTop = msgContainer.scrollHeight;
                
                const aiResponse = await fetchParuResponse(userText);
                
                if(currentUser) saveParuMessage(currentUser.uid, 'ai', aiResponse);
                
                const typingEl = document.getElementById(typingId);
                if(typingEl) typingEl.remove();
                
                const formattedResponse = aiResponse.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
                msgContainer.innerHTML += '<div class="message ai-msg">' + formattedResponse + '</div>';
                msgContainer.scrollTop = msgContainer.scrollHeight;
                
                // Refresh history sidebar logic could be called here to add new dates incrementally
            }
        };
        
        sendBtn.addEventListener('click', handleSend);
        input.addEventListener('keypress', (e) => { if(e.key === 'Enter') handleSend(); });
    }

    async function fetchParuResponse(prompt) {
        try {
            const genAI = new GoogleGenerativeAI("AIzaSyBYNhCMj8o0me2Wh9p-Mfz006LbLAvLpxY");
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
            const result = await model.generateContent("You are Paru, an advanced AI chatbot and a supportive friend to the research scholar. You possess the wisdom of a creator, author, researcher, and helper, but you must blend these seamlessly into a natural, conversational, and empathetic tone. Never use obvious headers for your roles. IMPORTANT: Speak in simple, plain English. Match the length of your response to the user's input—if the user shares a short feeling or simple line, respond concisely and empathetically like a caring friend. Avoid long essays unless explicitly asked to write one. The user says: " + prompt);
            return result.response.text();
        } catch(err) {
            console.error(err);
            return "Connection Error: Please ensure you are running via VS Code Live Server. " + err.message;
        }
    }

    // --- Serverless Backend Integration ---

    async function uploadToCloudStorage(file) {
        if(!auth.currentUser) { alert("Please login first."); return null; }
        try {
            const storageRef = ref(storage, `users/${auth.currentUser.uid}/uploads/${file.name}`);
            await uploadBytes(storageRef, file);
            alert(`Successfully uploaded ${file.name} to Cloud Storage!`);
            return await getDownloadURL(storageRef);
        } catch(err) {
            console.error("Upload error:", err);
            alert("Failed to upload file.");
            return null;
        }
    }

    function setupDashboardInteractions() {
        const uploadBtn = document.getElementById('dash-upload-btn');
        const fileInput = document.getElementById('dash-file-input');
        if(uploadBtn && fileInput) {
            uploadBtn.onclick = () => fileInput.click();
            fileInput.onchange = async (e) => {
                const file = e.target.files[0];
                if(file) {
                    const originalText = uploadBtn.innerHTML;
                    uploadBtn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Uploading...';
                    await uploadToCloudStorage(file);
                    uploadBtn.innerHTML = originalText;
                }
            };
        }
    }

    async function saveCloudDocument(docId, textContent) {
        if(!auth.currentUser) { alert("Please login to save to cloud."); return; }
        try {
            await setDoc(doc(db, "userDocuments", auth.currentUser.uid, "documents", docId), {
                content: textContent,
                lastSaved: serverTimestamp()
            });
            alert(`Draft securely saved to Cloud Database!`);
        } catch(err) {
            console.error("Save error:", err);
            alert("Failed to save document.");
        }
    }

    async function loadCloudDocument(docId, textAreaEl) {
        if(!auth.currentUser) return;
        try {
            const docSnap = await getDoc(doc(db, "userDocuments", auth.currentUser.uid, "documents", docId));
            if (docSnap.exists() && textAreaEl) {
                textAreaEl.value = docSnap.data().content || "";
            }
        } catch(err) {
            console.error("Load error:", err);
        }
    }

    function setupNotesInteractions() {
        loadToolHistory('notes', 'notes-history-list');
        // Currently Notes is just a visual text area demo without an explicit "Save" button in the toolbar,
        // but we ensure the history sidebar loads correctly for visual consistency.
    }

    function setupLatexInteractions() {
        loadToolHistory('latex', 'latex-history-list');
    }

    function setupEditingInteractions() {
        // Load history for the editing sub-tools
        loadToolHistory('editing', 'editing-history-list');
        
        // Set up the hub card handlers if this is the main editing hub
        const content = document.getElementById('dashboard-content');
        
        const e1 = document.getElementById('hub-edit-grammar');
        if(e1) {
            e1.removeEventListener('click', e1._grammarHandler);
            e1._grammarHandler = () => { 
                content.innerHTML = getGrammarHTML(); 
                setupGrammarInteractions(); 
            };
            e1.addEventListener('click', e1._grammarHandler);
        }
        
        const e2 = document.getElementById('hub-edit-plag-scan');
        if(e2) {
            e2.removeEventListener('click', e2._plagScanHandler);
            e2._plagScanHandler = () => { 
                content.innerHTML = getPlagScanHTML(); 
                setupPlagScanInteractions(); 
            };
            e2.addEventListener('click', e2._plagScanHandler);
        }
        
        const e3 = document.getElementById('hub-edit-plag-rem');
        if(e3) {
            e3.removeEventListener('click', e3._plagRemHandler);
            e3._plagRemHandler = () => { 
                content.innerHTML = getPlagRemHTML(); 
                setupPlagRemInteractions(); 
            };
            e3.addEventListener('click', e3._plagRemHandler);
        }
        
        const e4 = document.getElementById('hub-edit-para');
        if(e4) {
            e4.removeEventListener('click', e4._paraHandler);
            e4._paraHandler = () => { 
                content.innerHTML = getParaphraseHTML(); 
                setupParaphraseInteractions(); 
            };
            e4.addEventListener('click', e4._paraHandler);
        }
        
        const e5 = document.getElementById('hub-edit-ai-chk');
        if(e5) {
            e5.removeEventListener('click', e5._aiChkHandler);
            e5._aiChkHandler = () => { 
                content.innerHTML = getAiCheckHTML(); 
                setupAiCheckInteractions(); 
            };
            e5.addEventListener('click', e5._aiChkHandler);
        }
        
        const e6 = document.getElementById('hub-edit-reduce');
        if(e6) {
            e6.removeEventListener('click', e6._reduceHandler);
            e6._reduceHandler = () => { 
                content.innerHTML = getAiReduceHTML(); 
                setupAiReduceInteractions(); 
            };
            e6.addEventListener('click', e6._reduceHandler);
        }
    }

    function setupDraftInteractions() {
        loadToolHistory('draft', 'draft-history-list');
        
        const saveBtn = document.getElementById('draft-save-btn');
        const textarea = document.getElementById('draft-textarea');
        if(textarea) loadCloudDocument('thesisDraft', textarea);
        
        if(saveBtn && textarea) {
            saveBtn.onclick = async () => {
                const originalText = saveBtn.innerHTML;
                saveBtn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Saving...';
                await saveCloudDocument('thesisDraft', textarea.value);
                await saveToolHistory('draft', 'Draft Version ' + new Date().toLocaleTimeString(), textarea.value);
                saveBtn.innerHTML = originalText;
            };
        }
    }

    function setupNotesInteractions() {
        loadToolHistory('notes', 'notes-history-list');
        // Notes interaction logic can be added here for saving, exporting, etc.
    }

    function setupLatexInteractions() {
        loadToolHistory('latex', 'latex-history-list');
        // LaTeX conversion interaction logic can be added here
    }

    let currentPdfTextContext = "";

    function setupChatPdfInteractions() {
        loadToolHistory('chatpdf', 'chatpdf-history-list');

        const uploadBtn = document.getElementById('pdf-upload-btn');
        const fileInput = document.getElementById('pdf-upload-input');
        const renderArea = document.getElementById('pdf-render-area');
        
        if(uploadBtn && fileInput) {
            uploadBtn.onclick = () => fileInput.click();
            fileInput.onchange = async (e) => {
                const file = e.target.files[0];
                if(file && file.type === "application/pdf") {
                    renderArea.innerHTML = '<div style="text-align:center; margin-top: 50px; color: var(--text-muted);"><i class="ri-loader-4-line ri-spin"></i> Extracting text via PDF.js...</div>';
                    
                    try {
                        const arrayBuffer = await file.arrayBuffer();
                        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
                        let text = "";
                        for (let i = 1; i <= pdf.numPages; i++) {
                            const page = await pdf.getPage(i);
                            const content = await page.getTextContent();
                            text += content.items.map(item => item.str).join(" ") + "\\n";
                        }
                        
                        currentPdfTextContext = "The user has uploaded a document with the following text:\\n\\n" + text.substring(0, 15000) + "\\n\\n---\\n\\n"; 
                        
                        const fileUrl = URL.createObjectURL(file);
                        renderArea.innerHTML = `<object data="${fileUrl}#toolbar=0" type="application/pdf" width="100%" height="100%" style="border-radius:0 0 8px 8px;">
                            <p style="padding:20px;">Your browser does not support PDFs. <a href="${fileUrl}" style="color:var(--text-blue);">Download the PDF</a>.</p>
                        </object>`;
                        
                        await uploadToCloudStorage(file);
                        
                    } catch(err) {
                        console.error('PDF JS err', err);
                        renderArea.innerHTML = '<div style="text-align:center; padding: 20px; color: red;">Failed to parse PDF</div>';
                    }
                }
            };
        }
        
        const chatPdfView = document.querySelector('.split-view .chat-input-area');
        if(chatPdfView) {
            const input = chatPdfView.querySelector('input');
            const btn = chatPdfView.querySelector('.send-btn');
            const msgContainer = document.querySelector('.split-view .chat-messages');
            
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            const newInput = input.cloneNode(true);
            input.parentNode.replaceChild(newInput, input);
            
            const handleSend = async () => {
                if(newInput.value.trim() !== '') {
                    const userText = newInput.value;
                    msgContainer.innerHTML += '<div class="message user-msg">' + userText + '</div>';
                    newInput.value = '';
                    msgContainer.scrollTop = msgContainer.scrollHeight;
                    
                    const typingId = "typing-" + Date.now();
                    msgContainer.innerHTML += '<div class="message ai-msg" id="' + typingId + '">Reviewing document...</div>';
                    msgContainer.scrollTop = msgContainer.scrollHeight;
                    
                    const aiResponse = await fetchGeminiResponse(currentPdfTextContext + userText);
                    
                    const typingEl = document.getElementById(typingId);
                    if(typingEl) typingEl.remove();
                    
                    const formattedResponse = aiResponse.replace(/\\*\\*(.*?)\\*\\*/g, '<b>$1</b>').replace(/\\n/g, '<br>');
                    msgContainer.innerHTML += '<div class="message ai-msg">' + formattedResponse + '</div>';
                    msgContainer.scrollTop = msgContainer.scrollHeight;
                    
                    // Save to history automatically
                    await saveToolHistory('chatpdf', 'PDF Q&A Session', "User: " + userText + "\\n\\nAI: " + aiResponse);
                }
            };
            
            newBtn.addEventListener('click', handleSend);
            newInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') handleSend(); });
        }
    }

    async function extractTextFromMultiplePDFs(files) {
        let fullText = "";
        for(let i=0; i<files.length; i++) {
            try {
                const arrayBuffer = await files[i].arrayBuffer();
                const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
                fullText += `--- Document ${i+1}: ${files[i].name} ---\\n`;
                for (let j = 1; j <= pdf.numPages; j++) {
                    const page = await pdf.getPage(j);
                    const content = await page.getTextContent();
                    fullText += content.items.map(item => item.str).join(" ") + "\\n";
                }
            } catch(e) { console.error("Extract err", e); }
        }
        return fullText;
    }

    function attachLitBackBtn() {
        const btn = document.getElementById('lit-back-btn');
        if(btn) {
            btn.onclick = () => {
                document.getElementById('dashboard-content').innerHTML = getLiteratureHTML();
                setupLiteratureInteractions();
            };
        }
    }

    function subToolLoading(toolId, msg) {
        const outArea = document.getElementById(toolId + '-output-area');
        const outContent = document.getElementById(toolId + '-output-content');
        if(!outArea || !outContent) return null;
        outArea.style.display = 'block';
        outContent.innerHTML = `<i class="ri-loader-4-line ri-spin"></i> ${msg}...`;
        outArea.scrollIntoView({behavior: 'smooth'});
        return outContent;
    }

    // --- Sub-Tools Logic for Literature ---
    function setupLitReviewInteractions() {
        loadToolHistory('lit-review', 'lit-review-history-list');
        attachLitBackBtn();
        const reviewFile = document.getElementById('lit-review-file');
        if(reviewFile) {
            reviewFile.onchange = async (e) => {
                if(e.target.files.length > 0) {
                    const outContent = subToolLoading('lit-review', "Extracting papers and writing Literature Review");
                    if(!outContent) return;
                    const text = await extractTextFromMultiplePDFs(e.target.files);
                    const prompt = "Synthesize a comprehensive literature review from these papers. Highlight the common themes, differences, and chronological progression if any. Text:\\n" + text.substring(0, 15000);
                    const response = await fetchProfessionalResponse(prompt);
                    outContent.innerHTML = response.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\\n/g, '<br>');
                    await saveToolHistory('lit-review', 'Literature Review', response);
                }
            };
        }
    }

    function setupResearchGapInteractions() {
        loadToolHistory('lit-gap', 'lit-gap-history-list');
        attachLitBackBtn();
        const gapFile = document.getElementById('lit-gap-file');
        if(gapFile) {
            gapFile.onchange = async (e) => {
                if(e.target.files.length > 0) {
                    if(e.target.files.length > 10) {
                        alert("Please upload a maximum of 10 papers.");
                        document.getElementById('lit-gap-file').value = "";
                        return;
                    }
                    const outContent = subToolLoading('lit-gap', "Extracting papers and finding Research Gaps");
                    if(!outContent) return;
                    const text = await extractTextFromMultiplePDFs(e.target.files);
                    const prompt = "Analyze these papers and highlight the unexplored methodologies or research gaps. Provide a bulleted list of potential future research directions. Text:\\n" + text.substring(0, 15000);
                    const response = await fetchProfessionalResponse(prompt);
                    outContent.innerHTML = response.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\\n/g, '<br>');
                    await saveToolHistory('lit-gap', 'Research Gap Analysis', response);
                }
            };
        }
    }

    function setupProblemStmtInteractions() {
        loadToolHistory('lit-problem', 'lit-problem-history-list');
        attachLitBackBtn();
        const probFile = document.getElementById('lit-problem-file');
        if(probFile) {
            probFile.onchange = async (e) => {
                const file = e.target.files[0];
                if(file) {
                    const outContent = subToolLoading('lit-problem', "Extracting Word document and Formulating Problem Statements");
                    if(!outContent) return;
                    try {
                        const arrayBuffer = await file.arrayBuffer();
                        const result = await mammoth.extractRawText({arrayBuffer: arrayBuffer});
                        const text = result.value;
                        const prompt = "Based on this research draft or ideas, draft three compelling and distinct problem statements: " + text.substring(0, 15000);
                        const response = await fetchProfessionalResponse(prompt);
                        outContent.innerHTML = response.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\\n/g, '<br>');
                        await saveToolHistory('lit-problem', 'Problem Statements', response);
                    } catch(err) {
                        console.error(err);
                        outContent.innerHTML = '<span class="text-red">Error parsing Word document. Please ensure it is a valid .docx file.</span>';
                    }
                }
            };
        }
    }

    function setupJournalFinderInteractions() {
        loadToolHistory('lit-publish', 'lit-publish-history-list');
        attachLitBackBtn();
        const publishBtn = document.getElementById('lit-publish-btn');
        const publishText = document.getElementById('lit-publish-text');
        if(publishBtn && publishText) {
            publishBtn.onclick = async () => {
                const abstract = publishText.value.trim();
                if(abstract) {
                    const outContent = subToolLoading('lit-publish', "Finding Target Journals");
                    if(!outContent) return;
                    const p = "Suggest 5 high-impact, relevant academic journals or conferences for a paper with the following abstract. Provide the rationale for each. Abstract: " + abstract;
                    const response = await fetchProfessionalResponse(p);
                    outContent.innerHTML = response.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\\n/g, '<br>');
                    await saveToolHistory('lit-publish', 'Journal Suggestions', response);
                }
            };
        }
    }

    // --- Sub-Tools Logic for Editing ---
    function attachEditBackBtn() {
        const btn = document.getElementById('edit-back-btn');
        if(btn) {
            btn.onclick = () => {
                document.getElementById('dashboard-content').innerHTML = getEditingHTML();
                setupEditingInteractions();
            };
        }
    }

    function setupGrammarInteractions() {
        loadToolHistory('edit-grammar', 'edit-grammar-history-list'); attachEditBackBtn();
        const btn = document.getElementById('edit-grammar-btn');
        if(btn) {
            btn.onclick = async () => {
                const text = document.getElementById('edit-grammar-text').value;
                if(!text) return;
                const outContent = subToolLoading('edit-grammar', 'Checking grammar');
                const response = await fetchProfessionalResponse("Fix grammatical errors and enhance clarity of the following text:\\n\\n" + text);
                outContent.innerHTML = response.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\\n/g, '<br>');
                await saveToolHistory('edit-grammar', 'Grammar Check', response);
            };
        }
    }
    
    function setupPlagScanInteractions() {
        loadToolHistory('edit-plag-scan', 'edit-plag-scan-history-list'); attachEditBackBtn();
        const btn = document.getElementById('edit-plag-scan-btn');
        if(btn) {
            btn.onclick = async () => {
                const text = document.getElementById('edit-plag-scan-text').value;
                if(!text) return;
                const outContent = subToolLoading('edit-plag-scan', 'Scanning for unoriginality');
                const response = await fetchProfessionalResponse("Analyze this text for unoriginal content patterns and identify potential plagiarism risks:\\n\\n" + text);
                outContent.innerHTML = response.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\\n/g, '<br>');
                await saveToolHistory('edit-plag-scan', 'Plagiarism Scan', response);
            };
        }
    }
    
    function setupPlagRemInteractions() {
        loadToolHistory('edit-plag-rem', 'edit-plag-rem-history-list'); attachEditBackBtn();
        const btn = document.getElementById('edit-plag-rem-btn');
        if(btn) {
            btn.onclick = async () => {
                const text = document.getElementById('edit-plag-rem-text').value;
                if(!text) return;
                const outContent = subToolLoading('edit-plag-rem', 'Rewriting text');
                const response = await fetchProfessionalResponse("Rewrite the following text to ensure originality while retaining its meaning. It has been flagged as plagiarized:\\n\\n" + text);
                outContent.innerHTML = response.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\\n/g, '<br>');
                await saveToolHistory('edit-plag-rem', 'Plagiarism Removal', response);
            };
        }
    }
    
    function setupParaphraseInteractions() {
        loadToolHistory('edit-para', 'edit-para-history-list'); attachEditBackBtn();
        const btn = document.getElementById('edit-para-btn');
        if(btn) {
            btn.onclick = async () => {
                const text = document.getElementById('edit-para-text').value;
                if(!text) return;
                const outContent = subToolLoading('edit-para', 'Paraphrasing text');
                const response = await fetchProfessionalResponse("Paraphrase the following section to enhance flow and academic vocabulary:\\n\\n" + text);
                outContent.innerHTML = response.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\\n/g, '<br>');
                await saveToolHistory('edit-para', 'Paraphrase', response);
            };
        }
    }
    
    function setupAiCheckInteractions() {
        loadToolHistory('edit-ai-chk', 'edit-ai-chk-history-list'); attachEditBackBtn();
        const btn = document.getElementById('edit-ai-chk-btn');
        if(btn) {
            btn.onclick = async () => {
                const text = document.getElementById('edit-ai-chk-text').value;
                if(!text) return;
                const outContent = subToolLoading('edit-ai-chk', 'Analyzing AI likelihood');
                const response = await fetchProfessionalResponse("Check if this text is likely AI-generated. Provide a percentage confidence score and point out robotic phrasing:\\n\\n" + text);
                outContent.innerHTML = response.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\\n/g, '<br>');
                await saveToolHistory('edit-ai-chk', 'AI Detection', response);
            };
        }
    }
    
    function setupAiReduceInteractions() {
        loadToolHistory('edit-reduce', 'edit-reduce-history-list'); attachEditBackBtn();
        const btn = document.getElementById('edit-reduce-btn');
        if(btn) {
            btn.onclick = async () => {
                const text = document.getElementById('edit-reduce-text').value;
                if(!text) return;
                const outContent = subToolLoading('edit-reduce', 'Summarizing condensing text');
                const response = await fetchProfessionalResponse("Summarize and condense the following lengthy text into a tight, impactful paragraph:\\n\\n" + text);
                outContent.innerHTML = response.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\\n/g, '<br>');
                await saveToolHistory('edit-reduce', 'Summary', response);
            };
        }
    }

    // --- Hub Routing Implementations ---
    function setupLiteratureInteractions() {
        const content = document.getElementById('dashboard-content');
        
        const c1 = document.getElementById('hub-card-review');
        if(c1) {
            c1.removeEventListener('click', c1._reviewHandler);
            c1._reviewHandler = () => {
                content.innerHTML = getLitReviewHTML();
                setupLitReviewInteractions();
            };
            c1.addEventListener('click', c1._reviewHandler);
        }
        
        const c2 = document.getElementById('hub-card-gap');
        if(c2) {
            c2.removeEventListener('click', c2._gapHandler);
            c2._gapHandler = () => { 
                content.innerHTML = getResearchGapHTML(); 
                setupResearchGapInteractions(); 
            };
            c2.addEventListener('click', c2._gapHandler);
        }
        
        const c3 = document.getElementById('hub-card-problem');
        if(c3) {
            c3.removeEventListener('click', c3._problemHandler);
            c3._problemHandler = () => { 
                content.innerHTML = getProblemStmtHTML(); 
                setupProblemStmtInteractions(); 
            };
            c3.addEventListener('click', c3._problemHandler);
        }
        
        const c4 = document.getElementById('hub-card-publish');
        if(c4) {
            c4.removeEventListener('click', c4._publishHandler);
            c4._publishHandler = () => { 
                content.innerHTML = getJournalFinderHTML(); 
                setupJournalFinderInteractions(); 
            };
            c4.addEventListener('click', c4._publishHandler);
        }
    }

    function openLiteratureReviewTab(){
        const popup = window.open('', '_blank');
        if(!popup){alert('Popup blocked. Allow popups for this site.'); return;}

        const html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Literature Review Tool</title>
                <style>
                    body{margin:0;font-family:Inter,system-ui,Arial,sans-serif;background:#f0f4f8;color:#111827;}
                    .layout{display:grid;grid-template-columns:1fr 2fr 2fr;height:100vh;gap:8px;padding:8px;background:#f0f4f8;}
                    .panel{background:rgba(255,255,255,0.7);border:1px solid rgba(0,0,0,0.1);border-radius:10px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.05);}
                    .panel header{padding:12px 14px;font-weight:700;background:rgba(0,0,0,0.05);color:#111827;}
                    .panel main{padding:10px;flex:1;overflow:auto;}
                    .panel .padded{padding:10px;}
                    .control-group{margin-bottom:10px;}
                    .control-group label{display:block;font-size:13px;color:#4b5563;margin-bottom:4px;}
                    .control-group input[type=file], .control-group button, .control-group textarea{width:100%;}
                    .control-group textarea{height:120px;resize:vertical;padding:8px;border-radius:8px;border:1px solid rgba(0,0,0,0.1);background:rgba(255,255,255,0.8);color:#111827;}
                    .btn{border:0;border-radius:8px;background:#52c41a;color:#fff;padding:10px 12px;font-weight:700;cursor:pointer;transition:transform 0.2s;}
                    .btn:active{transform:translateY(1px);}
                    .history-item{padding:10px;border-radius:8px;margin-bottom:8px;background:rgba(0,0,0,0.05);cursor:pointer;color:#111827;font-size:0.9rem;}
                    .history-item:hover{background:rgba(0,0,0,0.1);}                     
                    embed{width:100%;height:calc(100% - 42px);border:1px solid rgba(0,0,0,0.1);background:#fff;border-radius:8px;}
                    .summary-content{white-space:pre-wrap;line-height:1.75;font-size:0.95rem;padding:16px;border-radius:10px;border:1px solid rgba(0,0,0,0.08);background:#ffffff;min-height:260px;}
                    .summary-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;}
                </style>
            </head>
            <body>
                <div class="layout">
                    <section class="panel" id="historyPanel">
                        <header>History</header>
                        <main>
                            <div id="historyList"></div>
                        </main>
                    </section>
                    <section class="panel" id="pdfPanel">
                        <header>Upload & View PDF</header>
                        <main>
                            <div class="padded control-group">
                                <label for="literatureFile">Select PDF</label>
                                <input type="file" id="literatureFile" accept="application/pdf" />
                                <button class="btn" id="loadPdfBtn" style="margin-top:10px;">Load PDF</button>
                            </div>
                            <embed id="pdfViewer" src="" type="application/pdf" style="display:block;" onload="console.log('PDF loaded successfully')" onerror="console.error('PDF failed to load')">
                                <p style="padding: 20px; text-align: center; color: #666;">Your browser does not support PDF viewing. Please use a modern browser like Chrome, Firefox, or Edge.</p>
                            </embed>
                        </main>
                    </section>
                    <section class="panel" id="summaryPanel">
                        <header>Summarized Paper (500 words max)</header>
                        <main>
                            <div class="padded summary-content" id="summaryContent">Upload a PDF and click "Summarize" to generate an aligned summary with headings and key refs.</div>
                            <div class="summary-actions">
                                <button class="btn" id="copySummaryBtn" style="background:#3b82f6;">Copy Text</button>
                                <button class="btn" id="downloadSummaryBtn" style="background:#6366f1;">Download as .doc</button>
                                <button class="btn" id="summarizeBtn" style="flex:1;">Generate 500-word Summary</button>
                            </div>
                        </main>
                    </section>
                </div>
                <!-- Scripts loaded dynamically after document is ready -->
            </body>
            </html>
        `;
        popup.document.write(html);
        popup.document.close();
        
        // Now dynamically load the scripts after the document is ready
        setTimeout(() => {
            // Initialize all functionality
            const initScript = popup.document.createElement('script');
            initScript.textContent = `
                const historyKey = 'litReviewHistory';
                const history = JSON.parse(localStorage.getItem(historyKey) || '[]');
                const historyList = document.getElementById('historyList');
                const pdfViewer = document.getElementById('pdfViewer');
                const fileInput = document.getElementById('literatureFile');
                const summaryContent = document.getElementById('summaryContent');

                const renderHistory = () => {
                    if(history.length === 0) {
                        historyList.innerHTML = '<div style="padding:12px;color:#4b5563;">No history yet. Generate a summary to save it here.</div>';
                        return;
                    }
                    historyList.innerHTML = history.map((item,index)=>'<div class="history-item" data-index="'+index+'">'+item.title+'</div>').join('');
                    document.querySelectorAll('.history-item').forEach(el=> el.addEventListener('click',()=>{
                        const item = history[el.dataset.index];
                        summaryContent.textContent = item.data;
                    }));
                };

                const saveHistory = () => {
                    localStorage.setItem(historyKey, JSON.stringify(history));
                };

                const updateHistory = (title, data) => {
                    history.unshift({title, data});
                    saveHistory();
                    renderHistory();
                };

                renderHistory();
                
                const loadSelectedPdf = () => {
                    const file = fileInput.files[0];
                    console.log('Loading PDF file:', file);
                    if(!file) {
                        summaryContent.textContent = 'Select a PDF to preview it here.';
                        pdfViewer.src = '';
                        pdfViewer.style.display = 'none';
                        return false;
                    }
                    const url = URL.createObjectURL(file);
                    console.log('Created blob URL:', url);
                    pdfViewer.src = url + '#toolbar=0&navpanes=0&scrollbar=0';
                    pdfViewer.style.width = '100%';
                    pdfViewer.style.height = '100%';
                    pdfViewer.style.display = 'block';
                    summaryContent.textContent = 'PDF loaded. Click "Generate 500-word Summary" to proceed.';
                    console.log('PDF viewer updated');
                    return true;
                };
                
                fileInput.addEventListener('change', loadSelectedPdf);
                document.getElementById('loadPdfBtn').addEventListener('click', () => {
                    if(!loadSelectedPdf()) alert('Please select a PDF file.');
                });
                
                document.getElementById('summarizeBtn').addEventListener('click',async()=>{
                    const file = fileInput.files[0];
                    if(!file) return alert('Please select and load a PDF first.');
                    summaryContent.textContent = 'Extracting text and generating summary... Please wait.';
                    console.log('Starting PDF summarization for file:', file.name);
                    try {
                        let pdfjsLib = window.pdfjsLib;
                        if(!pdfjsLib) {
                            summaryContent.textContent = 'Loading PDF.js library... Please wait.';
                            for(let i = 0; i < 30; i++) {
                                await new Promise(r => setTimeout(r, 100));
                                pdfjsLib = window.pdfjsLib;
                                if(pdfjsLib) break;
                            }
                        }
                        if(!pdfjsLib) throw new Error('PDF.js failed to load. Please refresh and try again.');
                        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                        console.log('PDF.js worker configured');
                        
                        const arrayBuffer = await file.arrayBuffer();
                        console.log('File converted to array buffer, size:', arrayBuffer.byteLength);
                        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
                        console.log('PDF document loaded, pages:', pdf.numPages);
                        
                        let fullText = '';
                        const maxPages = Math.min(pdf.numPages, 4);
                        console.log('Extracting text from', maxPages, 'pages');
                        for(let i=1; i<=maxPages; i++){
                            const page = await pdf.getPage(i);
                            const content = await page.getTextContent();
                            fullText += content.items.map(item => item.str).join(' ');
                        }
                        console.log('Text extracted, length:', fullText.length);
                        
                        const summary = await window.fetchSummary(fullText);
                        console.log('Summary generated');
                        summaryContent.innerHTML = summary.replace(/\\n/g, '<br>');
                        updateHistory(file.name.replace('.pdf',''), summary);
                    } catch(e) {
                        console.error('PDF summarization error:', e);
                        summaryContent.textContent = 'Error: ' + e.message;
                    }
                });

                document.getElementById('copySummaryBtn').addEventListener('click', () => {
                    navigator.clipboard.writeText(summaryContent.innerText).then(() => {
                        alert('Summary copied to clipboard.');
                    }).catch(() => {
                        alert('Copy failed. Please try again.');
                    });
                });

                document.getElementById('downloadSummaryBtn').addEventListener('click', () => {
                    const preHtml = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Summary Export</title></head><body>";
                    const postHtml = '</body></html>';
                    const html = preHtml + '<div style="font-family: Arial, sans-serif;">' + summaryContent.innerHTML + '</div>' + postHtml;
                    const blob = new Blob(['\\ufeff', html], { type: 'application/msword' });
                    const url = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(html);
                    const name = 'literature_review_summary.doc';
                    const downloadLink = document.createElement('a');
                    document.body.appendChild(downloadLink);
                    downloadLink.href = url;
                    downloadLink.download = name;
                    downloadLink.click();
                    document.body.removeChild(downloadLink);
                });
            `;
            popup.document.body.appendChild(initScript);
            
            // Load PDF.js externally
            const pdfScript = popup.document.createElement('script');
            pdfScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
            pdfScript.onload = () => {
                console.log('PDF.js loaded successfully');
            };
            popup.document.head.appendChild(pdfScript);
            
            // Load Google Generative AI module
            const aiScript = popup.document.createElement('script');
            aiScript.type = 'module';
            aiScript.textContent = `
                import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";
                window.fetchSummary = async function(text) {
                    try {
                        const genAI = new GoogleGenerativeAI("AIzaSyBYNhCMj8o0me2Wh9p-Mfz006LbLAvLpxY");
                        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
                        const result = await model.generateContent("Please summarize the following research paper into an organized 500-word overview, outlining Introduction, Methods, Results, and Implications:\\n\\n" + text.substring(0, 10000));
                        return result.response.text();
                    } catch(err) {
                        return "Error creating summary: " + err.message;
                    }
                };
            `;
            popup.document.body.appendChild(aiScript);
        }, 0);
    }

    function setupLibraryInteractions() {
        const fileUpload = document.getElementById('file-upload');
        const folderUpload = document.getElementById('folder-upload');
        const uploadActions = document.getElementById('upload-actions');
        const saveUpload = document.getElementById('save-upload');
        const cancelUpload = document.getElementById('cancel-upload');
        const uploadStatus = document.getElementById('upload-status');
        const folderUploadActions = document.getElementById('folder-upload-actions');
        const saveFolderUpload = document.getElementById('save-folder-upload');
        const cancelFolderUpload = document.getElementById('cancel-folder-upload');
        const folderUploadStatus = document.getElementById('folder-upload-status');

        let selectedFiles = [];
        let selectedFolderFiles = [];

        // Tab switching
        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.file-list');

        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                tabButtons.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                const tabId = btn.getAttribute('data-tab') + '-files';
                document.getElementById(tabId).classList.add('active');
            });
        });

        // Load existing files
        loadLibraryFiles();

        // File upload selection
        if(fileUpload) {
            fileUpload.addEventListener('change', (e) => {
                selectedFiles = Array.from(e.target.files);
                if(selectedFiles.length > 0) {
                    uploadActions.style.display = 'block';
                }
            });
        }

        if(saveUpload) {
            saveUpload.addEventListener('click', async () => {
                if(selectedFiles.length === 0) return alert('Please select files first.');
                saveUpload.disabled = true;
                cancelUpload.disabled = true;
                uploadStatus.textContent = 'Uploading files...';
                await uploadSelectedFiles(selectedFiles);
                selectedFiles = [];
                fileUpload.value = '';
                uploadActions.style.display = 'none';
                await loadLibraryFiles();
                uploadStatus.textContent = 'Files uploaded and saved to cloud.';
                saveUpload.disabled = false;
                cancelUpload.disabled = false;
            });
        }

        if(cancelUpload) {
            cancelUpload.addEventListener('click', () => {
                selectedFiles = [];
                fileUpload.value = '';
                uploadActions.style.display = 'none';
            });
        }

        // Folder upload selection
        if(folderUpload) {
            folderUpload.addEventListener('change', (e) => {
                selectedFolderFiles = Array.from(e.target.files);
                if(selectedFolderFiles.length > 0) {
                    folderUploadActions.style.display = 'block';
                }
            });
        }

        if(saveFolderUpload) {
            saveFolderUpload.addEventListener('click', async () => {
                if(selectedFolderFiles.length === 0) return alert('Please select a folder first.');
                saveFolderUpload.disabled = true;
                cancelFolderUpload.disabled = true;
                folderUploadStatus.textContent = 'Uploading folder files...';
                await uploadSelectedFiles(selectedFolderFiles);
                selectedFolderFiles = [];
                folderUpload.value = '';
                folderUploadActions.style.display = 'none';
                await loadLibraryFiles();
                folderUploadStatus.textContent = 'Folder files uploaded and saved to cloud.';
                saveFolderUpload.disabled = false;
                cancelFolderUpload.disabled = false;
            });
        }

        if(cancelFolderUpload) {
            cancelFolderUpload.addEventListener('click', () => {
                selectedFolderFiles = [];
                folderUpload.value = '';
                folderUploadActions.style.display = 'none';
            });
        }

        async function uploadSelectedFiles(files) {
            if(!files || files.length === 0) {
                alert('No files selected to upload.');
                return;
            }

            const user = auth.currentUser;
            if(!user) return alert('Please log in first.');

            let successCount = 0;
            for(let file of files) {
                const filePath = file.webkitRelativePath || file.name;
                const storageRef = ref(storage, `users/${user.uid}/library/${filePath}`);
                try {
                    await uploadBytes(storageRef, file);
                    successCount++;
                } catch(error) {
                    console.error('Upload failed:', error);
                    alert('Upload failed for ' + file.name + ': ' + error.message);
                }
            }

            if(successCount > 0) {
                alert(`${successCount} file(s) uploaded successfully to cloud storage!`);
            }
        }

        function addFileToLists(filePath, url) {
            const fileName = filePath.split('/').pop();
            const fileExt = fileName.split('.').pop().toLowerCase();

            const li = document.createElement('li');
            li.innerHTML = `<i class="ri-file-line"></i> ${fileName}`;
            li.style.cursor = 'pointer';
            li.addEventListener('click', () => {
                if(fileExt === 'pdf') {
                    sessionStorage.setItem('pdfViewerUrl', url);
                    dashboardContent.innerHTML = getPdfViewerHTML();
                    setupPdfViewerInteractions();
                } else {
                    window.open(url, '_blank');
                }
            });

            // Add to all
            document.getElementById('all-file-list').appendChild(li.cloneNode(true));

            // Add to specific tabs
            if(fileExt === 'pdf') {
                document.getElementById('pdf-file-list').appendChild(li.cloneNode(true));
            } else if(['doc', 'docx'].includes(fileExt)) {
                document.getElementById('doc-file-list').appendChild(li.cloneNode(true));
            } else {
                document.getElementById('other-file-list').appendChild(li.cloneNode(true));
            }
        }

        async function loadLibraryFiles() {
            const user = auth.currentUser;
            if(!user) return;

            const libraryRef = ref(storage, `users/${user.uid}/library/`);
            try {
                const result = await listAll(libraryRef);
                const files = result.items;

                // Clear lists
                document.getElementById('all-file-list').innerHTML = '';
                document.getElementById('pdf-file-list').innerHTML = '';
                document.getElementById('doc-file-list').innerHTML = '';
                document.getElementById('other-file-list').innerHTML = '';

                for(let fileRef of files) {
                    const url = await getDownloadURL(fileRef);
                    const fileName = fileRef.name;
                    const fileExt = fileName.split('.').pop().toLowerCase();

                    const li = document.createElement('li');
                    li.innerHTML = `<i class="ri-file-line"></i> ${fileName}`;
                    li.style.cursor = 'pointer';
                    li.addEventListener('click', () => {
                        if(fileExt === 'pdf') {
                            sessionStorage.setItem('pdfViewerUrl', url);
                            dashboardContent.innerHTML = getPdfViewerHTML();
                            setupPdfViewerInteractions();
                        } else {
                            window.open(url, '_blank');
                        }
                    });

                    // Add to all
                    document.getElementById('all-file-list').appendChild(li.cloneNode(true));

                    // Add to specific tabs
                    if(fileExt === 'pdf') {
                        document.getElementById('pdf-file-list').appendChild(li.cloneNode(true));
                    } else if(['doc', 'docx'].includes(fileExt)) {
                        document.getElementById('doc-file-list').appendChild(li.cloneNode(true));
                    } else {
                        document.getElementById('other-file-list').appendChild(li.cloneNode(true));
                    }
                }
            } catch(error) {
                console.error('Error loading files:', error);
            }
        }
    }

    function setupPdfViewerInteractions() {
        // Set PDF.js worker
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        const backBtn = document.getElementById('pdf-viewer-back-btn');
        if(backBtn) {
            backBtn.addEventListener('click', () => {
                dashboardContent.innerHTML = getLibraryHTML();
                setupLibraryInteractions();
            });
        }

        // Load the PDF if url is stored
        const pdfUrl = sessionStorage.getItem('pdfViewerUrl');
        if(pdfUrl) {
            loadPdfInViewer(pdfUrl);
        }
    }

    function loadPdfInViewer(url) {
        const renderArea = document.getElementById('pdf-viewer-render-area');
        if(!renderArea) return;

        pdfjsLib.getDocument(url).promise.then(function(pdf) {
            renderArea.innerHTML = '<canvas id="pdf-canvas"></canvas>';
            const canvas = document.getElementById('pdf-canvas');
            const context = canvas.getContext('2d');

            pdf.getPage(1).then(function(page) {
                const viewport = page.getViewport({scale: 1.5});
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                const renderContext = {
                    canvasContext: context,
                    viewport: viewport
                };
                page.render(renderContext);
            });
        }).catch(function(error) {
            renderArea.innerHTML = '<div style="color: red;">Error loading PDF: ' + error.message + '</div>';
        });
    }

    function setupEditingInteractions() {
        const content = document.getElementById('dashboard-content');
        
        const e1 = document.getElementById('hub-edit-grammar');
        if(e1) {
            e1.removeEventListener('click', e1._grammarHandler);
            e1._grammarHandler = () => { 
                content.innerHTML = getGrammarHTML(); 
                setupGrammarInteractions(); 
            };
            e1.addEventListener('click', e1._grammarHandler);
        }
        
        const e2 = document.getElementById('hub-edit-plag-scan');
        if(e2) {
            e2.removeEventListener('click', e2._plagScanHandler);
            e2._plagScanHandler = () => { 
                content.innerHTML = getPlagScanHTML(); 
                setupPlagScanInteractions(); 
            };
            e2.addEventListener('click', e2._plagScanHandler);
        }
        
        const e3 = document.getElementById('hub-edit-plag-rem');
        if(e3) {
            e3.removeEventListener('click', e3._plagRemHandler);
            e3._plagRemHandler = () => { 
                content.innerHTML = getPlagRemHTML(); 
                setupPlagRemInteractions(); 
            };
            e3.addEventListener('click', e3._plagRemHandler);
        }
        
        const e4 = document.getElementById('hub-edit-para');
        if(e4) {
            e4.removeEventListener('click', e4._paraHandler);
            e4._paraHandler = () => { 
                content.innerHTML = getParaphraseHTML(); 
                setupParaphraseInteractions(); 
            };
            e4.addEventListener('click', e4._paraHandler);
        }
        
        const e5 = document.getElementById('hub-edit-ai-chk');
        if(e5) {
            e5.removeEventListener('click', e5._aiChkHandler);
            e5._aiChkHandler = () => { 
                content.innerHTML = getAiCheckHTML(); 
                setupAiCheckInteractions(); 
            };
            e5.addEventListener('click', e5._aiChkHandler);
        }
        
        const e6 = document.getElementById('hub-edit-reduce');
        if(e6) {
            e6.removeEventListener('click', e6._reduceHandler);
            e6._reduceHandler = () => { 
                content.innerHTML = getAiReduceHTML(); 
                setupAiReduceInteractions(); 
            };
            e6.addEventListener('click', e6._reduceHandler);
        }
    }

    setupDashboardInteractions();

});
