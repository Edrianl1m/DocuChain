'use strict';

/**
 * Audit-trail analytics
 *
 * Built from the integrity_logs table, which records every upload, download,
 * view (preview), verification and public-page access together with the user
 * who did it. Nothing here writes to the database or the ledger.
 *
 * GET /api/analytics/summary?days=30
 *   Admin only (403 for other roles)
 */

const express = require('express');
const router = express.Router();
const { QueryTypes } = require('sequelize');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const blockchain = require('../services/blockchainService');

const TZ = process.env.ANALYTICS_TIMEZONE || 'Asia/Manila';

// Which log actions count as what
const DOWNLOAD = ['download', 'public_download'];
// Automatic thumbnail previews on the public page are not counted as views;
// only a deliberate click to open the document is. A preview that fails the
// integrity check still counts as a failed check (see the loop below).
const VIEW = ['view', 'public_view'];
const PREVIEW = ['public_preview'];
const VERIFY = ['verify', 'public_verify'];
const UPLOAD = ['register', 'new_version'];
const TRACKED = [...DOWNLOAD, ...VIEW, ...VERIFY, ...UPLOAD, ...PREVIEW, 'scan'];

function kind(action) {
  if (DOWNLOAD.includes(action)) return 'downloads';
  if (VIEW.includes(action)) return 'views';
  if (VERIFY.includes(action)) return 'verifications';
  if (UPLOAD.includes(action)) return 'uploads';
  if (action === 'scan') return 'scans';
  return null;
}

function emptyCounts() {
  return { downloads: 0, views: 0, verifications: 0, uploads: 0, scans: 0 };
}

router.get('/summary', authenticate, requireAdmin, async (req, res) => {
  try {
    const days = Math.min(365, Math.max(1, parseInt(req.query.days) || 30));
    const isAdmin = req.user.role === 'admin';

    // Ledger records give each document its department and type. If the
    // blockchain is offline the analytics still work, with "Unknown" department.
    let ledgerDocs = [];
    let ledgerAvailable = true;
    try {
      ledgerDocs = await blockchain.getAllDocuments();
    } catch {
      ledgerAvailable = false;
    }
    const docInfo = {};
    for (const d of ledgerDocs) docInfo[d.docId] = d;

    let docFilter = '';
    const replacements = { days, actions: TRACKED, tz: TZ };
    if (!isAdmin) {
      const own = ledgerDocs.filter(d => d.uploader === req.user.username).map(d => d.docId);
      if (own.length === 0) own.push('__none__');
      docFilter = 'AND "docId" IN (:own)';
      replacements.own = own;
    }

    const rows = await sequelize.query(
      `SELECT "docId", "filename", "action", "result", "blocked", "actor",
              to_char("createdAt" AT TIME ZONE :tz, 'YYYY-MM-DD') AS "day",
              EXTRACT(HOUR FROM "createdAt" AT TIME ZONE :tz)::int AS "hour",
              "createdAt"
         FROM integrity_logs
        WHERE "createdAt" >= NOW() - make_interval(days => :days)
          AND "action" IN (:actions)
          ${docFilter}`,
      { replacements, type: QueryTypes.SELECT }
    );

    const totals = { ...emptyCounts(), failedChecks: 0, blockedAccess: 0, publicAccess: 0, staffAccess: 0 };
    const byDay = {};
    const byDoc = {};
    const byDept = {};
    const byUser = {};
    const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));

    for (const r of rows) {
      const k = kind(r.action);
      if (!k) {
        if (PREVIEW.includes(r.action)) {
          if (r.result === 'fail') totals.failedChecks++;
          if (r.blocked) totals.blockedAccess++;
        }
        continue;
      }
      totals[k]++;
      if (r.result === 'fail') totals.failedChecks++;
      if (r.blocked) totals.blockedAccess++;

      const isAccess = k === 'downloads' || k === 'views';
      if (isAccess) {
        if (r.action.startsWith('public_')) totals.publicAccess++;
        else totals.staffAccess++;
        byHour[r.hour] && byHour[r.hour].count++;
      }

      byDay[r.day] = byDay[r.day] || emptyCounts();
      byDay[r.day][k]++;

      if (r.docId && k !== 'scans') {
        const info = docInfo[r.docId];
        const d = byDoc[r.docId] = byDoc[r.docId] || {
          docId: r.docId,
          filename: info?.filename || r.filename || r.docId,
          department: info?.department || 'Unknown',
          docType: info?.docType || '—',
          ...emptyCounts(),
          lastAccessAt: null,
        };
        d[k]++;
        if (isAccess && (!d.lastAccessAt || r.createdAt > d.lastAccessAt)) d.lastAccessAt = r.createdAt;

        const dept = d.department;
        byDept[dept] = byDept[dept] || { department: dept, ...emptyCounts() };
        byDept[dept][k]++;
      }

      if (isAccess || k === 'verifications' || k === 'uploads') {
        const who = r.action.startsWith('public_') ? 'Public visitors' : (r.actor || 'unknown');
        byUser[who] = byUser[who] || { user: who, ...emptyCounts() };
        byUser[who][k]++;
      }
    }

    // One entry per day in the range, including days with no activity
    const daily = [];
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
    for (let i = days - 1; i >= 0; i--) {
      const dt = new Date(today);
      dt.setDate(today.getDate() - i);
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      daily.push({ day: key, ...(byDay[key] || emptyCounts()) });
    }

    const docs = Object.values(byDoc);
    const topDownloaded = docs.filter(d => d.downloads > 0).sort((a, b) => b.downloads - a.downloads).slice(0, 10);
    const topViewed = docs.filter(d => d.views > 0).sort((a, b) => b.views - a.views).slice(0, 10);
    const access = d => d.downloads + d.views;

    // Documents on the ledger nobody opened in this period
    const visibleDocs = isAdmin ? ledgerDocs : ledgerDocs.filter(d => d.uploader === req.user.username);
    const neverAccessed = visibleDocs.filter(d => !byDoc[d.docId] || access(byDoc[d.docId]) === 0).length;

    res.json({
      days,
      timezone: TZ,
      ledgerAvailable,
      totals: { ...totals, documents: visibleDocs.length, neverAccessed },
      daily,
      byHour,
      topDownloaded,
      topViewed,
      documents: docs.sort((a, b) => access(b) - access(a)),
      byDepartment: Object.values(byDept).sort((a, b) => (b.downloads + b.views) - (a.downloads + a.views)),
      byUser: Object.values(byUser).sort((a, b) => (b.downloads + b.views) - (a.downloads + a.views)).slice(0, 10),
    });
  } catch (err) {
    console.error('[Analytics Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/analytics/bot-activity?days=30   (admin only, read only)
 *
 * Flags access patterns a person is unlikely to produce by hand, e.g. hopping
 * from document to document about once a second. Built from integrity_logs,
 * grouped by who did it: the username for staff, the IP address for the
 * public page. Automatic thumbnail previews are ignored (the browser loads
 * many at once by itself).
 *
 * Rules
 *   rapid_burst : FAST_RUN or more accesses in a row, each within FAST_GAP_MS
 *                 of the previous one
 *   high_rate   : RATE_LIMIT or more accesses inside any RATE_WINDOW_MS window
 */
const BOT_ACTIONS = ['download', 'view', 'verify', 'public_view', 'public_download', 'public_verify'];
const FAST_GAP_MS = parseInt(process.env.BOT_FAST_GAP_MS) || 1500;
const FAST_RUN = parseInt(process.env.BOT_FAST_RUN) || 3;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = parseInt(process.env.BOT_RATE_LIMIT) || 20;

function summarise(who, events, rule) {
  const gaps = [];
  for (let i = 1; i < events.length; i++) gaps.push(events[i].t - events[i - 1].t);
  const docs = [...new Set(events.map(e => e.filename || e.docId).filter(Boolean))];
  const actions = {};
  for (const e of events) actions[e.action] = (actions[e.action] || 0) + 1;
  return {
    who: who.name,
    source: who.source,
    rule,
    start: new Date(events[0].t).toISOString(),
    end: new Date(events[events.length - 1].t).toISOString(),
    durationSec: Math.round((events[events.length - 1].t - events[0].t) / 100) / 10,
    events: events.length,
    distinctDocuments: docs.length,
    documents: docs.slice(0, 5),
    fastestGapMs: gaps.length ? Math.min(...gaps) : null,
    averageGapMs: gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null,
    actions,
  };
}

router.get('/bot-activity', authenticate, requireAdmin, async (req, res) => {
  try {
    const days = Math.min(365, Math.max(1, parseInt(req.query.days) || 30));
    const rows = await sequelize.query(
      `SELECT "docId", "filename", "action", "actor", "ip", "createdAt"
         FROM integrity_logs
        WHERE "createdAt" >= NOW() - make_interval(days => :days)
          AND "action" IN (:actions)
        ORDER BY "createdAt" ASC`,
      { replacements: { days, actions: BOT_ACTIONS }, type: QueryTypes.SELECT }
    );

    // Group by who did it
    const groups = {};
    for (const r of rows) {
      const isPublic = !r.actor || r.actor === 'public';
      const name = isPublic ? (r.ip || 'unknown IP') : r.actor;
      const key = (isPublic ? 'ip:' : 'user:') + name;
      groups[key] = groups[key] || { who: { name, source: isPublic ? 'public' : 'staff' }, events: [] };
      groups[key].events.push({ ...r, t: new Date(r.createdAt).getTime() });
    }

    const incidents = [];
    for (const { who, events } of Object.values(groups)) {
      // Rule 1: runs of very fast consecutive accesses
      let run = [events[0]];
      const flushRun = () => { if (run.length >= FAST_RUN) incidents.push(summarise(who, run, 'rapid_burst')); };
      for (let i = 1; i < events.length; i++) {
        if (events[i].t - events[i - 1].t <= FAST_GAP_MS) run.push(events[i]);
        else { flushRun(); run = [events[i]]; }
      }
      if (events.length) flushRun();

      // Rule 2: too many accesses inside one minute (reported once per stretch)
      let lo = 0;
      let reportedUntil = -1;
      for (let hi = 0; hi < events.length; hi++) {
        while (events[hi].t - events[lo].t > RATE_WINDOW_MS) lo++;
        if (hi - lo + 1 >= RATE_LIMIT && lo > reportedUntil) {
          let end = hi;
          while (end + 1 < events.length && events[end + 1].t - events[lo].t <= RATE_WINDOW_MS) end++;
          incidents.push(summarise(who, events.slice(lo, end + 1), 'high_rate'));
          reportedUntil = end;
        }
      }
    }

    incidents.sort((a, b) => (a.start < b.start ? 1 : -1));
    res.json({
      days,
      rules: { fastGapMs: FAST_GAP_MS, fastRun: FAST_RUN, rateWindowSec: RATE_WINDOW_MS / 1000, rateLimit: RATE_LIMIT },
      accessesChecked: rows.length,
      flaggedActors: new Set(incidents.map(i => i.source + ':' + i.who)).size,
      incidents,
    });
  } catch (err) {
    console.error('[Bot activity]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
