// Document types and offices from the DNSC Revised Organizational Structure
// and Terms of Reference (2025): Office of the Board Secretary (ToR 2.2),
// College Secretarial Affairs Unit (ToR 1.3.3) and the organizational chart.
// Keep in sync with backend/src/services/torService.js.

export const DOC_TYPE_GROUPS = [
  { group: 'Board of Trustees (Office of the Board Secretary)', items: [
    'Board Resolution', 'Referendum', 'Agenda', 'Notice of Meeting', 'Minutes of Meeting',
    'Excerpt of Minutes', "Secretary's Certificate", 'Board Report',
  ] },
  { group: 'Councils and College Secretary', items: ['Council Resolution', 'Memorandum', 'Circular', 'Bulletin'] },
  { group: 'Other', items: ['Other'] },
]

export const OFFICE_GROUPS = [
  { group: 'Governing Board', items: ['Board of Trustees', 'Office of the Board Secretary'] },
  { group: 'Office of the President', items: ['Office of the President'] },
  { group: 'Councils', items: ['Administrative Council (AdCo)', 'Academic Council (AcadCo)', 'College RDE Council (CoRDEC)'] },
  { group: 'Vice Presidents', items: ['OVP for Administration and Finance', 'OVP for Academic Affairs', 'OVP for Research, Development, and Extension'] },
  { group: 'Campuses', items: ['DNSC-IGACOS Campus', 'DNSC-Carmen Campus', 'DNSC-Sto. Tomas Campus', 'DNSC-Talaingod Campus'] },
]

export const isResolution = type => /Resolution$/.test(type || '')

// <option>s grouped as in the ToR
export function GroupedOptions({ groups }) {
  return groups.map(g => (
    <optgroup key={g.group} label={g.group}>
      {g.items.map(i => <option key={i} value={i}>{i}</option>)}
    </optgroup>
  ))
}
