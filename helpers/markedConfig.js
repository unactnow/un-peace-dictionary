/**
 * Shared Marked configuration (PEACE-DICTIONARY-CMS-PLAN.md Section 8):
 * GFM on, header IDs off.
 */
const { marked } = require('marked');

marked.use({
  gfm: true,
  headerIds: false,
  mangle: false,
});

module.exports = { marked };
