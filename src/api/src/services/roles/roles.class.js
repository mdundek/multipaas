const { Service } = require('feathers-sequelize');

exports.Roles = class Roles extends Service {
    constructor (options, app) {
        super(options, app)
        this.app = app;
    }

   /**
    * setup
    * @param {*} app 
    * @param {*} path 
    */
    async setup (app, path) {
        try{
            // Create roles if not exist
            let allRoles = await app.service('roles').find({});
            let initialRoles =  [{
                name: "SYSADMIN",
            }, {
                name: "ACCOUNT_OWNER",
            }, {
                name: "ACCOUNT_USER",
            }];
            
            for(let i=0; i<initialRoles.length; i++) {
                if(!allRoles.data.find(r => r.name == initialRoles[i].name)){
                    await app.service('roles').create(initialRoles[i]);
                }
            }
            
            // Create sysadmin user if not exist
            let sysAdmRole = await app.service('roles').find({
                "name": "SYSADMIN"
            });

            if(sysAdmRole.total == 0) {
                throw new Error("The roles database has not been initialized");
            }

            // Make sure we have at least one sysadmin
            let adms = await app.service('users').find({
                query: {
                    roleId: sysAdmRole.data[0].id
                }
            });
            if(adms.total == 0){
                if(!process.env.API_SYSADMIN_USER || !process.env.API_SYSADMIN_PASSWORD){
                    throw new Error("Missing sysadmin credentials in env variables");
                }
                await app.service('users').create({
                    email: process.env.API_SYSADMIN_USER,
                    password: process.env.API_SYSADMIN_PASSWORD,
                    roleId: sysAdmRole.data[0].id
                }, {
                    _internalRequest: true
                });
            }

        } catch(err){
            console.log(err);
            process.exit(1);
        }
    }
};
