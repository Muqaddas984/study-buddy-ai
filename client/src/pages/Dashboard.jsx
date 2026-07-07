import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";

export default function Dashboard({ openNote, openChat, onNotesChanged }) {
  const [notes, setNotes] = useState([]);
  const [stats, setStats] = useState({ notes: 0, quizzes: 0, avgScore: 0, streak: 0 });
  const [history, setHistory] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState("write"); // write | upload | generate
  const [topic, setTopic] = useState("");
  const [form, setForm] = useState({ title: "", subject: "", content: "" });
  const [file, setFile] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const fileRef = useRef(null);

  const notify = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const load = async () => {
    try {
      setNotes(await api.getNotes());
      if (onNotesChanged) onNotesChanged();
      setStats(await api.stats());
      setHistory(await api.quizHistory());
    } catch (err) { notify("⚠️ " + err.message); }
  };
  useEffect(() => { load(); }, []);

  const subjects = useMemo(
    () => ["All", ...new Set(notes.map((n) => n.subject))],
    [notes]
  );

  const visible = notes.filter((n) => {
    const okFilter = filter === "All" || n.subject === filter;
    const q = search.toLowerCase();
    const okSearch = !q || n.title.toLowerCase().includes(q) ||
      (n.preview || "").toLowerCase().includes(q);
    return okFilter && okSearch;
  });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      let newId = null;
      if (mode === "generate") {
        if (!topic.trim()) { notify("⚠️ Please enter a topic."); setBusy(false); return; }
        const r = await api.generateNotes(topic, form.subject);
        newId = r.note_id;
        notify("✨ AI notes generated!");
        setTopic("");
      } else if (mode === "upload") {
        if (!file) { notify("⚠️ Please choose a file first."); setBusy(false); return; }
        const r = await api.uploadNote(file, form.title, form.subject);
        newId = r.note_id;
        notify(`✓ File imported — ${r.chars.toLocaleString()} characters extracted`);
      } else {
        const r = await api.addNote(form);
        newId = r.note_id;
        notify("✓ Note saved");
      }
      setForm({ title: "", subject: "", content: "" });
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      setShowForm(false);
      if (newId) { openNote(newId); return; } // jump straight into the new note
      load();
    } catch (err) { notify("⚠️ " + err.message); }
    setBusy(false);
  };

  const remove = async (id) => {
    if (!confirm("Delete this note?")) return;
    await api.deleteNote(id);
    notify("Note deleted");
    load();
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="page">
      {toast && <div className="toast">{toast}</div>}

      <div className="welcome-row">
        <div>
          <h1 className="welcome">{greeting()}, {(localStorage.getItem("userName") || "").split(" ")[0]}! 👋</h1>
          <p className="welcome-sub">{new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" })} — ready to study?</p>
        </div>
        <button className="btn primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "✕ Close" : "+ New Note"}
        </button>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-icon i1">📒</div><div><span className="stat-num">{stats.notes}</span><span className="stat-label">Notes</span></div></div>
        <div className="stat-card"><div className="stat-icon i2">📝</div><div><span className="stat-num">{stats.quizzes}</span><span className="stat-label">Quizzes Taken</span></div></div>
        <div className="stat-card"><div className="stat-icon i3">🎯</div><div><span className="stat-num">{stats.avgScore}%</span><span className="stat-label">Avg Score</span></div></div>
        <div className="stat-card"><div className="stat-icon i4">🔥</div><div><span className="stat-num">{stats.streak}</span><span className="stat-label">Day Streak</span></div></div>
      </div>

      {/* Add / upload form */}
      {showForm && (
        <form className="note-form card" onSubmit={submit}>
          <div className="mode-tabs">
            <span className={mode === "write" ? "active" : ""} onClick={() => setMode("write")}>✍️ Write / Paste</span>
            <span className={mode === "upload" ? "active" : ""} onClick={() => setMode("upload")}>📎 Upload File</span>
            <span className={mode === "generate" ? "active" : ""} onClick={() => setMode("generate")}>✨ AI Generate</span>
          </div>
          {mode !== "generate" && (
            <div className="row">
              <input placeholder="Title (e.g. OS Chapter 3 - Deadlocks)" value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })} required={mode === "write"} />
              <input placeholder="Subject (e.g. Operating Systems)" value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </div>
          )}
          {mode === "generate" ? (
            <div className="gen-box">
              <input className="gen-topic" placeholder="Enter any topic (e.g. TCP/IP Model, Photosynthesis, Binary Trees)…"
                value={topic} onChange={(e) => setTopic(e.target.value)} />
              <input placeholder="Subject (optional)" value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })} />
              <p className="gen-hint">✨ AI will write complete structured study notes on this topic and save them for you — then you can summarize, quiz, and make flashcards from them.</p>
            </div>
          ) : mode === "write" ? (
            <textarea rows="8" placeholder="Paste your study notes here…" value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })} required />
          ) : (
            <label className="dropzone">
              <input ref={fileRef} type="file" accept=".pdf,.pptx,.docx,.xlsx,.txt" hidden
                onChange={(e) => setFile(e.target.files[0])} />
              {file ? (
                <span>📄 <b>{file.name}</b> ({(file.size / 1024).toFixed(0)} KB) — click to change</span>
              ) : (
                <span>📎 Click to choose a <b>PDF, PPTX, DOCX, XLSX or TXT</b> file<br />
                  <small>Text will be extracted automatically (max 15 MB)</small></span>
              )}
            </label>
          )}
          <button className="btn primary" disabled={busy}>
            {busy ? <span className="spinner"></span> : mode === "upload" ? "Import File as Note" : mode === "generate" ? "✨ Generate Notes" : "Save Note"}
          </button>
        </form>
      )}

      {/* Search + filter */}
      <div className="section-head">
        <h2>My Notes {notes.length > 0 && <span className="count">({visible.length})</span>}</h2>
        <input className="search" placeholder="🔍 Search notes…" value={search}
          onChange={(e) => setSearch(e.target.value)} />
      </div>
      {subjects.length > 2 && (
        <div className="chips filter-chips">
          {subjects.map((s) => (
            <span key={s} className={`chip ${filter === s ? "chip-active" : ""}`}
              onClick={() => setFilter(s)}>{s}</span>
          ))}
        </div>
      )}

      {notes.length === 0 && !showForm && (
        <div className="empty card">
          <div className="empty-icon">🚀</div>
          <h3>Start your study journey</h3>
          <p>Add your first note (or upload a PDF/PPT) and let AI create summaries, quizzes and flashcards for you!</p>
          <button className="btn primary" onClick={() => setShowForm(true)}>+ Add Your First Note</button>
        </div>
      )}

      <div className="notes-grid">
        {visible.map((n) => (
          <div key={n.note_id} className="note-card card" onClick={() => openNote(n.note_id)}>
            <div className="note-top">
              <span className="badge">{n.subject}</span>
              {!!n.has_summary && <span className="badge done">✨ Summarized</span>}
            </div>
            <h3>{n.title}</h3>
            <p className="preview">{n.preview}…</p>
            <div className="note-bottom">
              <span className="date">{new Date(n.created_at).toLocaleDateString()}</span>
              <button className="btn danger small" onClick={(e) => { e.stopPropagation(); remove(n.note_id); }}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {/* Quiz history */}
      {history.length > 0 && (
        <>
          <div className="section-head" style={{ marginTop: 34 }}><h2>Recent Quiz Results</h2></div>
          <div className="history card">
            {history.map((h, i) => {
              const pct = Math.round((h.score / h.total) * 100);
              return (
                <div key={i} className="history-row">
                  <span className="h-title">{h.title}</span>
                  <div className="h-bar"><div className={`h-fill ${pct >= 60 ? "good" : "bad"}`} style={{ width: pct + "%" }}></div></div>
                  <span className={`h-score ${pct >= 60 ? "text-good" : "text-bad"}`}>{h.score}/{h.total}</span>
                  <span className="date">{new Date(h.taken_at).toLocaleDateString()}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}