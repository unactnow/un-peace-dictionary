# PEACE DICTIONARY CMS — FULL IMPLEMENTATION PLAN

Build a web-based CMS (Content Management System) for managing UN Peace Dictionary
terms. The CMS lets non-coders add, edit, and delete peace/security dictionary terms
via structured forms with markdown body fields. It generates production-ready HTML
(with Schema.org microdata, JSON-LD, and FAQ schema) that can be copied and pasted
into a Drupal 7 site.

The app is a utility tool, not a public website. It requires login, blocks search
engines, and is hosted for free on Vercel with Neon PostgreSQL.


---

## SECTION 1: STARTING POINT — EXPRESS APP TEMPLATE

The project is based on an Express.js starter template located at:

    ~/Documents/git/express-app

Copy this template to create the new project at:

    ~/Documents/git/peace-dictionary-cms

Use rsync (excluding .venv, node_modules, .npm-cache, .git):

    rsync -a --exclude='.venv' --exclude='node_modules' --exclude='.npm-cache' --exclude='.git' ~/Documents/git/express-app/ ~/Documents/git/peace-dictionary-cms/

Then:

    cd ~/Documents/git/peace-dictionary-cms && rm -rf .git && git init

### THE TEMPLATE PROVIDES (keep all of these):

- `server.js` — Express app setup, middleware, route registration
- `api/index.js` — Vercel serverless entry point
- `config/database.js` — Sequelize config (auto-detects SQLite locally, Neon in prod)
- `config/passport.js` — Passport local strategy (authenticates by email)
- `models/index.js` — Sequelize models (User, PasswordResetToken, etc.)
- `middleware/auth.js` — auth guards: ensureAuthenticated, ensureGuest, ensureRole, isAdmin
- `middleware/upload.js` — Multer + Sharp image processing (keep but won't use much)
- `helpers/pagination.js` — pagination helper
- `helpers/email.js` — email sending for password resets
- `routes/auth.js` — login, logout, password reset routes
- `routes/admin.js` — admin CRUD routes (will be heavily modified)
- `routes/index.js` — public routes (will be simplified)
- `views/partials/head.ejs` — public layout header
- `views/partials/footer.ejs` — public layout footer
- `views/partials/admin-head.ejs` — admin layout header
- `views/partials/admin-footer.ejs` — admin layout footer
- `views/auth/` — login, forgot-password, reset-password, account views
- `public/css/admin.css` — admin panel CSS
- `public/css/style.css` — public CSS
- `scripts/seed.js` — creates first admin user
- `vercel.json` — Vercel deployment config
- `package.json` — dependencies (already includes marked, sequelize, passport, etc.)

### TEMPLATE CONVENTIONS:

- Every `res.render()` call must pass `{ title: 'Page Title' }`
- EJS templates open with `<%- include('partials/head') %>` or `<%- include('../partials/admin-head') %>`
- Flash messages: `req.flash('success_msg', '...')`, `req.flash('error_msg', '...')`
- `res.locals.user` is the Passport user object (or null)
- Two roles: `admin` (full access) and `user` (basic access)
- No public registration — admins add users via `/admin/users`
- UUID primary keys on all models
- `sequelize.sync({ alter: true })` runs on startup
- CSRF protection via session-stored token (`req.body._csrf_token`)


---

## SECTION 2: WHAT TO MODIFY IN THE TEMPLATE

### 2A. BRANDING UPDATES:

Replace "Express App" with "Peace Dictionary CMS" in:

- `views/partials/head.ejs` (nav brand text and page title fallback)
- `views/partials/admin-head.ejs` (admin logo text)
- `README.md` title
- `package.json` and `package-lock.json` "name" field
- `scripts/seed.js` default `site_name` setting value

### 2B. REMOVE OR SIMPLIFY:

- Remove public-facing page functionality (Page, PageImage, PageRevision, Media models and their routes) — replace with Term-specific models and routes
- Remove `views/index.ejs` content (replace with redirect to /admin)
- Remove `views/page.ejs` (not needed)
- Remove admin routes for: pages, page images, page revisions, media, menu
- Keep: admin dashboard, users, settings, and auth routes

### 2C. ADD SEARCH ENGINE BLOCKING:

- Create `public/robots.txt`:

```
User-agent: *
Disallow: /
```

- Add X-Robots-Tag header to all responses in `server.js` middleware:

```javascript
res.set('X-Robots-Tag', 'noindex, nofollow');
```

- Add `<meta name="robots" content="noindex, nofollow">` to both head partials

### 2D. REDIRECT ROOT TO ADMIN:

In `routes/index.js`, change the GET `/` handler to redirect to `/admin` (the public site serves no purpose for this utility)

### 2E. UPDATE ADMIN NAV:

In `views/partials/admin-head.ejs`, update nav links to:

    Terms | Export | Users | Settings | Account | Logout


---

## SECTION 3: DATABASE SCHEMA (SEQUELIZE MODELS)

Add these models in `models/index.js` (keep User, PasswordResetToken, Setting):

### Term

```javascript
const Term = sequelize.define('Term', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  abbreviation: { type: DataTypes.STRING, defaultValue: '' },
  slug: { type: DataTypes.STRING, allowNull: false, unique: true },
  pronunciation: { type: DataTypes.STRING, defaultValue: '' },
  partOfSpeech: { type: DataTypes.STRING, defaultValue: 'noun' },
  leadDefinition: { type: DataTypes.TEXT, allowNull: false },
  searchKeywords: { type: DataTypes.TEXT, defaultValue: '' },
}, { tableName: 'terms', timestamps: true });
```

### AccordionSection

```javascript
const AccordionSection = sequelize.define('AccordionSection', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  title: { type: DataTypes.STRING, allowNull: false },
  body: { type: DataTypes.TEXT, allowNull: false },
  sortOrder: { type: DataTypes.INTEGER, defaultValue: 0 },
}, { tableName: 'accordion_sections', timestamps: true });
```

### ExternalLink

```javascript
const ExternalLink = sequelize.define('ExternalLink', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  text: { type: DataTypes.STRING, allowNull: false },
  url: { type: DataTypes.STRING, allowNull: false },
  sortOrder: { type: DataTypes.INTEGER, defaultValue: 0 },
}, { tableName: 'external_links', timestamps: true });
```

### TermRelationship (join table)

```javascript
const TermRelationship = sequelize.define('TermRelationship', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
}, { tableName: 'term_relationships', timestamps: false });
```

### TermRevision

```javascript
const TermRevision = sequelize.define('TermRevision', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  snapshot: { type: DataTypes.TEXT, allowNull: false },
  revisedBy: { type: DataTypes.STRING, defaultValue: '' },
}, { tableName: 'term_revisions', timestamps: true });
```

### ASSOCIATIONS:

```javascript
Term.hasMany(AccordionSection, { foreignKey: 'termId', onDelete: 'CASCADE', as: 'sections' });
AccordionSection.belongsTo(Term, { foreignKey: 'termId' });

Term.hasMany(ExternalLink, { foreignKey: 'termId', onDelete: 'CASCADE', as: 'externalLinks' });
ExternalLink.belongsTo(Term, { foreignKey: 'termId' });

Term.belongsToMany(Term, {
  through: TermRelationship,
  as: 'relatedTerms',
  foreignKey: 'termId',
  otherKey: 'relatedTermId'
});

Term.hasMany(TermRevision, { foreignKey: 'termId', onDelete: 'CASCADE', as: 'revisions' });
TermRevision.belongsTo(Term, { foreignKey: 'termId' });
```

### SNAPSHOT FORMAT (JSON stored in TermRevision.snapshot):

```json
{
  "name": "Carbon Sink",
  "abbreviation": "",
  "pronunciation": "/ˈkɑːbən sɪŋk/",
  "partOfSpeech": "noun",
  "leadDefinition": "A carbon sink is...",
  "searchKeywords": "carbon sink absorb...",
  "sections": [
    { "title": "In simple terms", "body": "A carbon sink removes...", "sortOrder": 0 },
    { "title": "Why it matters", "body": "Carbon sinks help...", "sortOrder": 1 }
  ],
  "externalLinks": [
    { "text": "Climate action", "url": "https://...", "sortOrder": 0 }
  ],
  "relatedTermIds": ["uuid-1", "uuid-2"]
}
```


---

## SECTION 4: SLUG GENERATION

Auto-generate slugs from term names. The slug is used for the HTML id attribute in the exported dictionary (prefixed with "pd-").

```javascript
function slugify(text) {
  return text.toLowerCase().trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
```

Examples:

- "Carbon Sink" → "carbon-sink" → HTML `id="pd-carbon-sink"`
- "Global Warming vs. Climate Change" → "global-warming-vs-climate-change"
- "COP" → "cop"
- "UNFCCC" → "unfccc"

The slug should be auto-generated on creation but editable.


---

## SECTION 5: ROUTES

Create a new routes file: `routes/terms.js`
Register it in server.js: `app.use('/admin/terms', require('./routes/terms'));`

Also create: `routes/export.js`
Register: `app.use('/export', require('./routes/export'));`

### routes/terms.js

All routes require `ensureAuthenticated` middleware.

**GET /admin/terms** — List all terms alphabetically by name. Render `views/admin/terms.ejs`. Pass: `{ title: 'terms', terms: [...] }`

**GET /admin/terms/new** — Show empty term editor form. Render `views/admin/term-edit.ejs`. Pass: `{ title: 'new term', term: null, sections: [], externalLinks: [], relatedTerms: [], allTerms: [...all other terms for related selection...] }`

**POST /admin/terms/new** — Create a new Term + its AccordionSections + ExternalLinks + TermRelationships. Auto-generate slug from name if not provided. Redirect to `/admin/terms/:id/edit` on success.

**GET /admin/terms/:id/edit** — Load term with all associations (sections ordered by sortOrder, externalLinks ordered by sortOrder, relatedTerms, revisions ordered by createdAt DESC). Render `views/admin/term-edit.ejs`. Pass: `{ title: 'edit term', term, sections, externalLinks, relatedTerms, allTerms, revisions }`

**POST /admin/terms/:id/edit** — Steps:
1. Load current term state.
2. Create a TermRevision with a JSON snapshot of the CURRENT state (before update). Set revisedBy to `req.user.username`.
3. Update the Term fields.
4. Delete existing AccordionSections and recreate from form data.
5. Delete existing ExternalLinks and recreate from form data.
6. Delete existing TermRelationships and recreate from form data.
7. Flash success, redirect to edit page.

**POST /admin/terms/:id/delete** — Delete the term and all associated data (CASCADE handles sections, links, revisions). Redirect to `/admin/terms`.

**GET /admin/terms/:id/revisions** — Show revision history for a term. Render `views/admin/term-revisions.ejs`. Pass: `{ title: 'revisions', term, revisions }`

**GET /admin/terms/:id/revisions/:revId** — Show a single revision's snapshot compared to current state. Parse the snapshot JSON. Load current term state. Render `views/admin/term-revision-view.ejs`. Pass: `{ title: 'revision', term, revision, snapshot, current }`

**POST /admin/terms/:id/revisions/:revId/restore** — Steps:
1. Create a TermRevision of the CURRENT state (before restore).
2. Parse the target revision's snapshot.
3. Update the Term with snapshot values.
4. Delete and recreate sections, links, and relationships from snapshot.
5. Flash success, redirect to edit page.

### routes/export.js

All routes require `ensureAuthenticated` middleware.

**GET /export** — Fetch all terms with all associations, ordered alphabetically. Generate the complete HTML fragment (see Section 7). Render `views/admin/export.ejs`. Pass: `{ title: 'export', htmlOutput: generatedHTML, termCount: N }`

**GET /export/download** — Same generation as above, but set response headers: `Content-Type: text/html`, `Content-Disposition: attachment; filename="peace-dictionary.html"`. Send the raw HTML string as the response body.

### Update routes/admin.js

Keep: dashboard (GET /admin), users, settings routes.
Remove: pages, page images, page revisions, media, menu routes.
Update dashboard to show term count instead of page count:

```javascript
const termCount = await Term.count();
const userCount = await User.count();
const recentTerm = await Term.findOne({ order: [['updatedAt', 'DESC']] });
```


---

## SECTION 6: VIEWS (EJS TEMPLATES)

All admin views use `<%- include('../partials/admin-head') %>` and `<%- include('../partials/admin-footer') %>`.

### views/admin/terms.ejs

Dashboard-style list of all terms.

- Table with columns: Name, Last Updated, Actions (Edit | Delete)
- "Add New Term" button at top
- Terms sorted alphabetically by name
- Show term count

### views/admin/term-edit.ejs

The main term editor form. This is the most complex view.

**LEFT COLUMN (form, ~60% width):**

- Term Name (text input, required)
- Abbreviation (text input, optional — for terms like COP, UNFCCC)
- Slug (text input, auto-generated from name via JS, editable)
- Pronunciation (text input, e.g. `/ˈkɑːbən sɪŋk/`)
- Part of Speech (select: noun, verb, adjective, abbreviation)
- Lead Definition (textarea, markdown, required) — the main definition paragraph shown under the term name.
- Accordion Sections (repeatable group):
  - Each section has: Title (text input, e.g. "In simple terms", "Why it matters"), Body (textarea, markdown), Sort order (hidden, managed by drag-to-reorder or move up/down buttons)
  - "Add Section" button to add another section.
  - "Remove" button on each section.
  - Sections submitted as arrays: `sections[0][title]`, `sections[0][body]`, etc.
- Related Terms (multi-select from existing terms):
  - Show all other terms as checkboxes or a tag-style picker.
  - Submitted as: `relatedTermIds[]` (array of term UUIDs)
- External Links (repeatable group):
  - Each link has: Text (text input), URL (text input)
  - "Add Link" button. "Remove" button on each.
  - Submitted as arrays: `links[0][text]`, `links[0][url]`, etc.
- Search Keywords (textarea, comma-separated additional keywords) — these populate the data-search attribute in the exported HTML.
- Save button
- Delete button (with confirmation)

**RIGHT COLUMN (preview, ~40% width):**

- Live preview panel styled with Peace Dictionary CSS
- Shows: term name, pronunciation, part of speech, lead definition, accordion sections (as `<details>/<summary>`), related term pills, external links
- Updated on each keystroke via client-side JavaScript
- Uses the `marked` library (loaded client-side) to parse markdown to HTML
- Wiki-link syntax `[[Term Name]]` in markdown is resolved to styled pill links in the preview (match against allTerms list passed to the view)
- Include the Peace Dictionary CSS (the `<style>` block from Section 7) scoped within a `.pd-preview` wrapper class

If editing (term exists), also show:
- Revision history link: "View N revisions" → `/admin/terms/:id/revisions`

**CLIENT-SIDE JAVASCRIPT for this view:**

1. Auto-generate slug from name on input (only if slug hasn't been manually edited)
2. Add/remove accordion sections dynamically
3. Add/remove external links dynamically
4. Live preview update on any form field change (debounced 300ms):
   - Read all form values
   - Parse markdown fields with marked
   - Resolve `[[wiki-links]]` using the allTerms data (embedded as JSON in the page)
   - Render the preview HTML into the preview panel
5. Load `marked.min.js` from a CDN: `https://cdn.jsdelivr.net/npm/marked/marked.min.js` — It's OK to load external scripts in the CMS since the Drupal constraint only applies to the exported dictionary HTML

### views/admin/term-revisions.ejs

List of revisions for a term.

- Back link to edit page
- Table: Date, Revised By, Actions (View | Restore)
- Each row shows createdAt formatted as human-readable date

### views/admin/term-revision-view.ejs

Side-by-side or sequential comparison of a revision vs current state. Show field-by-field: Name, Lead Definition, Sections, etc. Highlight differences visually (e.g. changed fields in a different background color). "Restore This Version" button at top (POST form to restore endpoint).

### views/admin/export.ejs

Two sections:

1. Info bar: "N terms ready for export" with two buttons:
   - "Copy to Clipboard" (JS copies htmlOutput to clipboard)
   - "Download HTML" (link to /export/download)
2. Code display area: `<pre><code>` block containing the escaped HTML output. Style with monospace font, horizontal scrolling, max-height with scroll. Include a line showing last generated timestamp.

### views/admin/dashboard.ejs

Update to show:

- Term count (with link to /admin/terms)
- User count (with link to /admin/users)
- Most recently updated term


---

## SECTION 7: HTML EXPORT GENERATION

This is the core feature. The export must generate an HTML fragment identical in structure to the current Peace Dictionary file. The output is NOT a full HTML document — it's a fragment designed to be pasted into a Drupal 7 text field.

The generation logic should live in a dedicated module: `helpers/export.js`

This module exports a function: `generateDictionaryHTML(terms, settings)` where `terms` is an array of Term objects with all associations loaded, and `settings` contains configurable values like the intro text and page URL.

The function returns a single string containing the complete HTML fragment.

**IMPORTANT**: The reference file for the exact HTML structure is:

    ~/Documents/git/un-peace-dictionary/index.html

The generated output must match this structure exactly. Below is a detailed specification of every part of the output, in order:

### PART 1: JSON-LD (static, baked in)

```html
<script id="pd-ld-json" type="application/ld+json">
[{
  "@context": "https://schema.org",
  "@type": "DefinedTermSet",
  "name": "The Peace Dictionary",
  "description": "A comprehensive glossary of peace and security terminology...",
  "url": "<page URL from settings>",
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "<page URL from settings>"
  },
  "publisher": {
    "@type": "Organization",
    "name": "United Nations",
    "url": "https://www.un.org"
  },
  "inLanguage": "en",
  "datePublished": "2026-04-01",
  "dateModified": "<today's date YYYY-MM-DD>",
  "hasDefinedTerm": [
    {
      "@type": "DefinedTerm",
      "name": "<term name>",
      "description": "<first paragraph of lead definition, plain text>",
      "url": "<page URL>#pd-<slug>"
    }
  ]
},
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "<question text>",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "<answer text>"
      }
    }
  ]
}]
</script>
```

NOTE: The FAQPage block should only be included if there are Q&A pairs. Q&A pairs are detected by accordion section body content that contains lines formatted as: `**Question text?**\nAnswer text` (bold text followed by a newline and answer text.)

In the exported HTML, Q&A pairs are rendered as: `<p><strong>Question text?</strong><br>Answer text</p>`

### PART 2: External stylesheet link

```html
<link href="https://cdn.jsdelivr.net/gh/robertirish/un-peace-and-security-stylesheet@main/styles.css" rel="stylesheet">
```

### PART 3: Inline CSS

The entire `<style>` block from the reference file. This is STATIC content that does not change based on terms. Copy it verbatim from the reference file (lines 6-338 of index.html). Store this as a string constant in `helpers/export.js`.

The full CSS is reproduced in the reference file `~/Documents/git/un-peace-dictionary/index.html` lines 6-338.

### PART 4: HTML body structure

```html
<div class="peace-dictionary" id="peace-dictionary">

<div class="content-container no-padding-top">
	<div class="image-banner full-width">
		<figure class="image-banner-image"><img alt="The Peace Dictionary banner" src="https://www.un.org/sites/un2.un.org/files/peace-dictionary-banner.png">
		</figure>
	</div>
</div>

<div class="content-container full-width no-padding-top">
    <h2 class="style-h1 align-center">The Peace Dictionary</h2>
    <h3 class="style-h2 align-center heading-underline no-margin-top">Understanding the language of peace and security</h3>
</div>

<div class="content-container no-padding-top">
    <p class="lede align-center">{intro text from settings}</p>
</div>

<div class="pd-search" role="search" aria-label="Search peace terms">
    <div class="pd-search-inner">
        <label for="pd-search-field">Find a term</label>
        <div class="pd-search-input-wrap">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="search" id="pd-search-field" class="pd-search-field" placeholder="e.g. peacebuilding, diplomacy, mediation&hellip;" autocomplete="off" aria-describedby="pd-search-info">
            <button type="button" class="pd-search-clear" id="pd-search-clear" aria-label="Clear search">&times;</button>
        </div>
        <div id="pd-search-info" class="pd-search-info" aria-live="polite"></div>
    </div>
</div>

<div class="content-container no-padding-top">
    <nav class="pd-alpha-nav" aria-label="Alphabetical index" id="pd-alpha-nav"></nav>
</div>

<div class="content-container no-padding-top">
    <div class="pd-terms" id="pd-terms" itemscope itemtype="https://schema.org/DefinedTermSet">
        <meta itemprop="name" content="The Peace Dictionary">
        <meta itemprop="description" content="A comprehensive glossary of key peace and security terms from the United Nations.">

        <!-- GENERATED TERM SECTIONS GO HERE -->

    </div>

    <div class="pd-no-results" id="pd-no-results" role="status">
        <p>No terms found matching "<span class="pd-no-results-term" id="pd-no-results-term"></span>"</p>
        <p class="pd-suggestion">Try a different spelling or browse the alphabetical index above.</p>
    </div>
</div>

<a href="#peace-dictionary" class="pd-back-to-top">Return to top</a>

</div>
```

### PART 5: Generated term sections

Terms are grouped by first letter. Each letter group:

```html
<section class="pd-letter-group" id="pd-letter-{LETTER}" aria-label="Terms starting with {LETTER}">
    <h2 class="pd-letter-heading">{LETTER}</h2>

    {ARTICLE elements for each term starting with this letter}
</section>
```

Each term article:

```html
<article class="pd-entry" id="pd-{slug}" itemscope itemtype="https://schema.org/DefinedTerm" itemprop="hasDefinedTerm" data-term="{name}" data-search="{searchKeywords}">
    <h3 class="pd-entry-term" itemprop="name"><dfn>{name OR <abbr title="full name">ABBR</abbr>}</dfn></h3>
    <p class="pd-entry-meta"><span aria-label="pronunciation">{pronunciation}</span> <span class="pd-pos">{partOfSpeech}</span></p>
    <div class="pd-entry-body" itemprop="description">
        {leadDefinition rendered from markdown to HTML}

        {For each accordion section:}
        <details>
            <summary>{section title}</summary>
            <div class="pd-details-body">
                {section body rendered from markdown to HTML}
            </div>
        </details>

        {If term has related terms:}
        <details>
            <summary>Related terms</summary>
            <div class="pd-details-body">
                <div class="pd-related-terms">
                    {For each related term:}
                    <a href="#pd-{relatedTerm.slug}">{relatedTerm.name}</a>
                </div>
            </div>
        </details>

        {If term has external links:}
        <details>
            <summary>Learn more</summary>
            <div class="pd-details-body pd-learn-more">
                <ul>
                    {For each link:}
                    <li><a href="{url}" rel="noopener">{text}</a></li>
                </ul>
            </div>
        </details>
    </div>
</article>
```

**ABBREVIATION HANDLING:** If `term.abbreviation` is set (e.g. name="COP", abbreviation="Conference of the Parties"), render the term name as `<dfn><abbr title="{abbreviation}">{name}</abbr></dfn>` and render the meta line as: `{abbreviation} <span class="pd-pos">abbreviation</span>` (instead of pronunciation + part of speech).

**MARKDOWN RENDERING:** Use the `marked` library to convert markdown to HTML for `leadDefinition` and accordion section `body`.

**WIKI-LINK RESOLUTION:** Before rendering markdown, resolve `[[Term Name]]` syntax:
1. Look up "Term Name" in the terms list
2. If found, replace with `<a href="#pd-{slug}">Term Name</a>`
3. If not found, just output the text without a link

**data-search ATTRIBUTE:** Combine: the slug (words separated by spaces), the term name lowercased, and the `searchKeywords` field. Deduplicate and join with spaces.

### PART 6: JavaScript

The entire `<script>` block from the reference file (lines 941-1339 of index.html). This is STATIC content — copy it verbatim. It handles:

- Building the alphabetical navigation from the DOM
- Fuzzy search with bigram similarity
- Weighted scoring (title > keywords > body)
- Stop words filtering
- Flat search results sorted by relevance (max 3 shown)
- Highlight functions (currently commented out but retained)
- IntersectionObserver for sticky search bar shadow
- Internal term link handling (clears search, scrolls to target)
- Debounced search input
- Alpha nav click clears search
- JSON-LD generation from DOM (kept as fallback, though static JSON-LD is now baked in)

Copy the entire script block exactly from the reference file.


---

## SECTION 8: MARKDOWN PROCESSING DETAILS

Use the `marked` library (already in package.json) for markdown-to-HTML conversion.

Configure marked to produce clean output:
- Enable GFM (GitHub Flavored Markdown) — on by default
- Disable header IDs (we don't want auto-generated IDs in the output)

Custom extensions / pre-processing:

**WIKI-LINKS:** Before passing to marked, use a regex to convert `[[Term Name]]` to `<a href="#pd-{slug}">Term Name</a>`:

```javascript
function resolveWikiLinks(markdown, termMap) {
  return markdown.replace(/\[\[([^\]]+)\]\]/g, function(match, name) {
    const term = termMap[name.toLowerCase()];
    if (term) return '<a href="#pd-' + term.slug + '">' + term.name + '</a>';
    return name;
  });
}
```

`termMap` is a lookup object: `{ "carbon sink": { slug: "carbon-sink", name: "Carbon Sink" }, ... }`


---

## SECTION 9: SEED SCRIPT UPDATE

Update `scripts/seed.js` to:

1. Keep the admin user creation
2. Update the default `site_name` setting to "Peace Dictionary CMS"
3. Add a setting for `dictionary_intro_text` with default value: "This is a first mock-up of the Peace Dictionary with sample content pulled from the climate site. It uses semantic HTML and microformatting to maximize SEO and GEO. The javascript populates its definition list based on the HTML markup so that definitions are only stored in one location and are easily added/edited by non-coders."
4. Add a setting for `dictionary_page_url` with default value: "https://www.un.org/en/peaceandsecurity/peace-dictionary"
5. Optionally: seed a few sample terms from the reference file to demonstrate the export functionality immediately after setup.


---

## SECTION 10: VERCEL DEPLOYMENT CONFIGURATION

Update `vercel.json` to include any new directories in includeFiles:

```json
{
  "version": 2,
  "installCommand": "npm install",
  "builds": [
    {
      "src": "api/index.js",
      "use": "@vercel/node",
      "config": {
        "includeFiles": [
          "views/**",
          "public/**",
          "config/**",
          "models/**",
          "routes/**",
          "middleware/**",
          "helpers/**"
        ]
      }
    }
  ],
  "routes": [
    {
      "src": "/robots.txt",
      "dest": "/public/robots.txt"
    },
    {
      "src": "/(.*)",
      "dest": "/api/index.js"
    }
  ],
  "env": {
    "VERCEL": "1"
  }
}
```


---

## SECTION 11: IMPLEMENTATION ORDER

Follow these steps in order:

### STEP 1: SET UP PROJECT

- Copy template to `~/Documents/git/peace-dictionary-cms`
- Initialize fresh git repo
- Update branding (Peace Dictionary CMS)
- Create Neon database (use Neon MCP `create_project`)
- Write `.env` file with `DATABASE_URL` and `SESSION_SECRET`
- `npm install`
- Update seed script, run `npm run seed`
- Verify app starts: `npm run dev`

### STEP 2: CLEAN UP TEMPLATE

- Remove Page, PageImage, PageRevision, Media models from `models/index.js`
- Remove all page/media/menu routes from `routes/admin.js`
- Simplify `routes/index.js` (redirect / to /admin)
- Remove unused views (`page.ejs`, `admin/pages.ejs`, `admin/page-edit.ejs`, `admin/page-revisions.ejs`, `admin/media.ejs`, `admin/menu.ejs`)
- Add robots.txt, noindex headers, noindex meta tags
- Update admin nav links in `admin-head.ejs`

### STEP 3: ADD NEW MODELS

- Add Term, AccordionSection, ExternalLink, TermRelationship, TermRevision models to `models/index.js`
- Define all associations
- Start the app to let `sequelize.sync({ alter: true })` create the tables

### STEP 4: BUILD TERM CRUD ROUTES

- Create `routes/terms.js` with all CRUD endpoints
- Register in `server.js`
- Create `views/admin/terms.ejs` (term list)
- Create `views/admin/term-edit.ejs` (form + preview)
- Test creating, editing, deleting terms locally

### STEP 5: BUILD REVISION SYSTEM

- Implement revision creation on save (in POST `/admin/terms/:id/edit`)
- Create `views/admin/term-revisions.ejs`
- Create `views/admin/term-revision-view.ejs`
- Implement restore endpoint
- Test revision history and restore

### STEP 6: BUILD LIVE PREVIEW

- Add client-side JavaScript to `term-edit.ejs`
- Load `marked.min.js` from CDN
- Implement real-time preview rendering
- Include Peace Dictionary CSS in preview panel (scoped)
- Implement wiki-link resolution in preview

### STEP 7: BUILD HTML EXPORT

- Create `helpers/export.js` with `generateDictionaryHTML` function
- Include static CSS, static JS, and dynamic term generation
- Create `routes/export.js`
- Create `views/admin/export.ejs`
- Test: create a few terms, export, verify HTML matches reference structure
- Verify: copy exported HTML into a local test file, open in browser, check that search, accordion, alpha nav all work

### STEP 8: UPDATE DASHBOARD

- Update admin dashboard to show term count and recent term
- Update dashboard view

### STEP 9: POLISH & TEST

- Test all CRUD operations
- Test revision history and restore
- Test export with edge cases (abbreviations, terms with no sections, etc.)
- Test on mobile (responsive admin CSS)
- Verify exported HTML validates (Schema.org, JSON-LD)

### STEP 10: DEPLOY

- Create GitHub repo
- `git add -A && git commit -m "Initial commit"`
- Connect to Vercel, deploy
- Set env vars in Vercel: `DATABASE_URL`, `SESSION_SECRET`, `NODE_ENV=production`, `APP_URL`
- Verify robots.txt blocks crawlers
- Verify login works
- Run seed in production (or create admin user manually)

### STEP 11: INITIAL COMMIT & HANDOFF

- Create initial git commit
- Share the Vercel URL and admin credentials


---

## SECTION 12: REFERENCE FILES

The complete reference Peace Dictionary HTML file is at:

    ~/Documents/git/un-peace-dictionary/index.html

(1340 lines — contains all CSS, HTML structure, and JavaScript)

The Express template is at:

    ~/Documents/git/express-app/

Key template files to understand:

- `server.js` — main app setup
- `models/index.js` — Sequelize models
- `routes/admin.js` — existing admin CRUD patterns to follow
- `views/partials/admin-head.ejs` — admin layout
- `public/css/admin.css` — admin styling
- `config/database.js` — database configuration
- `scripts/seed.js` — seed script pattern

The exported HTML must be a fragment (no `<html>`, `<head>`, `<body>` tags) because it's pasted into a Drupal 7 text field that already has those wrapping elements.
