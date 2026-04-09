const sequelize = require('../config/database');
const authSequelize = require('../config/auth-database');
const { DataTypes } = require('sequelize');

const User = authSequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: { isEmail: true },
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  role: {
    type: DataTypes.ENUM('user', 'editor', 'admin'),
    defaultValue: 'user',
  },
}, {
  tableName: 'users',
  timestamps: true,
});

const PasswordResetToken = authSequelize.define('PasswordResetToken', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  token: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  used: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  tableName: 'password_reset_tokens',
  timestamps: true,
});

const Setting = sequelize.define('Setting', {
  key: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  value: {
    type: DataTypes.TEXT,
    defaultValue: '',
  },
  label: {
    type: DataTypes.STRING,
  },
  type: {
    type: DataTypes.STRING,
    defaultValue: 'text',
  },
}, {
  tableName: 'settings',
  timestamps: false,
});

const Term = sequelize.define('Term', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  abbreviation: { type: DataTypes.STRING, defaultValue: '' },
  slug: { type: DataTypes.STRING, allowNull: false, unique: true },
  pronunciation: { type: DataTypes.STRING, defaultValue: '' },
  partOfSpeech: { type: DataTypes.STRING, defaultValue: 'noun' },
  leadDefinition: { type: DataTypes.TEXT, allowNull: false },
  searchKeywords: { type: DataTypes.TEXT, defaultValue: '' },
}, { tableName: 'terms', timestamps: true });

const AccordionSection = sequelize.define('AccordionSection', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  title: { type: DataTypes.STRING, allowNull: false },
  body: { type: DataTypes.TEXT, allowNull: false },
  sortOrder: { type: DataTypes.INTEGER, defaultValue: 0 },
}, { tableName: 'accordion_sections', timestamps: true });

const ExternalLink = sequelize.define('ExternalLink', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  text: { type: DataTypes.STRING, allowNull: false },
  url: { type: DataTypes.STRING, allowNull: false },
  sortOrder: { type: DataTypes.INTEGER, defaultValue: 0 },
}, { tableName: 'external_links', timestamps: true });

const TermRelationship = sequelize.define('TermRelationship', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  termId: { type: DataTypes.UUID, allowNull: false },
  relatedTermId: { type: DataTypes.UUID, allowNull: false },
}, { tableName: 'term_relationships', timestamps: false });

const TermRevision = sequelize.define('TermRevision', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  snapshot: { type: DataTypes.TEXT, allowNull: false },
  revisedBy: { type: DataTypes.STRING, defaultValue: '' },
}, { tableName: 'term_revisions', timestamps: true });

User.hasMany(PasswordResetToken, { foreignKey: 'userId', onDelete: 'CASCADE' });
PasswordResetToken.belongsTo(User, { foreignKey: 'userId' });

Term.hasMany(AccordionSection, { foreignKey: 'termId', onDelete: 'CASCADE', as: 'sections' });
AccordionSection.belongsTo(Term, { foreignKey: 'termId' });

Term.hasMany(ExternalLink, { foreignKey: 'termId', onDelete: 'CASCADE', as: 'externalLinks' });
ExternalLink.belongsTo(Term, { foreignKey: 'termId' });

Term.belongsToMany(Term, {
  through: TermRelationship,
  as: 'relatedTerms',
  foreignKey: 'termId',
  otherKey: 'relatedTermId',
});

Term.hasMany(TermRevision, { foreignKey: 'termId', onDelete: 'CASCADE', as: 'revisions' });
TermRevision.belongsTo(Term, { foreignKey: 'termId' });

module.exports = {
  sequelize,
  authSequelize,
  User,
  PasswordResetToken,
  Setting,
  Term,
  AccordionSection,
  ExternalLink,
  TermRelationship,
  TermRevision,
};
