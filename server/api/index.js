const { Sequelize, DataTypes } = require('sequelize');

const sequelize = new Sequelize('mb', 'postgres', 'password', {
  host: '139.59.94.40',
  dialect: 'postgres',
});

const GoogleData = sequelize.define('googleData',
    {
        id: {
            type: DataTypes.BIGINT,
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
        },
        searchString: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        data: {
            type: DataTypes.JSON,
        }
    },
    {
        indexes: [
            {
                unique: true,
                fields: ['searchString']
            }
        ]
    }
);

sequelize.sync();

module.exports = { GoogleData, sequelize };
