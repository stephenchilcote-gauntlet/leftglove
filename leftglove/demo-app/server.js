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

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieSession({
  name: 'demo-session',
  keys: [config.sessionSecret],
  maxAge: 30 * 60 * 1000,
}));

app.locals.config = config;

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', commit: COMMIT, started: STARTED, service: 'demo-app' });
});

app.use('/', require('./routes/index'));
app.use('/', require('./routes/login'));
app.use('/', require('./routes/dashboard'));
app.use('/', require('./routes/logout'));
app.use('/', require('./routes/about'));

const port = process.env.PORT || config.port;
app.listen(port, () => {
  console.log(`Demo app running at http://localhost:${port}`);
});
