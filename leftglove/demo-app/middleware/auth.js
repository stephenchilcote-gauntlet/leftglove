function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  res.redirect('/login');
}

function currentUser(req) {
  return (req.session && req.session.user) || null;
}

module.exports = { requireAuth, currentUser };
