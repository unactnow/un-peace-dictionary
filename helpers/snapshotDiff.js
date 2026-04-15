function buildRevisionFieldDiff(snapshot, current) {
  const snap = snapshot || {};
  const cur = current || {};

  const scalarFields = [
    ['name', 'Name'],
    ['slug', 'Slug'],
    ['searchKeywords', 'Search keywords'],
  ];

  const rows = [];
  for (const [key, label] of scalarFields) {
    const b = snap[key] != null ? String(snap[key]) : '';
    const a = cur[key] != null ? String(cur[key]) : '';
    rows.push({ label, before: b, after: a, changed: b !== a });
  }

  const secB = JSON.stringify(snap.sections || [], null, 2);
  const secA = JSON.stringify(cur.sections || [], null, 2);
  rows.push({
    label: 'Questions (sections)',
    before: secB,
    after: secA,
    changed: secB !== secA,
  });

  const relB = JSON.stringify(snap.relatedTermIds || []);
  const relA = JSON.stringify(cur.relatedTermIds || []);
  rows.push({
    label: 'Related term IDs',
    before: relB,
    after: relA,
    changed: relB !== relA,
  });

  return rows;
}

module.exports = { buildRevisionFieldDiff };
