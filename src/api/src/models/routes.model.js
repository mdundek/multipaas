// See http://docs.sequelizejs.com/en/latest/docs/models-definition/
// for more of what you can do here.
const Sequelize = require('sequelize');
const DataTypes = Sequelize.DataTypes;

module.exports = function (app) {
  const sequelizeClient = app.get('sequelizeClient');
  const routes = sequelizeClient.define('routes', {
    virtualPort: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    port: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    tcpStream: {
      type: DataTypes.BOOLEAN,
      allowNull: true
    },
    subdomain: {
      type: DataTypes.STRING,
      allowNull: true
    },
    serviceType: {
      type: DataTypes.STRING,
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
  routes.associate = function (models) {
    routes.belongsTo(models.domains);
    routes.belongsTo(models.applications);
    routes.belongsTo(models.services);
  };

  return routes;
};
