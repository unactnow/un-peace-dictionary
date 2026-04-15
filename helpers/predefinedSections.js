const PREDEFINED_SECTIONS = [];

function matchSectionToSlot(sectionTitle) {
  return null;
}

function mapSectionsToSlots(dbSections) {
  const slots = {};
  const qaPairs = [];
  (dbSections || []).forEach((sec) => {
    if ((sec.title || '').toLowerCase().startsWith('questions people ask')) {
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
