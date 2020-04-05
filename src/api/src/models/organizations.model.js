// See http://docs.sequelizejs.com/en/latest/docs/models-definition/
// for more of what you can do here.
const Sequelize = require('sequelize');
const DataTypes = Sequelize.DataTypes;

module.exports = function (app) {
  const sequelizeClient = app.get('sequelizeClient');
  const organizations = sequelizeClient.define('organizations', {
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    registryUser: {
      type: DataTypes.STRING,
      allowNull: false
    },
    registryPass: {
      type: DataTypes.STRING,
      allowNull: false
    },
    bcryptSalt: {
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
  organizations.associate = function (models) {
    organizations.belongsTo(models.accounts);
    organizations.hasMany(models.workspaces, {
      onDelete: "CASCADE"
    });
    organizations.hasMany(models.org_users, {
      onDelete: "CASCADE"
    });
    organizations.hasMany(models.domains, {
      onDelete: "CASCADE"
    });
  };

  return organizations;
};
