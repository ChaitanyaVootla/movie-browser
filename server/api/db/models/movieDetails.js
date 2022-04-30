const { DataTypes } = require('sequelize');

const MovieDetails = global.sequelize.define('movieDetails', {
    id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        primaryKey: true,
    },
    data: {
        type: DataTypes.JSON,
    },
});

module.exports = { MovieDetails };
