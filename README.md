# Peace Dictionary CMS

Internal CMS for managing the UN Peace & Security Dictionary. Authors create and edit glossary terms with markdown content, accordion sections, wiki-links between terms, and external references. The export feature generates a single Drupal-ready HTML fragment with semantic markup.

**Default login (after `npm run seed`):** `admin` / `admin` — change immediately in production.

## Features

- **Term editor** with live preview matching the dictionary's production CSS
- **Predefined accordion sections** (In simple terms, Why it matters, How it works, Questions people ask, Data / Facts and Figures)
- **Wiki-links** — `[[Term Name]]` syntax auto-links terms; related terms are auto-suggested from content
- **Revision history** with snapshot diffs and one-click restore
- **Drupal HTML export** — generates the full dictionary as a single HTML fragment for embedding
- **JSON bulk import/export** — back up or migrate all terms between environments
- **Search and sortable columns** on the terms list
- **Multi-user auth** with admin and editor roles

## Tech Stack

- **Runtime**: Node.js 18+, Express 4.x
- **Database**: SQLite locally (via Sequelize), Neon PostgreSQL in production
- **ORM**: Sequelize 6.x
- **Auth**: Passport.js local strategy, bcryptjs, express-session
- **Security**: Helmet, CSRF tokens, `noindex` headers
- **Templating**: EJS
- **Markdown**: Marked.js (server + client)
- **Deployment**: Vercel (serverless) or Railway

## Project Structure

```
├── server.js              Express app setup
├── api/index.js           Vercel serverless entry
├── config/
│   ├── database.js        Sequelize: Neon on Vercel/Railway, SQLite locally
│   └── passport.js        Passport local strategy
├── middleware/
│   └── auth.js            Auth guards
├── helpers/
│   ├── export.js          Drupal HTML generation
│   ├── markedConfig.js    Shared Marked.js config
│   ├── predefinedSections.js  Section slot definitions
│   ├── snapshotDiff.js    Revision diff logic
│   └── email.js           Password reset emails
├── models/
│   └── index.js           Term, AccordionSection, ExternalLink, TermRevision, etc.
├── routes/
│   ├── index.js           Root redirect
│   ├── auth.js            Login, logout, forgot/reset password
│   ├── terms.js           Term CRUD + revisions + JSON import/export
│   ├── export.js          Drupal HTML export
│   └── admin.js           User + settings management
├── views/
│   ├── partials/          admin-head, admin-footer, head, footer
│   ├── admin/             dashboard, terms, term-edit, export, users, settings
│   └── auth/              login, forgot-password, reset-password
├── public/css/
│   ├── admin.css          Admin panel styles
│   └── peace-dictionary-preview.css  Live preview styles
├── scripts/
│   ├── seed.js            Initial admin user + sample terms
│   └── seed-reference-terms.js  Import from reference HTML
└── package.json
```

## Local Development

```bash
cd peace-dictionary-cms
npm install
cp .env.example .env
npm run seed     # creates admin user + sample terms
npm run dev      # http://localhost:3000
```

Login: `admin` / `admin`

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SESSION_SECRET` | Yes (prod) | Express session secret |
| `DATABASE_URL` | Yes (prod) | Neon PostgreSQL connection string |
| `APP_URL` | Yes (prod) | Full URL of the deployed site |
| `PORT` | No | Default 3000 |
| `NODE_ENV` | Yes (prod) | Set to `production` |
| `SMTP_HOST` | No | SMTP server for password reset emails |
| `SMTP_PORT` | No | SMTP port (default 587) |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASS` | No | SMTP password |
| `MAIL_FROM` | No | From address for emails |

## Deployment

### Vercel

1. Import the repo at [vercel.com](https://vercel.com)
2. Set env vars: `SESSION_SECRET`, `DATABASE_URL`, `NODE_ENV=production`, `APP_URL`
3. Deploy — `vercel.json` is auto-detected

### Railway

1. New project at [railway.app](https://railway.app)
2. Deploy from GitHub, set the same env vars
3. Run `DATABASE_URL="..." npm run seed` to create the admin user
