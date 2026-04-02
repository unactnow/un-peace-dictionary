const PREDEFINED_SECTIONS = [
  { key: 'simple', title: 'In simple terms' },
  { key: 'matters', title: 'Why it matters' },
  { key: 'works', title: 'How it works' },
  { key: 'data', title: 'Data / Facts and Figures' },
];

function matchSectionToSlot(sectionTitle) {
  const t = (sectionTitle || '').toLowerCase().trim();
  for (const slot of PREDEFINED_SECTIONS) {
    if (t === slot.title.toLowerCase()) return slot.key;
  }
  return null;
}

function mapSectionsToSlots(dbSections) {
  const slots = {};
  PREDEFINED_SECTIONS.forEach((s) => { slots[s.key] = ''; });
  const qaPairs = [];
  (dbSections || []).forEach((sec) => {
    const key = matchSectionToSlot(sec.title);
    if (key) {
      slots[key] = sec.body || '';
    } else if ((sec.title || '').toLowerCase().startsWith('questions people ask')) {
      try {
        const parsed = JSON.parse(sec.body);
        if (Array.isArray(parsed)) {
          parsed.forEach((p) => { if (p.q || p.a) qaPairs.push(p); });
        }
      } catch (e) {
        // legacy markdown body — ignore
      }
    }
  });
  return { slots, qaPairs };
}

function extractWikiLinks(text) {
  const found = new Set();
  if (!text) return found;
  text.replace(/\[\[([^\]]+)\]\]/g, (_, raw) => {
    const termKey = raw.trim().toLowerCase();
    found.add(termKey);
  });
  return found;
}

module.exports = { PREDEFINED_SECTIONS, matchSectionToSlot, mapSectionsToSlots, extractWikiLinks };
