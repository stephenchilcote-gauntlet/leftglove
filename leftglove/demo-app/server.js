const express = require('express');
const cookieSession = require('cookie-session');
const path = require('path');
const config = require('./config');

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

app.use('/', require('./routes/index'));
app.use('/', require('./routes/login'));
app.use('/', require('./routes/dashboard'));
app.use('/', require('./routes/logout'));
app.use('/', require('./routes/about'));

const port = process.env.PORT || config.port;
app.listen(port, () => {
  console.log(`Demo app running at http://localhost:${port}`);
});
