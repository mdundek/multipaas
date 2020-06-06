const { Service } = require('feathers-sequelize');

exports.Users = class Users extends Service {
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
        // Wait 30 seconds before initializing base data sets
        // This is necessary to give Feathers time to create 
        // all tables first if they dont already exist
        setTimeout(() => {
            (async() => {
                try{
                    // Make sure we have at least one sysadmin
                    let adms = await app.service('users').find({
                        query: {
                            email: process.env.API_SYSADMIN_USER
                        }
                    });
                    if(adms.total == 0){
                        if(!process.env.API_SYSADMIN_USER || !process.env.API_SYSADMIN_PASSWORD){
                            throw new Error("Missing sysadmin credentials in env variables");
                        }
                        await app.service('users').create({
                            email: process.env.API_SYSADMIN_USER,
                            password: process.env.API_SYSADMIN_PASSWORD
                        }, {
                            _internalRequest: true
                        });
                    }
        
                } catch(err){
                    console.log(err);
                    process.exit(1);
                }
            })();
        }, 30 * 1000);
    }
};
