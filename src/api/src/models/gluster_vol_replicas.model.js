// See http://docs.sequelizejs.com/en/latest/docs/models-definition/
// for more of what you can do here.
const Sequelize = require('sequelize');
const DataTypes = Sequelize.DataTypes;

module.exports = function (app) {
  const sequelizeClient = app.get('sequelizeClient');
  const glusterVolReplicas = sequelizeClient.define('gluster_vol_replicas', {}, {
    hooks: {
      beforeCount(options) {
        options.raw = true;
      }
    }
  });

  // eslint-disable-next-line no-unused-vars
  glusterVolReplicas.associate = function (models) {
    glusterVolReplicas.belongsTo(models.volumes);
    glusterVolReplicas.belongsTo(models.gluster_hosts);
  };

  return glusterVolReplicas;
};
