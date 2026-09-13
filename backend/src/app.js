'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const { connectDatabase } = require('./config/database');
const { initSearch } = require('./services/searchService');

const documentRoutes = require('./routes/documents');
const searchRoutes = require('./routes/search');
const auditRoutes = require('./routes/audit');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');


const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static file serving (uploaded docs accessible by admins via API only)
app.use('/files', express.static(path.join(__dirname, '../../uploads')));

// ── Routes ────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/users', userRoutes);

// ── Health check ─────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    system: 'DocuChain',
    timestamp: new Date().toISOString(),
  });
});

// ── 404 handler ───────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Error handler ─────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[DocuChain Error]', err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
});

// ── Startup ───────────────────────────────────────────────────────
async function start() {
  try {
    await connectDatabase();
console.log('[DB] PostgreSQL connected');
const User = require('./models/User');
await User.seedDefaults();

    await initSearch();
    console.log('[Search] MeiliSearch initialized');

    app.listen(PORT, () => {
      console.log('');
      console.log('╔══════════════════════════════════════╗');
      console.log('║   DocuChain API Server Running       ║');
      console.log(`║   http://localhost:${PORT}               ║`);
      console.log('╚══════════════════════════════════════╝');
      console.log('');
    });
  } catch (err) {
    console.error('[Startup Error]', err);
    process.exit(1);
  }
}

start();

module.exports = app;
