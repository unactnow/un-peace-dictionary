'use strict';

const { Sequelize } = require('sequelize');
const { getAuthDatabaseUrl } = require('./database-url');
const appSequelize = require('./database');

const authUrl = getAuthDatabaseUrl();

if (!authUrl) {
  module.exports = appSequelize;
} else {
  module.exports = new Sequelize(authUrl, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: { require: true, rejectUnauthorized: false },
    },
    pool: { max: 3, min: 0, idle: 10000, acquire: 30000 },
  });
}
