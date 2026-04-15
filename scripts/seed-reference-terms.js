#!/usr/bin/env node
/**
 * Parse all terms from the reference Peace Dictionary HTML and seed them into the database.
 * Replaces any existing terms (wipes terms, sections, links, relationships first).
 *
 * Usage:
 *   node scripts/seed-reference-terms.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { sequelize, Term, AccordionSection, ExternalLink, TermRelationship } = require('../models');

const HTML_PATH = path.resolve(__dirname, '../../un-peace-dictionary/index.html');

function extractArticles(html) {
  const articles = [];
  const articleRe = /<article\s+class="pd-entry"[^>]*id="pd-([^"]+)"[^>]*data-term="([^"]+)"[^>]*data-search="([^"]*)"[^>]*>([\s\S]*?)<\/article>/gi;
  let m;
  while ((m = articleRe.exec(html)) !== null) {
    const slug = m[1];
    const termName = m[2];
    const searchKeywords = m[3];
    const body = m[4];

    const qaPairs = [];
    const relatedSlugs = [];

    const detailsRe = /<details[^>]*>\s*<summary>([\s\S]*?)<\/summary>\s*<div\s+class="pd-details-body[^"]*">([\s\S]*?)<\/div>\s*<\/details>/gi;
    let dm;
    while ((dm = detailsRe.exec(body)) !== null) {
      const summaryTitle = dm[1].replace(/<[^>]+>/g, '').trim();
      const detailsBody = dm[2];

      if (summaryTitle === 'Related terms') {
        const relRe = /<a\s+href="#pd-([^"]+)"/gi;
        let rm;
        while ((rm = relRe.exec(detailsBody)) !== null) {
          relatedSlugs.push(rm[1]);
        }
      } else if (summaryTitle.toLowerCase().startsWith('questions people ask')) {
        const pairRe = /<p><strong>([\s\S]*?)<\/strong><\/p>\s*([\s\S]*?)(?=<p><strong>|$)/gi;
        let pm;
        while ((pm = pairRe.exec(detailsBody)) !== null) {
          const q = pm[1].replace(/<[^>]+>/g, '').trim();
          const a = pm[2].trim();
          if (q) qaPairs.push({ q, a });
        }
      }
    }

    articles.push({
      name: termName,
      slug,
      searchKeywords,
      qaPairs,
      relatedSlugs,
    });
  }
  return articles;
}

async function run() {
  if (!fs.existsSync(HTML_PATH)) {
    console.error('Reference HTML not found at:', HTML_PATH);
    process.exit(1);
  }

  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const articles = extractArticles(html);
  console.log(`Parsed ${articles.length} terms from reference HTML.`);

  await sequelize.sync();

  await TermRelationship.destroy({ where: {} });
  await AccordionSection.destroy({ where: {} });
  await ExternalLink.destroy({ where: {} });
  await Term.destroy({ where: {} });
  console.log('Cleared existing terms.');

  const termMap = {};
  for (const a of articles) {
    const term = await Term.create({
      name: a.name,
      slug: a.slug,
      searchKeywords: a.searchKeywords,
    });
    termMap[a.slug] = term;

    if (a.qaPairs.length > 0) {
      const title = `Questions people ask about \u201c${a.name.toLowerCase()}\u201d`;
      await AccordionSection.create({
        termId: term.id,
        title,
        body: JSON.stringify(a.qaPairs),
        sortOrder: 0,
      });
    }

    console.log(`  + ${a.name} (${a.qaPairs.length} Q&A pairs)`);
  }

  for (const a of articles) {
    if (a.relatedSlugs.length === 0) continue;
    const term = termMap[a.slug];
    const relatedIds = a.relatedSlugs
      .map(s => termMap[s])
      .filter(Boolean)
      .map(t => t.id);
    if (relatedIds.length > 0) {
      await term.setRelatedTerms(relatedIds);
      console.log(`  ~ ${a.name} → ${relatedIds.length} related terms`);
    }
  }

  console.log(`\nDone. ${articles.length} terms seeded.`);
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
