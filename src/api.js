/**
 * api.js — ImRa Research Assistant
 * Express router handling all AI, PDF, and tool history endpoints.
 * Mount this in server.js with: app.use("/api", require("./src/api"));
 */

const express = require("express");
const router = express.Router();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { admin, db, bucket } = require("./firebase-admin");

/* -------------------------------------------------------
   Gemini AI Setup
------------------------------------------------------- */
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const INSTITUTE_DOMAIN = "kanchiuniv.ac.in";

function isInstituteEmail(email = "") {
  return email.toLowerCase().endsWith(`@${INSTITUTE_DOMAIN}`);
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    return res.status(401).json({ error: "Missing Firebase ID token." });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    if (!isInstituteEmail(decoded.email || "")) {
      return res.status(403).json({ error: "Use your Kanchi University email account." });
    }
    req.user = decoded;
    next();
  } catch (error) {
    console.error("[auth] token verification failed:", error.message);
    res.status(401).json({ error: "Invalid or expired Firebase ID token." });
  }
}

function serializeDoc(docSnap) {
  if (!docSnap.exists) return null;
  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    role: typeof data.role === "string" ? data.role.toLowerCase() : data.role,
  };
}

function cleanObject(input = {}) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  );
}

async function getUserProfile(uid) {
  const snap = await db.collection("users").doc(uid).get();
  return serializeDoc(snap);
}

async function requireProfile(req, res, next) {
  try {
    const profile = await getUserProfile(req.user.uid);
    if (!profile) {
      return res.status(404).json({ error: "Profile not found." });
    }
    req.profile = profile;
    next();
  } catch (error) {
    console.error("[profile] load failed:", error.message);
    res.status(500).json({ error: "Failed to load profile." });
  }
}

function canAccessScholar(profile, scholarId) {
  return (
    profile.uid === scholarId ||
    profile.id === scholarId ||
    (profile.role === "supervisor" && !!scholarId)
  );
}

/* -------------------------------------------------------
   Helper: call Gemini with a plain text prompt
------------------------------------------------------- */
async function callGemini(prompt) {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error("GOOGLE_API_KEY is not configured on the server.");
  }
  const result = await model.generateContent(prompt);
  return result.response.text();
}

/* -------------------------------------------------------
   Helper: validate required body fields
   Returns true if all fields are present and non-empty.
------------------------------------------------------- */
function requireFields(res, body, fields) {
  for (const field of fields) {
    if (!body[field] || !String(body[field]).trim()) {
      res.status(400).json({ error: `Missing required field: ${field}` });
      return false;
    }
  }
  return true;
}

/* ═══════════════════════════════════════════════════════
   HEALTH CHECK
═══════════════════════════════════════════════════════ */

/**
 * GET /api/health
 * Quick liveness check.
 */
router.get("/health", (req, res) => {
  res.json({
    ok: true,
    message: "ImRa API is running",
    timestamp: new Date().toISOString(),
  });
});

/* -------------------------------------------------------
   AUTHENTICATED FIRESTORE ROUTES
------------------------------------------------------- */

router.get("/me", requireAuth, async (req, res) => {
  try {
    const profile = await getUserProfile(req.user.uid);
    res.json({ profile });
  } catch (error) {
    console.error("[GET /api/me] Error:", error.message);
    res.status(500).json({ error: "Failed to load profile." });
  }
});

router.put("/me", requireAuth, async (req, res) => {
  try {
    const existing = await getUserProfile(req.user.uid);
    const role = existing?.role || (req.body.role === "supervisor" ? "supervisor" : "scholar");
    const payload = cleanObject({
      uid: req.user.uid,
      email: req.user.email,
      displayName: req.body.displayName || req.user.name || req.user.email.split("@")[0],
      photoURL: req.body.photoURL || req.user.picture || "",
      role,
      department: req.body.department || existing?.department || "",
      supervisorId: req.body.supervisorId || existing?.supervisorId || "",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: existing?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection("users").doc(req.user.uid).set(payload, { merge: true });
    const profile = await getUserProfile(req.user.uid);
    res.json({ profile });
  } catch (error) {
    console.error("[PUT /api/me] Error:", error.message);
    res.status(500).json({ error: "Failed to save profile." });
  }
});

router.get("/supervisors", requireAuth, async (req, res) => {
  try {
    const snap = await db.collection("users").get();
    const supervisors = snap.docs
      .map(serializeDoc)
      .filter((profile) => profile?.role === "supervisor");
    res.json({ supervisors });
  } catch (error) {
    console.error("[GET /api/supervisors] Error:", error.message);
    res.status(500).json({ error: "Failed to load supervisors." });
  }
});

router.get("/supervisor/scholars", requireAuth, requireProfile, async (req, res) => {
  if (req.profile.role !== "supervisor") {
    return res.status(403).json({ error: "Supervisor access required." });
  }

  try {
    const snap = await db
      .collection("users")
      .where("role", "==", "scholar")
      .where("supervisorId", "==", req.user.uid)
      .get();
    res.json({ scholars: snap.docs.map(serializeDoc) });
  } catch (error) {
    console.error("[GET /api/supervisor/scholars] Error:", error.message);
    res.status(500).json({ error: "Failed to load scholars." });
  }
});

router.post("/supervisor-requests", requireAuth, requireProfile, async (req, res) => {
  if (req.profile.role !== "scholar") {
    return res.status(403).json({ error: "Only scholars can request supervisors." });
  }
  if (!requireFields(res, req.body, ["supervisorEmail"])) return;

  const supervisorEmail = String(req.body.supervisorEmail).trim().toLowerCase();
  if (!isInstituteEmail(supervisorEmail)) {
    return res.status(400).json({ error: "Supervisor email must be a Kanchi University email." });
  }

  try {
    const supervisorSnap = await db
      .collection("users")
      .where("email", "==", supervisorEmail)
      .limit(1)
      .get();

    if (supervisorSnap.empty) {
      return res.status(404).json({ error: "No supervisor account found with that email." });
    }

    const supervisor = serializeDoc(supervisorSnap.docs[0]);
    if (supervisor.role !== "supervisor") {
      return res.status(404).json({ error: "No supervisor account found with that email." });
    }
    const existingSnap = await db
      .collection("supervisorRequests")
      .where("scholarId", "==", req.user.uid)
      .where("supervisorId", "==", supervisor.uid || supervisor.id)
      .where("status", "==", "pending")
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      return res.json({ id: existingSnap.docs[0].id, status: "pending" });
    }

    const payload = {
      scholarId: req.user.uid,
      scholarEmail: req.user.email,
      scholarName: req.profile.displayName || req.user.name || req.user.email,
      supervisorId: supervisor.uid || supervisor.id,
      supervisorEmail,
      supervisorName: supervisor.displayName || supervisorEmail,
      department: req.body.department || req.profile.department || "",
      message: req.body.message || "",
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const ref = await db.collection("supervisorRequests").add(payload);
    res.status(201).json({ id: ref.id, request: { id: ref.id, ...payload } });
  } catch (error) {
    console.error("[POST /api/supervisor-requests] Error:", error.message);
    res.status(500).json({ error: "Failed to send supervisor request." });
  }
});

router.get("/supervisor-requests", requireAuth, requireProfile, async (req, res) => {
  try {
    let q = db.collection("supervisorRequests");
    if (req.profile.role === "supervisor") {
      q = q.where("supervisorId", "==", req.user.uid);
    } else {
      q = q.where("scholarId", "==", req.user.uid);
    }
    const snap = await q.get();
    const requests = snap.docs
      .map(serializeDoc)
      .sort((a, b) => (b.createdAt?._seconds || 0) - (a.createdAt?._seconds || 0));
    res.json({ requests });
  } catch (error) {
    console.error("[GET /api/supervisor-requests] Error:", error.message);
    res.status(500).json({ error: "Failed to load supervisor requests." });
  }
});

router.patch("/supervisor-requests/:id", requireAuth, requireProfile, async (req, res) => {
  if (req.profile.role !== "supervisor") {
    return res.status(403).json({ error: "Supervisor access required." });
  }

  const status = req.body.status;
  if (!["accepted", "rejected"].includes(status)) {
    return res.status(400).json({ error: "Status must be accepted or rejected." });
  }

  try {
    const ref = db.collection("supervisorRequests").doc(req.params.id);
    const snap = await ref.get();
    const request = serializeDoc(snap);
    if (!request) return res.status(404).json({ error: "Request not found." });
    if (request.supervisorId !== req.user.uid) {
      return res.status(403).json({ error: "Not allowed to update this request." });
    }

    await ref.update({
      status,
      responseNote: req.body.responseNote || "",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (status === "accepted") {
      await db.collection("users").doc(request.scholarId).set(
        {
          supervisorId: req.user.uid,
          department: request.department || "",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("[PATCH /api/supervisor-requests/:id] Error:", error.message);
    res.status(500).json({ error: "Failed to update supervisor request." });
  }
});

router.get("/files", requireAuth, async (req, res) => {
  try {
    const snap = await db
      .collection("users")
      .doc(req.user.uid)
      .collection("files")
      .get();
    const files = await Promise.all(
      snap.docs.map(async (docSnap) => {
        const data = docSnap.data();
        let url = data.url || "";
        if (data.storagePath) {
          try {
            const [signedUrl] = await bucket.file(data.storagePath).getSignedUrl({
              action: "read",
              expires: "2030-01-01",
            });
            url = signedUrl;
          } catch (error) {
            console.warn("[files] signed URL failed:", error.message);
          }
        }
        return { id: docSnap.id, ...data, url };
      })
    );
    files.sort((a, b) => (b.uploadedAt?._seconds || 0) - (a.uploadedAt?._seconds || 0));
    res.json({ files });
  } catch (error) {
    console.error("[GET /api/files] Error:", error.message);
    res.status(500).json({ error: "Failed to load files." });
  }
});

router.post("/files/upload", requireAuth, async (req, res) => {
  if (!requireFields(res, req.body, ["name", "contentBase64"])) return;

  try {
    const buffer = Buffer.from(req.body.contentBase64, "base64");
    const maxBytes = 8 * 1024 * 1024;
    if (buffer.length > maxBytes) {
      return res.status(400).json({ error: "File too large. Maximum size is 8 MB." });
    }

    const safeName = String(req.body.name).replace(/[\\/:*?"<>|]/g, "_");
    const storagePath = `users/${req.user.uid}/uploads/${Date.now()}-${safeName}`;
    const file = bucket.file(storagePath);
    await file.save(buffer, {
      metadata: {
        contentType: req.body.type || "application/octet-stream",
        metadata: {
          owner: req.user.uid,
          originalName: safeName,
        },
      },
      resumable: false,
    });

    const metadata = {
      name: safeName,
      size: buffer.length,
      type: req.body.type || "",
      storagePath,
      uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const ref = await db
      .collection("users")
      .doc(req.user.uid)
      .collection("files")
      .add(metadata);

    const [url] = await file.getSignedUrl({ action: "read", expires: "2030-01-01" });
    res.status(201).json({ id: ref.id, file: { id: ref.id, ...metadata, url } });
  } catch (error) {
    console.error("[POST /api/files/upload] Error:", error.message);
    res.status(500).json({ error: "Failed to upload file." });
  }
});

router.get("/milestones", requireAuth, requireProfile, async (req, res) => {
  try {
    let q = db.collection("milestones");
    if (req.query.scholarId) {
      if (!canAccessScholar(req.profile, req.query.scholarId)) {
        return res.status(403).json({ error: "Not allowed to view this scholar." });
      }
      q = q.where("scholarId", "==", req.query.scholarId);
    } else if (req.profile.role === "supervisor") {
      q = q.where("supervisorId", "==", req.user.uid);
    } else {
      q = q.where("scholarId", "==", req.user.uid);
    }
    const snap = await q.get();
    const milestones = snap.docs
      .map(serializeDoc)
      .sort((a, b) => String(a.dueDate || "").localeCompare(String(b.dueDate || "")));
    res.json({ milestones });
  } catch (error) {
    console.error("[GET /api/milestones] Error:", error.message);
    res.status(500).json({ error: "Failed to load milestones." });
  }
});

router.post("/milestones", requireAuth, requireProfile, async (req, res) => {
  if (req.profile.role !== "supervisor") {
    return res.status(403).json({ error: "Only supervisors can create milestones." });
  }

  if (!requireFields(res, req.body, ["scholarId", "title", "dueDate"])) return;

  try {
    const payload = cleanObject({
      scholarId: req.body.scholarId,
      supervisorId: req.user.uid,
      title: req.body.title,
      dueDate: req.body.dueDate,
      status: req.body.status || "pending",
      note: req.body.note || "",
      supervisorNote: req.body.supervisorNote || "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const ref = await db.collection("milestones").add(payload);
    res.status(201).json({ id: ref.id, milestone: { id: ref.id, ...payload } });
  } catch (error) {
    console.error("[POST /api/milestones] Error:", error.message);
    res.status(500).json({ error: "Failed to create milestone." });
  }
});

router.patch("/milestones/:id", requireAuth, requireProfile, async (req, res) => {
  try {
    const ref = db.collection("milestones").doc(req.params.id);
    const snap = await ref.get();
    const milestone = serializeDoc(snap);
    if (!milestone) return res.status(404).json({ error: "Milestone not found." });

    const allowed =
      req.profile.role === "supervisor"
        ? milestone.supervisorId === req.user.uid
        : milestone.scholarId === req.user.uid;
    if (!allowed) return res.status(403).json({ error: "Not allowed to update milestone." });

    const payload = cleanObject({
      status: req.body.status,
      note: req.body.note,
      supervisorNote: req.body.supervisorNote,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await ref.update(payload);
    res.json({ ok: true });
  } catch (error) {
    console.error("[PATCH /api/milestones/:id] Error:", error.message);
    res.status(500).json({ error: "Failed to update milestone." });
  }
});

router.get("/submissions", requireAuth, requireProfile, async (req, res) => {
  try {
    let q = db.collection("submissions");
    if (req.profile.role === "supervisor") {
      q = q.where("supervisorId", "==", req.user.uid);
    } else {
      q = q.where("scholarId", "==", req.user.uid);
    }
    const snap = await q.get();
    const submissions = snap.docs
      .map(serializeDoc)
      .sort((a, b) => (b.createdAt?._seconds || 0) - (a.createdAt?._seconds || 0));
    res.json({ submissions });
  } catch (error) {
    console.error("[GET /api/submissions] Error:", error.message);
    res.status(500).json({ error: "Failed to load submissions." });
  }
});

router.post("/submissions", requireAuth, requireProfile, async (req, res) => {
  if (!requireFields(res, req.body, ["title", "type", "content"])) return;

  try {
    const payload = cleanObject({
      scholarId: req.user.uid,
      supervisorId: req.profile.supervisorId || req.body.supervisorId || "",
      type: req.body.type,
      title: req.body.title,
      content: req.body.content,
      status: "pending_review",
      feedback: "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const ref = await db.collection("submissions").add(payload);
    res.status(201).json({ id: ref.id, submission: { id: ref.id, ...payload } });
  } catch (error) {
    console.error("[POST /api/submissions] Error:", error.message);
    res.status(500).json({ error: "Failed to create submission." });
  }
});

router.patch("/submissions/:id/feedback", requireAuth, requireProfile, async (req, res) => {
  if (req.profile.role !== "supervisor") {
    return res.status(403).json({ error: "Supervisor access required." });
  }
  if (!requireFields(res, req.body, ["feedback"])) return;

  try {
    const ref = db.collection("submissions").doc(req.params.id);
    const snap = await ref.get();
    const submission = serializeDoc(snap);
    if (!submission) return res.status(404).json({ error: "Submission not found." });
    if (submission.supervisorId !== req.user.uid) {
      return res.status(403).json({ error: "Not allowed to review this submission." });
    }
    await ref.update({
      feedback: req.body.feedback,
      status: "reviewed",
      reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ ok: true });
  } catch (error) {
    console.error("[PATCH /api/submissions/:id/feedback] Error:", error.message);
    res.status(500).json({ error: "Failed to save feedback." });
  }
});

router.get("/meetings", requireAuth, requireProfile, async (req, res) => {
  try {
    let q = db.collection("meetings");
    if (req.profile.role === "supervisor") {
      q = q.where("supervisorId", "==", req.user.uid);
    } else {
      q = q.where("scholarId", "==", req.user.uid);
    }
    const snap = await q.get();
    const meetings = snap.docs
      .map(serializeDoc)
      .sort((a, b) => (b.createdAt?._seconds || 0) - (a.createdAt?._seconds || 0));
    res.json({ meetings });
  } catch (error) {
    console.error("[GET /api/meetings] Error:", error.message);
    res.status(500).json({ error: "Failed to load meetings." });
  }
});

router.post("/meetings", requireAuth, requireProfile, async (req, res) => {
  if (!requireFields(res, req.body, ["requestedDate", "requestedTime", "agenda"])) return;

  try {
    const payload = cleanObject({
      scholarId: req.user.uid,
      supervisorId: req.profile.supervisorId || req.body.supervisorId || "",
      requestedDate: req.body.requestedDate,
      requestedTime: req.body.requestedTime,
      agenda: req.body.agenda,
      status: "pending",
      supervisorNote: "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const ref = await db.collection("meetings").add(payload);
    res.status(201).json({ id: ref.id, meeting: { id: ref.id, ...payload } });
  } catch (error) {
    console.error("[POST /api/meetings] Error:", error.message);
    res.status(500).json({ error: "Failed to request meeting." });
  }
});

router.patch("/meetings/:id/respond", requireAuth, requireProfile, async (req, res) => {
  if (req.profile.role !== "supervisor") {
    return res.status(403).json({ error: "Supervisor access required." });
  }
  if (!requireFields(res, req.body, ["status"])) return;

  try {
    const ref = db.collection("meetings").doc(req.params.id);
    const snap = await ref.get();
    const meeting = serializeDoc(snap);
    if (!meeting) return res.status(404).json({ error: "Meeting not found." });
    if (meeting.supervisorId !== req.user.uid) {
      return res.status(403).json({ error: "Not allowed to update this meeting." });
    }
    await ref.update({
      status: req.body.status,
      supervisorNote: req.body.supervisorNote || "",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ ok: true });
  } catch (error) {
    console.error("[PATCH /api/meetings/:id/respond] Error:", error.message);
    res.status(500).json({ error: "Failed to update meeting." });
  }
});

/* ═══════════════════════════════════════════════════════
   CORE AI ROUTES
   Used by: fetchGeminiResponse, fetchProfessionalResponse
═══════════════════════════════════════════════════════ */

/**
 * POST /api/ai/chat
 * Powers the floating Parama chatbot.
 * Body: { message: string }
 */
router.post("/ai/chat", async (req, res) => {
  if (!requireFields(res, req.body, ["message"])) return;

  const { message } = req.body;

  if (message.length > 20000) {
    return res.status(400).json({ error: "Message too long (max 20,000 characters)." });
  }

  try {
    const prompt = `You are Parama, an intelligent AI research assistant inside the ImRa platform.
Answer clearly, professionally, and helpfully for researchers.
Keep responses focused, well-structured, and concise where possible.

User message:
${message}`;

    const text = await callGemini(prompt);
    res.json({ result: text });
  } catch (error) {
    console.error("[/api/ai/chat] Error:", error.message);
    res.status(500).json({ error: "AI chat failed.", details: error.message });
  }
});

/**
 * POST /api/ai/generate
 * General-purpose professional AI generation.
 * Powers all literature, editing, draft, and LaTeX tools.
 * Body: { prompt: string }
 */
router.post("/ai/generate", async (req, res) => {
  if (!requireFields(res, req.body, ["prompt"])) return;

  const { prompt } = req.body;

  if (prompt.length > 30000) {
    return res.status(400).json({ error: "Prompt too long (max 30,000 characters)." });
  }

  try {
    const text = await callGemini(prompt);
    res.json({ result: text });
  } catch (error) {
    console.error("[/api/ai/generate] Error:", error.message);
    res.status(500).json({ error: "AI generation failed.", details: error.message });
  }
});

/* ═══════════════════════════════════════════════════════
   PDF Q&A ROUTE
   Used by: askPdfQuestion (Chat with PDF tool)
═══════════════════════════════════════════════════════ */

/**
 * POST /api/pdf/ask
 * Answer a question grounded in uploaded PDF text.
 * Body: { question: string, context: string }
 */
router.post("/pdf/ask", async (req, res) => {
  if (!requireFields(res, req.body, ["question", "context"])) return;

  const { question, context } = req.body;

  if (context.length > 50000) {
    return res.status(400).json({ error: "Context too long (max 50,000 characters)." });
  }

  try {
    const prompt = `You are a research assistant. Answer the user's question using ONLY the document context provided below.
If the answer is not clearly present in the context, say so honestly — do not fabricate information.
Be concise and cite relevant parts of the document where useful.

Document context:
${context}

Question:
${question}`;

    const text = await callGemini(prompt);
    res.json({ result: text });
  } catch (error) {
    console.error("[/api/pdf/ask] Error:", error.message);
    res.status(500).json({ error: "PDF Q&A failed.", details: error.message });
  }
});

/* ═══════════════════════════════════════════════════════
   LITERATURE TOOLS
   All powered by /api/ai/generate in app.js,
   but these dedicated routes give better prompts per tool.
═══════════════════════════════════════════════════════ */

/**
 * POST /api/literature/review
 * Synthesize a literature review from extracted PDF text.
 * Body: { text: string }
 */
router.post("/literature/review", async (req, res) => {
  if (!requireFields(res, req.body, ["text"])) return;

  const { text } = req.body;
  if (!String(text).trim()) {
    return res.status(400).json({ error: "No readable paper text found. Please upload a text-based PDF." });
  }

  try {
    const prompt = `You are an expert academic research assistant. Synthesize a comprehensive literature review from the following research papers.

Your review must:
- Group papers by common themes and methodologies
- Highlight agreements and contradictions between authors
- Show the progression of ideas over time
- Identify the dominant approaches in this field
- Use formal academic writing style
- Use subheadings for each major theme

Papers:
${text.substring(0, 20000)}`;

    const result = await callGemini(prompt);
    res.json({ result });
  } catch (error) {
    console.error("[/api/literature/review] Error:", error.message);
    res.status(500).json({ error: "Literature review generation failed.", details: error.message });
  }
});

/**
 * POST /api/literature/gap
 * Find research gaps from multiple papers.
 * Body: { text: string }
 */
router.post("/literature/gap", async (req, res) => {
  if (!requireFields(res, req.body, ["text"])) return;

  const { text } = req.body;

  try {
    const prompt = `You are an expert academic researcher. Analyze the following research papers and identify research gaps and unexplored areas.

Your analysis must:
- List specific methodological gaps not addressed by any paper
- Identify datasets, populations, or contexts that have been overlooked
- Highlight contradictions between papers that require further investigation
- Suggest 3–5 concrete future research directions with justification
- Use formal academic writing style

Papers:
${text.substring(0, 20000)}`;

    const result = await callGemini(prompt);
    res.json({ result });
  } catch (error) {
    console.error("[/api/literature/gap] Error:", error.message);
    res.status(500).json({ error: "Research gap analysis failed.", details: error.message });
  }
});

/**
 * POST /api/literature/problem-statement
 * Draft research problem statements from a Word document draft.
 * Body: { text: string }
 */
router.post("/literature/problem-statement", async (req, res) => {
  if (!requireFields(res, req.body, ["text"])) return;

  const { text } = req.body;

  try {
    const prompt = `You are an expert academic writing coach. Based on the following research draft, formulate 3 strong and distinct research problem statements.

Each problem statement must:
- Be written in formal academic style
- Clearly define the research problem and its significance
- Identify the gap in existing knowledge this research addresses
- Be 2–4 sentences long
- Be numbered and clearly separated

Draft:
${text.substring(0, 15000)}`;

    const result = await callGemini(prompt);
    res.json({ result });
  } catch (error) {
    console.error("[/api/literature/problem-statement] Error:", error.message);
    res.status(500).json({ error: "Problem statement generation failed.", details: error.message });
  }
});

/**
 * POST /api/literature/journal-finder
 * Suggest journals for a given abstract.
 * Body: { abstract: string }
 */
router.post("/literature/journal-finder", async (req, res) => {
  if (!requireFields(res, req.body, ["abstract"])) return;

  const { abstract } = req.body;

  try {
    const prompt = `You are an expert academic publishing advisor. Based on the following research abstract, suggest 5 suitable academic journals for submission.

For each journal provide:
1. Journal name and publisher
2. Scope match — why this journal fits this research
3. Impact factor range (approximate)
4. Typical review timeline
5. One specific submission tip for this paper

Abstract:
${abstract.substring(0, 5000)}`;

    const result = await callGemini(prompt);
    res.json({ result });
  } catch (error) {
    console.error("[/api/literature/journal-finder] Error:", error.message);
    res.status(500).json({ error: "Journal finder failed.", details: error.message });
  }
});

/* ═══════════════════════════════════════════════════════
   EDITING TOOLS
   Dedicated endpoints with refined prompts per tool.
═══════════════════════════════════════════════════════ */

/**
 * POST /api/editing/grammar
 * Check and fix grammar.
 * Body: { text: string }
 */
router.post("/editing/grammar", async (req, res) => {
  if (!requireFields(res, req.body, ["text"])) return;

  try {
    const prompt = `You are an expert academic editor. Correct all grammatical errors in the following text while:
- Preserving the author's original meaning and academic tone
- Improving sentence clarity and conciseness where needed
- Fixing punctuation, verb tense, and subject-verb agreement
- Highlighting what was changed with a brief summary at the end

Text:
${req.body.text.substring(0, 15000)}`;

    const result = await callGemini(prompt);
    res.json({ result });
  } catch (error) {
    console.error("[/api/editing/grammar] Error:", error.message);
    res.status(500).json({ error: "Grammar check failed.", details: error.message });
  }
});

/**
 * POST /api/editing/plagiarism-scan
 * Identify text at risk for plagiarism.
 * Body: { text: string }
 */
router.post("/editing/plagiarism-scan", async (req, res) => {
  if (!requireFields(res, req.body, ["text"])) return;

  try {
    const prompt = `You are an academic integrity specialist. Analyze the following text and identify sections that may be at risk for plagiarism or that appear overly generic, derivative, or borrowed in style.

For each flagged section:
- Quote the specific sentence or phrase
- Explain why it appears risky
- Suggest a rewrite approach (do not rewrite yet)

Be honest and conservative — only flag genuinely concerning areas.

Text:
${req.body.text.substring(0, 15000)}`;

    const result = await callGemini(prompt);
    res.json({ result });
  } catch (error) {
    console.error("[/api/editing/plagiarism-scan] Error:", error.message);
    res.status(500).json({ error: "Plagiarism scan failed.", details: error.message });
  }
});

/**
 * POST /api/editing/plagiarism-remove
 * Rewrite text to improve originality.
 * Body: { text: string }
 */
router.post("/editing/plagiarism-remove", async (req, res) => {
  if (!requireFields(res, req.body, ["text"])) return;

  try {
    const prompt = `You are an expert academic writer. Rewrite the following text to significantly improve its originality while:
- Preserving the original meaning and all factual content
- Using different sentence structures and vocabulary
- Maintaining formal academic tone
- Not adding or removing any key ideas

Text:
${req.body.text.substring(0, 15000)}`;

    const result = await callGemini(prompt);
    res.json({ result });
  } catch (error) {
    console.error("[/api/editing/plagiarism-remove] Error:", error.message);
    res.status(500).json({ error: "Plagiarism rewrite failed.", details: error.message });
  }
});

/**
 * POST /api/editing/paraphrase
 * Paraphrase text in academic style.
 * Body: { text: string }
 */
router.post("/editing/paraphrase", async (req, res) => {
  if (!requireFields(res, req.body, ["text"])) return;

  try {
    const prompt = `You are an expert academic editor. Paraphrase the following text to:
- Enhance vocabulary and vary sentence structure
- Improve the overall flow and readability
- Maintain formal academic register
- Preserve all original ideas and meaning precisely

Text:
${req.body.text.substring(0, 15000)}`;

    const result = await callGemini(prompt);
    res.json({ result });
  } catch (error) {
    console.error("[/api/editing/paraphrase] Error:", error.message);
    res.status(500).json({ error: "Paraphrase failed.", details: error.message });
  }
});

/**
 * POST /api/editing/ai-check
 * Estimate whether text is AI-generated.
 * Body: { text: string }
 */
router.post("/editing/ai-check", async (req, res) => {
  if (!requireFields(res, req.body, ["text"])) return;

  try {
    const prompt = `You are an AI content detection specialist. Analyze the following text and estimate whether it is likely AI-generated.

In your analysis:
- Give an overall likelihood score: Low / Medium / High
- Identify specific phrases or patterns that suggest AI generation (e.g. overly uniform sentence length, generic transitions, lack of specific citations or anecdotes)
- Identify phrases or patterns that suggest human writing
- Provide a brief overall conclusion

Important: Do not make absolute claims — state this is an estimate only.

Text:
${req.body.text.substring(0, 15000)}`;

    const result = await callGemini(prompt);
    res.json({ result });
  } catch (error) {
    console.error("[/api/editing/ai-check] Error:", error.message);
    res.status(500).json({ error: "AI check failed.", details: error.message });
  }
});

/**
 * POST /api/editing/reduce
 * Summarize and condense text.
 * Body: { text: string }
 */
router.post("/editing/reduce", async (req, res) => {
  if (!requireFields(res, req.body, ["text"])) return;

  try {
    const prompt = `You are an expert academic editor. Summarize and condense the following text to approximately 30–40% of its original length while:
- Retaining all key arguments, findings, and conclusions
- Removing redundancy and filler phrases
- Maintaining formal academic tone
- Preserving the logical flow of ideas

Text:
${req.body.text.substring(0, 15000)}`;

    const result = await callGemini(prompt);
    res.json({ result });
  } catch (error) {
    console.error("[/api/editing/reduce] Error:", error.message);
    res.status(500).json({ error: "Text reduction failed.", details: error.message });
  }
});

/* ═══════════════════════════════════════════════════════
   WRITING SUITE TOOLS
═══════════════════════════════════════════════════════ */

/**
 * POST /api/draft/paraphrase
 * Paraphrase thesis draft content.
 * Body: { text: string }
 */
router.post("/draft/paraphrase", async (req, res) => {
  if (!requireFields(res, req.body, ["text"])) return;

  try {
    const prompt = `Paraphrase the following academic thesis draft while preserving its meaning, depth, and formal tone:\n\n${req.body.text.substring(0, 15000)}`;
    const result = await callGemini(prompt);
    res.json({ result });
  } catch (error) {
    console.error("[/api/draft/paraphrase] Error:", error.message);
    res.status(500).json({ error: "Draft paraphrase failed.", details: error.message });
  }
});

/**
 * POST /api/draft/expand
 * Expand thesis draft with academic detail.
 * Body: { text: string }
 */
router.post("/draft/expand", async (req, res) => {
  if (!requireFields(res, req.body, ["text"])) return;

  try {
    const prompt = `Expand the following thesis draft with additional academic detail, supporting arguments, and elaboration. Maintain formal academic tone and do not repeat existing content unnecessarily:\n\n${req.body.text.substring(0, 15000)}`;
    const result = await callGemini(prompt);
    res.json({ result });
  } catch (error) {
    console.error("[/api/draft/expand] Error:", error.message);
    res.status(500).json({ error: "Draft expand failed.", details: error.message });
  }
});

/**
 * POST /api/draft/grammar
 * Grammar check for thesis draft.
 * Body: { text: string }
 */
router.post("/draft/grammar", async (req, res) => {
  if (!requireFields(res, req.body, ["text"])) return;

  try {
    const prompt = `Correct the grammar of the following academic thesis draft while strictly preserving the author's meaning and academic voice:\n\n${req.body.text.substring(0, 15000)}`;
    const result = await callGemini(prompt);
    res.json({ result });
  } catch (error) {
    console.error("[/api/draft/grammar] Error:", error.message);
    res.status(500).json({ error: "Draft grammar check failed.", details: error.message });
  }
});

/**
 * POST /api/latex/convert
 * Convert Word document text to LaTeX.
 * Body: { text: string }
 */
router.post("/latex/convert", async (req, res) => {
  if (!requireFields(res, req.body, ["text"])) return;

  try {
    const prompt = `Convert the following manuscript content into clean, well-structured LaTeX code suitable for academic journal submission.

Requirements:
- Use standard LaTeX packages (\\usepackage{amsmath}, graphicx, etc.) in a commented header
- Use proper sectioning (\\section, \\subsection)
- Convert any lists to \\begin{itemize} or \\begin{enumerate}
- Wrap any equations in equation or align environments
- Use \\textbf{} and \\textit{} for formatting
- Output only the LaTeX code — no explanation outside comments

Manuscript:
${req.body.text.substring(0, 15000)}`;

    const result = await callGemini(prompt);
    res.json({ result });
  } catch (error) {
    console.error("[/api/latex/convert] Error:", error.message);
    res.status(500).json({ error: "LaTeX conversion failed.", details: error.message });
  }
});

/* ═══════════════════════════════════════════════════════
   PARU (Advanced AI Assistant)
═══════════════════════════════════════════════════════ */

/**
 * POST /api/paru/chat
 * Paru — multi-role advanced AI for deep research tasks.
 * Body: { message: string, history?: Array<{role, text}> }
 */
router.post("/paru/chat", async (req, res) => {
  if (!requireFields(res, req.body, ["message"])) return;

  const { message, history = [] } = req.body;

  if (message.length > 20000) {
    return res.status(400).json({ error: "Message too long (max 20,000 characters)." });
  }

  try {
    // Build conversation context from recent history (last 6 messages)
    const recentHistory = history.slice(-6);
    const historyText = recentHistory
      .map((m) => `${m.role === "user" ? "User" : "Paru"}: ${m.text}`)
      .join("\n");

    const prompt = `You are Paaru (also called Paru), a warm, highly intelligent, and supportive AI assistant for researchers inside the ImRa platform. You take on multiple roles:
- As a Creator: help brainstorm original research ideas
- As an Author: assist with academic writing and editing  
- As a Researcher: analyze papers and synthesize knowledge
- As a Helper: answer any research-related question with clarity and empathy

Be thoughtful, structured, and empathetic. Use markdown formatting with **bold** for emphasis.

${historyText ? `Recent conversation:\n${historyText}\n` : ""}
User: ${message}`;

    const text = await callGemini(prompt);
    res.json({ result: text });
  } catch (error) {
    console.error("[/api/paru/chat] Error:", error.message);
    res.status(500).json({ error: "Paru chat failed.", details: error.message });
  }
});

/* ═══════════════════════════════════════════════════════
   ERROR HANDLER (catches unhandled errors in routes)
═══════════════════════════════════════════════════════ */
router.use((err, req, res, next) => {
  console.error("[API Error]", err);
  res.status(500).json({ error: "Internal server error.", details: err.message });
});

module.exports = router;
