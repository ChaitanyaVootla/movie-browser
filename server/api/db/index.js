const { Sequelize } = require('sequelize');

const sequelize = new Sequelize('mb', 'postgres', 'password', {
    host: '139.59.94.40',
    dialect: 'postgres',
    pool: {
        max: 5,
        min: 0,
        idle: 10000,
        handleDisconnects: true,
    },
    logging: false,
});

global.sequelize = sequelize;

const { GoogleData } = require('./models/googleData');
const { MovieDetails } = require('./models/movieDetails');

sequelize.sync();

module.exports = { GoogleData, MovieDetails, sequelize };
