'use strict';

/**
 * DocuChain — ToR labels
 *
 * Document types and offices follow the DNSC Revised Organizational Structure
 * and Terms of Reference (2025):
 *  - Office of the Board Secretary, ToR 2.2: agenda, minutes, referendums,
 *    excerpts of minutes, certifications, resolutions, reports of the Board.
 *  - College Secretarial Affairs Unit, ToR 1.3.3: notices of meetings and
 *    resolutions of the Councils (AdCo, AcadCo, CoRDEC), memoranda,
 *    circulars and bulletins.
 *  - Offices: the top level of the organizational chart.
 *
 * Documents registered before this change carry the old labels on the
 * ledger (which cannot be edited); LEGACY_* map them to the ToR names when
 * they are read.
 */

const DOC_TYPE_GROUPS = [
  { group: 'Board of Trustees (Office of the Board Secretary)', items: [
    'Board Resolution', 'Referendum', 'Agenda', 'Notice of Meeting', 'Minutes of Meeting',
    'Excerpt of Minutes', "Secretary's Certificate", 'Board Report',
  ] },
  { group: 'Councils and College Secretary', items: [
    'Council Resolution', 'Memorandum', 'Circular', 'Bulletin',
  ] },
  { group: 'Other', items: ['Other'] },
];

const OFFICE_GROUPS = [
  { group: 'Governing Board', items: ['Board of Trustees', 'Office of the Board Secretary'] },
  { group: 'Office of the President', items: ['Office of the President'] },
  { group: 'Councils', items: ['Administrative Council (AdCo)', 'Academic Council (AcadCo)', 'College RDE Council (CoRDEC)'] },
  { group: 'Vice Presidents', items: [
    'OVP for Administration and Finance', 'OVP for Academic Affairs', 'OVP for Research, Development, and Extension',
  ] },
  { group: 'Campuses', items: ['DNSC-IGACOS Campus', 'DNSC-Carmen Campus', 'DNSC-Sto. Tomas Campus', 'DNSC-Talaingod Campus'] },
];

const LEGACY_DOC_TYPES = {
  Resolution: 'Board Resolution',
  Minutes: 'Minutes of Meeting',
  Notice: 'Notice of Meeting',
  Certificate: "Secretary's Certificate",
  Memo: 'Memorandum',
  Report: 'Board Report',
  Document: 'Other',
  Contract: 'Other',
  Invoice: 'Other',
  Policy: 'Other',
};

const LEGACY_OFFICES = {
  'Board Secretary': 'Office of the Board Secretary',
  General: 'Office of the President',
  Admin: 'Office of the President',
  Legal: 'Office of the President',
  Finance: 'OVP for Administration and Finance',
  HR: 'OVP for Administration and Finance',
  IT: 'OVP for Administration and Finance',
  Academic: 'OVP for Academic Affairs',
  Research: 'OVP for Research, Development, and Extension',
};

const docType = value => (value && LEGACY_DOC_TYPES[value]) || value || 'Other';
const office = value => (value && LEGACY_OFFICES[value]) || value || 'Office of the Board Secretary';

/** Ledger record with ToR labels (the stored record is not changed). */
function normalize(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return doc;
  if (!('docType' in doc) && !('department' in doc)) return doc;
  return { ...doc, docType: docType(doc.docType), department: office(doc.department) };
}

module.exports = { DOC_TYPE_GROUPS, OFFICE_GROUPS, LEGACY_DOC_TYPES, LEGACY_OFFICES, docType, office, normalize };
