const express = require('express');
const path = require('path');
const { execSync } = require('child_process');

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

// Toggle state for demo: controls whether the "recurring donation" element exists
let showRecurring = false;

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', commit: COMMIT, started: STARTED, service: 'demo-app' });
});

// Main fundraiser page
app.get('/', (req, res) => {
  res.render('fundraiser', { showRecurring });
});
app.get('/fundraiser', (req, res) => {
  res.render('fundraiser', { showRecurring });
});

// Toggle API — used by demo script to add/remove the recurring donation element
app.post('/toggle-recurring', (req, res) => {
  showRecurring = !showRecurring;
  res.json({ showRecurring });
});
app.post('/set-recurring', (req, res) => {
  showRecurring = req.body.enabled === true;
  res.json({ showRecurring });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Demo app running at http://localhost:${port}`);
});
