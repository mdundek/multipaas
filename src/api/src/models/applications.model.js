// See http://docs.sequelizejs.com/en/latest/docs/models-definition/
// for more of what you can do here.
const Sequelize = require('sequelize');
const DataTypes = Sequelize.DataTypes;

module.exports = function (app) {
  const sequelizeClient = app.get('sequelizeClient');
  const applications = sequelizeClient.define('applications', {
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    namespace: {
      type: DataTypes.STRING,
      allowNull: false
    },
    config: {
      type: DataTypes.TEXT,
      allowNull: false
    },
  }, {
    hooks: {
      beforeCount(options) {
        options.raw = true;
      }
    }
  });

  // eslint-disable-next-line no-unused-vars
  applications.associate = function (models) {
    applications.hasMany(models.application_version, {
      onDelete: "CASCADE"
    });
    applications.hasMany(models.routes, {
      onDelete: "CASCADE"
    });
    applications.belongsTo(models.workspaces);
  };

  return applications;
};
