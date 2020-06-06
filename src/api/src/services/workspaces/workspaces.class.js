const { Service } = require('feathers-sequelize');
const { Conflict } = require('@feathersjs/errors');
const TaskController = require("../../controllers/tasks/index");

exports.Workspaces = class Workspaces extends Service {
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
        try{
            let socketId = data.socketId;
            delete data.socketId;
            
            // Check to see if user already exists
            if((await this.app.service('workspaces').find({
                "query": {
                    "name": data.name,
                    "organizationId":  data.organizationId
                },
                "user": params.user,
                "authentication": params.authentication
            })).total != 0){
                return new Conflict(new Error('This workspace name already exists'));
            } 
            else {
                let newWs = await super.create(data, params);

                await TaskController.schedule(
                    "CREATE-K8S-CLUSTER",
                    "workspace",
                    newWs.id,
                    [{
                        "type":"INFO",
                        "step":"PROVISION",
                        "socketId": socketId,
                        "clusterAdminUserEmail": params.user.email, 
                        "ts":new Date().toISOString()
                    }],
                    params
                );

                return {
                    code: 200,
                    data: newWs
                };
            }
        } catch(err) {
            console.log(err);
            return {
                code: 500
            };
        }
    }
};
