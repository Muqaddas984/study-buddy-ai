import { useEffect, useState } from "react";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import NoteView from "./pages/NoteView";
import Chat from "./pages/Chat";
import { api } from "./api";
import "./App.css";

export default function App() {
  const [userName, setUserName] = useState(localStorage.getItem("userName") || "");
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");
  const loggedIn = !!localStorage.getItem("token");
  const [view, setView] = useState({ page: "chat", noteId: null, convId: null });
  const [notes, setNotes] = useState([]);
  const [convs, setConvs] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatNonce, setChatNonce] = useState(0);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const refreshNotes = () => {
    if (localStorage.getItem("token"))
      api.getNotes().then(setNotes).catch(() => {});
  };
  const refreshConvs = () => {
    if (localStorage.getItem("token"))
      api.conversations().then(setConvs).catch(() => {});
  };
  useEffect(() => {
    if (loggedIn && userName) { refreshNotes(); refreshConvs(); }
  }, [loggedIn, userName]);

  const go = (page, noteId = null, convId = null) => {
    setView({ page, noteId, convId });
    setMenuOpen(false);
  };

  const removeConv = async (e, id) => {
    e.stopPropagation();
    if (!confirm("Delete this chat?")) return;
    await api.deleteConv(id).catch(() => {});
    if (view.convId === id) go("chat");
    refreshConvs();
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userName");
    setUserName("");
    setNotes([]); setConvs([]);
    setView({ page: "chat", noteId: null, convId: null });
  };

  if (!loggedIn || !userName) return <Login onLogin={setUserName} />;

  return (
    <div className="shell">
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="side-top">
          <span className="logo" onClick={() => go("chat")}>📚 Study Buddy</span>
        </div>

        <button className="new-chat-btn"
          onClick={() => { setChatNonce((n) => n + 1); go("chat"); }}>+ New Chat</button>

        <nav className="side-nav">
          <div className={`side-item ${view.page === "dashboard" ? "on" : ""}`} onClick={() => go("dashboard")}>
            📊 Dashboard & Notes
          </div>
        </nav>

        <div className="side-scroll">
          {convs.length > 0 && (
            <>
              <div className="side-label">RECENT CHATS</div>
              {convs.map((c) => (
                <div key={c.conv_id}
                  className={`side-note ${view.page === "chat" && view.convId === c.conv_id ? "on" : ""}`}
                  onClick={() => go("chat", null, c.conv_id)} title={c.title}>
                  <span className="sn-title">💬 {c.title}</span>
                  <b className="sn-del" onClick={(e) => removeConv(e, c.conv_id)}>✕</b>
                </div>
              ))}
            </>
          )}

          <div className="side-label">MY NOTES ({notes.length})</div>
          {notes.length === 0 && <div className="side-empty">No notes yet</div>}
          {notes.map((n) => (
            <div key={n.note_id}
              className={`side-note ${view.page === "note" && view.noteId === n.note_id ? "on" : ""}`}
              onClick={() => go("note", n.note_id)} title={n.title}>
              <span className="sn-title">📄 {n.title}</span>
              <span className="sn-sub">{n.subject}</span>
            </div>
          ))}
        </div>

        <div className="side-bottom">
          <div className="side-user">
            <span className="avatar">{userName[0]?.toUpperCase()}</span>
            <span className="side-username">{userName.split(" ")[0]}</span>
            <button className="theme-toggle" title="Dark mode"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
              {theme === "light" ? "🌙" : "☀️"}
            </button>
            <button className="btn ghost small" onClick={logout}>Logout</button>
          </div>
        </div>
      </aside>
      {menuOpen && <div className="side-overlay" onClick={() => setMenuOpen(false)}></div>}

      <main className="main">
        <div className="mobile-bar">
          <button className="hamburger" onClick={() => setMenuOpen(true)}>☰</button>
          <span className="logo">📚 Study Buddy</span>
        </div>

        {view.page === "chat" && (
          <Chat key={view.convId ? "c" + view.convId : "new" + chatNonce} noteId={view.noteId} convId={view.convId}
            onConvCreated={(id) => { setView(v => ({ ...v, convId: id })); refreshConvs(); }}
            goBack={() => go(view.noteId ? "note" : "chat", view.noteId)} />
        )}
        {view.page === "dashboard" && (
          <Dashboard
            openNote={(id) => { refreshNotes(); go("note", id); }}
            openChat={() => go("chat")}
            onNotesChanged={refreshNotes}
          />
        )}
        {view.page === "note" && (
          <NoteView noteId={view.noteId} goBack={() => go("dashboard")}
            openChat={(id) => go("chat", id)} onNotesChanged={refreshNotes} />
        )}
      </main>
    </div>
  );
}