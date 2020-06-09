const { Service } = require('feathers-sequelize');
const { Conflict } = require('@feathersjs/errors');
const OSController = require('../../controllers/os/index');
const crypto = require('crypto');
const fs = require('fs');
const algorithm = 'aes-256-cbc';

const node_ssh = require('node-ssh');

// Sleep promise for async
let _sleep = (duration) => {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, duration);
    });
}

exports.Organizations = class Organizations extends Service {
    constructor (options, app) {
        super(options, app)
        this.app = app;
    }

    /**
     * _hashPass
     * @param {*} password 
     */
    async _hashPass(password) {
        return new Promise((resolve, reject) => {
            const key = Buffer.from(process.env.CRYPTO_KEY, 'base64');
            const iv = crypto.randomBytes(16);

            let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), iv);
            let encrypted = cipher.update(password);
           
            resolve({
                password: Buffer.concat([encrypted, cipher.final()]).toString('hex'),
                salt: iv.toString('base64')
            });
        });
    }

    /**
     * _sshExec
     * @param {*} ip 
     * @param {*} command 
     */
    async _sshExec(ip, command) {
        return new Promise((resolve, reject) => {
            let ssh = new node_ssh();
        
            ssh.connect({
                host: ip,
                username: 'root',
                password: 'vagrant'
            }).then(function() {
                try {
                    ssh.execCommand(command, {}).then(function(result) {
                        ssh.dispose();
                        resolve(result);
                    })
                } catch (error) {
                    ssh.dispose();
                    reject(error);
                }
            }).catch((error) => {
                reject(error);
            });
        });
    }

    /**
     * create
     * @param {*} data 
     * @param {*} params 
     */
    async create (data, params) {
        const { name, registryUser, registryPass } = data;
        let transaction = null;
        try{
            console.log(1);
            // Check to see if org already exists
            if((await this.app.service('organizations').find({
                "query": {
                    "name": name,
                    "accountId":  data.accountId
                },
                "user": params.user,
                "authentication": params.authentication
            })).total != 0){
                return new Conflict(new Error('This organization name already exists'));
            } 
            else {
                console.log(2);
                // Gen registry user pass hash
                let cryptoData = await this._hashPass(registryPass);
            
                const sequelize = this.app.get('sequelizeClient');
                transaction = await sequelize.transaction();
                params.sequelize = { transaction };

                // Create org
                let newOrg = await super.create({
                    "name": name,
                    "registryUser": registryUser,
                    "registryPass": cryptoData.password,
                    "bcryptSalt": cryptoData.salt,
                    "accountId":  data.accountId
                }, params);
                console.log(3);
                // Create org admin user link
                let orgUser = await this.app.service('org-users').create({
                    "organizationId": newOrg.id,
                    "userId":  params.user.id,
                    "permissions": "ORG_ADMIN"
                }, params);

                try {
                    console.log(4);
                    // Create user/pass for NGinx & Registry
                    let REGISTYRY_PASSWD_PATH="/usr/src/app/auth-docker/htpasswd";
                    if (!fs.existsSync(REGISTYRY_PASSWD_PATH)) {
                        fs.writeFileSync(REGISTYRY_PASSWD_PATH, '');
                    }
                    await this._sshExec(process.env.REGISTRY_IP, `docker run --entrypoint htpasswd registry:2.7.1 -Bbn ${registryUser} ${registryPass} >> /opt/docker/containers/docker-registry/auth/htpasswd`);
                    console.log(5);
                    let NGINX_PASSWD_PATH="/usr/src/app/auth-nginx/htpasswd";
                    if (!fs.existsSync(NGINX_PASSWD_PATH)) {
                        fs.writeFileSync(NGINX_PASSWD_PATH, '');
                    }
                    await this._sshExec(process.env.REGISTRY_IP, `docker run --entrypoint htpasswd registry:2.7.1 -bn ${registryUser} ${registryPass} >> /opt/docker/containers/nginx-registry/auth/htpasswd`);
                    console.log(6);
                    await transaction.commit();
                } catch (_error) {
                    if (transaction) {
                        await transaction.rollback();
                    }
                    throw _error;
                }
                
                return {
                    code: 200,
                    data: {
                        "organization": newOrg,
                        "orgUser": orgUser
                    }
                };
            }
        } catch(err) {
            console.error(err);
            return {
                code: 500
            };
        }
    }  
};
