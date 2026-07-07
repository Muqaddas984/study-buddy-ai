# 📚 Study Buddy — AI-Powered Learning Platform

Full stack web app: paste your study notes → AI generates summaries, quizzes, and answers your questions.

**Stack:** React (Vite) + Node.js/Express + MySQL (XAMPP) + Gemini API

## Features
- User registration & login (bcrypt password hashing + JWT tokens)
- Save notes by subject
- ✨ AI Summary — bullet-point revision summary of any note
- 📝 AI Quiz — 5 MCQs generated from your note, with score tracking
- 💬 AI Tutor Chat — general chat, or grounded in the note you're studying (understands Roman Urdu too)
- Progress stats: total notes, quizzes taken, average score
- Fully responsive (mobile + desktop)

## Setup (10 minutes)

### 1. Database
- Start MySQL in XAMPP
- Open http://localhost/phpmyadmin → Import → `database/study_buddy.sql`

### 2. Backend
```bash
cd server
npm install
```
Create a file `server/.env` (copy from `.env.example`):
```
GEMINI_API_KEY=your_key_from_aistudio.google.com
JWT_SECRET=any_random_text_here
```
Then run:
```bash
node index.js
```
Server starts at http://localhost:5000

### 3. Frontend
```bash
cd client
npm install
npm run dev
```
Open http://localhost:5173 — register an account and start studying!

## API Endpoints
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | /api/register | Create account |
| POST | /api/login | Login, returns JWT |
| GET/POST/DELETE | /api/notes | Notes CRUD |
| POST | /api/ai/summarize | AI summary of a note |
| POST | /api/ai/quiz | Generate 5 MCQs (JSON) |
| POST | /api/ai/chat | AI tutor chat (optional note context) |
| GET | /api/stats | Progress stats |

## Security Notes (interview talking points)
- API key lives only on the backend (.env, gitignored) — never exposed to the browser
- Passwords hashed with bcrypt, never stored in plain text
- JWT auth middleware protects all note/AI routes
- PreparedStatement-style parameterized queries (mysql2) prevent SQL injection
- Every query filters by user_id — users can only access their own notes
