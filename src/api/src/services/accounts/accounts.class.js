const { Service } = require('feathers-sequelize');
const { Conflict } = require('@feathersjs/errors');

exports.Accounts = class Accounts extends Service {
    constructor (options, app) {
        super(options, app)
        this.app = app;
    }

    /**
     * create
     * @param {*} data 
     * @param {*} params 
     */
    async create (data, params) {
        const { name, email, password } = data;
        // Check to see if user already exists
        if((await this.app.service('users').find({
            "query": {
                "email": email
            },
            "user": params.user
        })).total != 0){
            let err = new Error('This user already exists');
            err.code = 412;
            return err;
        } 
        // Otherwise, create user, then account
        else {
            params._internalRequest = true;
            if((await this.app.service('accounts').find({
                "query": {
                    "name": name
                },
                "user": params.user,
                "_internalRequest": true
            })).total == 0){
                // Call the original `create` method with existing `params` and new data
                let newAccount = await super.create({
                    name
                }, params);
                let roles = await this.app.service('roles').find({ "query": {name: "ACCOUNT_OWNER"}, "user": params.user });
                // Then create the admin user object
                params._internalRequest = true;
                await this.app.service('users').create({
                    email, 
                    password, 
                    roleId: roles.data[0].id, 
                    accountId: newAccount.id
                }, params);
                return {
                    code: 200
                };
            } else {
                return new Conflict(new Error('This account already exists'));
            }
        }
    }
};
