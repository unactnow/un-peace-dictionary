# Peace Dictionary CMS

Internal utility to manage UN Peace Dictionary terms and export a Drupal-ready HTML fragment (semantic markup, microdata, JSON-LD). Based on the express-app template stack.

**Default login (after `npm run seed`):** `admin` / `admin` — change immediately in production.

## Tech Stack

- **Backend**: Node.js 18+, Express 4.x
- **Database**: SQLite locally (via Sequelize), Neon PostgreSQL in production (with `@neondatabase/serverless` driver for Vercel, standard `pg` for Railway)
- **ORM**: Sequelize 6.x (models, migrations, associations)
- **Auth**: Passport.js (local strategy) with bcryptjs, express-session, connect-flash
- **Image processing**: Multer (memory storage) + Sharp — auto-resizes uploads, JPEG compression
- **Security**: Helmet (HTTP security headers)
- **Email**: Nodemailer (for password resets) — logs to console if SMTP not configured
- **Templating**: EJS with partials (head/footer)
- **Deployment**: Vercel (serverless) and/or Railway (long-running server)

## Project Structure

```
├── server.js              Express app: helmet, sessions, passport, flash, routes, error handling
├── api/
│   └── index.js           Vercel serverless entry point
├── config/
│   ├── database.js        Sequelize config: Neon serverless on Vercel, pg on Railway, SQLite locally
│   └── passport.js        Passport local strategy (authenticates by email)
├── middleware/
│   ├── auth.js            Auth guards: ensureAuthenticated, ensureGuest, ensureRole, isAdmin
│   └── upload.js          Multer file filter + Sharp image resize/compress
├── helpers/
│   ├── pagination.js      getPagination(page, perPage, total) → metadata object
│   └── email.js           sendResetEmail(toEmail, resetUrl) via SMTP or console fallback
├── models/
│   └── index.js           Sequelize models: User (UUID, roles), PasswordResetToken
├── routes/
│   ├── index.js           Placeholder index route
│   ├── auth.js            Login, logout, forgot/reset password
│   └── admin.js           User management (admin only): list, add, delete
├── views/
│   ├── partials/
│   │   ├── head.ejs       Opens HTML, head, nav, flash messages, opens main
│   │   └── footer.ejs     Closes main, footer, closes HTML
│   ├── index.ejs          Placeholder index page
│   ├── error.ejs          Error page (404/500)
│   ├── auth/
│   │   ├── login.ejs
│   │   ├── forgot-password.ejs
│   │   └── reset-password.ejs
│   └── admin/
│       └── users.ejs      User management table + add form
├── public/
│   └── css/
│       └── style.css      CSS reset, variables, base component styles
├── uploads/               Local upload storage (gitignored except .gitkeep)
├── scripts/
│   └── seed.js            Creates the first admin user
├── package.json           Dependencies and scripts (start, dev, seed)
├── vercel.json            Vercel deployment config
├── railway.json           Railway deployment config
├── Procfile               Heroku-compatible process file
├── .env.example           All env vars documented
├── .gitignore
└── .cursor/rules/         Cursor AI rules (stack conventions, patterns)
```

## Roles

Two roles: **admin** and **user**.

| | Admin | User |
|---|---|---|
| Log in / Log out | Yes | Yes |
| Reset password via email | Yes | Yes |
| View/add/delete users | Yes | No |
| `/admin/users` page | Yes | No |

No public registration. Admins add users via the Users page.

## How the Database Works

- **Locally**: Uses SQLite (`database.sqlite`, auto-created). No setup needed.
- **In production**: Set `DATABASE_URL` to a Neon PostgreSQL connection string.
- `config/database.js` auto-detects the environment:
  - On **Vercel**: Uses `@neondatabase/serverless` driver
  - On **Railway**: Uses standard `pg` driver with SSL
  - **Locally**: Falls back to SQLite
- `sequelize.sync({ alter: true })` runs on startup — auto-creates/updates tables.
- Models: `User` (UUID, name, email, password, role) and `PasswordResetToken`.

## How Image Uploads Work

- `middleware/upload.js` exports a Multer instance with memory storage.
- File filter allows: jpeg, jpg, png, gif, webp. Max size: 10MB.
- `upload.processImage(file)` resizes to max 2400px and compresses to JPEG using Sharp. Returns a Buffer.
- Use in routes: `upload.single('image')` as middleware, then `await upload.processImage(req.file)`.

## How Auth Works

- Passport local strategy authenticates by email + bcrypt password.
- Sessions via express-session (secure cookies in production).
- Flash messages via connect-flash: `success_msg`, `error_msg`, `error`.
- `res.locals.user` available in all templates (Passport user object or null).
- Auth middleware: `ensureAuthenticated`, `ensureGuest`, `ensureRole('admin')`, `isAdmin`.
- Password reset: generates token, sends email via Nodemailer (or logs URL to console). Token expires in 1 hour.

## CSS & Templates

- `partials/head.ejs` opens the page: HTML head, nav (role-aware links), flash messages, `<main>`.
- `partials/footer.ejs` closes the page: `</main>`, footer, `</body>`.
- `style.css` defines CSS variables and base styles for nav, forms, buttons, tables, flash messages, badges, pagination. Override variables to change the design.
- Every `res.render()` must pass `{ title: 'Page Title' }`.

## Local Development

```bash
cp -r express-app my-new-project
cd my-new-project
npm install
cp .env.example .env
npm run seed                # creates admin user
npm run dev                 # http://localhost:3000
```

Default login: `admin@example.com` / `admin` (change immediately).

## Publishing a New Project

### 1. Create a GitHub repo

```bash
git remote add origin git@github.com:YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### 2. Create free PostgreSQL database (Neon)

1. Go to **[neon.tech](https://neon.tech)** and sign up (free)
2. Create a new project
3. Copy the **connection string**: `postgresql://user:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require`

### 3a. Deploy on Vercel (serverless)

Best for: sites with low/bursty traffic, no WebSockets, no long-running processes.

1. Go to **[vercel.com](https://vercel.com)** → Import Git Repository
2. Select your repo
3. Add env vars: `SESSION_SECRET`, `DATABASE_URL`, `NODE_ENV=production`, `APP_URL`
4. Deploy — Vercel picks up `vercel.json` automatically

**Vercel notes:** 10s timeout on free tier. No persistent filesystem. Uses `@neondatabase/serverless` driver automatically.

### 3b. Deploy on Railway (long-running server)

Best for: WebSockets, background jobs, persistent connections.

1. Go to **[railway.app](https://railway.app)** → New Project
2. Add PostgreSQL: New Service → Database → PostgreSQL
3. Deploy from GitHub → select your repo
4. Set env vars: `SESSION_SECRET`, `NODE_ENV=production`, `APP_URL`, `DATABASE_URL`

**Railway notes:** $5/month free credit. Always-on (no cold starts). Uses standard `pg` driver.

### 4. Create first admin user

After deploy, run the seed script locally (pointed at your Neon DB):

```bash
DATABASE_URL="your-neon-connection-string" npm run seed
```

### 5. Set up SMTP (optional — password reset emails)

Without SMTP, password reset URLs are logged to the server console.

Add to env vars: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`

### 6. Post-deploy checklist

- [ ] Site loads at your deployment URL
- [ ] Admin can log in
- [ ] Admin can add/delete users via `/admin/users`
- [ ] Image uploads work (if applicable)
- [ ] Password reset email sends (or URL shows in logs)

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `SESSION_SECRET` | Yes (prod) | Express session secret |
| `DATABASE_URL` | Yes (prod) | Neon PostgreSQL connection string |
| `APP_URL` | Yes (prod) | Full URL of your site (for reset email links) |
| `PORT` | No | Default 3000. Railway sets automatically. Not used on Vercel. |
| `NODE_ENV` | Yes (prod) | Set to `production` for secure cookies and SSL |
| `SMTP_HOST` | No | SMTP server hostname |
| `SMTP_PORT` | No | SMTP port (default 587) |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASS` | No | SMTP password |
| `MAIL_FROM` | No | From address for emails |

## Vercel vs Railway

| | **Vercel** | **Railway** |
|---|---|---|
| Hosting model | Serverless | Always-on server |
| Cold starts | Yes (~5-10s) | No |
| WebSockets | No | Yes |
| File uploads | External storage only | Disk (resets on redeploy) |
| Free tier | 100GB bandwidth | $5/month credit |

You can deploy to both simultaneously — the codebase auto-detects the environment.

## Adding to This Template

1. Add models in `models/index.js` (Sequelize models + associations)
2. Add route files in `routes/` and register in `server.js`
3. Add EJS templates in `views/` using `<%- include('partials/head') %>` / `footer`
4. Add CSS/JS in `public/`
5. Use `upload.single('fieldname')` + `upload.processImage()` for image fields
6. Use `ensureAuthenticated` / `isAdmin` middleware on protected routes
7. Use `getPagination()` from `helpers/pagination.js` for paginated lists
