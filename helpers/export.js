const fs = require('fs');
const path = require('path');
const { marked } = require('./markedConfig');

const PD_CSS = fs.readFileSync(path.join(__dirname, 'static', 'peace-dictionary.css'), 'utf8');
const PD_JS = fs.readFileSync(path.join(__dirname, 'static', 'peace-dictionary.js'), 'utf8');

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function letterBucket(name) {
  const m = String(name).match(/[A-Za-z]/);
  return m ? m[0].toUpperCase() : 'A';
}

function buildTermLookup(terms) {
  const byLower = {};
  terms.forEach((t) => {
    byLower[t.name.trim().toLowerCase()] = t;
  });
  return byLower;
}

function fuzzyMatchTerm(key, termLookup) {
  if (termLookup[key]) return termLookup[key];
  const slugKey = key.replace(/\s+/g, '-').replace(/[^\w-]/g, '');
  for (const [name, term] of Object.entries(termLookup)) {
    if (term.slug === slugKey) return term;
  }
  for (const [name, term] of Object.entries(termLookup)) {
    if (name.includes(key)) return term;
  }
  const keyWords = key.split(/\s+/).filter((w) => w.length > 2);
  let bestMatch = null;
  let bestScore = 0;
  for (const [name, term] of Object.entries(termLookup)) {
    const nameWords = name.split(/\s+/).filter((w) => w.length > 2);
    const overlap = keyWords.filter((w) => nameWords.includes(w)).length;
    const score = overlap / Math.max(keyWords.length, 1);
    if (overlap > bestScore || (overlap === bestScore && score > (bestScore / Math.max(keyWords.length, 1)))) {
      bestScore = overlap;
      bestMatch = term;
    }
  }
  if (bestScore >= 1 && bestScore >= keyWords.length * 0.5) return bestMatch;
  return null;
}

function resolveWikiLinks(markdown, termLookup) {
  if (!markdown) return '';
  return markdown.replace(/\[\[([^\]]+)\]\]/g, (match, rawContent) => {
    const label = rawContent.trim();
    const termKey = label.toLowerCase();
    const term = fuzzyMatchTerm(termKey, termLookup);
    if (term) {
      return `<a href="#pd-${escapeHtml(term.slug)}">${escapeHtml(label)}</a>`;
    }
    return escapeHtml(label);
  });
}

function isHtml(text) {
  return /^\s*</.test(text || '');
}

function cleanQuillListMarkup(html) {
  return html
    .replace(/<ol[^>]*>([\s\S]*?)<\/ol>/g, (match, inner) => {
      if (/data-list="bullet"/.test(inner)) {
        const cleaned = inner.replace(/\s*(data-list|class)="[^"]*"/g, '');
        return '<ul>' + cleaned + '</ul>';
      }
      return match.replace(/\s*(data-list|class)="[^"]*"/g, '');
    })
    .replace(/<span\s+style="[^"]*">([\s\S]*?)<\/span>/g, '$1')
    .replace(/<span\s+class="[^"]*">([\s\S]*?)<\/span>/g, '$1')
    .replace(/<span>([\s\S]*?)<\/span>/g, '$1')
    .replace(/<p>\s*<br\s*\/?>\s*<\/p>/g, '')
    .replace(/<p>\s*<\/p>/g, '')
    .replace(/<p>&nbsp;<\/p>/g, '')
    .replace(/(<br\s*\/?>){2,}/g, '<br>');
}

function contentToHtml(content, termLookup) {
  if (!content) return '';
  const resolved = resolveWikiLinks(content, termLookup);
  if (isHtml(content)) return cleanQuillListMarkup(resolved);
  return marked.parse(resolved, { async: false });
}

function markdownToHtml(md, termLookup) {
  return contentToHtml(md, termLookup);
}

function buildDataSearch(term) {
  const parts = [
    term.slug.replace(/-/g, ' '),
    term.name.toLowerCase(),
    (term.searchKeywords || '').toLowerCase(),
  ];
  const seen = new Set();
  const out = [];
  parts.join(' ').split(/\s+/).forEach((w) => {
    if (w && !seen.has(w)) {
      seen.add(w);
      out.push(w);
    }
  });
  return out.join(' ');
}

function renderTermArticle(term, termLookup) {
  const sections = (term.sections || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const related = term.relatedTerms || [];

  const titleHtml = `<dfn>${escapeHtml(term.name)}</dfn>`;
  const leadHtml = markdownToHtml(term.leadDefinition, termLookup);
  let bodyInner = leadHtml;

  sections.forEach((sec) => {
    let sectionBodyHtml;
    const isQa = (sec.title || '').toLowerCase().startsWith('questions people ask');
    if (isQa) {
      try {
        const pairs = JSON.parse(sec.body);
        if (Array.isArray(pairs) && pairs.length > 0) {
          sectionBodyHtml = pairs.map((p) => {
            const aHtml = contentToHtml(p.a || '', termLookup);
            return `<p><strong>${escapeHtml(p.q || '')}</strong></p>\n                            ${aHtml}`;
          }).join('\n                            ');
        }
      } catch (e) { /* not JSON, fall through */ }
    }
    if (!sectionBodyHtml) {
      sectionBodyHtml = contentToHtml(sec.body, termLookup);
    }
    bodyInner += `
                    <details>
                        <summary>${escapeHtml(sec.title)}</summary>
                        <div class="pd-details-body">
                            ${sectionBodyHtml}
                        </div>
                    </details>`;
  });

  if (related.length > 0) {
    const pills = related
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((r) => `<a href="#pd-${escapeHtml(r.slug)}">${escapeHtml(r.name)}</a>`)
      .join('\n                                ');
    bodyInner += `
                    <details>
                        <summary>Related terms</summary>
                        <div class="pd-details-body">
                            <div class="pd-related-terms">
                                ${pills}
                            </div>
                        </div>
                    </details>`;
  }

  return `<article class="pd-entry" id="pd-${escapeHtml(term.slug)}" itemscope itemtype="https://schema.org/DefinedTerm" itemprop="hasDefinedTerm" data-term="${escapeHtml(term.name)}" data-search="${escapeHtml(buildDataSearch(term))}">
                <h3 class="pd-entry-term" itemprop="name">${titleHtml}</h3>
                <div class="pd-entry-body" itemprop="description">
                    ${bodyInner}
                </div>
            </article>`;
}

function buildJsonLd(terms, pageUrl, dateModified) {
  const base = pageUrl.replace(/#.*$/, '');
  const termLookup = buildTermLookup(terms);
  const defined = terms.map((t) => {
    const leadHtml = markdownToHtml(t.leadDefinition, termLookup);
    const plainMatch = String(leadHtml).match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const desc = plainMatch ? plainMatch[1].replace(/<[^>]+>/g, '').trim() : '';
    return {
      '@type': 'DefinedTerm',
      name: t.name,
      description: desc || t.name,
      url: `${base}#pd-${t.slug}`,
    };
  });

  const allFaqs = [];
  terms.forEach((t) => {
    (t.sections || []).forEach((sec) => {
      const isQa = (sec.title || '').toLowerCase().startsWith('questions people ask');
      if (isQa) {
        try {
          const pairs = JSON.parse(sec.body);
          if (Array.isArray(pairs)) {
            pairs.forEach((p) => {
              if (p.q && p.a) {
                const plainAnswer = p.a
                  .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2')
                  .replace(/\[\[([^\]]+)\]\]/g, '$1')
                  .replace(/<[^>]+>/g, '');
                allFaqs.push({ question: p.q, answer: plainAnswer });
              }
            });
          }
        } catch (e) { /* not JSON */ }
      }
    });
  });

  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'DefinedTermSet',
      name: 'The Peace Dictionary',
      description:
        'A comprehensive glossary of peace and security terminology from the United Nations, covering key terms to help understand the language of diplomacy, peacebuilding, and conflict resolution.',
      url: base,
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': base,
      },
      publisher: {
        '@type': 'Organization',
        name: 'United Nations',
        url: 'https://www.un.org',
      },
      inLanguage: 'en',
      datePublished: '2026-04-01',
      dateModified,
      hasDefinedTerm: defined,
    },
  ];

  if (allFaqs.length > 0) {
    ld.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: allFaqs.map((f) => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: f.answer,
        },
      })),
    });
  }

  return JSON.stringify(ld);
}

function groupTermsByLetter(terms) {
  const map = {};
  terms.forEach((t) => {
    const L = letterBucket(t.name);
    if (!map[L]) map[L] = [];
    map[L].push(t);
  });
  return map;
}

function generateDictionaryHTML(terms, settings = {}) {
  const intro =
    settings.dictionary_intro_text ||
    'This is a first mock-up of the Peace Dictionary with sample content pulled from the climate site. It uses semantic HTML and microformatting to maximize SEO and GEO. The javascript populates its definition list based on the HTML markup so that definitions are only stored in one location and are easily added/edited by non-coders.';
  const pageUrl =
    settings.dictionary_page_url || 'https://www.un.org/en/peaceandsecurity/peace-dictionary';
  const dateModified = new Date().toISOString().split('T')[0];

  const sorted = terms.slice().sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const termLookup = buildTermLookup(sorted);
  const byLetter = groupTermsByLetter(sorted);
  const letters = Object.keys(byLetter).sort();

  const jsonLd = buildJsonLd(sorted, pageUrl, dateModified);

  const sectionsHtml = letters
    .map((L) => {
      const articles = byLetter[L]
        .sort((a, b) => a.name.localeCompare(b.name, 'en'))
        .map((t) => renderTermArticle(t, termLookup))
        .join('\n\n            ');
      return `        <!-- ${L} -->
        <section class="pd-letter-group" id="pd-letter-${L}" aria-label="Terms starting with ${L}">
            <h2 class="pd-letter-heading">${L}</h2>

            ${articles}
        </section>`;
    })
    .join('\n\n');

  return `<!-- Peace Dictionary export -->
<script id="pd-ld-json" type="application/ld+json">${jsonLd}</script>

<link href="https://cdn.jsdelivr.net/gh/unactnow/un-stylesheet@main/styles.css" rel="stylesheet">

<style>
${PD_CSS}
</style>

<div class="peace-dictionary" id="peace-dictionary">

<div class="content-container no-padding-top">
	<div class="image-banner full-width">
		<figure class="image-banner-image"><img alt="The Peace Dictionary banner" src="https://www.un.org/sites/un2.un.org/files/peace-dictionary-banner.png">
		</figure>
	</div>
</div>

<div class="content-container full-width no-padding-top">
    <h2 class="style-h1 align-center">The Peace Dictionary</h2>
    <h3 class="style-h2 align-center heading-underline no-margin-top">Understanding the language of peace and security</h3>
</div>

<div class="content-container no-padding-top">
    <p class="lede align-center">${escapeHtml(intro)}</p>
</div>

<div class="pd-search" role="search" aria-label="Search peace terms">
    <div class="pd-search-inner">
        <label for="pd-search-field">Find a term</label>
        <div class="pd-search-input-wrap">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="search" id="pd-search-field" class="pd-search-field" placeholder="e.g. peacebuilding, diplomacy, mediation&hellip;" autocomplete="off" aria-describedby="pd-search-info">
            <button type="button" class="pd-search-clear" id="pd-search-clear" aria-label="Clear search">&times;</button>
        </div>
        <div id="pd-search-info" class="pd-search-info" aria-live="polite"></div>
    </div>
</div>

<div class="content-container no-padding-top">
    <nav class="pd-alpha-nav" aria-label="Alphabetical index" id="pd-alpha-nav"></nav>
</div>

<div class="content-container no-padding-top">
    <div class="pd-terms" id="pd-terms" itemscope itemtype="https://schema.org/DefinedTermSet">
        <meta itemprop="name" content="The Peace Dictionary">
        <meta itemprop="description" content="A comprehensive glossary of key peace and security terms from the United Nations.">

${sectionsHtml}

    </div>

    <div class="pd-no-results" id="pd-no-results" role="status">
        <p>No terms found matching "<span class="pd-no-results-term" id="pd-no-results-term"></span>"</p>
        <p class="pd-suggestion">Try a different spelling or browse the alphabetical index above.</p>
    </div>
</div>


<a href="#peace-dictionary" class="pd-back-to-top">Return to top</a>

</div>

<script>
${PD_JS}
</script>
`;
}

module.exports = {
  generateDictionaryHTML,
  escapeHtml,
  buildTermLookup,
  resolveWikiLinks,
  markdownToHtml,
};
