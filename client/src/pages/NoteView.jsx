import { useEffect, useState } from "react";
import { api } from "../api";

export default function NoteView({ noteId, goBack, openChat, onNotesChanged }) {
  const [note, setNote] = useState(null);
  const [tab, setTab] = useState("notes");
  const [loading, setLoading] = useState("");
  const [toast, setToast] = useState("");

  // Quiz
  const [quiz, setQuiz] = useState(null);
  const [difficulty, setDifficulty] = useState("medium");
  const [qCount, setQCount] = useState(5);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [mistakes, setMistakes] = useState("");
  const [showVideos, setShowVideos] = useState(false);

  // Flashcards
  const [cards, setCards] = useState(null);
  const [cardIdx, setCardIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);

  // Edit
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({ title: "", subject: "", content: "" });

  const notify = (m) => { setToast(m); setTimeout(() => setToast(""), 3000); };

  useEffect(() => {
    api.getNote(noteId).then((n) => {
      setNote(n);
      setEdit({ title: n.title, subject: n.subject, content: n.content });
    }).catch((e) => notify("⚠️ " + e.message));
  }, [noteId]);

  const summarize = async () => {
    setLoading("summary");
    try {
      const data = await api.summarize(noteId);
      setNote({ ...note, summary: data.summary });
      setTab("summary");
    } catch (e) { notify("⚠️ " + e.message); }
    setLoading("");
  };

  const makeQuiz = async () => {
    setLoading("quiz"); setSubmitted(false); setAnswers({}); setMistakes("");
    try {
      const data = await api.quiz(noteId, difficulty, qCount);
      setQuiz(data.quiz);
      setTab("quiz");
    } catch (e) { notify("⚠️ " + e.message); }
    setLoading("");
  };

  const makeCards = async () => {
    setLoading("cards");
    try {
      const data = await api.flashcards(noteId);
      setCards(data.cards); setCardIdx(0); setFlipped(false);
      setTab("cards");
    } catch (e) { notify("⚠️ " + e.message); }
    setLoading("");
  };

  const submitQuiz = async () => {
    setSubmitted(true);
    const score = quiz.filter((q, i) => answers[i] === q.answer).length;
    try { await api.saveResult({ noteId, score, total: quiz.length }); } catch {}
  };

  const explainMistakes = async () => {
    const wrong = quiz
      .map((q, i) => ({ q, i }))
      .filter(({ q, i }) => answers[i] !== q.answer)
      .map(({ q, i }) => ({
        question: q.question,
        correct: q.options[q.answer],
        chosen: q.options[answers[i]],
      }));
    if (wrong.length === 0) return;
    setLoading("mistakes");
    try {
      const data = await api.explainMistakes(wrong);
      setMistakes(data.explanation);
    } catch (e) { notify("⚠️ " + e.message); }
    setLoading("");
  };

  const videoLessons = () => setShowVideos(true);

  const saveEdit = async () => {
    setLoading("edit");
    try {
      await api.updateNote(noteId, edit);
      setNote({ ...note, ...edit, summary: null });
      setEditing(false);
      if (onNotesChanged) onNotesChanged();
      notify("✓ Note updated (summary reset — regenerate it)");
    } catch (e) { notify("⚠️ " + e.message); }
    setLoading("");
  };

  const copySummary = () => {
    navigator.clipboard.writeText(note.summary);
    notify("✓ Summary copied to clipboard");
  };

  const exportNoteWord = () => {
    const body = note.summary
      ? `<h2>AI Summary</h2><p style="white-space:pre-wrap">${note.summary.replace(/</g, "&lt;")}</p><hr/><h2>Full Notes</h2><p style="white-space:pre-wrap">${note.content.replace(/</g, "&lt;")}</p>`
      : `<p style="white-space:pre-wrap">${note.content.replace(/</g, "&lt;")}</p>`;
    const html = `<html><head><meta charset="utf-8"><title>${note.title}</title></head>
      <body style="font-family:Calibri"><h1>${note.title}</h1><p><i>Subject: ${note.subject} — exported from Study Buddy</i></p>${body}</body></html>`;
    const blob = new Blob([html], { type: "application/msword" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${note.title.replace(/[^a-z0-9 ]/gi, "")}.doc`;
    a.click();
    URL.revokeObjectURL(a.href);
    notify("✓ Word file downloaded");
  };

  const exportNotePDF = () => {
    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>${note.title}</title>
      <style>body{font-family:Segoe UI,Arial;max-width:800px;margin:40px auto;line-height:1.7;color:#222}
      h1{color:#5a4bd1} .sub{color:#777;font-style:italic} pre{white-space:pre-wrap;font-family:inherit}</style>
      </head><body><h1>${note.title}</h1><p class="sub">Subject: ${note.subject} — Study Buddy</p>
      ${note.summary ? `<h2>AI Summary</h2><pre>${note.summary.replace(/</g, "&lt;")}</pre><hr/>` : ""}
      <h2>Notes</h2><pre>${note.content.replace(/</g, "&lt;")}</pre></body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  };

  const downloadWord = () => {
    const html = `<html><head><meta charset="utf-8"><title>${note.title}</title></head>
      <body style="font-family:Calibri"><h1>${note.title} — AI Summary</h1>
      <p style="white-space:pre-wrap">${note.summary.replace(/</g, "&lt;")}</p></body></html>`;
    const blob = new Blob([html], { type: "application/msword" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${note.title.replace(/[^a-z0-9 ]/gi, "")} - Summary.doc`;
    a.click();
    URL.revokeObjectURL(a.href);
    notify("✓ Word file downloaded");
  };

  const downloadSummary = () => {
    const blob = new Blob([`${note.title} — AI Summary\n\n${note.summary}`], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${note.title.replace(/[^a-z0-9 ]/gi, "")} - Summary.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    notify("✓ Summary downloaded");
  };

  if (!note) return <div className="page"><p>Loading…</p></div>;
  const score = quiz ? quiz.filter((q, i) => answers[i] === q.answer).length : 0;

  return (
    <div className="page">
      {toast && <div className="toast">{toast}</div>}
      <button className="btn ghost" onClick={goBack}>← Back to Dashboard</button>

      <div className="note-header">
        <div>
          <span className="badge">{note.subject}</span>
          <h2>{note.title}</h2>
          <span className="date">{note.content.length.toLocaleString()} characters · added {new Date(note.created_at).toLocaleDateString()}</span>
        </div>
        <div className="actions-block">
          <div className="actions ai-actions">
            <button className="btn primary" onClick={summarize} disabled={loading !== ""}>
              {loading === "summary" ? <span className="spinner"></span> : "✨ AI Summary"}
            </button>
            <button className="btn primary" onClick={makeQuiz} disabled={loading !== ""}>
              {loading === "quiz" ? <span className="spinner"></span> : "📝 Quiz"}
            </button>
            <button className="btn primary" onClick={makeCards} disabled={loading !== ""}>
              {loading === "cards" ? <span className="spinner"></span> : "🃏 Flashcards"}
            </button>
          </div>
          <div className="actions util-actions">
            <button className="btn ghost" onClick={() => openChat(noteId)}>💬 Ask AI about this</button>
            <button className="btn ghost" onClick={() => setEditing(!editing)}>{editing ? "✕ Cancel" : "✏️ Edit"}</button>
            <button className="btn ghost" onClick={exportNoteWord}>⬇ Word</button>
            <button className="btn ghost" onClick={exportNotePDF}>🖨 PDF</button>
            <button className="btn ghost" onClick={videoLessons}>🎥 Videos</button>
          </div>
        </div>
      </div>

      {editing ? (
        <div className="note-form card">
          <div className="row">
            <input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
            <input value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} />
          </div>
          <textarea rows="12" value={edit.content} onChange={(e) => setEdit({ ...edit, content: e.target.value })} />
          <button className="btn primary" onClick={saveEdit} disabled={loading === "edit"}>
            {loading === "edit" ? <span className="spinner"></span> : "Save Changes"}
          </button>
        </div>
      ) : (
        <>
          <div className="tabs">
            <span className={tab === "notes" ? "active" : ""} onClick={() => setTab("notes")}>📖 Notes</span>
            {note.summary && <span className={tab === "summary" ? "active" : ""} onClick={() => setTab("summary")}>✨ Summary</span>}
            {quiz && <span className={tab === "quiz" ? "active" : ""} onClick={() => setTab("quiz")}>📝 Quiz</span>}
            {cards && <span className={tab === "cards" ? "active" : ""} onClick={() => setTab("cards")}>🃏 Flashcards</span>}
          </div>

          {tab === "notes" && <div className="card content-box">{note.content}</div>}

          {tab === "summary" && (
            <div className="card content-box">
              <span className="copy-btn">
                <button className="btn ghost small" onClick={copySummary}>📋 Copy</button>{" "}
                <button className="btn ghost small" onClick={downloadSummary}>⬇ TXT</button>{" "}
                <button className="btn ghost small" onClick={downloadWord}>⬇ Word</button>
              </span>
              {note.summary}
            </div>
          )}

          {tab === "quiz" && quiz && (
            <div className="quiz">
              <div className="quiz-toolbar">
                <span>Difficulty:</span>
                {["easy", "medium", "hard"].map((d) => (
                  <span key={d} className={`chip mini ${difficulty === d ? "chip-active" : ""}`}
                    onClick={() => setDifficulty(d)}>{d}</span>
                ))}
                <span className="divider">|</span>
                <span>Questions:</span>
                {[5, 10].map((c) => (
                  <span key={c} className={`chip mini ${qCount === c ? "chip-active" : ""}`}
                    onClick={() => setQCount(c)}>{c}</span>
                ))}
                <button className="btn ghost small" onClick={makeQuiz}>↻ New Quiz</button>
              </div>
              {submitted && (
                <div className={`card score-banner ${score >= quiz.length * 0.6 ? "good" : "bad"}`}>
                  You scored {score}/{quiz.length} ({Math.round(score / quiz.length * 100)}%)
                  {score === quiz.length ? " 🏆 Perfect!" : score >= quiz.length * 0.6 ? " 🎉 Great job!" : " — review the notes and try again 💪"}
                  {score < quiz.length && (
                    <div style={{ marginTop: 10 }}>
                      <button className="btn primary small" onClick={explainMistakes} disabled={loading !== ""}>
                        {loading === "mistakes" ? <span className="spinner"></span> : "🧠 Explain my mistakes"}
                      </button>
                    </div>
                  )}
                </div>
              )}
              {mistakes && (
                <div className="card mistakes-box">
                  <h4 className="md-h">🧠 Why you got these wrong</h4>
                  <div className="content-box-inner">{mistakes}</div>
                </div>
              )}
              {quiz.map((q, i) => (
                <div key={i} className="card quiz-q">
                  <p className="q-text">{i + 1}. {q.question}</p>
                  {q.options.map((opt, j) => {
                    let cls = "option";
                    if (answers[i] === j) cls += " selected";
                    if (submitted && j === q.answer) cls += " correct";
                    if (submitted && answers[i] === j && j !== q.answer) cls += " wrong";
                    return (
                      <div key={j} className={cls} onClick={() => !submitted && setAnswers({ ...answers, [i]: j })}>
                        {opt}
                      </div>
                    );
                  })}
                </div>
              ))}
              {!submitted && (
                <button className="btn primary full" onClick={submitQuiz}
                  disabled={Object.keys(answers).length < quiz.length}>
                  Submit Quiz ({Object.keys(answers).length}/{quiz.length} answered)
                </button>
              )}
            </div>
          )}

          {tab === "cards" && cards && (
            <div className="flash-area">
              <div className={`flashcard ${flipped ? "flipped" : ""}`} onClick={() => setFlipped(!flipped)}>
                <div className="flash-inner">
                  <div className="flash-face flash-front">
                    <span className="flash-label">QUESTION</span>
                    <p>{cards[cardIdx].front}</p>
                    <small>tap to reveal answer</small>
                  </div>
                  <div className="flash-face flash-back">
                    <span className="flash-label">ANSWER</span>
                    <p>{cards[cardIdx].back}</p>
                  </div>
                </div>
              </div>
              <div className="flash-nav">
                <button className="btn ghost" disabled={cardIdx === 0}
                  onClick={() => { setCardIdx(cardIdx - 1); setFlipped(false); }}>← Prev</button>
                <span>{cardIdx + 1} / {cards.length}</span>
                <button className="btn ghost" disabled={cardIdx === cards.length - 1}
                  onClick={() => { setCardIdx(cardIdx + 1); setFlipped(false); }}>Next →</button>
              </div>
            </div>
          )}
        </>
      )}

      {showVideos && (
        <div className="video-overlay" onClick={() => setShowVideos(false)}>
          <div className="video-modal" onClick={(e) => e.stopPropagation()}>
            <div className="video-head">
              <b>🎥 Video lessons: {note.title.slice(0, 60)}</b>
              <span>
                <a className="btn ghost small" target="_blank" rel="noreferrer"
                  href={"https://www.youtube.com/results?search_query=" + encodeURIComponent(note.title + " " + note.subject + " tutorial")}>
                  Open on YouTube ↗
                </a>{" "}
                <button className="btn ghost small" onClick={() => setShowVideos(false)}>✕ Close</button>
              </span>
            </div>
            <iframe
              title="Video lessons"
              src={"https://www.youtube.com/embed?listType=search&list=" + encodeURIComponent(note.title + " " + note.subject + " explained tutorial")}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
            <p className="video-hint">Top search results play as a playlist — use the ≡ playlist icon inside the player to pick a video.</p>
          </div>
        </div>
      )}
    </div>
  );
}