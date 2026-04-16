const express = require('express');
const { Op } = require('sequelize');
const { Term, AccordionSection, ExternalLink, TermRevision } = require('../models');
const { ensureAuthenticated } = require('../middleware/auth');
const { buildRevisionFieldDiff } = require('../helpers/snapshotDiff');
const { extractWikiLinks } = require('../helpers/predefinedSections');
const { sanitizeRichText } = require('../helpers/sanitizeRichText');

const router = express.Router();

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseQaPairs(body, termName) {
  const questions = body.qa_question;
  const answers = body.qa_answer;
  if (!questions) return null;
  const qArr = Array.isArray(questions) ? questions : [questions];
  const aArr = Array.isArray(answers) ? answers : [answers || ''];
  const pairs = [];
  for (let i = 0; i < qArr.length; i++) {
    const q = (qArr[i] || '').trim();
    const a = (aArr[i] || '').trim();
    if (q || a) pairs.push({ q, a: sanitizeRichText(a) });
  }
  if (pairs.length === 0) return null;
  const title = termName
    ? 'Questions people ask about \u201c' + termName.toLowerCase() + '\u201d'
    : 'Questions people ask';
  return { title, body: JSON.stringify(pairs), sortOrder: 0 };
}

function parseSections(body, termName) {
  const out = [];
  const qa = parseQaPairs(body, termName);
  if (qa) out.push(qa);
  return out;
}

async function resolveRelatedFromContent(termId, allTextFields) {
  const linked = new Set();
  allTextFields.forEach((text) => {
    extractWikiLinks(text).forEach((name) => linked.add(name));
  });
  if (linked.size === 0) return [];
  const excludeWhere = termId ? { id: { [Op.ne]: termId } } : {};
  const conditions = [];
  Array.from(linked).forEach((n) => {
    conditions.push({ name: { [Op.iLike]: n } });
    conditions.push({ name: { [Op.iLike]: `%${n}%` } });
    conditions.push({ slug: slugify(n) });
  });
  const matches = await Term.findAll({
    where: { [Op.or]: conditions, ...excludeWhere },
    attributes: ['id'],
  });
  return [...new Set(matches.map((t) => t.id))];
}

function gatherAllText(body) {
  const texts = [(body.lead_definition || '')];
  const questions = body.qa_question;
  const answers = body.qa_answer;
  if (questions) {
    const qArr = Array.isArray(questions) ? questions : [questions];
    const aArr = Array.isArray(answers) ? answers : [answers || ''];
    qArr.forEach((q) => { if (q) texts.push(q); });
    aArr.forEach((a) => { if (a) texts.push(a); });
  }
  return texts;
}

function generateSearchKeywords(name, allTextFields) {
  const parts = new Set();
  (name || '').toLowerCase().split(/\s+/).forEach((w) => { if (w) parts.add(w); });
  allTextFields.forEach((text) => {
    (text || '').replace(/\[\[([^\]]+)\]\]/g, (_, raw) => {
      raw.trim().toLowerCase().split(/\s+/).forEach((w) => { if (w) parts.add(w); });
    });
  });
  return Array.from(parts).join(' ');
}

function mapSectionsToQaPairs(dbSections) {
  const qaPairs = [];
  (dbSections || []).forEach((sec) => {
    if ((sec.title || '').toLowerCase().startsWith('questions people ask')) {
      try {
        const parsed = JSON.parse(sec.body);
        if (Array.isArray(parsed)) {
          parsed.forEach((p) => { if (p.q || p.a) qaPairs.push(p); });
        }
      } catch (e) {
        // legacy body — ignore
      }
    }
  });
  return qaPairs;
}

async function buildSnapshotObject(termId) {
  const term = await Term.findByPk(termId, {
    include: [
      { model: AccordionSection, as: 'sections' },
    ],
  });
  if (!term) return null;
  const related = await term.getRelatedTerms();
  return {
    name: term.name,
    slug: term.slug,
    leadDefinition: term.leadDefinition || '',
    searchKeywords: term.searchKeywords,
    sections: term.sections.map((s) => ({
      title: s.title,
      body: s.body,
      sortOrder: s.sortOrder,
    })),
    relatedTermIds: related.map((r) => r.id),
  };
}

async function loadAllTermsForSelect(excludeId) {
  const where = excludeId ? { id: { [Op.ne]: excludeId } } : {};
  return Term.findAll({
    where,
    attributes: ['id', 'name', 'slug'],
    order: [['name', 'ASC']],
  });
}

/* ---- routes ---- */

router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const terms = await Term.findAll({ order: [['name', 'ASC']] });
    res.render('admin/terms', { title: 'Terms', terms });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Failed to load terms.');
    res.redirect('/admin');
  }
});

router.get('/new', ensureAuthenticated, async (req, res) => {
  try {
    const allTerms = await loadAllTermsForSelect(null);
    res.render('admin/term-edit', {
      title: 'New term',
      term: null,
      qaPairs: [],
      allTerms,
      revisions: [],
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Failed to load form.');
    res.redirect('/admin/terms');
  }
});

router.post('/new', ensureAuthenticated, async (req, res) => {
  try {
    const { name, lead_definition, slug: formSlug } = req.body;
    const isAdmin = req.user && req.user.role === 'admin';
    const finalSlug = (isAdmin && formSlug && formSlug.trim()) ? slugify(formSlug.trim()) : slugify(name);
    const existing = await Term.findOne({ where: { slug: finalSlug } });
    if (existing) {
      req.flash('error_msg', 'A term with that name already exists.');
      return res.redirect('/admin/terms/new');
    }
    const allTexts = gatherAllText(req.body);
    const keywords = generateSearchKeywords(name, allTexts);
    const term = await Term.create({
      name: name.trim(),
      slug: finalSlug,
      leadDefinition: sanitizeRichText(lead_definition || ''),
      searchKeywords: keywords,
    });

    const sections = parseSections(req.body, name.trim());
    for (const s of sections) {
      await AccordionSection.create({ ...s, termId: term.id });
    }
    const relIds = await resolveRelatedFromContent(term.id, gatherAllText(req.body));
    if (relIds.length > 0) {
      await term.setRelatedTerms(relIds);
    }

    req.flash('success_msg', 'Term created.');
    res.redirect(`/admin/terms/${term.id}/edit`);
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Failed to create term.');
    res.redirect('/admin/terms/new');
  }
});

router.get('/:id/edit', ensureAuthenticated, async (req, res) => {
  try {
    const term = await Term.findByPk(req.params.id, {
      include: [
        { model: AccordionSection, as: 'sections', separate: true, order: [['sortOrder', 'ASC']] },
      ],
    });
    if (!term) {
      req.flash('error_msg', 'Term not found.');
      return res.redirect('/admin/terms');
    }
    const allTerms = await loadAllTermsForSelect(term.id);
    const revisions = await TermRevision.findAll({
      where: { termId: term.id },
      order: [['createdAt', 'DESC']],
      limit: 50,
    });
    const dbSections = term.sections
      ? term.sections.map((s) => ({ title: s.title, body: s.body, sortOrder: s.sortOrder }))
      : [];
    const qaPairs = mapSectionsToQaPairs(dbSections);

    res.render('admin/term-edit', {
      title: 'Edit term',
      term,
      qaPairs,
      allTerms,
      revisions,
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Failed to load term.');
    res.redirect('/admin/terms');
  }
});

router.post('/:id/edit', ensureAuthenticated, async (req, res) => {
  try {
    const term = await Term.findByPk(req.params.id);
    if (!term) {
      req.flash('error_msg', 'Term not found.');
      return res.redirect('/admin/terms');
    }

    const snap = await buildSnapshotObject(term.id);
    if (snap) {
      await TermRevision.create({
        termId: term.id,
        snapshot: JSON.stringify(snap),
        revisedBy: req.user ? req.user.username : '',
      });
    }

    const { name, lead_definition, slug: formSlug } = req.body;
    const isAdmin = req.user && req.user.role === 'admin';
    const finalSlug = (isAdmin && formSlug && formSlug.trim()) ? slugify(formSlug.trim()) : slugify(name);
    const clash = await Term.findOne({ where: { slug: finalSlug, id: { [Op.ne]: term.id } } });
    if (clash) {
      req.flash('error_msg', 'Another term already uses that name.');
      return res.redirect(`/admin/terms/${term.id}/edit`);
    }

    const allTexts = gatherAllText(req.body);
    const keywords = generateSearchKeywords(name, allTexts);
    await term.update({
      name: name.trim(),
      slug: finalSlug,
      leadDefinition: sanitizeRichText(lead_definition || ''),
      searchKeywords: keywords,
    });

    const newSections = parseSections(req.body, name.trim());
    const existingSections = await AccordionSection.findAll({ where: { termId: term.id } });
    const existingHasContent = existingSections.some((s) => (s.body || '').trim().length > 0);
    const newHasContent = newSections.some((s) => (s.body || '').trim().length > 0);
    if (!existingHasContent || newHasContent) {
      await AccordionSection.destroy({ where: { termId: term.id } });
      for (const s of newSections) {
        await AccordionSection.create({ ...s, termId: term.id });
      }
    }

    const relIds = await resolveRelatedFromContent(term.id, gatherAllText(req.body));
    await term.setRelatedTerms(relIds);

    req.flash('success_msg', 'Term updated.');
    res.redirect(`/admin/terms/${term.id}/edit`);
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Failed to update term.');
    res.redirect(`/admin/terms/${req.params.id}/edit`);
  }
});

router.post('/:id/delete', ensureAuthenticated, async (req, res) => {
  try {
    await Term.destroy({ where: { id: req.params.id } });
    req.flash('success_msg', 'Term deleted.');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Failed to delete term.');
  }
  res.redirect('/admin/terms');
});

/* ---- revisions ---- */

router.get('/:id/revisions', ensureAuthenticated, async (req, res) => {
  try {
    const term = await Term.findByPk(req.params.id, { attributes: ['id', 'name'] });
    if (!term) {
      req.flash('error_msg', 'Term not found.');
      return res.redirect('/admin/terms');
    }
    const revisions = await TermRevision.findAll({
      where: { termId: term.id },
      order: [['createdAt', 'DESC']],
    });
    res.render('admin/term-revisions', { title: 'Revisions', term, revisions });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Failed to load revisions.');
    res.redirect(`/admin/terms/${req.params.id}/edit`);
  }
});

router.get('/:id/revisions/:revId', ensureAuthenticated, async (req, res) => {
  try {
    const term = await Term.findByPk(req.params.id);
    if (!term) return res.status(404).render('404', { title: 'Not found' });
    const rev = await TermRevision.findOne({
      where: { id: req.params.revId, termId: term.id },
    });
    if (!rev) return res.status(404).render('404', { title: 'Not found' });
    let snapshot;
    try {
      snapshot = JSON.parse(rev.snapshot);
    } catch (e) {
      snapshot = {};
    }
    const current = await buildSnapshotObject(term.id);
    const diffRows = buildRevisionFieldDiff(snapshot, current);
    res.render('admin/term-revision-view', {
      title: 'Revision',
      term,
      revision: rev,
      snapshot,
      current,
      diffRows,
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Failed to load revision.');
    res.redirect(`/admin/terms/${req.params.id}/revisions`);
  }
});

router.post('/:id/revisions/:revId/restore', ensureAuthenticated, async (req, res) => {
  try {
    const term = await Term.findByPk(req.params.id);
    if (!term) {
      req.flash('error_msg', 'Term not found.');
      return res.redirect('/admin/terms');
    }
    const rev = await TermRevision.findOne({
      where: { id: req.params.revId, termId: term.id },
    });
    if (!rev) {
      req.flash('error_msg', 'Revision not found.');
      return res.redirect(`/admin/terms/${term.id}/revisions`);
    }

    const before = await buildSnapshotObject(term.id);
    if (before) {
      await TermRevision.create({
        termId: term.id,
        snapshot: JSON.stringify(before),
        revisedBy: req.user ? req.user.username : '',
      });
    }

    let snap;
    try {
      snap = JSON.parse(rev.snapshot);
    } catch (e) {
      req.flash('error_msg', 'Invalid snapshot.');
      return res.redirect(`/admin/terms/${term.id}/revisions`);
    }

    await term.update({
      name: snap.name || term.name,
      slug: snap.slug || term.slug,
      leadDefinition: snap.leadDefinition != null ? sanitizeRichText(snap.leadDefinition) : term.leadDefinition,
      searchKeywords: snap.searchKeywords || '',
    });

    await AccordionSection.destroy({ where: { termId: term.id } });
    for (let i = 0; i < (snap.sections || []).length; i++) {
      const s = snap.sections[i];
      await AccordionSection.create({
        title: s.title || 'Section',
        body: sanitizeRichText(s.body || ''),
        sortOrder: s.sortOrder != null ? s.sortOrder : i,
        termId: term.id,
      });
    }

    await term.setRelatedTerms(snap.relatedTermIds || []);

    req.flash('success_msg', 'Restored from revision.');
    res.redirect(`/admin/terms/${term.id}/edit`);
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Failed to restore.');
    res.redirect(`/admin/terms/${req.params.id}/revisions`);
  }
});

/* ---- JSON bulk export ---- */

router.get('/json/export', ensureAuthenticated, async (req, res) => {
  try {
    const terms = await Term.findAll({
      include: [
        { model: AccordionSection, as: 'sections', separate: true, order: [['sortOrder', 'ASC']] },
        { model: Term, as: 'relatedTerms', through: { attributes: [] }, required: false },
      ],
      order: [['name', 'ASC']],
    });
    const payload = terms.map((t) => ({
      name: t.name,
      slug: t.slug,
      leadDefinition: t.leadDefinition || '',
      searchKeywords: t.searchKeywords || '',
      sections: (t.sections || []).map((s) => ({ title: s.title, body: s.body, sortOrder: s.sortOrder })),
      relatedSlugs: (t.relatedTerms || []).map((r) => r.slug),
    }));
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="peace-dictionary-terms.json"');
    res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Failed to export JSON.');
    res.redirect('/admin/terms');
  }
});

/* ---- JSON bulk import ---- */

router.post('/json/import', ensureAuthenticated, express.json({ limit: '5mb' }), async (req, res) => {
  try {
    const data = req.body;
    if (!Array.isArray(data)) {
      return res.status(400).json({ error: 'Expected a JSON array of terms.' });
    }

    let created = 0;
    let updated = 0;
    const slugToId = {};

    for (const item of data) {
      if (!item.name || !item.slug) continue;
      let term = await Term.findOne({ where: { slug: item.slug } });
      if (term) {
        await term.update({
          name: item.name,
          leadDefinition: item.leadDefinition || '',
          searchKeywords: item.searchKeywords || '',
        });
        updated++;
      } else {
        term = await Term.create({
          name: item.name,
          slug: item.slug,
          leadDefinition: item.leadDefinition || '',
          searchKeywords: item.searchKeywords || '',
        });
        created++;
      }
      slugToId[item.slug] = term.id;

      await AccordionSection.destroy({ where: { termId: term.id } });
      for (let i = 0; i < (item.sections || []).length; i++) {
        const s = item.sections[i];
        await AccordionSection.create({
          title: s.title || 'Section',
          body: s.body || '',
          sortOrder: s.sortOrder != null ? s.sortOrder : i,
          termId: term.id,
        });
      }
    }

    for (const item of data) {
      if (!item.slug || !Array.isArray(item.relatedSlugs) || item.relatedSlugs.length === 0) continue;
      const termId = slugToId[item.slug];
      if (!termId) continue;
      const term = await Term.findByPk(termId);
      if (!term) continue;
      const relIds = item.relatedSlugs.map((s) => slugToId[s]).filter(Boolean);
      await term.setRelatedTerms(relIds);
    }

    res.json({ ok: true, created, updated, total: data.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Import failed: ' + err.message });
  }
});

module.exports = router;
