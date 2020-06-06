// See http://docs.sequelizejs.com/en/latest/docs/models-definition/
// for more of what you can do here.
const Sequelize = require('sequelize');
const DataTypes = Sequelize.DataTypes;

module.exports = function (app) {
  const sequelizeClient = app.get('sequelizeClient');
  const workspaces = sequelizeClient.define('workspaces', {
    name: {
      type: DataTypes.STRING,
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
  workspaces.associate = function (models) {
    workspaces.belongsTo(models.organizations);
    workspaces.hasMany(models.k8s_nodes, {
      onDelete: "CASCADE"
    });
    workspaces.hasMany(models.volumes, {
      onDelete: "CASCADE"
    });
    workspaces.hasMany(models.services, {
      onDelete: "CASCADE"
    });
    workspaces.hasMany(models.applications, {
      onDelete: "CASCADE"
    });
  };

  return workspaces;
};