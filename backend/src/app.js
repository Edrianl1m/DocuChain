'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const { connectDatabase } = require('./config/database');
const { initSearch } = require('./services/searchService');
const { rateLimit } = require('./middleware/rateLimit');

const documentRoutes = require('./routes/documents');
const searchRoutes = require('./routes/search');
const auditRoutes = require('./routes/audit');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const explorerRoutes = require('./routes/explorer');
const publicationRoutes = require('./routes/publications');
const publicRoutes = require('./routes/public');
const integrityRoutes = require('./routes/integrity');
const analyticsRoutes = require('./routes/analytics');
const recordsRoutes = require('./routes/records');
const { ensureFilingColumns } = require('./services/publicationService');
const { startScheduler } = require('./services/integrityService');


const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Refuse to run online with a missing or sample JWT secret
if (isProduction && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32
    || process.env.JWT_SECRET === 'your-very-secret-key-change-this')) {
  console.error('[Startup Error] Set JWT_SECRET to a random value of at least 32 characters.');
  process.exit(1);
}

// ── Middleware ────────────────────────────────────────────────────
// Behind the Caddy reverse proxy: use X-Forwarded-For for the client IP
if (isProduction) app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(morgan(isProduction ? 'combined' : 'dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Static file serving has no login check and skips the integrity check, so it
// is off by default; files are served through the API routes, which verify
// every download and view against the ledger. Set ENABLE_STATIC_FILES=true
// (LAN setup only) to turn the old /files route back on.
if (!isProduction && process.env.ENABLE_STATIC_FILES === 'true') {
  app.use('/files', express.static(path.join(__dirname, '../../uploads')));
}

// ── Routes ────────────────────────────────────────────────────────
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Too many login attempts. Try again in 15 minutes.' }));
app.use('/api/public/verify', rateLimit({ windowMs: 60 * 1000, max: 10 }));
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/users', userRoutes);
app.use('/api/explorer', explorerRoutes);
app.use('/api/publications', publicationRoutes);
app.use('/api/public', publicRoutes); // no login: public resolutions page
app.use('/api/integrity', integrityRoutes);
app.use('/api/analytics', analyticsRoutes); // audit-trail analytics (read only)
app.use('/api/records', recordsRoutes); // repository: documents filed by year and quarter

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
  // Multer size errors -> 413; hide internal error details online
  const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : (err.status || 500);
  res.status(status).json({
    error: isProduction && status >= 500 ? 'Internal Server Error' : (err.message || 'Internal Server Error'),
  });
});

// ── Startup ───────────────────────────────────────────────────────
async function start() {
  try {
    await connectDatabase();
console.log('[DB] PostgreSQL connected');
const User = require('./models/User');
await User.seedDefaults();
    // Year + quarter filing columns (adds them to an existing database once)
    await ensureFilingColumns();

    await initSearch();
    console.log('[Search] MeiliSearch initialized');

    app.listen(PORT, () => {
      console.log('');
      console.log('╔══════════════════════════════════════╗');
      console.log('║   DocuChain API Server Running       ║');
      console.log(`║   http://localhost:${PORT}               ║`);
      console.log('╚══════════════════════════════════════╝');
      console.log('');
      // Re-hash every stored file and its metadata against the ledger on a schedule
      startScheduler();
    });
  } catch (err) {
    console.error('[Startup Error]', err);
    process.exit(1);
  }
}

start();

module.exports = app;
