// See http://docs.sequelizejs.com/en/latest/docs/models-definition/
// for more of what you can do here.
const Sequelize = require('sequelize');
const DataTypes = Sequelize.DataTypes;

module.exports = function (app) {
  const sequelizeClient = app.get('sequelizeClient');
  const k8sNodes = sequelizeClient.define('k8s_nodes', {
    hash: {
      type: DataTypes.STRING,
      allowNull: false
    },
    nodeType: {
      type: DataTypes.STRING,
      allowNull: false
    },
    ip: {
      type: DataTypes.STRING,
      allowNull: false
    },
    hostname: {
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
  k8sNodes.associate = function (models) {
    k8sNodes.belongsTo(models.k8s_hosts);
    k8sNodes.belongsTo(models.workspaces);
  };

  return k8sNodes;
};
