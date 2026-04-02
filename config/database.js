const { Sequelize } = require('sequelize');
const path = require('path');

let sequelize;

const dbUrl = process.env.DATABASE_URL;
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true' || !!process.env.VERCEL_URL;

if (dbUrl && (dbUrl.startsWith('postgresql') || dbUrl.startsWith('postgres'))) {
  if (isVercel) {
    const { neonConfig } = require('@neondatabase/serverless');
    neonConfig.fetchConnectionCache = true;

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
} else {
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(__dirname, '..', 'database.sqlite'),
    logging: false,
  });
}

module.exports = sequelize;
