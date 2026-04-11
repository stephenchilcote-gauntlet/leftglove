const express = require('express');
const cookieSession = require('cookie-session');
const path = require('path');
const { execSync } = require('child_process');
const config = require('./config');

const COMMIT = (() => {
  try { return execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim(); }
  catch { return 'unknown'; }
})();
const STARTED = new Date().toISOString();

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieSession({ name: 'session', secret: config.sessionSecret }));

// Toggle state for demo: controls whether the "recurring donation" element exists
let showRecurring = false;

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', commit: COMMIT, started: STARTED, service: 'demo-app' });
});

// Root: redirect based on auth
app.get('/', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/fundraiser');
  }
  res.redirect('/login');
});

// Login
app.get('/login', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/fundraiser');
  }
  res.render('login', { message: null });
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const userRecord = config.users[email];
  if (userRecord && userRecord.password === password) {
    req.session.user = { email, name: userRecord.name };
    return res.redirect('/fundraiser');
  }
  res.render('login', { message: 'Invalid email or password.' });
});

// Logout
app.get('/logout', (req, res) => {
  req.session = null;
  res.redirect('/login');
});

// Fundraiser page (no auth — demo app is a test surface for sieve)
app.get('/fundraiser', (req, res) => {
  res.render('fundraiser', { showRecurring });
});

// Toggle API — used by demo script to add/remove the recurring donation element
app.post('/set-recurring', (req, res) => {
  showRecurring = req.body.enabled === true;
  res.json({ showRecurring });
});

// GET toggle for test automation (browser navigation can trigger this)
app.get('/set-recurring', (req, res) => {
  showRecurring = req.query.enabled === 'true';
  res.redirect('/fundraiser');
});

const port = process.env.PORT || config.port || 3000;
app.listen(port, () => {
  console.log(`Demo app running at http://localhost:${port}`);
});
