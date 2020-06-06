// See http://docs.sequelizejs.com/en/latest/docs/models-definition/
// for more of what you can do here.
const Sequelize = require('sequelize');
const DataTypes = Sequelize.DataTypes;

module.exports = function (app) {
  const sequelizeClient = app.get('sequelizeClient');
  const applicationVersion = sequelizeClient.define('application_version', {
    externalServiceName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    registry: {
      type: DataTypes.STRING,
      allowNull: false
    },
    tag: {
      type: DataTypes.STRING,
      allowNull: false
    },
    image: {
      type: DataTypes.STRING,
      allowNull: false
    },
    replicas: {
      type: DataTypes.INTEGER,
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
    },
    weight: {
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
  applicationVersion.associate = function (models) {
    applicationVersion.belongsTo(models.volumes);
    applicationVersion.belongsTo(models.applications);
  };

  return applicationVersion;
};
