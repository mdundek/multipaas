// See http://docs.sequelizejs.com/en/latest/docs/models-definition/
// for more of what you can do here.
const Sequelize = require('sequelize');
const DataTypes = Sequelize.DataTypes;

module.exports = function (app) {
  const sequelizeClient = app.get('sequelizeClient');
  const volumes = sequelizeClient.define('volumes', {
    size: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    secret: {
      type: DataTypes.STRING,
      allowNull: false
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false
    },
    portIndex: {
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
  volumes.associate = function (models) {
    volumes.belongsTo(models.workspaces);
    volumes.hasMany(models.volume_bindings, {
      onDelete: "CASCADE"
    });
    volumes.hasMany(models.gluster_vol_replicas, {
      onDelete: "CASCADE"
    });
    volumes.hasMany(models.services);
    volumes.hasMany(models.application_version);
  };

  return volumes;
};
