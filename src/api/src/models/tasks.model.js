// See http://docs.sequelizejs.com/en/latest/docs/models-definition/
// for more of what you can do here.
const Sequelize = require('sequelize');
const DataTypes = Sequelize.DataTypes;

module.exports = function (app) {
  const sequelizeClient = app.get('sequelizeClient');
  const tasks = sequelizeClient.define('tasks', {
    taskId: {
      type: DataTypes.STRING,
      allowNull: false
    },
    taskType: {
      type: DataTypes.STRING,
      allowNull: false
    },
    target: {
      type: DataTypes.STRING,
      allowNull: false
    },
    targetId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false
    },
    payload: {
      type: DataTypes.TEXT,
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
  tasks.associate = function (models) {
    // Define associations here
    // See http://docs.sequelizejs.com/en/latest/docs/associations/
  };

  return tasks;
};
