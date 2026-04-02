const express = require('express');
const { Op } = require('sequelize');
const { Term, AccordionSection, ExternalLink, TermRevision } = require('../models');
const { ensureAuthenticated } = require('../middleware/auth');

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

function parseSections(body) {
  const out = [];
  if (Array.isArray(body.sections)) {
    body.sections.forEach((s, i) => {
      if (s && typeof s === 'object') {
        const title = (s.title || '').trim();
        const bodyText = (s.body || '').trim();
        if (title || bodyText) {
          out.push({ title: title || 'Section', body: bodyText, sortOrder: i });
        }
      }
    });
  }
  return out;
}

function parseLinks(body) {
  const out = [];
  if (Array.isArray(body.links)) {
    body.links.forEach((l, i) => {
      if (l && typeof l === 'object') {
        const text = (l.text || '').trim();
        const url = (l.url || '').trim();
        if (text && url) out.push({ text, url, sortOrder: i });
      }
    });
  }
  return out;
}

function parseRelatedIds(body) {
  const raw = body.relatedTermIds;
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (raw) return [raw];
  return [];
}

async function buildSnapshotObject(termId) {
  const term = await Term.findByPk(termId, {
    include: [
      { model: AccordionSection, as: 'sections' },
      { model: ExternalLink, as: 'externalLinks' },
    ],
  });
  if (!term) return null;
  const related = await term.getRelatedTerms();
  return {
    name: term.name,
    abbreviation: term.abbreviation,
    slug: term.slug,
    pronunciation: term.pronunciation,
    partOfSpeech: term.partOfSpeech,
    leadDefinition: term.leadDefinition,
    searchKeywords: term.searchKeywords,
    sections: term.sections.map((s) => ({
      title: s.title,
      body: s.body,
      sortOrder: s.sortOrder,
    })),
    externalLinks: term.externalLinks.map((l) => ({
      text: l.text,
      url: l.url,
      sortOrder: l.sortOrder,
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
      sections: [{ title: '', body: '', sortOrder: 0 }],
      externalLinks: [{ text: '', url: '', sortOrder: 0 }],
      allTerms,
      relatedIdList: [],
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
    const {
      name,
      abbreviation,
      slug: slugInput,
      pronunciation,
      part_of_speech,
      lead_definition,
      search_keywords,
    } = req.body;
    const finalSlug = (slugInput || '').trim() || slugify(name);
    const existing = await Term.findOne({ where: { slug: finalSlug } });
    if (existing) {
      req.flash('error_msg', 'A term with that slug already exists.');
      return res.redirect('/admin/terms/new');
    }
    const term = await Term.create({
      name: name.trim(),
      abbreviation: (abbreviation || '').trim(),
      slug: finalSlug,
      pronunciation: (pronunciation || '').trim(),
      partOfSpeech: (part_of_speech || 'noun').trim(),
      leadDefinition: lead_definition || '',
      searchKeywords: (search_keywords || '').trim(),
    });

    const sections = parseSections(req.body);
    for (const s of sections) {
      await AccordionSection.create({ ...s, termId: term.id });
    }
    const links = parseLinks(req.body);
    for (const l of links) {
      await ExternalLink.create({ ...l, termId: term.id });
    }
    const relIds = parseRelatedIds(req.body).filter((id) => id !== term.id);
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
        { model: ExternalLink, as: 'externalLinks', separate: true, order: [['sortOrder', 'ASC']] },
      ],
    });
    if (!term) {
      req.flash('error_msg', 'Term not found.');
      return res.redirect('/admin/terms');
    }
    const related = await term.getRelatedTerms({ attributes: ['id'] });
    const relatedIdList = related.map((r) => r.id);
    const allTerms = await loadAllTermsForSelect(term.id);
    const revisions = await TermRevision.findAll({
      where: { termId: term.id },
      order: [['createdAt', 'DESC']],
      limit: 50,
    });
    const sections =
      term.sections && term.sections.length > 0
        ? term.sections.map((s) => ({ title: s.title, body: s.body, sortOrder: s.sortOrder }))
        : [{ title: '', body: '', sortOrder: 0 }];
    const externalLinks =
      term.externalLinks && term.externalLinks.length > 0
        ? term.externalLinks.map((l) => ({ text: l.text, url: l.url, sortOrder: l.sortOrder }))
        : [{ text: '', url: '', sortOrder: 0 }];

    res.render('admin/term-edit', {
      title: 'Edit term',
      term,
      sections,
      externalLinks,
      allTerms,
      relatedIdList,
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

    const {
      name,
      abbreviation,
      slug: slugInput,
      pronunciation,
      part_of_speech,
      lead_definition,
      search_keywords,
    } = req.body;
    const finalSlug = (slugInput || '').trim() || slugify(name);
    const clash = await Term.findOne({ where: { slug: finalSlug, id: { [Op.ne]: term.id } } });
    if (clash) {
      req.flash('error_msg', 'Another term already uses that slug.');
      return res.redirect(`/admin/terms/${term.id}/edit`);
    }

    await term.update({
      name: name.trim(),
      abbreviation: (abbreviation || '').trim(),
      slug: finalSlug,
      pronunciation: (pronunciation || '').trim(),
      partOfSpeech: (part_of_speech || 'noun').trim(),
      leadDefinition: lead_definition || '',
      searchKeywords: (search_keywords || '').trim(),
    });

    await AccordionSection.destroy({ where: { termId: term.id } });
    const sections = parseSections(req.body);
    for (const s of sections) {
      await AccordionSection.create({ ...s, termId: term.id });
    }

    await ExternalLink.destroy({ where: { termId: term.id } });
    const links = parseLinks(req.body);
    for (const l of links) {
      await ExternalLink.create({ ...l, termId: term.id });
    }

    const relIds = parseRelatedIds(req.body).filter((id) => id !== term.id);
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
    res.render('admin/term-revision-view', {
      title: 'Revision',
      term,
      revision: rev,
      snapshot,
      current,
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
      abbreviation: snap.abbreviation || '',
      slug: snap.slug || term.slug,
      pronunciation: snap.pronunciation || '',
      partOfSpeech: snap.partOfSpeech || 'noun',
      leadDefinition: snap.leadDefinition || '',
      searchKeywords: snap.searchKeywords || '',
    });

    await AccordionSection.destroy({ where: { termId: term.id } });
    for (let i = 0; i < (snap.sections || []).length; i++) {
      const s = snap.sections[i];
      await AccordionSection.create({
        title: s.title || 'Section',
        body: s.body || '',
        sortOrder: s.sortOrder != null ? s.sortOrder : i,
        termId: term.id,
      });
    }

    await ExternalLink.destroy({ where: { termId: term.id } });
    for (let i = 0; i < (snap.externalLinks || []).length; i++) {
      const l = snap.externalLinks[i];
      await ExternalLink.create({
        text: l.text,
        url: l.url,
        sortOrder: l.sortOrder != null ? l.sortOrder : i,
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

module.exports = router;
