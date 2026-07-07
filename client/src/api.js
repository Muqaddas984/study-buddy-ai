const BASE = "http://localhost:5000/api";

function headers(json = true) {
  const token = localStorage.getItem("token");
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request(path, options = {}) {
  const res = await fetch(BASE + path, { headers: headers(), ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

export const api = {
  register: (body) => request("/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body) => request("/login", { method: "POST", body: JSON.stringify(body) }),
  getNotes: () => request("/notes"),
  getNote: (id) => request(`/notes/${id}`),
  addNote: (body) => request("/notes", { method: "POST", body: JSON.stringify(body) }),
  updateNote: (id, body) => request(`/notes/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteNote: (id) => request(`/notes/${id}`, { method: "DELETE" }),
  uploadNote: async (file, title, subject) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("title", title);
    fd.append("subject", subject);
    const res = await fetch(BASE + "/notes/upload", {
      method: "POST", headers: headers(false), body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Upload failed");
    return data;
  },
  summarize: (noteId) => request("/ai/summarize", { method: "POST", body: JSON.stringify({ noteId }) }),
  quiz: (noteId, difficulty, count) => request("/ai/quiz", { method: "POST", body: JSON.stringify({ noteId, difficulty, count }) }),
  generateNotes: (topic, subject) => request("/ai/generate-notes", { method: "POST", body: JSON.stringify({ topic, subject }) }),
  chatFiles: async (message, history, noteId, files, convId) => {
    const fd = new FormData();
    fd.append("message", message);
    fd.append("history", JSON.stringify(history));
    if (noteId) fd.append("noteId", noteId);
    if (convId) fd.append("convId", convId);
    files.forEach((f) => fd.append("files", f));
    const res = await fetch(BASE + "/ai/chat-files", {
      method: "POST", headers: headers(false), body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Chat failed");
    return data;
  },
  flashcards: (noteId) => request("/ai/flashcards", { method: "POST", body: JSON.stringify({ noteId }) }),
  saveResult: (body) => request("/quiz-results", { method: "POST", body: JSON.stringify(body) }),
  quizHistory: () => request("/quiz-results"),
  chat: (body) => request("/ai/chat", { method: "POST", body: JSON.stringify(body) }),
  conversations: () => request("/conversations"),
  convMessages: (id) => request(`/conversations/${id}`),
  deleteConv: (id) => request(`/conversations/${id}`, { method: "DELETE" }),
  explainMistakes: (items) => request("/ai/explain-mistakes", { method: "POST", body: JSON.stringify({ items }) }),
  stats: () => request("/stats"),
};