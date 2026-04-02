#!/usr/bin/env node
/**
 * Create the first admin user. Run once after first deploy.
 *
 * Usage:
 *   npm run seed
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sequelize, User, Setting, Term, AccordionSection, ExternalLink } = require('../models');

async function seed() {
  await sequelize.sync();

  const existing = await User.findOne({ where: { role: 'admin' } });
  if (existing) {
    console.log('Admin user already exists. Skipping user creation.');
  } else {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const name = process.env.ADMIN_NAME || 'Admin';
    const email = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
    const password = process.env.ADMIN_PASSWORD || 'admin';

    const hash = await bcrypt.hash(password, 10);
    await User.create({ username, name, email, password: hash, role: 'admin' });

    console.log(`Admin user created: ${username} (${email})`);
  }

  const defaults = [
    { key: 'site_name', value: 'UN Peace Dictionary', label: 'Site Name', type: 'text' },
    { key: 'tagline', value: '', label: 'Tagline', type: 'text' },
    { key: 'footer_text', value: '', label: 'Footer Text', type: 'text' },
    { key: 'analytics_code', value: '', label: 'Analytics Code', type: 'textarea' },
    {
      key: 'dictionary_intro_text',
      value:
        'This is a first mock-up of the Peace Dictionary with sample content pulled from the climate site. It uses semantic HTML and microformatting to maximize SEO and GEO. The javascript populates its definition list based on the HTML markup so that definitions are only stored in one location and are easily added/edited by non-coders.',
      label: 'Dictionary intro (export)',
      type: 'textarea',
    },
    {
      key: 'dictionary_page_url',
      value: 'https://www.un.org/en/peaceandsecurity/peace-dictionary',
      label: 'Public dictionary page URL (canonical)',
      type: 'text',
    },
  ];
  for (const d of defaults) {
    await Setting.findOrCreate({ where: { key: d.key }, defaults: d });
  }
  console.log('Default settings seeded.');

  const termCount = await Term.count();
  if (termCount === 0) {
    const peacebuilding = await Term.create({
      name: 'Peacebuilding',
      abbreviation: '',
      slug: 'peacebuilding',
      pronunciation: '/ˈpiːsˌbɪldɪŋ/',
      partOfSpeech: 'noun',
      leadDefinition:
        'Activities and structures that **prevent**, **reduce**, or **transform** violence and support lasting peace.',
      searchKeywords: 'peacebuilding, peace, conflict',
    });
    await AccordionSection.create({
      termId: peacebuilding.id,
      title: 'In simple terms',
      body: 'Efforts to help societies recover from conflict and avoid returning to it.',
      sortOrder: 0,
    });
    const prevention = await Term.create({
      name: 'Conflict prevention',
      abbreviation: '',
      slug: 'conflict-prevention',
      pronunciation: '',
      partOfSpeech: 'noun',
      leadDefinition:
        'Measures to identify and address causes of conflict before violence erupts. See also [[Peacebuilding]].',
      searchKeywords: 'prevention, conflict',
    });
    await ExternalLink.create({
      termId: prevention.id,
      text: 'UN Peace and Security',
      url: 'https://www.un.org/en/peaceandsecurity',
      sortOrder: 0,
    });
    await peacebuilding.setRelatedTerms([prevention.id]);
    await prevention.setRelatedTerms([peacebuilding.id]);
    console.log('Sample terms seeded (peacebuilding, conflict-prevention).');
  }

  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
