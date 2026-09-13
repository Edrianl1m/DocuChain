'use strict';

const bcrypt = require('bcryptjs');

// Shared in-memory user store
// Both auth.js and users.js reference this same array
const USERS = [
  {
    id: 1,
    username: 'admin',
    password: bcrypt.hashSync('admin123', 10),
    role: 'admin',
    createdAt: '2026-01-01T00:00:00.000Z',
    isActive: true,
  },
  {
    id: 2,
    username: 'user1',
    password: bcrypt.hashSync('user123', 10),
    role: 'user',
    createdAt: '2026-01-01T00:00:00.000Z',
    isActive: true,
  },
];

module.exports = USERS;
