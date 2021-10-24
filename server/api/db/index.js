const { Sequelize } = require('sequelize');

const sequelize = new Sequelize('mb', 'postgres', 'password', {
  host: '139.59.94.40',
  dialect: 'postgres',
});

global.sequelize = sequelize;

const { GoogleData } = require('./models/googleData');
const { MovieDetails } = require('./models/movieDetails');

sequelize.sync();

module.exports = { GoogleData, MovieDetails, sequelize };
