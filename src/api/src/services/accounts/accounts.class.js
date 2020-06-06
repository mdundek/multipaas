const { Service } = require('feathers-sequelize');
const { Conflict } = require('@feathersjs/errors');
const PermissionHelper = require("../../lib/permission_helper");
const Keycloak = require("../../lib/keycloak");

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

        // If user exists, make sure he has not his own account
        let potentialUsers = await this.app.service('users').find({
            paginate: false,
            query: {
                "email": email
            },
            _internalRequest: true
        });
        if(potentialUsers.length == 1 && password) {
            let error = new Error('This user already has an account');
            error.statusCode = 412;
            err.code = 412;
            return error;
        }

        let adminToken = await Keycloak.adminAuthenticate(this.app);
        let kcUser = await Keycloak.getUserByEmail(adminToken, email);
        if(kcUser && password) {
            await Keycloak.authenticate(email, password, true);
        }

        if(potentialUsers.length == 1) {
            let accountUsers = await this.app.service('acc-users').find({
                paginate: false,
                query: {
                    "userId": potentialUsers[0].id
                },
                _internalRequest: true
            });
            if(accountUsers.find(o => o.isAccountOwner)){
                let error = new Error('This user already has an account');
                error.statusCode = 412;
                err.code = 412;
                return error;
            }
        }
        
        let accounts = await this.app.service('accounts').find({
            query: {
                "name": name
            },
            _internalRequest: true
        });
        if(accounts.total == 0){
            let transaction = null;
            try {
                const sequelize = this.app.get('sequelizeClient');
                transaction = await sequelize.transaction();

                let newAccount = await super.create({
                    name
                }, {
                    _internalRequest: true,
                    sequelize: { transaction}
                });

                let user = null;
                if(potentialUsers.length == 1){
                    user = potentialUsers[0];
                } else {
                    user = await this.app.service('users').create({
                        email, 
                        password
                    }, {
                        _internalRequest: true,
                        sequelize: { transaction}
                    });
                }

                await this.app.service('acc-users').create({
                    accountId: newAccount.id, 
                    userId: user.id,
                    isAccountOwner: true
                }, {
                    _internalRequest: true,
                    sequelize: { transaction}
                });

                if(!kcUser) {
                    await Keycloak.createUser(adminToken, email, password);
                }
            
                await transaction.commit();
                return {
                    code: 200
                };
            } catch (error) {
                if (transaction) {
                    // console.log(transaction);
                    await transaction.rollback();
                }
                throw error;
            }
        } else {
            return new Conflict(new Error('This account already exists'));
        }
    }
};
