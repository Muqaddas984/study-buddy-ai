import { useEffect, useRef, useState } from "react";
import { api } from "../api";

const ACCEPT = ".pdf,.pptx,.docx,.xlsx,.txt,image/png,image/jpeg,image/webp";

/* Lightweight markdown renderer */
function renderMD(text) {
  const lines = text.split("\n");
  const out = [];
  let list = null, listType = null;
  const flush = () => {
    if (list) {
      out.push(listType === "ol" ? <ol key={out.length}>{list}</ol> : <ul key={out.length}>{list}</ul>);
      list = null; listType = null;
    }
  };
  const bold = (s) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
      p.startsWith("**") && p.endsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : p);

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (/^#{1,4}\s/.test(line)) {
      flush(); out.push(<h4 key={i} className="md-h">{bold(line.replace(/^#{1,4}\s/, ""))}</h4>);
    } else if (/^[-*]\s/.test(line.trim())) {
      if (listType !== "ul") { flush(); list = []; listType = "ul"; }
      list.push(<li key={i}>{bold(line.trim().replace(/^[-*]\s/, ""))}</li>);
    } else if (/^\d+[.)]\s/.test(line.trim())) {
      if (listType !== "ol") { flush(); list = []; listType = "ol"; }
      list.push(<li key={i}>{bold(line.trim().replace(/^\d+[.)]\s/, ""))}</li>);
    } else if (line.trim() === "") { flush(); }
    else { flush(); out.push(<p key={i} className="md-p">{bold(line)}</p>); }
  });
  flush();
  return out;
}

export default function Chat({ noteId, convId, onConvCreated, goBack }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [activeConv, setActiveConv] = useState(convId || null);
  const [videoTopic, setVideoTopic] = useState(null);
  const bottomRef = useRef(null);
  const fileRef = useRef(null);
  const recRef = useRef(null);

  // Load past conversation
  useEffect(() => {
    if (convId) {
      api.convMessages(convId)
        .then((msgs) => setMessages(msgs))
        .catch(() => setMessages([]));
      setActiveConv(convId);
    }
  }, [convId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const addFiles = (e) => {
    const chosen = Array.from(e.target.files);
    if (files.length + chosen.length > 4) alert("Maximum 4 files per message.");
    setFiles([...files, ...chosen].slice(0, 4));
    e.target.value = "";
  };

  /* Voice input (Chrome/Edge) */
  const toggleVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Voice input works in Chrome or Edge browsers."); return; }
    if (listening) { recRef.current?.stop(); return; }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.onresult = (e) =>
      setInput(Array.from(e.results).map((r) => r[0].transcript).join(""));
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const send = async (text) => {
    const msg = (text ?? input).trim();
    if ((!msg && files.length === 0) || loading) return;
    recRef.current?.stop();
    const userMsg = { role: "user", text: msg, files: files.map((f) => f.name) };
    setMessages((prev) => [...prev, userMsg]);
    const toSend = files;
    setInput(""); setFiles([]); setLoading(true);
    try {
      const history = messages.filter((m) => m.text)
        .map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
      const data = toSend.length > 0
        ? await api.chatFiles(msg, history, noteId, toSend, activeConv)
        : await api.chat({ message: msg, history, noteId, convId: activeConv });
      setMessages((prev) => [...prev, { role: "model", text: data.reply }]);
      if (data.convId && !activeConv) {
        setActiveConv(data.convId);
        if (onConvCreated) onConvCreated(data.convId);
      }
    } catch (err) {
      setMessages((prev) => [...prev, { role: "model", text: "⚠️ " + err.message }]);
    }
    setLoading(false);
  };

  /* Per-answer tools */
  const lastUserBefore = (idx) => {
    for (let i = idx - 1; i >= 0; i--)
      if (messages[i].role === "user" && messages[i].text) return messages[i].text;
    return "study topic";
  };
  const copyAnswer = (t) => navigator.clipboard.writeText(t);
  const wordAnswer = (t, topic) => {
    const html = `<html><head><meta charset="utf-8"></head><body style="font-family:Calibri">
      <h2>${topic.replace(/</g, "&lt;")}</h2><p style="white-space:pre-wrap">${t.replace(/</g, "&lt;")}</p>
      <p><i>— Study Buddy</i></p></body></html>`;
    const blob = new Blob([html], { type: "application/msword" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${topic.replace(/[^a-z0-9 ]/gi, "").slice(0, 40) || "answer"}.doc`;
    a.click(); URL.revokeObjectURL(a.href);
  };
  const pdfAnswer = (t, topic) => {
    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>${topic}</title>
      <style>body{font-family:Segoe UI,Arial;max-width:800px;margin:40px auto;line-height:1.7}
      h2{color:#5a4bd1} pre{white-space:pre-wrap;font-family:inherit}</style></head>
      <body><h2>${topic.replace(/</g, "&lt;")}</h2><pre>${t.replace(/</g, "&lt;")}</pre>
      <p><i>— Study Buddy</i></p></body></html>`);
    w.document.close(); w.focus();
    setTimeout(() => w.print(), 400);
  };
  const youtubeSearch = (topic) => setVideoTopic(topic);

  const starters = [
    { icon: "🧠", title: "Explain a concept", text: "Explain object-oriented programming with a real-world example" },
    { icon: "🧮", title: "Solve step by step", text: "Solve this step by step: derivative of x² · sin(x)" },
    { icon: "📅", title: "Make a study plan", text: "Make me a 7-day study plan for my Database Systems final exam" },
    { icon: "📎", title: "Analyze my document", attach: true },
  ];

  return (
    <div className="chat-wrap">
      {noteId && (
        <div className="context-bar">
          📄 Chatting about your note <button className="btn ghost small" onClick={goBack}>Open note</button>
        </div>
      )}

      <div className="chat-messages big">
        {messages.length === 0 && !loading && (
          <div className="hero">
            <div className="hero-logo">📚</div>
            <h1>How can I help you study today?</h1>
            <p className="hero-sub">Expert help in every subject — attach documents & images, use voice, get videos</p>
            <div className="starter-grid">
              {starters.map((s) => (
                <div key={s.title} className="starter-card"
                  onClick={() => s.attach ? fileRef.current.click() : send(s.text)}>
                  <span className="starter-icon">{s.icon}</span>
                  <b>{s.title}</b>
                  <small>{s.attach ? "Upload a PDF, slides or an image" : s.text}</small>
                </div>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`msg-row ${m.role}`}>
            <div className="msg-avatar">{m.role === "user" ? "🧑" : "🤖"}</div>
            <div className="msg-col">
              <div className={`bubble ${m.role}`}>
                {m.files && m.files.length > 0 && (
                  <div className="bubble-files">
                    {m.files.map((f) => <span key={f} className="file-tag">📎 {f}</span>)}
                  </div>
                )}
                {m.role === "model" ? renderMD(m.text) : m.text}
              </div>
              {m.role === "model" && !m.text.startsWith("⚠️") && (
                <div className="answer-tools">
                  <button title="Copy" onClick={() => copyAnswer(m.text)}>📋</button>
                  <button title="Download as Word" onClick={() => wordAnswer(m.text, lastUserBefore(i))}>⬇ Word</button>
                  <button title="Save as PDF" onClick={() => pdfAnswer(m.text, lastUserBefore(i))}>🖨 PDF</button>
                  <button title="Watch YouTube videos on this topic" onClick={() => youtubeSearch(lastUserBefore(i))}>🎥 Videos</button>
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="msg-row model">
            <div className="msg-avatar">🤖</div>
            <div className="bubble model typing">Thinking<span className="dots"><i>.</i><i>.</i><i>.</i></span></div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {files.length > 0 && (
        <div className="attach-row">
          {files.map((f, i) => (
            <span key={i} className="attach-chip">
              {f.type.startsWith("image/") ? "🖼️" : "📄"} {f.name.slice(0, 24)}{f.name.length > 24 ? "…" : ""}
              <b onClick={() => setFiles(files.filter((_, j) => j !== i))}> ✕</b>
            </span>
          ))}
        </div>
      )}

      <div className="chat-input big">
        <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={addFiles} />
        <button className="plus-btn" title="Attach up to 4 files or images"
          onClick={() => fileRef.current.click()}>+</button>
        <button className={`mic-btn ${listening ? "live" : ""}`}
          title="Voice input" onClick={toggleVoice}>🎤</button>
        <input value={input} placeholder={listening ? "Listening… speak now" : "Ask anything — any subject, any level…"}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()} />
        <button className="btn primary send-btn" onClick={() => send()} disabled={loading}>➤</button>
      </div>
      <p className="chat-footnote">Study Buddy can make mistakes — verify important information.</p>

      {videoTopic && (
        <div className="video-overlay" onClick={() => setVideoTopic(null)}>
          <div className="video-modal" onClick={(e) => e.stopPropagation()}>
            <div className="video-head">
              <b>🎥 Video lessons: {videoTopic.slice(0, 60)}</b>
              <span>
                <a className="btn ghost small" target="_blank" rel="noreferrer"
                  href={"https://www.youtube.com/results?search_query=" + encodeURIComponent(videoTopic + " explained tutorial")}>
                  Open on YouTube ↗
                </a>{" "}
                <button className="btn ghost small" onClick={() => setVideoTopic(null)}>✕ Close</button>
              </span>
            </div>
            <iframe
              title="Video lessons"
              src={"https://www.youtube.com/embed?listType=search&list=" + encodeURIComponent(videoTopic + " explained tutorial")}
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