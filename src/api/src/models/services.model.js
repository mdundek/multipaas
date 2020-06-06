// See http://docs.sequelizejs.com/en/latest/docs/models-definition/
// for more of what you can do here.
const Sequelize = require('sequelize');
const DataTypes = Sequelize.DataTypes;

module.exports = function (app) {
  const sequelizeClient = app.get('sequelizeClient');
  const services = sequelizeClient.define('services', {
    serviceName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    serviceVersion: {
      type: DataTypes.STRING,
      allowNull: false
    },
    instanceName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    namespace: {
      type: DataTypes.STRING,
      allowNull: false
    },
    externalServiceName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    hasDedicatedVolume: {
      type: DataTypes.BOOLEAN,
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
    vcap: {
      type: DataTypes.TEXT,
      allowNull: true
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
  services.associate = function (models) {
    services.belongsTo(models.workspaces);
    services.belongsTo(models.volumes);
    services.hasMany(models.routes, {
      onDelete: "CASCADE"
    });
  };

  return services;
};
