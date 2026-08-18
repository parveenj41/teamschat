# TeamsChat — a Microsoft Teams-style chat replica

A full-stack, real-time group chat app: sign up, log in, forgot/reset password by
email, create groups, and chat live in them (Socket.io). Built with:

- **Backend:** Node.js, Express, Socket.io, MongoDB (Mongoose), JWT auth, bcrypt, Nodemailer
- **Frontend:** Plain HTML/CSS/JavaScript (no build step needed)

The backend serves the frontend too, so the whole thing deploys as **one single
web service** — no separate frontend hosting needed.

```
teamschat/
├── backend/          Express + Socket.io API and server
│   ├── models/        Mongoose schemas (User, Group, Message)
│   ├── routes/        REST routes (auth, groups, messages)
│   ├── middleware/     JWT auth middleware
│   ├── utils/          Email sender
│   └── server.js       Entry point (serves frontend + API + sockets)
└── frontend/          Static site (login, signup, forgot/reset password, dashboard)
```

---

## 1. Run it locally

### Step 1 — Get a free MongoDB database
1. Go to https://www.mongodb.com/cloud/atlas/register and create a free account.
2. Create a free **M0 cluster**.
3. Under **Database Access**, create a DB user with a username/password.
4. Under **Network Access**, add `0.0.0.0/0` (allow access from anywhere) — needed
   since your host's IP isn't fixed on free tiers.
5. Click **Connect → Drivers**, copy the connection string. It looks like:
   `mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`
   Add a database name before the `?`, e.g. `.../teamschat?retryWrites=true...`

### Step 2 — Configure environment variables
```bash
cd backend
cp .env.example .env
```
Open `.env` and fill in:
- `MONGO_URI` — the connection string from Step 1
- `JWT_SECRET` — any long random string (e.g. generate one with `openssl rand -hex 32`)
- `CLIENT_URL` — `http://localhost:5000` for local dev
- `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_USER` / `EMAIL_PASS` — see **Email setup** below

### Step 3 — Install and run
```bash
cd backend
npm install
npm start
```
Visit **http://localhost:5000** — you'll land on the login page.

> If you don't set up email yet, "Forgot password" still works: since sending fails
> gracefully, the API returns a `devResetUrl` field and the page shows you the
> reset link directly on screen so you can test the full flow without email.

---

## 2. Email setup (for real "forgot password" emails)

Easiest free option — **Gmail App Password**:
1. Turn on 2-Step Verification on your Google account.
2. Go to https://myaccount.google.com/apppasswords and create an app password.
3. Use these values in `.env`:
   ```
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_USER=your_email@gmail.com
   EMAIL_PASS=<the 16-character app password>
   ```

Alternative free option for testing only (emails aren't really delivered, but you
can view them in a browser inbox): https://ethereal.email — click "Create Ethereal
Account" and use the generated SMTP credentials.

---

## 3. Deploy for free — Render.com (recommended)

Render's free tier supports Node.js + WebSockets (needed for Socket.io), so the
whole app — frontend and backend together — runs as a single free web service.

1. Push this project to a **GitHub repository**.
2. Go to https://render.com and sign up (free).
3. Click **New → Web Service**, connect your GitHub repo.
4. Configure:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
5. Add environment variables (same as your `.env`, under **Environment**):
   `MONGO_URI`, `JWT_SECRET`, `CLIENT_URL`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`
   - Set `CLIENT_URL` to the Render URL you'll be given, e.g.
     `https://teamschat.onrender.com` (you can update this after the first deploy
     once you know the exact URL).
6. Click **Create Web Service**. Render will build and deploy automatically.
7. Once live, visit the URL Render gives you — that's your whole app, live and free.

**Note:** on Render's free tier, the service "spins down" after 15 minutes of
inactivity and takes ~30–50 seconds to wake back up on the next visit. That's a
free-tier limitation, not a bug in the app.

### Alternative free hosts
- **Railway.app** — similar flow (connect repo, set root dir to `backend`, add env vars). Free trial credit, then usage-based.
- **Cyclic.sh** / **Fly.io** — also support Node + WebSockets on free tiers, same general steps: install, set start command to `npm start`, add env vars.
- Avoid Vercel/Netlify for the backend — their free tiers don't support persistent WebSocket connections, which Socket.io needs. If you want to use Vercel, you'd need to host only the static frontend there and the Socket.io backend elsewhere, which adds complexity — not needed here since Render handles both together.

---

## 4. How the pieces fit together

- **Auth:** Passwords are hashed with bcrypt before saving. Login/signup return a
  JWT stored in the browser's `localStorage`; it's sent as a `Bearer` token on
  every API request and validated by `middleware/auth.js`.
- **Forgot/reset password:** A random token is generated, hashed, and stored on
  the user with a 1-hour expiry. The *unhashed* token is emailed as a link; the
  reset endpoint re-hashes the submitted token and compares it to what's stored.
- **Groups:** Any logged-in user can create a group and invite others by email.
  Only members of a group can view its messages or add more members.
- **Real-time chat:** Socket.io authenticates each socket connection with the same
  JWT. Joining a group makes the browser join a Socket.io "room" named after the
  group's ID; messages are saved to MongoDB and then broadcast to everyone in that
  room instantly.

## 5. Ideas to extend it
- Direct (1-to-1) messages, not just groups
- Online/offline presence indicators
- File/image sharing in chat
- Message editing/deleting
- Read receipts
