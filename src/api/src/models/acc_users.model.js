// See http://docs.sequelizejs.com/en/latest/docs/models-definition/
// for more of what you can do here.
const Sequelize = require('sequelize');
const DataTypes = Sequelize.DataTypes;

module.exports = function (app) {
  const sequelizeClient = app.get('sequelizeClient');
  const accUsers = sequelizeClient.define('acc_users', {
    isAccountOwner: {
      type: DataTypes.BOOLEAN,
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
  accUsers.associate = function (models) {
    accUsers.belongsTo(models.users);
    accUsers.belongsTo(models.accounts);
  };

  return accUsers;
};
