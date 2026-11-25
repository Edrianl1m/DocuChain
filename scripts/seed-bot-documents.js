#!/usr/bin/env node
'use strict';
/**
 * DocuChain — load the sample Board of Trustees documents through the API
 * (the same path as the Upload page, so every file is hashed and registered
 * on the blockchain).
 *
 * Usage (backend running):  node scripts/seed-bot-documents.js [--no-activity]
 * Files already on the ledger (same file name) are skipped, so it is safe to
 * run again: it then only adds the samples that are missing (for example the
 * earlier-quarter resolutions in the earlier-quarters folder).
 * Login: DOCUCHAIN_USER / DOCUCHAIN_PASS environment variables, otherwise it asks.
 * API:   DOCUCHAIN_API (default http://localhost:3000/api)
 * Files: ../docuchain-sample-BOT-documents (override with DOCUCHAIN_SAMPLES)
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const API = process.env.DOCUCHAIN_API || 'http://localhost:3000/api';
const DIR = process.env.DOCUCHAIN_SAMPLES || path.resolve(__dirname, '..', '..', 'docuchain-sample-BOT-documents');
const ACTIVITY = !process.argv.includes('--no-activity');

const DOCS = [
  { file: 'BOT-Resolution-No-045-s2026_FY2027-Budget.pdf', department: 'OVP for Administration and Finance', docType: 'Board Resolution', tags: 'budget, FY2027, finance',
    isPublic: true, title: 'Approving the FY 2027 Annual Budget', resolutionNumber: '045, s. 2026', resolutionDate: '2026-10-24',
    summary: 'Approves the PHP 312.45 million annual budget for Fiscal Year 2027.' },
  { file: 'BOT-Resolution-No-046-s2026_Revised-Student-Handbook.pdf', department: 'OVP for Academic Affairs', docType: 'Board Resolution', tags: 'student handbook, policy',
    isPublic: true, title: 'Approving the Revised Student Handbook, AY 2026-2027', resolutionNumber: '046, s. 2026', resolutionDate: '2026-10-24',
    summary: 'Approves the revised Student Handbook for Academic Year 2026-2027.',
    newVersion: 'versions/BOT-Resolution-No-046-s2026_Revised-Student-Handbook_v2.pdf' },
  { file: 'BOT-Resolution-No-047-s2026_Candidates-for-Graduation.pdf', department: 'OVP for Academic Affairs', docType: 'Board Resolution', tags: 'graduation, registrar',
    isPublic: true, title: 'Confirming the Candidates for Graduation, 1st Sem AY 2026-2027', resolutionNumber: '047, s. 2026', resolutionDate: '2026-10-24',
    summary: 'Confirms 428 candidates for graduation.' },
  { file: 'BOT-Resolution-No-048-s2026_Faculty-Promotion-CONFIDENTIAL.pdf', department: 'OVP for Administration and Finance', docType: 'Board Resolution', tags: 'promotion, personnel, confidential',
    isConfidential: true, title: 'Approving the Promotion of Faculty Members', resolutionNumber: '048, s. 2026', resolutionDate: '2026-10-24' },
  { file: 'Minutes_3rd-Regular-BOT-Meeting_2026-10-24.docx', department: 'Office of the Board Secretary', docType: 'Minutes of Meeting', tags: 'minutes, regular meeting',
    title: 'Minutes of the Third Regular BOT Meeting' },
  { file: 'Notice-of-Meeting_4th-Regular-BOT-Meeting-2026.pdf', department: 'Office of the Board Secretary', docType: 'Notice of Meeting', tags: 'notice, meeting',
    title: 'Notice of the Fourth Regular BOT Meeting' },
  { file: 'Secretarys-Certificate_Resolution-045-s2026.pdf', department: 'OVP for Administration and Finance', docType: "Secretary's Certificate", tags: 'certificate, budget',
    title: "Secretary's Certificate on Resolution No. 045" },
  { file: 'Memorandum-2026-031_Submission-of-Agenda-Items.docx', department: 'Office of the Board Secretary', docType: 'Memorandum', tags: 'memo, agenda',
    title: 'Memorandum 2026-031: Submission of Agenda Items' },
  // Earlier quarters, so the Repository shows documents filed across 2025 Q4 to 2026 Q4
  { file: 'earlier-quarters/BOT-Resolution-No-062-s2025_College-Development-Plan.pdf', department: 'Office of the President', docType: 'Board Resolution', tags: 'development plan, planning',
    isPublic: true, title: 'Approving the College Development Plan 2025-2030', resolutionNumber: '062, s. 2025', resolutionDate: '2025-12-13',
    summary: 'The Board approved the five-goal College Development Plan for 2025 to 2030.' },
  { file: 'earlier-quarters/BOT-Resolution-No-008-s2026_Academic-Calendar-AY-2026-2027.pdf', department: 'OVP for Academic Affairs', docType: 'Board Resolution', tags: 'academic calendar, registrar',
    isPublic: true, title: 'Approving the Academic Calendar for AY 2026-2027', resolutionNumber: '008, s. 2026', resolutionDate: '2026-03-14',
    summary: 'First semester of AY 2026-2027 opens on August 10, 2026.' },
  { file: 'earlier-quarters/BOT-Resolution-No-019-s2026_Laboratory-Fees.pdf', department: 'OVP for Administration and Finance', docType: 'Board Resolution', tags: 'fees, laboratory',
    isPublic: true, title: 'Approving the Revised Schedule of Laboratory Fees', resolutionNumber: '019, s. 2026', resolutionDate: '2026-06-20',
    summary: 'New laboratory fees take effect in the first semester of AY 2026-2027.' },
  { file: 'earlier-quarters/Minutes_2nd-Regular-BOT-Meeting_2026-06-20.pdf', department: 'Office of the Board Secretary', docType: 'Minutes of Meeting', tags: 'minutes, regular meeting',
    title: 'Minutes of the Second Regular BOT Meeting', recordYear: 2026, recordQuarter: 2 },
  { file: 'earlier-quarters/BOT-Resolution-No-031-s2026_Scholarship-MOA.pdf', department: 'Office of the President', docType: 'Board Resolution', tags: 'scholarship, agreement, provincial government',
    isPublic: true, title: 'Approving the MOA with the Provincial Government on Scholarship Grants', resolutionNumber: '031, s. 2026', resolutionDate: '2026-08-22',
    summary: 'The College President may sign the scholarship agreement covering 120 students.' },
];

function ask(question, hidden) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  if (hidden) rl._writeToOutput = s => { if (!s.includes(question)) rl.output.write('*'); else rl.output.write(s); };
  return new Promise(resolve => rl.question(question, a => { rl.close(); if (hidden) console.log(''); resolve(a); }));
}

async function call(method, url, token, body) {
  const res = await fetch(API + url, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 80) }; }
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${data.error || ''}`);
  return data;
}

function fileForm(file) {
  const fd = new FormData();
  fd.append('file', new Blob([fs.readFileSync(path.join(DIR, file))]), path.basename(file));
  return fd;
}

(async () => {
  if (!fs.existsSync(DIR)) { console.error(`Sample folder not found: ${DIR}`); process.exit(1); }
  const username = process.env.DOCUCHAIN_USER || await ask('Admin username: ');
  const password = process.env.DOCUCHAIN_PASS || await ask('Password: ', true);
  const loginRes = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  const login = await loginRes.json();
  if (!loginRes.ok) { console.error('Login failed:', login.error); process.exit(1); }
  const token = login.token;

  const existing = new Set(((await call('GET', '/documents', token)).documents || []).map(d => d.filename));
  const ids = {};
  for (const d of DOCS) {
    if (existing.has(path.basename(d.file)) || (d.newVersion && existing.has(path.basename(d.newVersion)))) { console.log(`- ${path.basename(d.file)} is already on the ledger, skipped`); continue; }
    if (!fs.existsSync(path.join(DIR, d.file))) { console.log(`- ${d.file} not found in the sample folder, skipped`); continue; }
    const fd = fileForm(d.file);
    fd.append('department', d.department);
    fd.append('docType', d.docType);
    fd.append('tags', d.tags || '');
    for (const k of ['isPublic', 'isConfidential']) fd.append(k, d[k] ? 'true' : 'false');
    for (const k of ['title', 'resolutionNumber', 'resolutionDate', 'summary', 'recordYear', 'recordQuarter']) fd.append(k, d[k] || '');
    const r = await call('POST', '/documents/upload', token, fd);
    ids[d.file] = r.docId;
    console.log(`✓ ${d.file}  →  ${r.docId}${r.publicationError ? `  (publication: ${r.publicationError})` : ''}`);
    if (d.newVersion) {
      const v = await call('POST', `/documents/${r.docId}/versions`, token, fileForm(d.newVersion));
      console.log(`  ✓ new version v${v.version}: ${path.basename(d.newVersion)}`);
    }
  }

  if (ACTIVITY) {
    // A little realistic use so the dashboard and analytics are not empty
    const plan = [
      ['BOT-Resolution-No-045-s2026_FY2027-Budget.pdf', 4, 3],
      ['BOT-Resolution-No-046-s2026_Revised-Student-Handbook.pdf', 2, 5],
      ['BOT-Resolution-No-047-s2026_Candidates-for-Graduation.pdf', 3, 2],
      ['Minutes_3rd-Regular-BOT-Meeting_2026-10-24.docx', 2, 1],
      ['Notice-of-Meeting_4th-Regular-BOT-Meeting-2026.pdf', 1, 4],
      ['Secretarys-Certificate_Resolution-045-s2026.pdf', 2, 0],
    ];
    for (const [file, downloads, views] of plan) {
      if (!ids[file]) continue;
      for (let i = 0; i < downloads; i++) await fetch(`${API}/documents/${ids[file]}/download`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.arrayBuffer());
      for (let i = 0; i < views; i++) await fetch(`${API}/documents/${ids[file]}/download?inline=1`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.arrayBuffer());
    }
    for (const file of Object.keys(ids).slice(0, 3)) await call('POST', `/documents/${ids[file]}/verify`, token, new FormData());
    if (Object.keys(ids).length) console.log('✓ Sample downloads, views and verifications recorded');
  }

  console.log('\nDone. Demo files for the defence:');
  console.log(`  Tampered copy (amount changed): ${path.join(DIR, 'demo-tampered-copy')}`);
  console.log(`  Old version of Resolution 046:  ${path.join(DIR, 'BOT-Resolution-No-046-s2026_Revised-Student-Handbook.pdf')} (verify it after v2)`);
})().catch(err => { console.error('✗', err.message); process.exit(1); });
