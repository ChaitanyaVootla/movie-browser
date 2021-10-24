const { DataTypes } = require('sequelize');

const GoogleData = global.sequelize.define('googleData',
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

module.exports = { GoogleData };
