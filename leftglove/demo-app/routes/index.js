const express = require('express');
const { currentUser } = require('../middleware/auth');

const router = express.Router();

router.get('/', (req, res) => {
  if (currentUser(req)) {
    return res.redirect('/dashboard');
  }
  res.redirect('/login');
});

module.exports = router;
