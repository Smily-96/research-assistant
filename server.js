/**
 * server.js — ImRa Research Assistant
 * Main Express server. Mounts the API router from src/api.js.
 */

const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

/* -------------------------------------------------------
   Rate Limiting  (npm install express-rate-limit)
------------------------------------------------------- */
let rateLimit;
try {
  rateLimit = require("express-rate-limit");
} catch {
  console.warn("express-rate-limit not installed. Run: npm install express-rate-limit");
  // Fallback no-op middleware
  rateLimit = () => (req, res, next) => next();
}

const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 25,             // max 25 AI requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait a moment and try again." },
});

/* -------------------------------------------------------
   Core Middleware
------------------------------------------------------- */
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? process.env.ALLOWED_ORIGIN || "https://your-domain.com"
        : "*",
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Serve all frontend static files from project root
app.use(
  express.static(path.join(__dirname), {
    index: false,
    extensions: false,
  })
);

app.get(["/app.js", "/style.css", "/logo.png", "/parama-avatar.svg", "/favicon.ico", "/favicon.png"], (req, res) => {
  res.sendFile(path.join(__dirname, req.path));
});

/* -------------------------------------------------------
   Mount API Router
   All routes in src/api.js are prefixed with /api
------------------------------------------------------- */
const apiRouter = require("./src/api");

// Apply rate limiting to all AI and PDF endpoints
app.use("/api/ai", aiLimiter);
app.use("/api/pdf", aiLimiter);
app.use("/api/literature", aiLimiter);
app.use("/api/editing", aiLimiter);
app.use("/api/draft", aiLimiter);
app.use("/api/latex", aiLimiter);
app.use("/api/paru", aiLimiter);

// Mount the router
app.use("/api", apiRouter);

/* -------------------------------------------------------
   SPA Fallback — must come after /api routes
------------------------------------------------------- */
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

/* -------------------------------------------------------
   Start Server
------------------------------------------------------- */
app.listen(PORT, () => {
  console.log(`✅  ImRa server running → http://localhost:${PORT}`);
  console.log(`    NODE_ENV : ${process.env.NODE_ENV || "development"}`);
  console.log(
    `    Gemini   : ${process.env.GOOGLE_API_KEY ? "API key loaded ✓" : "⚠️  GOOGLE_API_KEY missing in .env"}`
  );
});
