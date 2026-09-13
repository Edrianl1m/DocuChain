'use strict';

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { authenticate, requireAdmin } = require('../middleware/auth');

// GET /api/users — admin only
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'username', 'role', 'isActive', 'createdAt'],
      order: [['createdAt', 'ASC']],
    });
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users — admin only
router.post('/', authenticate, requireAdmin, async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });
  if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: 'Role must be admin or user.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  try {
    const user = await User.create({ username, password, role });
    res.status(201).json({ message: 'User created.', user: { id: user.id, username: user.username, role: user.role } });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'Username already exists.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/users/:id/toggle — activate/deactivate
router.patch('/:id/toggle', authenticate, requireAdmin, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (user.username === req.user.username) return res.status(400).json({ error: 'Cannot deactivate your own account.' });
    user.isActive = !user.isActive;
    await user.save();
    res.json({ message: `User ${user.isActive ? 'activated' : 'deactivated'}.`, isActive: user.isActive });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/users/me/password — any logged-in user can change their own password
router.patch('/me/password', authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect.' });
    user.password = newPassword;
    await user.save();
    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/users/:id/password — reset password
router.patch('/:id/password', authenticate, requireAdmin, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    user.password = password;
    await user.save();
    res.json({ message: 'Password updated.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/users/:id
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (user.username === req.user.username) return res.status(400).json({ error: 'Cannot delete your own account.' });
    await user.destroy();
    res.json({ message: 'User deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;