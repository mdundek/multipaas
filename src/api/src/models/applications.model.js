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
    externalServiceName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    registryImageName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    registryImageVersion: {
      type: DataTypes.STRING,
      allowNull: false
    },
    replicas: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    buildpack: {
      type: DataTypes.STRING,
      allowNull: false
    },
    namespace: {
      type: DataTypes.STRING,
      allowNull: false
    },
    dedicatedPv: {
      type: DataTypes.STRING,
      allowNull: true
    },
    dedicatedPvc: {
      type: DataTypes.STRING,
      allowNull: true
    },
    hasDedicatedVolume: {
      type: DataTypes.BOOLEAN,
      allowNull: false
    },
    pvcSize: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    hooks: {
      beforeCount(options) {
        options.raw = true;
      }
    }
  });

  // eslint-disable-next-line no-unused-vars
  applications.associate = function (models) {
    applications.hasMany(models.routes, {
      onDelete: "CASCADE"
    });
    applications.belongsTo(models.volumes);
    applications.belongsTo(models.workspaces);
  };

  return applications;
};
