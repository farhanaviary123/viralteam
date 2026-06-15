# Viral Team

A creative strategy and content production app for managing UGC video concepts. Strategists build and assign concepts; creators receive shoot briefs and edit instructions.

---

## Tech Stack

| Layer | Technology | Hosting |
|---|---|---|
| Frontend | React + Vite | Vercel |
| Backend | Node.js + Express | Railway |
| Database | PostgreSQL | Supabase |
| Media Storage | Cloudinary | Cloudinary |
| Auth | JWT (Bearer tokens) | — |

---

## Project Structure

```
/
├── frontend/          # React + Vite app
│   ├── src/
│   │   ├── pages/
│   │   │   ├── creator/       # Creator-facing pages
│   │   │   └── strategist/    # Strategist-facing pages
│   │   ├── components/        # Shared components
│   │   ├── context/           # AuthContext (user session)
│   │   └── api/               # API helper (index.js)
│   └── index.html
│
└── backend/
    ├── src/
    │   ├── routes/            # Express route handlers
    │   │   ├── auth.js        # Login, register, /me
    │   │   ├── concepts.js    # Concept generation + fetch
    │   │   ├── users.js       # Creator management
    │   │   ├── songs.js       # Songs (with TikTok links)
    │   │   ├── formats.js
    │   │   ├── angles.js
    │   │   ├── copyLines.js
    │   │   └── products.js
    │   ├── db/
    │   │   └── migrate.js     # Base schema
    │   └── generation.js      # Concept generation logic
    └── migrations/            # Versioned migration files (v1–v20+)
```

---

## User Roles

### Creator
- Views assigned concepts on their home screen
- Goes through a shoot phase (shot list, hook references, clip order)
- Goes through an edit phase (text for video, song, hook, clip order)
- Accesses their Playbook link (assigned by strategist) for footage upload/download
- Marks concepts and individual videos as done

### Strategist
- Builds the creative strategy (angles, formats, copy lines, hooks, clip orders)
- Generates concepts for creators using the randomiser
- Manages songs, products, and preset concepts
- Assigns Playbook links to creators
- Views and manages all creators

---

## Key Features

- **Concept Generator** — randomly assigns angle + format + copy lines + hook + song per concept, weighted by priority
- **Variation system** — each concept has 1–5 video variations, each with their own copy line, song, and clip order
- **Concept naming** — displayed as `Concept N: Angle Name` with format as subtitle
- **Archive system** — angles and copy lines can be archived (soft delete) instead of hard deleted; archived items are excluded from generation
- **Strategist passcode** — required env var to prevent unauthorised strategist signups
- **Playbook integration** — strategist assigns a Playbook URL per creator; shown as a button in the shoot and edit flows

---

## Environment Variables

### Backend (Railway)

```
DATABASE_URL=<Supabase PostgreSQL connection string>
JWT_SECRET=<your JWT secret>
CLOUDINARY_CLOUD_NAME=<cloudinary cloud name>
CLOUDINARY_API_KEY=<cloudinary api key>
CLOUDINARY_API_SECRET=<cloudinary api secret>
STRATEGIST_PASSCODE=<passcode required to register as strategist>
```

### Frontend (Vercel)

```
VITE_API_URL=<Railway backend URL, e.g. https://scalemax-production.up.railway.app>
```

---

## Running Locally

### Prerequisites
- Node.js 18+
- A Supabase PostgreSQL database
- A Cloudinary account

### Backend

```bash
cd backend
npm install
cp .env.example .env
# Fill in .env with your values
npm start
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
# Set VITE_API_URL to your local backend (e.g. http://localhost:3000)
npm run dev
```

---

## Database Migrations

Migrations are versioned files in `/backend/migrations/`. They run sequentially and are tracked in a `schema_migrations` table.

To run a specific migration:

```bash
npm run migrate:v20
```

To run all pending migrations:

```bash
npm run migrate
```

**On Railway:** migrations are run via the Custom Start Command:
```
npm run migrate:vXX && npm start
```
Change back to `npm start` after the migration completes successfully.

Current migration version: **v20** (adds `archived` column to angles and copy_lines)

---

## Deployment

### Frontend — Vercel
- Connected to the `main` branch of this repo
- Auto-deploys on every push
- If changes aren't reflecting, redeploy with **"Use existing Build Cache" unchecked**

### Backend — Railway
- Connected to the `main` branch
- Auto-deploys on every push
- Environment variables set in Railway dashboard → Variables tab

---

## Live URLs

- **Frontend:** https://scalemax-delta.vercel.app
- **Backend API:** https://scalemax-production.up.railway.app

---

## Notes for Developers

- The concept generation logic lives entirely in `backend/src/generation.js`
- `weightedPickNUnique()` handles copy line selection — if the eligible pool is smaller than `variationCount`, it cycles (known behaviour, being hardened)
- Product filter in generation: copy lines with `product_ids = []` match all products; copy lines with non-empty `product_ids` must include the selected product UUID — orphaned UUIDs (from deleted/recreated products) will silently exclude those copy lines
- `sequential_number` for concepts is computed via `ROW_NUMBER()` window function in the concepts list query, not stored in the DB
- Auth tokens are JWT stored in localStorage; `useAuth()` hook and `AuthContext` expose the full user object including `playbook_link`
