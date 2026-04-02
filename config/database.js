const { Sequelize } = require('sequelize');

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}

const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true' || !!process.env.VERCEL_URL;

let sequelize;

if (isVercel) {
  sequelize = new Sequelize(dbUrl, {
    dialect: 'postgres',
    dialectModule: require('@neondatabase/serverless'),
    logging: false,
    dialectOptions: { ssl: true },
    pool: { max: 1, min: 0, idle: 0, acquire: 3000 },
  });
} else {
  sequelize = new Sequelize(dbUrl, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: { require: true, rejectUnauthorized: false },
    },
  });
}

module.exports = sequelize;
