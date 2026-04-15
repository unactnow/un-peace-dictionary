const express = require('express');
const { Term, AccordionSection, Setting } = require('../models');
const { ensureAuthenticated } = require('../middleware/auth');
const { generateDictionaryHTML } = require('../helpers/export');

const router = express.Router();

async function loadTermsForExport() {
  return Term.findAll({
    distinct: true,
    subQuery: false,
    col: 'Term.id',
    include: [
      {
        model: AccordionSection,
        as: 'sections',
        separate: true,
        order: [['sortOrder', 'ASC']],
      },
      {
        model: Term,
        as: 'relatedTerms',
        through: { attributes: [] },
        required: false,
      },
    ],
    order: [['name', 'ASC']],
  });
}

async function getSettings() {
  const rows = await Setting.findAll({ raw: true });
  const settings = {};
  rows.forEach((r) => {
    settings[r.key] = r.value;
  });
  return settings;
}

router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const terms = await loadTermsForExport();
    const settings = await getSettings();
    const htmlOutput = generateDictionaryHTML(terms, settings);
    res.render('admin/export', {
      title: 'Export',
      htmlOutput,
      termCount: terms.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Failed to generate export.');
    res.redirect('/admin');
  }
});

router.get('/download', ensureAuthenticated, async (req, res) => {
  try {
    const terms = await loadTermsForExport();
    const settings = await getSettings();
    const htmlOutput = generateDictionaryHTML(terms, settings);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="peace-dictionary.html"');
    res.send(htmlOutput);
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Failed to download export.');
    res.redirect('/export');
  }
});

module.exports = router;
