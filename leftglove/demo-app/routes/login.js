const express = require('express');
const { currentUser } = require('../middleware/auth');

const router = express.Router();

router.get('/login', (req, res) => {
  if (currentUser(req)) {
    return res.redirect('/dashboard');
  }
  res.render('login', { message: null });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const config = req.app.locals.config;
  const userRecord = config.users[email];

  if (userRecord && userRecord.password === password) {
    req.session.user = { email, name: userRecord.name };
    return res.redirect('/dashboard');
  }

  res.render('login', { message: 'Invalid email or password.' });
});

module.exports = router;
