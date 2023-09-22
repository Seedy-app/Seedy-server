const { Sequelize } = require('sequelize');
const config = require('./config.json');
const env = process.env.NODE_ENV || 'development';
const dbConfig = config.database[env];

// Conexión a la base de datos
const sequelize = new Sequelize(dbConfig.database, dbConfig.username, dbConfig.password, {
    host: dbConfig.host,
    dialect: dbConfig.dialect
});
  
module.exports = sequelize;