require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mysql = require("mysql2/promise");
const { GoogleGenAI } = require("@google/genai");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { parseOffice } = require("officeparser");

const os = require("os");
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB max
});
const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ---------- Database (XAMPP MySQL) ----------
const db = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 3307,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "study_buddy",
  ssl: process.env.DB_HOST ? { minVersion: "TLSv1.2", rejectUnauthorized: true } : undefined,
});

// ---- Startup self-check: test DB connection and print a clear message ----
(async () => {
  try {
    const conn = await db.getConnection();
    await conn.query("SELECT 1");
    conn.release();
    console.log("✅ MySQL connected successfully (study_buddy @ port " + (process.env.DB_PORT || 3307) + ")");
    // v5: create new tables automatically if they don't exist
    await conn.query(`CREATE TABLE IF NOT EXISTS conversations (
      conv_id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(150) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    )`);
    await conn.query(`CREATE TABLE IF NOT EXISTS messages (
      msg_id INT AUTO_INCREMENT PRIMARY KEY,
      conv_id INT NOT NULL,
      role ENUM('user','model') NOT NULL,
      text MEDIUMTEXT,
      files VARCHAR(600),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conv_id) REFERENCES conversations(conv_id) ON DELETE CASCADE
    )`);
    await conn.query(`CREATE TABLE IF NOT EXISTS activity_log (
      user_id INT NOT NULL,
      day DATE NOT NULL,
      UNIQUE KEY uniq_day (user_id, day)
    )`);
    console.log("✅ Tables ready (conversations, messages, activity_log)");
  } catch (err) {
    console.error("❌ MYSQL CONNECTION FAILED:", err.code, "-", err.message);
    console.error("   → Check: XAMPP MySQL running? Correct port (3306/3307)? Database imported?");
  }
})();

// ---------- Gemini AI ----------
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = "gemini-2.5-flash";

const JWT_SECRET = process.env.JWT_SECRET || "change_this_secret";

// v5: record that the user studied today (for streak)
async function logActivity(userId) {
  try {
    await db.query("INSERT IGNORE INTO activity_log (user_id, day) VALUES (?, CURDATE())", [userId]);
  } catch {}
}

// v5: get or create a conversation, save a message pair
async function ensureConversation(userId, convId, firstMessage) {
  if (convId) return convId;
  const title = (firstMessage || "New chat").replace(/\s+/g, " ").slice(0, 80);
  const [r] = await db.query(
    "INSERT INTO conversations (user_id, title) VALUES (?,?)", [userId, title]);
  return r.insertId;
}
async function saveMessage(convId, role, text, files) {
  await db.query(
    "INSERT INTO messages (conv_id, role, text, files) VALUES (?,?,?,?)",
    [convId, role, text, files ? JSON.stringify(files) : null]);
}

// ---------- Auth middleware ----------
function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Login required." });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Session expired. Please login again." });
  }
}

// =====================================================
// AUTH ROUTES
// =====================================================
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: "All fields are required." });
    if (password.length < 6)
      return res.status(400).json({ error: "Password must be at least 6 characters." });

    const hash = await bcrypt.hash(password, 10);
    await db.query("INSERT INTO users (name, email, password) VALUES (?,?,?)", [
      name.trim(), email.trim().toLowerCase(), hash,
    ]);
    res.json({ message: "Account created. Please login." });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY")
      return res.status(400).json({ error: "Email already registered." });
    console.error("REGISTER ERROR:", err.code, err.message);
    res.status(500).json({ error: "Registration failed: " + (err.code || "") + " " + err.message });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [
      (email || "").trim().toLowerCase(),
    ]);
    if (rows.length === 0)
      return res.status(400).json({ error: "Invalid email or password." });

    const user = rows[0];
    const ok = await bcrypt.compare(password || "", user.password);
    if (!ok) return res.status(400).json({ error: "Invalid email or password." });

    const token = jwt.sign({ id: user.user_id, name: user.name }, JWT_SECRET, {
      expiresIn: "7d",
    });
    res.json({ token, user: { id: user.user_id, name: user.name } });
  } catch (err) {
    console.error("LOGIN ERROR:", err.code, err.message);
    res.status(500).json({ error: "Login failed: " + err.message });
  }
});

// =====================================================
// NOTES ROUTES
// =====================================================
app.get("/api/notes", auth, async (req, res) => {
  const [rows] = await db.query(
    "SELECT note_id, title, subject, created_at, LEFT(content, 150) AS preview, (summary IS NOT NULL) AS has_summary FROM notes WHERE user_id=? ORDER BY created_at DESC",
    [req.user.id]
  );
  res.json(rows);
});

app.get("/api/notes/:id", auth, async (req, res) => {
  const [rows] = await db.query(
    "SELECT * FROM notes WHERE note_id=? AND user_id=?",
    [req.params.id, req.user.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: "Note not found." });
  res.json(rows[0]);
});

app.post("/api/notes", auth, async (req, res) => {
  const { title, subject, content } = req.body;
  if (!title || !content)
    return res.status(400).json({ error: "Title and content are required." });
  const [result] = await db.query(
    "INSERT INTO notes (user_id, title, subject, content) VALUES (?,?,?,?)",
    [req.user.id, title.trim(), (subject || "General").trim(), content]
  );
  logActivity(req.user.id);
  res.json({ note_id: result.insertId });
});

// Upload a PDF / PPTX / DOCX / TXT file as a note
app.post("/api/notes/upload", auth, upload.single("file"), async (req, res) => {
  let tempPath = null;
  try {
    if (!req.file) return res.status(400).json({ error: "No file received." });
    const ext = path.extname(req.file.originalname).toLowerCase();
    const allowed = [".pdf", ".pptx", ".docx", ".xlsx", ".txt"];
    if (!allowed.includes(ext)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Supported files: PDF, PPTX, DOCX, XLSX, TXT." });
    }

    // officeparser needs the correct extension, multer strips it
    tempPath = req.file.path + ext;
    fs.renameSync(req.file.path, tempPath);

    let text = "";
    if (ext === ".txt") {
      text = fs.readFileSync(tempPath, "utf8");
    } else {
      const parsed = await parseOffice(tempPath);
      text = await parsed.toText();
    }

    if (!text || text.trim().length < 20) {
      return res.status(400).json({ error: "Could not extract readable text from this file (is it a scanned image?)." });
    }

    const title = (req.body.title || "").trim() || req.file.originalname.replace(ext, "");
    const subject = (req.body.subject || "General").trim();

    const [result] = await db.query(
      "INSERT INTO notes (user_id, title, subject, content) VALUES (?,?,?,?)",
      [req.user.id, title, subject, text.trim().slice(0, 60000)]
    );
    res.json({ note_id: result.insertId, chars: text.trim().length });
  } catch (err) {
    console.error("UPLOAD ERROR:", err.message);
    res.status(500).json({ error: "File processing failed: " + err.message });
  } finally {
    if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
});

app.put("/api/notes/:id", auth, async (req, res) => {
  const { title, subject, content } = req.body;
  if (!title || !content)
    return res.status(400).json({ error: "Title and content are required." });
  await db.query(
    "UPDATE notes SET title=?, subject=?, content=?, summary=NULL WHERE note_id=? AND user_id=?",
    [title.trim(), (subject || "General").trim(), content, req.params.id, req.user.id]
  );
  res.json({ message: "Updated." });
});

app.delete("/api/notes/:id", auth, async (req, res) => {
  await db.query("DELETE FROM notes WHERE note_id=? AND user_id=?", [
    req.params.id, req.user.id,
  ]);
  res.json({ message: "Deleted." });
});

// =====================================================
// AI ROUTES (Gemini)
// =====================================================

// 1. Summarize a note
app.post("/api/ai/summarize", auth, async (req, res) => {
  try {
    const { noteId } = req.body;
    const [rows] = await db.query(
      "SELECT content FROM notes WHERE note_id=? AND user_id=?",
      [noteId, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Note not found." });

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: `Summarize these study notes for exam revision. Use short bullet points covering all key concepts. Keep it clear and student-friendly.\n\nNOTES:\n${rows[0].content}`,
    });

    const summary = response.text;
    await db.query("UPDATE notes SET summary=? WHERE note_id=?", [summary, noteId]);
    res.json({ summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "AI summarize failed. Check your API key." });
  }
});

// 2. Generate a quiz from a note (returns JSON)
app.post("/api/ai/quiz", auth, async (req, res) => {
  try {
    const { noteId, difficulty = "medium", count = 5 } = req.body;
    const qCount = [5, 10].includes(Number(count)) ? Number(count) : 5;
    const [rows] = await db.query(
      "SELECT content FROM notes WHERE note_id=? AND user_id=?",
      [noteId, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Note not found." });

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: `Create exactly ${qCount} ${difficulty}-difficulty multiple-choice questions from these study notes.
Respond ONLY with valid JSON, no markdown, in this exact format:
[{"question":"...","options":["A","B","C","D"],"answer":0}]
where "answer" is the index (0-3) of the correct option.

NOTES:
${rows[0].content}`,
    });

    const clean = response.text.replace(/```json|```/g, "").trim();
    const quiz = JSON.parse(clean);
    res.json({ quiz });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Quiz generation failed. Try again." });
  }
});

// 3. Save quiz result
app.post("/api/quiz-results", auth, async (req, res) => {
  const { noteId, score, total } = req.body;
  await db.query(
    "INSERT INTO quiz_results (user_id, note_id, score, total) VALUES (?,?,?,?)",
    [req.user.id, noteId, score, total]
  );
  logActivity(req.user.id);
  res.json({ message: "Saved." });
});

// 4. Study chat assistant (optionally grounded in a note)
app.post("/api/ai/chat", auth, async (req, res) => {
  try {
    const { message, history = [], noteId, convId: reqConvId } = req.body;
    const convId = await ensureConversation(req.user.id, reqConvId || null, message);

    let noteContext = "";
    if (noteId) {
      const [rows] = await db.query(
        "SELECT title, content FROM notes WHERE note_id=? AND user_id=?",
        [noteId, req.user.id]
      );
      if (rows.length > 0)
        noteContext = `\nThe student is currently studying this note titled "${rows[0].title}":\n${rows[0].content}\n`;
    }

    const systemInstruction = `You are Study Buddy, an expert AI tutor with deep knowledge across ALL academic subjects — computer science, mathematics, physics, chemistry, biology, engineering, economics, business, medicine, languages and more.
Answer like a brilliant professor: start with a clear direct answer, then explain step by step using markdown (## headings, **bold key terms**, - bullet points, numbered steps for procedures), include a simple example or analogy, and end with a short "In short:" one-liner.
Respond in the language the student writes in. Be thorough but never rambling. Encourage the student.${noteContext}`;

    const contents = [
      ...history,
      { role: "user", parts: [{ text: message }] },
    ];

    const response = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: { systemInstruction },
    });

    await saveMessage(convId, "user", message, null);
    await saveMessage(convId, "model", response.text, null);
    logActivity(req.user.id);
    res.json({ reply: response.text, convId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Chat failed. Try again." });
  }
});

// 4b. Generate flashcards from a note
app.post("/api/ai/flashcards", auth, async (req, res) => {
  try {
    const { noteId } = req.body;
    const [rows] = await db.query(
      "SELECT content FROM notes WHERE note_id=? AND user_id=?",
      [noteId, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Note not found." });

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: `Create exactly 8 study flashcards from these notes.
Respond ONLY with valid JSON, no markdown, in this exact format:
[{"front":"question or term","back":"short clear answer"}]

NOTES:
${rows[0].content}`,
    });

    const clean = response.text.replace(/```json|```/g, "").trim();
    res.json({ cards: JSON.parse(clean) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Flashcard generation failed. Try again." });
  }
});

// 4c. Quiz history
app.get("/api/quiz-results", auth, async (req, res) => {
  const [rows] = await db.query(
    `SELECT q.score, q.total, q.taken_at, n.title
     FROM quiz_results q JOIN notes n ON q.note_id = n.note_id
     WHERE q.user_id=? ORDER BY q.taken_at DESC LIMIT 8`,
    [req.user.id]
  );
  res.json(rows);
});

// v5. Conversation history routes
app.get("/api/conversations", auth, async (req, res) => {
  const [rows] = await db.query(
    "SELECT conv_id, title, created_at FROM conversations WHERE user_id=? ORDER BY conv_id DESC LIMIT 30",
    [req.user.id]);
  res.json(rows);
});

app.get("/api/conversations/:id", auth, async (req, res) => {
  const [own] = await db.query(
    "SELECT conv_id FROM conversations WHERE conv_id=? AND user_id=?",
    [req.params.id, req.user.id]);
  if (own.length === 0) return res.status(404).json({ error: "Conversation not found." });
  const [rows] = await db.query(
    "SELECT role, text, files FROM messages WHERE conv_id=? ORDER BY msg_id ASC",
    [req.params.id]);
  res.json(rows.map(r => ({ role: r.role, text: r.text, files: r.files ? JSON.parse(r.files) : undefined })));
});

app.delete("/api/conversations/:id", auth, async (req, res) => {
  await db.query("DELETE FROM conversations WHERE conv_id=? AND user_id=?",
    [req.params.id, req.user.id]);
  res.json({ message: "Deleted." });
});

// v5. Explain quiz mistakes
app.post("/api/ai/explain-mistakes", auth, async (req, res) => {
  try {
    const { items } = req.body;
    if (!items || items.length === 0)
      return res.status(400).json({ error: "No mistakes to explain." });
    const listing = items.map((it, i) =>
      `${i + 1}. Question: ${it.question}\n   Correct answer: ${it.correct}\n   Student chose: ${it.chosen}`
    ).join("\n");
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: `A student got these quiz questions wrong. For EACH one, explain in 2-3 sentences why the correct answer is right and why their choice was wrong. Be encouraging. Use markdown with **bold** for key terms and number each explanation.\n\n${listing}`,
    });
    res.json({ explanation: response.text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Explanation failed. Try again." });
  }
});

// 4d. Chat with file/image attachments (up to 4 files)
app.post("/api/ai/chat-files", auth, upload.array("files", 4), async (req, res) => {
  const tempPaths = [];
  try {
    const message = req.body.message || "";
    const history = JSON.parse(req.body.history || "[]");
    const noteId = req.body.noteId || null;
    const convId = await ensureConversation(req.user.id, req.body.convId || null, message);

    const parts = [];
    for (const f of req.files || []) {
      const ext = path.extname(f.originalname).toLowerCase();
      const newPath = f.path + ext;
      fs.renameSync(f.path, newPath);
      tempPaths.push(newPath);

      if (f.mimetype.startsWith("image/")) {
        parts.push({
          inlineData: {
            mimeType: f.mimetype,
            data: fs.readFileSync(newPath).toString("base64"),
          },
        });
      } else if ([".pdf", ".pptx", ".docx", ".xlsx"].includes(ext)) {
        const parsed = await parseOffice(newPath);
        const text = await parsed.toText();
        parts.push({ text: `[Attached document "${f.originalname}"]:\n${text.slice(0, 30000)}` });
      } else if (ext === ".txt") {
        parts.push({ text: `[Attached file "${f.originalname}"]:\n${fs.readFileSync(newPath, "utf8").slice(0, 30000)}` });
      }
    }
    parts.push({ text: message || "Please analyze the attached file(s)." });

    let noteContext = "";
    if (noteId) {
      const [rows] = await db.query(
        "SELECT title, content FROM notes WHERE note_id=? AND user_id=?",
        [noteId, req.user.id]
      );
      if (rows.length > 0)
        noteContext = `\nThe student is currently studying this note titled "${rows[0].title}":\n${rows[0].content}\n`;
    }

    const systemInstruction = `You are Study Buddy, an expert AI tutor with deep knowledge across ALL academic subjects — computer science, mathematics, physics, chemistry, biology, engineering, economics, business, medicine, languages and more.
Answer like a brilliant professor: start with a clear direct answer, then explain step by step using markdown (## headings, **bold key terms**, - bullet points, numbered steps for procedures), include a simple example or analogy, and end with a short "In short:" one-liner.
When files or images are attached, analyze them carefully and base your answer on their content.
Respond in the language the student writes in. Be thorough but never rambling.${noteContext}`;

    const contents = [...history, { role: "user", parts }];
    const response = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: { systemInstruction },
    });
    await saveMessage(convId, "user", message, (req.files || []).map(f => f.originalname));
    await saveMessage(convId, "model", response.text, null);
    logActivity(req.user.id);
    res.json({ reply: response.text, convId });
  } catch (err) {
    console.error("CHAT-FILES ERROR:", err.message);
    res.status(500).json({ error: "Chat with files failed: " + err.message });
  } finally {
    tempPaths.forEach((p) => fs.existsSync(p) && fs.unlinkSync(p));
  }
});

// 4e. AI Notes Generator - create full study notes from a topic
app.post("/api/ai/generate-notes", auth, async (req, res) => {
  try {
    const { topic, subject } = req.body;
    if (!topic || !topic.trim())
      return res.status(400).json({ error: "Please enter a topic." });

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: `Create comprehensive, well-structured study notes on the topic: "${topic}".
Write for a university student. Use clear section headings, short paragraphs, key definitions,
important points, simple examples, and end with a short "Key Takeaways" list.
Write in plain text (no markdown symbols like # or *). Length: thorough but focused.`,
    });

    const content = response.text;
    const [result] = await db.query(
      "INSERT INTO notes (user_id, title, subject, content) VALUES (?,?,?,?)",
      [req.user.id, topic.trim().slice(0, 140), (subject || "General").trim(), content]
    );
    res.json({ note_id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Note generation failed. Try again." });
  }
});

// 5. Progress stats
app.get("/api/stats", auth, async (req, res) => {
  const [[notes]] = await db.query(
    "SELECT COUNT(*) AS total FROM notes WHERE user_id=?", [req.user.id]);
  const [[quizzes]] = await db.query(
    "SELECT COUNT(*) AS total, COALESCE(AVG(score/total*100),0) AS avgScore FROM quiz_results WHERE user_id=?",
    [req.user.id]);
  // v5: streak = consecutive study days ending today (or yesterday)
  const [days] = await db.query(
    "SELECT day FROM activity_log WHERE user_id=? ORDER BY day DESC LIMIT 366", [req.user.id]);
  let streak = 0;
  if (days.length > 0) {
    const toKey = (d) => d.toISOString().slice(0, 10);
    const set = new Set(days.map(r => toKey(new Date(r.day))));
    let cursor = new Date();
    if (!set.has(toKey(cursor))) cursor.setDate(cursor.getDate() - 1); // forgive today
    while (set.has(toKey(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
  }
  res.json({
    notes: notes.total,
    quizzes: quizzes.total,
    avgScore: Math.round(quizzes.avgScore),
    streak,
  });
});

const PORT = process.env.PORT || 5000;
if (!process.env.VERCEL) {
  app.listen(PORT, () => console.log(`Study Buddy server running on http://localhost:${PORT}`));
}
module.exports = app;