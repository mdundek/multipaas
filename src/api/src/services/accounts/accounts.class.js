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

        console.log("data =>", data);

        const { name, email, password } = data;
        // If user exists, make sure he has not his own account
        let potentialUsers = await this.app.service('users').find({
            paginate: false,
            query: {
                "email": email
            },
            _internalRequest: true
        });

        console.log("potentialUsers =>", potentialUsers);

        let adminToken = null;
        let kcUser = null;

        // if(process.env.MP_MODE == "unipaas") {
        //     if(potentialUsers.length != 1) {
        //         let error = new Error('Unauthorized');
        //         error.statusCode = 401;
        //         error.code = 401;
        //         return error;
        //     }

        //     adminToken = await Keycloak.adminAuthenticate(this.app);
        //     kcUser = await Keycloak.getUserByEmail(adminToken, email);
           
        //     if(kcUser && password && email == process.env.API_SYSADMIN_USER) {
        //         await Keycloak.authenticate(email, password, true);
        //         let accounts = await this.app.service('accounts').find({
        //             paginate: false,
        //             query: {},
        //             _internalRequest: true
        //         });

        //         if(accounts.length != 0) {
        //             let error = new Error('Unicloud already has a default account');
        //             error.statusCode = 401;
        //             error.code = 401;
        //             return error;
        //         }
        //     }
        //     else {
        //         let error = new Error('Unauthorized');
        //         error.statusCode = 401;
        //         error.code = 401;
        //         return error;
        //     }
        // }
        // else {
            if(potentialUsers.length == 1 && password) {
                let error = new Error('This user already has an account');
                error.statusCode = 412;
                error.code = 412;
                return error;
            }
            
            adminToken = await Keycloak.adminAuthenticate(this.app);
            kcUser = await Keycloak.getUserByEmail(adminToken, email);
            
            if(kcUser && password) {
                await Keycloak.authenticate(email, password, true);
            }
            
            if(potentialUsers.length == 1) {
                console.log("Has potential user !!! =>", potentialUsers);
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
                    error.code = 412;
                    return error;
                }
            }
        // }
        
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
                    console.log("Has potential user 2 !!! =>", potentialUsers);
                    user = potentialUsers[0];
                } else {
                    console.log("Creating user ==>", {
                        email, 
                        password
                    });
                    user = await this.app.service('users').create({
                        email, 
                        password
                    }, {
                        _internalRequest: true,
                        sequelize: { transaction}
                    });
                }

                console.log("creating acc-user =>", {
                    accountId: newAccount.id, 
                    userId: user.id,
                    isAccountOwner: true
                });

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
                    await transaction.rollback();
                }
                throw error;
            }
        } else {
            return new Conflict(new Error('This account already exists'));
        }
    }
};
