require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const passport = require('passport');
const flash = require('connect-flash');
const helmet = require('helmet');
const path = require('path');
const crypto = require('crypto');
const { marked } = require('./helpers/markedConfig');
const { sequelize, Setting } = require('./models');

const app = express();

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use((req, res, next) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'fallback-secret-key',
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
  },
};

if (process.env.DATABASE_URL) {
  const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true' || !!process.env.VERCEL_URL;
  const pgSessionOpts = {
    conString: process.env.DATABASE_URL,
    tableName: 'session',
    createTableIfMissing: true,
  };
  if (isVercel) {
    const { Pool } = require('@neondatabase/serverless');
    pgSessionOpts.pool = new Pool({ connectionString: process.env.DATABASE_URL });
    delete pgSessionOpts.conString;
    pgSessionOpts.pruneSessionInterval = false;
  } else {
    pgSessionOpts.pruneSessionInterval = 60 * 15;
  }
  sessionConfig.store = new pgSession(pgSessionOpts);
}

app.use(session(sessionConfig));

require('./config/passport')(passport);
app.use(passport.initialize());
app.use(passport.session());

app.use(flash());

app.locals.renderMarkdown = (text) => (text ? marked.parse(text) : '');

app.use((req, res, next) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    return req.session.save(() => {
      res.locals.csrfToken = req.session.csrfToken;
      next();
    });
  }
  res.locals.csrfToken = req.session.csrfToken;

  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    const token = req.body._csrf_token || req.headers['x-csrf-token'];
    if (!token || token !== req.session.csrfToken) {
      return res.status(403).send('CSRF token mismatch');
    }
  }
  next();
});

app.use(async (req, res, next) => {
  res.locals.user = req.user || null;
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.error = req.flash('error');
  res.locals.menu_pages = [];
  try {
    const rows = await Setting.findAll({ raw: true });
    const settings = {};
    rows.forEach((r) => { settings[r.key] = r.value; });
    res.locals.settings = settings;
  } catch (e) {
    res.locals.settings = {};
  }
  next();
});

app.use('/', require('./routes/index'));
app.use('/auth', require('./routes/auth'));
app.use('/admin/terms', require('./routes/terms'));
app.use('/export', require('./routes/export'));
app.use('/admin', require('./routes/admin'));

app.use((req, res) => {
  res.status(404).render('404', { title: 'Page Not Found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('500', { title: 'Server Error' });
});

const PORT = process.env.PORT || 3000;

sequelize.sync()
  .then(() => console.log('Database connected and synced'))
  .catch((err) => console.error('Database connection error:', err.message));

if (!process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;
