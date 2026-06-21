/* -------------------------------------------------------
   Utilities & Helper Functions
------------------------------------------------------- */

export const INSTITUTE_DOMAIN = "kanchiuniv.ac.in";

export function isInstituteEmail(email) {
  if (!email) return false;
  const re = new RegExp(`^[a-zA-Z0-9._%+-]+@${INSTITUTE_DOMAIN.replace(".", "\\.")}$`, "i");
  return re.test(email.trim());
}

export function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

export function fmtDate(value) {
  if (!value) return "—";
  let d;
  if (value && typeof value.toDate === "function") d = value.toDate();
  else d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtDateTime(value) {
  if (!value) return "—";
  let d;
  if (value && typeof value.toDate === "function") d = value.toDate();
  else d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function isOverdue(dueDate, status) {
  if (!dueDate || status === "completed") return false;
  return new Date(dueDate).getTime() < Date.now();
}

export function toast(message, type = "info") {
  const stack = document.getElementById("toast-root") || document.getElementById("toast-stack");
  if (!stack) return alert(message);
  const icon = type === "success" ? "ri-checkbox-circle-line" : type === "error" ? "ri-error-warning-line" : "ri-information-line";
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.innerHTML = `<i class="${icon}"></i><span>${escapeHtml(message)}</span>`;
  stack.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .25s ease";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 260);
  }, 4200);
}

export function formatAIText(text = "") {
  return text.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
}

export function safeFirstName(user) {
  return user?.displayName ? user.displayName.split(" ")[0] : "Scholar";
}

export async function extractTextFromMultiplePDFs(files) {
  let fullText = "";
  for (let i = 0; i < files.length; i++) {
    try {
      const arrayBuffer = await files[i].arrayBuffer();
      const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
      fullText += `--- Document ${i + 1}: ${files[i].name} ---\n`;
      for (let j = 1; j <= pdf.numPages; j++) {
        const page = await pdf.getPage(j);
        const content = await page.getTextContent();
        fullText += content.items.map((item) => item.str).join(" ") + "\n";
      }
    } catch (e) {
      console.error("PDF extract error", e);
    }
  }
  return fullText;
}

export async function extractTextFromDocx(file) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value || "";
}
