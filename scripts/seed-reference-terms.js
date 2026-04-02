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

function htmlToMarkdown(html) {
  if (!html) return '';
  let md = html;
  md = md.replace(/<strong>([\s\S]*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');
  md = md.replace(/<br\s*\/?>/gi, '\n');
  md = md.replace(/<li>([\s\S]*?)<\/li>/gi, '- $1\n');
  md = md.replace(/<\/?ul[^>]*>/gi, '\n');
  md = md.replace(/<\/?p[^>]*>/gi, '\n\n');
  md = md.replace(/<[^>]+>/g, '');
  md = md.replace(/&hellip;/g, '…');
  md = md.replace(/&amp;/g, '&');
  md = md.replace(/&lt;/g, '<');
  md = md.replace(/&gt;/g, '>');
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#39;/g, "'");
  md = md.replace(/&times;/g, '×');
  md = md.replace(/\u00A0/g, ' ');
  md = md.replace(/\n{3,}/g, '\n\n');
  return md.trim();
}

function extractArticles(html) {
  const articles = [];
  const articleRe = /<article\s+class="pd-entry"[^>]*id="pd-([^"]+)"[^>]*data-term="([^"]+)"[^>]*data-search="([^"]*)"[^>]*>([\s\S]*?)<\/article>/gi;
  let m;
  while ((m = articleRe.exec(html)) !== null) {
    const slug = m[1];
    const termName = m[2];
    const searchKeywords = m[3];
    const body = m[4];

    let abbreviation = '';
    const abbrMatch = body.match(/<abbr\s+title="([^"]+)"/i);
    if (abbrMatch) abbreviation = abbrMatch[1];

    let pronunciation = '';
    const pronMatches = [...body.matchAll(/<span\s+aria-label="pronunciation">([^<]+)<\/span>/gi)];
    if (pronMatches.length > 0) {
      pronunciation = pronMatches.map(pm => pm[1].trim()).join(' — ');
    }

    let partOfSpeech = 'noun';
    const posMatch = body.match(/<span\s+class="pd-pos">([^<]+)<\/span>/i);
    if (posMatch) partOfSpeech = posMatch[1].trim();

    const entryBodyMatch = body.match(/<div\s+class="pd-entry-body"[^>]*>([\s\S]*?)$/i);
    if (!entryBodyMatch) continue;
    let entryBody = entryBodyMatch[1];

    const sections = [];
    const externalLinks = [];
    const relatedSlugs = [];

    const detailsRe = /<details[^>]*>\s*<summary>([\s\S]*?)<\/summary>\s*<div\s+class="pd-details-body[^"]*">([\s\S]*?)<\/div>\s*<\/details>/gi;
    let dm;
    while ((dm = detailsRe.exec(entryBody)) !== null) {
      const summaryTitle = dm[1].replace(/<[^>]+>/g, '').trim();
      const detailsBody = dm[2];

      if (summaryTitle === 'Related terms') {
        const relRe = /<a\s+href="#pd-([^"]+)"/gi;
        let rm;
        while ((rm = relRe.exec(detailsBody)) !== null) {
          relatedSlugs.push(rm[1]);
        }
      } else if (summaryTitle === 'Learn more') {
        const linkRe = /<li><a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/li>/gi;
        let lm;
        while ((lm = linkRe.exec(detailsBody)) !== null) {
          externalLinks.push({ text: lm[2].replace(/<[^>]+>/g, '').trim(), url: lm[1].trim() });
        }
      } else {
        sections.push({ title: summaryTitle, body: htmlToMarkdown(detailsBody) });
      }
    }

    let leadHtml = entryBody.replace(/<details[\s\S]*?<\/details>/gi, '').trim();
    leadHtml = leadHtml.replace(/<\/div>\s*$/, '').trim();
    const leadDefinition = htmlToMarkdown(leadHtml);

    articles.push({
      name: termName,
      slug,
      abbreviation,
      pronunciation,
      partOfSpeech,
      leadDefinition,
      searchKeywords,
      sections,
      externalLinks,
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
      abbreviation: a.abbreviation,
      pronunciation: a.pronunciation,
      partOfSpeech: a.partOfSpeech,
      leadDefinition: a.leadDefinition,
      searchKeywords: a.searchKeywords,
    });
    termMap[a.slug] = term;

    for (let i = 0; i < a.sections.length; i++) {
      await AccordionSection.create({
        termId: term.id,
        title: a.sections[i].title,
        body: a.sections[i].body,
        sortOrder: i,
      });
    }

    for (let i = 0; i < a.externalLinks.length; i++) {
      await ExternalLink.create({
        termId: term.id,
        text: a.externalLinks[i].text,
        url: a.externalLinks[i].url,
        sortOrder: i,
      });
    }

    console.log(`  + ${a.name} (${a.sections.length} sections, ${a.externalLinks.length} links)`);
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
