const { Service } = require('feathers-sequelize');

exports.Users = class Users extends Service {
    constructor (options, app) {
        super(options, app)
        this.app = app;
    }
};
