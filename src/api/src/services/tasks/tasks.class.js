const { Service } = require('feathers-sequelize');

exports.Tasks = class Tasks extends Service {
    constructor (options, app) {
        super(options, app)
        this.app = app;
    }
};
