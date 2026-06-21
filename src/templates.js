import { escapeHtml, fmtDate, fmtDateTime, isOverdue } from "./utils.js";

/* ═══════════════════════════════════════════════════════
   AUTH & RULES SETUP TEMPLATES
   ═══════════════════════════════════════════════════════ */

export function getFirestoreSetupHTML(userEmail = "") {
  return `
    <div class="dashboard-header">
      <h2>Firebase permissions need setup</h2>
      <p>You are signed in${userEmail ? ` as ${escapeHtml(userEmail)}` : ""}, but Firestore blocked the app from reading or creating your profile.</p>
    </div>
    <div class="workflow-card glass-panel" style="max-width:760px; margin-top:20px;">
      <h3>What this means</h3>
      <p>Your Google/Firebase login is working. The database rules are still too strict for the new production collections.</p>
      <div class="inline-actions" style="margin-top:16px;">
        <button class="primary-btn" id="retry-profile-btn">Retry after rules update</button>
        <button class="secondary-btn" id="permission-signout-btn">Sign out</button>
      </div>
      <p style="margin-top:20px; font-size:0.9rem; color:var(--text-muted);">
        <strong>Ask your Firebase admin to allow:</strong> authenticated Kanchi University users to read/write their own <code>users/{uid}</code> profile, and role-scoped access to milestones, submissions, and meetings.
      </p>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════
   SCHOLAR TEMPLATES
   ═══════════════════════════════════════════════════════ */

export function getDashboardHTML(userProfile = {}) {
  const name = userProfile.displayName ? userProfile.displayName.split(" ")[0] : "Scholar";
  return `
    <div class="dashboard-header">
      <h2>Welcome back, ${escapeHtml(name)}! <span class="role-badge">Scholar</span></h2>
      <p>Here is an overview of your research progress synced from your cloud storage.</p>
    </div>

    <div class="stats-grid">
      <div class="stat-card glass-panel">
        <div class="stat-icon" style="background: rgba(99,102,241,0.2); color: #6366f1;">
          <i class="ri-folders-line"></i>
        </div>
        <div class="stat-info">
          <h3>Papers Uploaded</h3>
          <p class="stat-value" id="stats-papers-count">...</p>
          <span class="stat-sub">Safely stored in Cloud DB</span>
        </div>
      </div>

      <div class="stat-card glass-panel">
        <div class="stat-icon" style="background: rgba(236,72,153,0.2); color: var(--accent-secondary);">
          <i class="ri-article-line"></i>
        </div>
        <div class="stat-info">
          <h3>Submissions</h3>
          <p class="stat-value" id="stats-submissions-count">...</p>
          <span class="stat-sub">Sent to Supervisor</span>
        </div>
      </div>

      <div class="stat-card glass-panel progress-card">
        <div class="progress-info">
          <h3>Thesis Progress</h3>
          <p class="stat-sub" id="stats-progress-sub">Milestones Done</p>
        </div>
        <div class="circular-progress">
          <svg viewBox="0 0 36 36" class="circular-chart">
            <path class="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
            <path class="circle" id="stats-progress-circle" stroke-dasharray="0, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
            <text x="18" y="20.35" class="percentage" id="stats-progress-text">0%</text>
          </svg>
        </div>
      </div>
    </div>

    <div class="dashboard-bottom">
      <div class="recent-files glass-panel">
        <div class="panel-header">
          <h3>Recent Cloud Files</h3>
          <button class="btn-text" id="dash-view-library">View Library</button>
        </div>
        <ul class="file-list" id="dash-recent-files-list">
          <li style="color:var(--text-muted); font-size:0.9rem; justify-content:center;">Loading cloud files...</li>
        </ul>
      </div>

      <div class="quick-actions glass-panel">
        <div class="panel-header"><h3>AI Shortcuts</h3></div>
        <div class="action-buttons">
          <button class="action-btn" id="dash-upload-btn"><i class="ri-upload-cloud-2-line"></i> Upload to Cloud</button>
          <input type="file" id="dash-file-input" style="display:none;" accept=".pdf,.doc,.docx" />
          <button class="action-btn" id="dash-ask-parama-btn"><i class="ri-robot-line"></i> Ask Parama</button>
          <button class="action-btn" id="dash-editing-btn"><i class="ri-magic-line"></i> Open Editing Tools</button>
        </div>
      </div>
    </div>
  `;
}

export function getLiteratureHTML() {
  return `
    <div class="dashboard-header" style="margin-bottom:16px;">
      <h2>Literature & Ideas Engine</h2>
      <p>Select a tool below to synthesize literature, find gaps, and formulate problem statements.</p>
    </div>
    <div class="tool-grid">
      <div class="tool-card glass-panel" style="background: rgba(0,0,0,0.02); cursor:pointer;" id="hub-card-review">
        <i class="ri-book-read-line tool-icon text-blue"></i>
        <h3>Literature Review Generator</h3>
        <p>Upload PDFs to let AI synthesize related work.</p>
      </div>
      <div class="tool-card glass-panel" style="background: rgba(0,0,0,0.02); cursor:pointer;" id="hub-card-gap">
        <i class="ri-crosshair-2-line tool-icon text-purple"></i>
        <h3>Research Gap Finder</h3>
        <p>Analyze papers to highlight unexplored methodologies.</p>
      </div>
      <div class="tool-card glass-panel" style="background: rgba(0,0,0,0.02); cursor:pointer;" id="hub-card-problem">
        <i class="ri-edit-circle-line tool-icon text-green"></i>
        <h3>Problem Statement Formulator</h3>
        <p>Draft compelling problem statements using your own Word draft as context.</p>
      </div>
      <div class="tool-card glass-panel" style="background: rgba(0,0,0,0.02); cursor:pointer;" id="hub-card-publish">
        <i class="ri-global-line tool-icon text-pink"></i>
        <h3>Where to Publish?</h3>
        <p>Get AI suggestions for journals matching your abstract.</p>
      </div>
    </div>
  `;
}

export function getLitSubToolFrame(toolId, title, desc, historyLabel, inputsHTML) {
  return `
    <div class="dashboard-header" style="margin-bottom:16px; display:flex; justify-content:space-between; align-items:flex-start;">
      <div><h2>${title}</h2><p>${desc}</p></div>
      <button class="secondary-btn" id="lit-back-btn"><i class="ri-close-line"></i> Close Tab</button>
    </div>
    <div class="tool-layout">
      <div class="history-sidebar glass-panel" style="padding:20px;">
        <div class="panel-header" style="padding-bottom:10px; margin-bottom:10px;">
          <h3 style="font-size:1rem;">${historyLabel}</h3>
        </div>
        <div id="${toolId}-history-list" style="overflow-y:auto; flex-grow:1; padding-right:5px; display:flex; flex-direction:column; gap:6px;"></div>
      </div>
      <div class="main-tool-area glass-panel" style="padding:20px; overflow-y:auto;">
        ${inputsHTML}
        <div id="${toolId}-output-area" style="margin-top:24px; display:none;">
          <h3 style="margin-bottom:12px; border-bottom:1px solid rgba(0,0,0,0.1); padding-bottom:10px;">AI Output</h3>
          <div class="message ai-msg" id="${toolId}-output-content" style="white-space:pre-wrap; margin-top:10px; margin-bottom:15px; width:100%; max-width:100%;"></div>
          <div style="display:flex; justify-content:flex-end; gap:10px;">
            <button class="primary-btn" id="${toolId}-copy-btn" style="padding:8px 16px;">Copy Text</button>
            <button class="secondary-btn" id="${toolId}-download-btn" style="padding:8px 16px;">Download .doc</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function getLitReviewHTML() {
  return getLitSubToolFrame(
    "lit-review",
    "Literature Review Generator",
    "Upload multi-PDFs to let AI synthesize related work.",
    "Past Reviews",
    `
      <div class="upload-zone text-center" style="border:1px dashed rgba(0,0,0,0.2); padding:40px; border-radius:12px;">
        <i class="ri-file-pdf-line" style="font-size:3rem; color:var(--accent-secondary);"></i>
        <h3 style="margin:10px 0;">Upload Papers (.pdf)</h3>
        <input type="file" id="lit-review-file" accept=".pdf" multiple style="display:none;">
        <button class="primary-btn mt-10" onclick="document.getElementById('lit-review-file').click()">Select PDFs & Start</button>
      </div>
    `
  );
}

export function getResearchGapHTML() {
  return getLitSubToolFrame(
    "lit-gap",
    "Research Gap Finder",
    "Analyze papers to highlight unexplored methodologies (Max 10 papers).",
    "Gaps Found",
    `
      <div class="upload-zone text-center" style="border:1px dashed rgba(0,0,0,0.2); padding:40px; border-radius:12px;">
        <i class="ri-crosshair-2-line" style="font-size:3rem; color:var(--accent-secondary);"></i>
        <h3 style="margin:10px 0;">Upload Up To 10 Papers (.pdf)</h3>
        <input type="file" id="lit-gap-file" accept=".pdf" multiple style="display:none;">
        <button class="primary-btn mt-10" onclick="document.getElementById('lit-gap-file').click()">Upload & Analyze</button>
      </div>
    `
  );
}

export function getProblemStmtHTML() {
  return getLitSubToolFrame(
    "lit-problem",
    "Problem Statement Formulator",
    "Upload your Word draft (.docx) and let AI draft compelling problem statements.",
    "Saved Statements",
    `
      <div class="upload-zone text-center" style="border:1px dashed rgba(0,0,0,0.2); padding:40px; border-radius:12px;">
        <i class="ri-file-word-line" style="font-size:3rem; color:var(--accent-secondary);"></i>
        <h3 style="margin:10px 0;">Upload Your Ideas Draft (.docx)</h3>
        <input type="file" id="lit-problem-file" accept=".doc,.docx" style="display:none;">
        <button class="primary-btn mt-10" onclick="document.getElementById('lit-problem-file').click()">Read Doc & Draft Statement</button>
      </div>
    `
  );
}

export function getJournalFinderHTML() {
  return getLitSubToolFrame(
    "lit-publish",
    "Where to Publish?",
    "Paste your abstract to find top journals.",
    "Journal Results",
    `
      <div class="upload-zone text-center" style="border:1px dashed rgba(0,0,0,0.2); padding:40px; border-radius:12px;">
        <i class="ri-global-line" style="font-size:3rem; color:var(--accent-secondary);"></i>
        <h3 style="margin:10px 0;">Paste Your Abstract</h3>
        <textarea id="lit-publish-text" style="width:100%; height:150px; background:rgba(255,255,255,0.5); border:1px solid var(--glass-border); padding:15px; color:var(--text-main); border-radius:8px;" placeholder="Paste your abstract here..."></textarea>
        <button class="primary-btn mt-10" id="lit-publish-btn" style="width:100%;">Suggest Journals</button>
      </div>
    `
  );
}

export function getLibraryHTML() {
  return `
    <div class="dashboard-header" style="margin-bottom:16px;">
      <h2>Library</h2>
      <p>Upload and manage your research files and folders.</p>
    </div>

    <div class="upload-section glass-panel">
      <h3>Upload Files</h3>
      <input type="file" role="button" aria-label="Upload files" multiple id="file-upload" accept=".pdf,.doc,.docx,.txt,.md">
      <p>Select multiple files to upload to your cloud library.</p>
      <div id="upload-status" style="margin-top:10px; color:var(--text-main); font-size:0.95rem;"></div>
    </div>

    <div class="library-tabs glass-panel" style="padding:20px;">
      <div class="tab-buttons" style="margin-bottom:16px;">
        <button class="tab-btn active" data-tab="all">All Files</button>
        <button class="tab-btn" data-tab="pdfs">PDFs</button>
        <button class="tab-btn" data-tab="docs">Documents</button>
        <button class="tab-btn" data-tab="others">Others</button>
      </div>
      <div class="tab-content">
        <div id="all-files" class="file-list active"><ul id="all-file-list" class="file-list"></ul></div>
        <div id="pdf-files" class="file-list"><ul id="pdf-file-list" class="file-list"></ul></div>
        <div id="doc-files" class="file-list"><ul id="doc-file-list" class="file-list"></ul></div>
        <div id="other-files" class="file-list"><ul id="other-file-list" class="file-list"></ul></div>
      </div>
    </div>
  `;
}

export function getNotesHTML() {
  return `
    <div class="dashboard-header" style="margin-bottom:16px;">
      <h2>Notes & Equations Editor</h2>
      <p>Write your ideas seamlessly with interactive equation support.</p>
    </div>
    <div class="tool-layout">
      <div class="history-sidebar glass-panel" style="padding:20px;">
        <div class="panel-header" style="padding-bottom:10px; margin-bottom:10px;">
          <h3 style="font-size:1rem;">Saved Notes</h3>
        </div>
        <div id="notes-history-list" style="overflow-y:auto; flex-grow:1; padding-right:5px; display:flex; flex-direction:column; gap:6px;"></div>
      </div>
      <div class="main-tool-area">
        <div class="editor-layout">
          <div class="editor-panel glass-panel">
            <div class="editor-toolbar">
              <button id="editor-bold-btn"><i class="ri-bold"></i></button>
              <button id="editor-italic-btn"><i class="ri-italic"></i></button>
              <button id="editor-header-btn"><i class="ri-h-1"></i></button>
              <button id="editor-math-btn"><i class="ri-omega"></i> Insert Math</button>
            </div>
            <textarea id="notes-textarea" class="note-textarea" placeholder="Start typing your research notes... Use $$ for equations."></textarea>
            <div style="padding:15px; border-top: 1px solid var(--glass-border);">
              <button id="notes-save-btn" class="primary-btn">Save Notes</button>
            </div>
          </div>
          <div class="preview-panel glass-panel">
            <h3>Equation Preview</h3>
            <div class="equation-rendered" id="notes-math-preview">
              <p>Live LaTeX rendering enabled. Wrap equations in $$ (e.g. $$E=mc^2$$) to preview.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function getDraftHTML() {
  return `
    <div class="dashboard-header" style="margin-bottom:16px;">
      <h2>Thesis Draft Writing</h2>
      <p>Draft your thesis chapters with AI assistance.</p>
    </div>
    <div class="tool-layout">
      <div class="history-sidebar glass-panel" style="padding:20px;">
        <div class="panel-header" style="padding-bottom:10px; margin-bottom:10px;">
          <h3 style="font-size:1rem;">Saved Drafts</h3>
        </div>
        <div id="draft-history-list" style="overflow-y:auto; flex-grow:1; padding-right:5px; display:flex; flex-direction:column; gap:6px;"></div>
      </div>
      <div class="main-tool-area">
        <div class="editor-layout">
          <div class="editor-panel glass-panel" style="flex:2;">
            <div class="editor-toolbar">
              <button id="draft-bold-btn"><i class="ri-bold"></i></button>
              <button id="draft-italic-btn"><i class="ri-italic"></i></button>
              <button id="draft-underline-btn"><i class="ri-underline"></i></button>
            </div>
            <textarea id="draft-textarea" class="note-textarea" style="height:60vh;" placeholder="Begin writing your thesis draft here..."></textarea>
          </div>
          <div class="action-panel glass-panel" style="flex:1; display:flex; flex-direction:column; gap:15px; padding:20px;">
            <h3>AI Writing Assistant</h3>
            <button class="action-btn" id="draft-paraphrase-btn">Paraphrase Selection</button>
            <button class="action-btn" id="draft-expand-btn">Expand Selection</button>
            <button class="action-btn" id="draft-grammar-btn">Check Grammar</button>
            <hr style="border-color:var(--glass-border); margin:10px 0;">
            <div style="display:flex; flex-direction:column; gap:10px;">
              <button id="draft-save-btn" class="primary-btn" style="width:100%;">Save to Cloud</button>
              <button id="draft-submit-btn" class="secondary-btn" style="width:100%; border-color:var(--accent-primary); color:var(--accent-primary);">Submit to Supervisor</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function getLatexHTML() {
  return `
    <div class="dashboard-header" style="margin-bottom:16px;">
      <h2>Word to LaTeX Converter</h2>
      <p>Convert your .docx manuscripts into journal-ready LaTeX code instantly.</p>
    </div>
    <div class="tool-layout">
      <div class="history-sidebar glass-panel" style="padding:20px;">
        <div class="panel-header" style="padding-bottom:10px; margin-bottom:10px;">
          <h3 style="font-size:1rem;">Past Conversions</h3>
        </div>
        <div id="latex-history-list" style="overflow-y:auto; flex-grow:1; padding-right:5px; display:flex; flex-direction:column; gap:6px;"></div>
      </div>
      <div class="main-tool-area glass-panel" style="padding:20px; overflow-y:auto;">
        <div class="upload-zone text-center">
          <i class="ri-file-word-line" style="font-size:4rem; color:#3b82f6;"></i>
          <h3 style="margin-top:20px;">Upload your Word Document</h3>
          <p class="stat-sub" style="margin:10px 0 20px;">Supports .doc, .docx</p>
          <input type="file" id="latex-upload-file" accept=".doc,.docx" style="display:none;">
          <button class="primary-btn" onclick="document.getElementById('latex-upload-file').click()">Browse Files</button>
          <div id="latex-output-area" style="margin-top:24px; display:none; text-align:left;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <h3>Generated LaTeX</h3>
              <button class="primary-btn" id="latex-copy-btn" style="padding:6px 12px; font-size:0.85rem;">Copy Code</button>
            </div>
            <pre class="message ai-msg" id="latex-output-content" style="white-space:pre-wrap; font-family:monospace; padding:15px; background:rgba(0,0,0,0.05); max-width:100%; overflow-x:auto;"></pre>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function getEditingHTML() {
  return `
    <div class="dashboard-header" style="margin-bottom:16px;">
      <h2>AI Editing Tools Suite</h2>
      <p>Select a tool below to perfect your manuscript with our advanced AI agents.</p>
    </div>
    <div class="tool-grid">
      <div class="tool-card glass-panel" style="background:rgba(0,0,0,0.02); cursor:pointer;" id="hub-edit-grammar">
        <i class="ri-spellcheck tool-icon"></i><h3>Grammar Checker</h3><p>Fix grammatical errors and enhance clarity.</p>
      </div>
      <div class="tool-card glass-panel" style="background:rgba(0,0,0,0.02); cursor:pointer;" id="hub-edit-plag-scan">
        <i class="ri-file-shield-2-line tool-icon text-green"></i><h3>Plagiarism Checker</h3><p>Scan document for unoriginal content patterns.</p>
      </div>
      <div class="tool-card glass-panel" style="background:rgba(0,0,0,0.02); cursor:pointer;" id="hub-edit-plag-rem">
        <i class="ri-eraser-line tool-icon text-red"></i><h3>Plagiarism Remover</h3><p>Rewrite sections for originality.</p>
      </div>
      <div class="tool-card glass-panel" style="background:rgba(0,0,0,0.02); cursor:pointer;" id="hub-edit-para">
        <i class="ri-text-wrap tool-icon text-purple"></i><h3>Paraphrasing Tool</h3><p>Enhance flow and vocabulary.</p>
      </div>
      <div class="tool-card glass-panel" style="background:rgba(0,0,0,0.02); cursor:pointer;" id="hub-edit-ai-chk">
        <i class="ri-robot-2-line tool-icon text-blue"></i><h3>AI Checker</h3><p>Check likely AI-generated text.</p>
      </div>
      <div class="tool-card glass-panel" style="background:rgba(0,0,0,0.02); cursor:pointer;" id="hub-edit-reduce">
        <i class="ri-compress-right-line tool-icon text-pink"></i><h3>AI Reducer</h3><p>Summarize lengthy text.</p>
      </div>
    </div>
  `;
}

export function getEditSubToolFrame(toolId, title, desc, historyLabel, inputsHTML) {
  return `
    <div class="dashboard-header" style="margin-bottom:16px; display:flex; justify-content:space-between; align-items:flex-start;">
      <div><h2>${title}</h2><p>${desc}</p></div>
      <button class="secondary-btn" id="edit-back-btn"><i class="ri-arrow-left-line"></i> Back to Hub</button>
    </div>
    <div class="tool-layout">
      <div class="history-sidebar glass-panel" style="padding:20px;">
        <div class="panel-header" style="padding-bottom:10px; margin-bottom:10px;">
          <h3 style="font-size:1rem;">${historyLabel}</h3>
        </div>
        <div id="${toolId}-history-list" style="overflow-y:auto; flex-grow:1; padding-right:5px; display:flex; flex-direction:column; gap:6px;"></div>
      </div>
      <div class="main-tool-area glass-panel" style="padding:20px; overflow-y:auto;">
        ${inputsHTML}
        <div id="${toolId}-output-area" style="margin-top:24px; display:none;">
          <h3 style="margin-bottom:12px; border-bottom:1px solid rgba(0,0,0,0.1); padding-bottom:10px;">AI Result</h3>
          <div class="message ai-msg" id="${toolId}-output-content" style="white-space:pre-wrap; margin-top:10px; margin-bottom:15px; width:100%; max-width:100%;"></div>
          <div style="display:flex; justify-content:flex-end; gap:10px;">
            <button class="primary-btn" id="${toolId}-copy-btn" style="padding:6px 12px;">Copy Result</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function getGrammarHTML() {
  return getEditSubToolFrame(
    "edit-grammar",
    "Grammar Checker",
    "Paste text to check and fix grammatical errors.",
    "Past Checks",
    `
      <textarea id="edit-grammar-text" style="width:100%; height:200px; background:rgba(255,255,255,0.5); border:1px solid var(--glass-border); padding:15px; color:var(--text-main); border-radius:8px;" placeholder="Paste text here..."></textarea>
      <button class="primary-btn mt-10" id="edit-grammar-btn" style="width:100%;">Check Grammar</button>
    `
  );
}

export function getPlagScanHTML() {
  return getEditSubToolFrame(
    "edit-plag-scan",
    "Plagiarism Checker",
    "Paste text to scan for unoriginal content patterns.",
    "Past Scans",
    `
      <textarea id="edit-plag-scan-text" style="width:100%; height:200px; background:rgba(255,255,255,0.5); border:1px solid var(--glass-border); padding:15px; color:var(--text-main); border-radius:8px;" placeholder="Paste text here..."></textarea>
      <button class="primary-btn mt-10" id="edit-plag-scan-btn" style="width:100%;">Scan Document</button>
    `
  );
}

export function getPlagRemHTML() {
  return getEditSubToolFrame(
    "edit-plag-rem",
    "Plagiarism Remover",
    "Paste flagged text to rewrite for originality.",
    "Saved Rewrites",
    `
      <textarea id="edit-plag-rem-text" style="width:100%; height:200px; background:rgba(255,255,255,0.5); border:1px solid var(--glass-border); padding:15px; color:var(--text-main); border-radius:8px;" placeholder="Paste text here..."></textarea>
      <button class="primary-btn mt-10" id="edit-plag-rem-btn" style="width:100%;">Rewrite Text</button>
    `
  );
}

export function getParaphraseHTML() {
  return getEditSubToolFrame(
    "edit-para",
    "Paraphrasing Tool",
    "Enhance the flow and vocabulary of a section.",
    "Past Paraphrases",
    `
      <textarea id="edit-para-text" style="width:100%; height:200px; background:rgba(255,255,255,0.5); border:1px solid var(--glass-border); padding:15px; color:var(--text-main); border-radius:8px;" placeholder="Paste text here..."></textarea>
      <button class="primary-btn mt-10" id="edit-para-btn" style="width:100%;">Paraphrase Section</button>
    `
  );
}

export function getAiCheckHTML() {
  return getEditSubToolFrame(
    "edit-ai-chk",
    "AI Content Checker",
    "Check if a manuscript section was likely AI-generated.",
    "Past Checks",
    `
      <textarea id="edit-ai-chk-text" style="width:100%; height:200px; background:rgba(255,255,255,0.5); border:1px solid var(--glass-border); padding:15px; color:var(--text-main); border-radius:8px;" placeholder="Paste text here..."></textarea>
      <button class="primary-btn mt-10" id="edit-ai-chk-btn" style="width:100%;">Analyze AI Likelihood</button>
    `
  );
}

export function getAiReduceHTML() {
  return getEditSubToolFrame(
    "edit-reduce",
    "AI Reducer",
    "Summarize and condense lengthy text.",
    "Past Summaries",
    `
      <textarea id="edit-reduce-text" style="width:100%; height:200px; background:rgba(255,255,255,0.5); border:1px solid var(--glass-border); padding:15px; color:var(--text-main); border-radius:8px;" placeholder="Paste lengthy text here..."></textarea>
      <button class="primary-btn mt-10" id="edit-reduce-btn" style="width:100%;">Summarize Text</button>
    `
  );
}

export function getChatPdfHTML() {
  return `
    <div class="dashboard-header" style="margin-bottom:16px;">
      <h2>Chat with PDF</h2>
      <p>Upload a document and interact with it intelligently.</p>
    </div>
    <div class="tool-layout">
      <div class="history-sidebar glass-panel" style="padding:20px;">
        <div class="panel-header" style="padding-bottom:10px; margin-bottom:10px;">
          <h3 style="font-size:1rem;">Past Documents</h3>
        </div>
        <div id="chatpdf-history-list" style="overflow-y:auto; flex-grow:1; padding-right:5px; display:flex; flex-direction:column; gap:6px;"></div>
      </div>
      <div class="main-tool-area">
        <div class="split-view">
          <div class="pdf-viewer glass-panel" style="display:flex; flex-direction:column;">
            <div class="panel-header" style="flex-shrink:0; padding:15px 20px;">
              <h3>PDF Viewer</h3>
              <input type="file" id="pdf-upload-input" accept=".pdf" style="display:none;">
              <button class="icon-btn" id="pdf-upload-btn" title="Upload PDF"><i class="ri-upload-cloud-2-line"></i></button>
            </div>
            <div class="mock-pdf" id="pdf-render-area" style="flex-grow:1; display:flex; padding:0; background: #eaecf0; min-height: 400px;">
              <div style="margin:auto; color:var(--text-muted); padding:20px; text-align:center;">
                <i class="ri-file-pdf-line" style="font-size:2.5rem; display:block; margin-bottom:8px; color:#98a2b3;"></i>
                Please upload a PDF to interact with it.
              </div>
            </div>
          </div>

          <div class="chat-interface glass-panel">
            <div class="chat-messages" id="pdf-chat-messages" style="overflow-y:auto;">
              <div class="message ai-msg">Upload a PDF using the cloud button to get started!</div>
            </div>
            <div class="chat-input-area">
              <input type="text" id="pdf-chat-input" placeholder="Ask about this paper...">
              <button class="send-btn" id="pdf-chat-send-btn"><i class="ri-send-plane-fill"></i></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function getParuHTML() {
  return `
    <div class="dashboard-header" style="margin-bottom:16px;">
      <h2>Paru 🌟 - Advanced Multi-Role AI</h2>
      <p>Creator, Author, Researcher, and Helper. Powered by advanced reasoning.</p>
    </div>
    <div class="paru-layout" style="display: grid; grid-template-columns: 260px 1fr; gap: 24px; height: 70vh;">
      <div class="history-sidebar glass-panel" style="padding:20px;">
        <div class="panel-header" style="padding-bottom:10px; margin-bottom:10px;">
          <h3 style="font-size:1rem;">Chat History</h3>
          <button class="icon-btn" id="new-paru-chat" title="New Chat"><i class="ri-add-line"></i></button>
        </div>
        <div id="paru-history-list" style="overflow-y:auto; flex-grow:1; padding-right:5px; display:flex; flex-direction:column; gap:6px;">
          <div style="text-align:center; padding:20px 0; color:var(--text-muted); font-size:0.8rem;">Loading history...</div>
        </div>
      </div>
      <div class="chat-interface glass-panel" style="display:flex; flex-direction:column; overflow:hidden;">
        <div class="chatbot-header" style="padding:12px 20px; background:rgba(0,0,0,0.03);">
          <div>
            <h3 style="margin-bottom:0;">Paaru 🌟</h3>
            <p class="stat-sub" style="margin-top:2px; color:#1d4ed8;">Advanced Mode Active</p>
          </div>
        </div>
        <div class="chat-messages" id="paru-chat-messages" style="flex-grow:1; overflow-y:auto; padding:20px;">
          <div class="message ai-msg">Welcome! I am Paru, your advanced AI research partner. What shall we explore today?</div>
        </div>
        <div class="chat-input-area">
          <input type="text" id="paru-chat-input" placeholder="Ask Paru for deep analysis or creative writing...">
          <button class="send-btn" id="paru-send-btn"><i class="ri-send-plane-fill"></i></button>
        </div>
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════
   SUPERVISOR TEMPLATES
   ═══════════════════════════════════════════════════════ */

export function getSupervisorDashboardHTML(userProfile = {}) {
  const name = userProfile.displayName ? userProfile.displayName.split(" ")[0] : "Supervisor";
  return `
    <div class="dashboard-header">
      <h2>Welcome back, ${escapeHtml(name)}! <span class="role-badge" style="background:rgba(99,102,241,0.15); color:#4f46e5;">Supervisor</span></h2>
      <p>Track your scholars' thesis submissions, upcoming milestones, and schedule appointments.</p>
    </div>

    <div class="stats-grid">
      <div class="stat-card glass-panel">
        <div class="stat-icon" style="background: rgba(99,102,241,0.15); color: #4f46e5;">
          <i class="ri-group-line"></i>
        </div>
        <div class="stat-info">
          <h3>My Scholars</h3>
          <p class="stat-value" id="sup-stats-scholars">...</p>
          <span class="stat-sub">Assigned to review</span>
        </div>
      </div>

      <div class="stat-card glass-panel">
        <div class="stat-icon" style="background: rgba(202,138,4,0.15); color: #854d0e;">
          <i class="ri-file-shield-line"></i>
        </div>
        <div class="stat-info">
          <h3>Pending Submissions</h3>
          <p class="stat-value" id="sup-stats-submissions">...</p>
          <span class="stat-sub">Require feedback</span>
        </div>
      </div>

      <div class="stat-card glass-panel">
        <div class="stat-icon" style="background: rgba(22,101,52,0.13); color: #166534;">
          <i class="ri-calendar-todo-line"></i>
        </div>
        <div class="stat-info">
          <h3>Meeting Requests</h3>
          <p class="stat-value" id="sup-stats-meetings">...</p>
          <span class="stat-sub">Pending approval</span>
        </div>
      </div>
    </div>

    <div class="supervisor-shell">
      <div class="workflow-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap:24px;">
        
        <!-- Scholars Section -->
        <div class="glass-panel" style="padding:20px; display:flex; flex-direction:column; min-height:300px;">
          <div class="panel-header" style="margin-bottom:15px; padding-bottom:10px;">
            <h3>My Assigned Scholars</h3>
          </div>
          <div id="sup-scholars-list" style="flex-grow:1; display:flex; flex-direction:column; gap:10px;">
            <p style="color:var(--text-muted); font-size:0.9rem; text-align:center; margin:auto;">Loading scholars...</p>
          </div>
        </div>

        <!-- Meeting Requests Section -->
        <div class="glass-panel" style="padding:20px; display:flex; flex-direction:column; min-height:300px;">
          <div class="panel-header" style="margin-bottom:15px; padding-bottom:10px;">
            <h3>Pending Meeting Requests</h3>
          </div>
          <div id="sup-meetings-list" style="flex-grow:1; display:flex; flex-direction:column; gap:10px; overflow-y:auto; max-height:400px;">
            <p style="color:var(--text-muted); font-size:0.9rem; text-align:center; margin:auto;">Loading meetings...</p>
          </div>
        </div>

      </div>

      <!-- Thesis Submissions Section -->
      <div class="glass-panel" style="padding:20px; margin-top:24px;">
        <div class="panel-header" style="margin-bottom:15px; padding-bottom:10px;">
          <h3>Submissions Pending Review</h3>
        </div>
        <div id="sup-submissions-list" style="display:flex; flex-direction:column; gap:15px;">
          <p style="color:var(--text-muted); font-size:0.9rem; text-align:center; padding:20px;">Loading submissions...</p>
        </div>
      </div>

    </div>
  `;
}

export function getScholarsViewHTML() {
  return `
    <div class="dashboard-header">
      <h2>Scholars & Milestone Progress</h2>
      <p>Assign tasks, set due dates, and track thesis completion percentage.</p>
    </div>
    <div class="tool-layout">
      <!-- Scholars Sidebar -->
      <div class="history-sidebar glass-panel" style="padding:20px;">
        <div class="panel-header" style="padding-bottom:10px; margin-bottom:10px;">
          <h3 style="font-size:1rem;">Scholars</h3>
        </div>
        <div id="scholar-select-list" style="overflow-y:auto; flex-grow:1; display:flex; flex-direction:column; gap:6px;">
          <p style="color:var(--text-muted); font-size:0.85rem; text-align:center; padding-top:20px;">Loading list...</p>
        </div>
      </div>
      <!-- Scholar Details and Milestones -->
      <div class="main-tool-area glass-panel" style="padding:20px; overflow-y:auto;" id="scholar-details-container">
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:var(--text-muted);">
          <i class="ri-user-search-line" style="font-size:3rem; margin-bottom:12px;"></i>
          <p>Select a scholar from the sidebar to view milestones and manage progress.</p>
        </div>
      </div>
    </div>
  `;
}

export function getScholarMilestoneDetailsHTML(scholarProfile, milestones = []) {
  const completedCount = milestones.filter(m => m.status === "completed").length;
  const progressPercent = milestones.length ? Math.round((completedCount / milestones.length) * 100) : 0;
  
  let milestoneRows = "";
  if (milestones.length === 0) {
    milestoneRows = `<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-muted);">No milestones set yet.</td></tr>`;
  } else {
    milestones.forEach(m => {
      const isOver = isOverdue(m.dueDate, m.status);
      const overdueBadge = isOver ? `<span class="status-pill rejected" style="margin-left:8px; font-size:0.65rem; padding:2px 6px;">Overdue</span>` : "";
      
      let statusClass = "pending";
      if (m.status === "completed") statusClass = "done";
      else if (m.status === "in_progress") statusClass = "approved";
      else if (m.status === "submitted" || m.status === "needs_revision") statusClass = "review";

      milestoneRows += `
        <tr data-milestone-id="${m.id}">
          <td style="padding:12px; font-weight:600;">${escapeHtml(m.title)}</td>
          <td style="padding:12px;">${fmtDate(m.dueDate)}${overdueBadge}</td>
          <td style="padding:12px;">
            <span class="status-pill ${statusClass}">${escapeHtml(m.status.replace("_", " "))}</span>
          </td>
          <td style="padding:12px;">
            <select class="milestone-status-select" style="padding:6px 10px; border-radius:6px; border:1px solid var(--glass-border); outline:none;">
              <option value="pending" ${m.status === "pending" ? "selected" : ""}>Pending</option>
              <option value="in_progress" ${m.status === "in_progress" ? "selected" : ""}>In Progress</option>
              <option value="needs_revision" ${m.status === "needs_revision" ? "selected" : ""}>Needs Revision</option>
              <option value="completed" ${m.status === "completed" ? "selected" : ""}>Completed</option>
            </select>
          </td>
        </tr>
      `;
    });
  }

  return `
    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--glass-border); padding-bottom:15px; margin-bottom:20px;">
      <div>
        <h2 style="margin:0; font-size:1.4rem;">${escapeHtml(scholarProfile.displayName)}</h2>
        <p style="color:var(--text-muted); font-size:0.85rem; margin-top:4px;">${escapeHtml(scholarProfile.email)} | ${escapeHtml(scholarProfile.department || "No Department")}</p>
      </div>
      <div style="display:flex; align-items:center; gap:15px;">
        <div style="text-align:right;">
          <div style="font-size:0.8rem; color:var(--text-muted);">Thesis Completion</div>
          <div style="font-weight:700; font-size:1.15rem; color:var(--accent-primary);">${progressPercent}%</div>
        </div>
        <button class="primary-btn" id="sup-add-milestone-btn" style="padding:8px 16px;"><i class="ri-add-line"></i> Add Milestone</button>
      </div>
    </div>

    <h3>Milestone Checklist</h3>
    <table style="width:100%; border-collapse:collapse; margin-top:12px; text-align:left;">
      <thead>
        <tr style="border-bottom:2px solid var(--glass-border); font-size:0.9rem; color:var(--text-muted);">
          <th style="padding:10px 12px;">Milestone Title</th>
          <th style="padding:10px 12px;">Due Date</th>
          <th style="padding:10px 12px;">Current Status</th>
          <th style="padding:10px 12px;">Update Status</th>
        </tr>
      </thead>
      <tbody id="sup-milestones-tbody">
        ${milestoneRows}
      </tbody>
    </table>

    <!-- Add Milestone Modal (Inline Mock) -->
    <div id="add-milestone-form-container" style="display:none; margin-top:24px; padding:20px; border-radius:10px; background:rgba(0,0,0,0.02); border:1px solid var(--glass-border);">
      <h3 style="margin-bottom:12px;">Create New Milestone</h3>
      <div class="form-grid">
        <div>
          <label style="font-size:0.85rem; font-weight:600; display:block; margin-bottom:6px;">Milestone Title</label>
          <input type="text" id="new-milestone-title" placeholder="e.g., Chapter 3 Draft Review" />
        </div>
        <div>
          <label style="font-size:0.85rem; font-weight:600; display:block; margin-bottom:6px;">Due Date</label>
          <input type="date" id="new-milestone-due" />
        </div>
        <div>
          <label style="font-size:0.85rem; font-weight:600; display:block; margin-bottom:6px;">Notes/Instructions</label>
          <textarea id="new-milestone-note" placeholder="Write any specific notes or requirements..."></textarea>
        </div>
        <div class="inline-actions" style="margin-top:12px;">
          <button class="primary-btn" id="save-milestone-btn">Add Milestone</button>
          <button class="secondary-btn" id="cancel-milestone-btn">Cancel</button>
        </div>
      </div>
    </div>
  `;
}
