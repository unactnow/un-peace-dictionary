const ensureAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  req.flash('error_msg', 'Please log in to access this page');
  res.redirect('/auth/login');
};

const ensureGuest = (req, res, next) => {
  if (!req.isAuthenticated()) return next();
  res.redirect('/admin');
};

const ensureRole = (...roles) => {
  return (req, res, next) => {
    if (!req.isAuthenticated()) {
      req.flash('error_msg', 'Please log in to access this page');
      return res.redirect('/auth/login');
    }
    if (roles.includes(req.user.role)) return next();
    req.flash('error_msg', 'You do not have permission to access this page');
    res.redirect('/');
  };
};

const isAdmin = (req, res, next) => {
  if (!req.isAuthenticated()) {
    req.flash('error_msg', 'Please log in to access this page');
    return res.redirect('/auth/login');
  }
  if (req.user.role === 'admin') return next();
  req.flash('error_msg', 'Admin access required');
  res.redirect('/');
};

module.exports = { ensureAuthenticated, ensureGuest, ensureRole, isAdmin };
