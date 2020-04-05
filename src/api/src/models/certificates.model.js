// See http://docs.sequelizejs.com/en/latest/docs/models-definition/
// for more of what you can do here.
const Sequelize = require('sequelize');
const DataTypes = Sequelize.DataTypes;

module.exports = function (app) {
  const sequelizeClient = app.get('sequelizeClient');
  const certificates = sequelizeClient.define('certificates', {
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    key: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    crt: {
      type: DataTypes.TEXT,
      allowNull: false
    }
  }, {
    hooks: {
      beforeCount(options) {
        options.raw = true;
      }
    }
  });

  // eslint-disable-next-line no-unused-vars
  certificates.associate = function (models) {
    certificates.belongsTo(models.domains);
  };

  return certificates;
};
