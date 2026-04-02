const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const passport = require('passport');
const rateLimit = require('express-rate-limit');
const { Op } = require('sequelize');
const { User, PasswordResetToken } = require('../models');
const { ensureAuthenticated, ensureGuest } = require('../middleware/auth');
const { sendResetEmail } = require('../helpers/email');

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  handler: (req, res) => {
    req.flash('error_msg', 'Too many login attempts. Please try again in a minute.');
    res.redirect('/auth/login');
  },
});

const forgotLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  handler: (req, res) => {
    req.flash('error_msg', 'Too many requests. Please try again in a minute.');
    res.redirect('/auth/forgot-password');
  },
});

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

router.get('/login', ensureGuest, (req, res) => {
  res.render('auth/login', { title: 'login' });
});

router.post('/login', loginLimiter, ensureGuest, passport.authenticate('local', {
  successRedirect: '/admin',
  failureRedirect: '/auth/login',
  failureFlash: true,
  successFlash: 'Logged in.',
}));

router.get('/logout', (req, res) => {
  req.logout(() => {
    req.flash('success_msg', 'Logged out.');
    res.redirect('/auth/login');
  });
});

router.get('/account', ensureAuthenticated, (req, res) => {
  res.render('auth/account', { title: 'account' });
});

router.post('/account', ensureAuthenticated, async (req, res) => {
  try {
    const { name, email, current_password, new_password, confirm_password } = req.body;

    if (!email) {
      req.flash('error_msg', 'Email is required.');
      return res.redirect('/auth/account');
    }

    const updates = {
      name: name || req.user.name,
      email: email.toLowerCase(),
    };

    if (new_password) {
      if (new_password !== confirm_password) {
        req.flash('error_msg', "Passwords don't match.");
        return res.redirect('/auth/account');
      }
      if (new_password.length < 6) {
        req.flash('error_msg', 'Password must be at least 6 characters.');
        return res.redirect('/auth/account');
      }
      const isMatch = await bcrypt.compare(current_password, req.user.password);
      if (!isMatch) {
        req.flash('error_msg', 'Current password is incorrect.');
        return res.redirect('/auth/account');
      }
      updates.password = await bcrypt.hash(new_password, 10);
    }

    await User.update(updates, { where: { id: req.user.id } });
    req.flash('success_msg', 'Account updated.');
    res.redirect('/auth/account');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Something went wrong.');
    res.redirect('/auth/account');
  }
});

router.get('/forgot-password', (req, res) => {
  res.render('auth/forgot-password', { title: 'Forgot Password' });
});

router.post('/forgot-password', forgotLimiter, async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const user = await User.findOne({ where: { email } });

    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await PasswordResetToken.create({ userId: user.id, token, expiresAt });

      const resetUrl = `${APP_URL}/auth/reset-password/${token}`;
      await sendResetEmail(email, resetUrl);
    }

    req.flash('success_msg', 'If that email exists, a reset link has been sent.');
    res.redirect('/auth/login');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Something went wrong.');
    res.redirect('/auth/forgot-password');
  }
});

router.get('/reset-password/:token', async (req, res) => {
  try {
    const record = await PasswordResetToken.findOne({
      where: { token: req.params.token, used: false, expiresAt: { [Op.gt]: new Date() } },
    });

    if (!record) {
      req.flash('error_msg', 'Invalid or expired reset link.');
      return res.redirect('/auth/login');
    }

    res.render('auth/reset-password', { title: 'Reset Password', token: req.params.token });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Something went wrong.');
    res.redirect('/auth/login');
  }
});

router.post('/reset-password/:token', async (req, res) => {
  try {
    const record = await PasswordResetToken.findOne({
      where: { token: req.params.token, used: false, expiresAt: { [Op.gt]: new Date() } },
    });

    if (!record) {
      req.flash('error_msg', 'Invalid or expired reset link.');
      return res.redirect('/auth/login');
    }

    const { new_password, confirm_password } = req.body;

    if (new_password !== confirm_password) {
      req.flash('error_msg', "Passwords don't match.");
      return res.redirect(`/auth/reset-password/${req.params.token}`);
    }

    if (new_password.length < 6) {
      req.flash('error_msg', 'Password must be at least 6 characters.');
      return res.redirect(`/auth/reset-password/${req.params.token}`);
    }

    const hash = await bcrypt.hash(new_password, 10);
    await User.update({ password: hash }, { where: { id: record.userId } });
    await record.update({ used: true });

    req.flash('success_msg', 'Password has been reset. Please log in.');
    res.redirect('/auth/login');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Something went wrong.');
    res.redirect('/auth/login');
  }
});

module.exports = router;
