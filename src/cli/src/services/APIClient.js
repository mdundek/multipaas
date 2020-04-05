const feathers = require('@feathersjs/feathers');
const rest = require('@feathersjs/rest-client');
const axios = require('axios');
const fs = require("fs")
const mkdirp = require('mkdirp');
const os = require('os');
const path = require('path');
const OSController = require('../controllers/os/index');
const YAML = require('yaml');
const request = require('request');
const shortid = require('shortid');
shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$@');

class APIClient {

    /**
     * constructor
     * @param {*} baseUri 
     */
    constructor() {
        this.sessionJson = null;
        this.apiJson = null;
        this.cfgDir = path.join(require('os').homedir(), ".mycloud");

		if (fs.existsSync(this.cfgDir)) {
			if (fs.existsSync(path.join(this.cfgDir, "session.json"))) {
				this.sessionJson = JSON.parse(fs.readFileSync(path.join(this.cfgDir, "session.json")));
            }
            if (fs.existsSync(path.join(this.cfgDir, "api.json"))) {
				this.apiJson = JSON.parse(fs.readFileSync(path.join(this.cfgDir, "api.json")));
			}
		} else {
            (async() => {
                await mkdirp(this.cfgDir);
            })();
        }
        
        if(this.apiJson && this.apiJson.uri){
            this.initApiConnection(this.apiJson.uri);
        }
    }

    /**
     * _precheckFlight
     * @param {*} p 
     */
    _precheckFlight(p) {
        if(!this.apiJson) {
            return {
                "code": 417
            };
        }
        if(p.auth && !this.sessionJson){
            return {
                "code": 401
            };
        } 
        if (p.org && !this.sessionJson.organization){
            return {
                "code": 412
            };
        }
        if (p.ws && !this.sessionJson.workspace){
            return {
                "code": 412
            };
        }
    }

    /**
     * initApiConnection
     * @param {*} baseUri 
     */
    initApiConnection(baseUri) {
        this.app = feathers();
        this.restClient = rest(baseUri);
        this.app.configure(this.restClient.axios(axios));
    }

    /**
     * join
     * @param {*} host 
     */
    async join(host) {
        this.initApiConnection(host);
        try{
            await this.app.service("cli").find({});

            if(!this.apiJson){
                this.apiJson = {};
            }
            this.apiJson.uri = host;
            this._saveApi();

            return {
                "code": 200
            };         
        } catch(err) {
            return {
                "code": 404
            };
        }
    }

    /**
     * login
     * @param {*} username 
     * @param {*} password 
     */
    async login(email, password) {
        let error = this._precheckFlight({});
        if(error) {
            return error;
        }

        try{
            let data = await this.app.service('authentication').create({
                strategy: 'local',
                email: email,
                password: password
            });
            this.sessionJson = data;
            this._saveSession();
            return {
                "code": 200
            };
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * logout
     */
    async logout() {
        let error = this._precheckFlight({});
        if(error) {
            return error;
        }
        if (fs.existsSync(`${this.cfgDir}/session.json`)) {
            fs.unlinkSync(`${this.cfgDir}/session.json`);
        }
        this.sessionJson = null;
        return {
            "code": 200
        };
    }

    /**
     * register
     * @param {*} params 
     */
    async register(params) {
        let error = this._precheckFlight({});
        if(error) {
            return error;
        }

        try{
            return await this.app.service("cli").create({
                "action": "account",
                "params": params
            });     
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * getStatus
     */
    getStatus() {
        let error = this._precheckFlight({});
        if(error) {
            return error;
        }

        if(!this.sessionJson){
            return {
                "code": 200,
                "user": null
            };
        } else {
            return {
                "code": 200,
                "user": this.sessionJson.user,
                "organization": this.sessionJson.organization ? this.sessionJson.organization : null,
                "workspace": this.sessionJson.workspace ? this.sessionJson.workspace : null
            };
        }
    }

    /**
     * createOrganization
     * @param {*} data 
     */
    async createOrganization(data) {
        let error = this._precheckFlight({auth: true});
        if(error) {
            return error;
        }
        try{
            let result = await this.app.service("organizations").create(data, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            if(result.code == 200){
                for(let p in result.data){
                    this.sessionJson[p] = result.data[p];
                }
                this._saveSession();
            }
            return result;                
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * deleteOrganization
     * @param {*} data 
     */
    async deleteOrganization(data) {
        let error = this._precheckFlight({auth: true});
        if(error) {
            return error;
        }
        try{
            let result = await this.app.service("cli").update(0, {
                "action": "delete_organization",
                "params": {
                    "name": data.name,
                    "accountId": this.sessionJson.user.accountId
                }
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            if(this.sessionJson.organization && this.sessionJson.organization.id == result.id){
                delete this.sessionJson.organization;
                delete this.sessionJson.orgUser;
                this._saveSession();
            }
            return result;
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * useOrganization
     * @param {*} orgName 
     */
    async useOrganization(orgName) {
        let error = this._precheckFlight({auth: true});
        if(error) {
            return error;
        }
        try{
            let result = await this.app.service("organizations").find({
                query: {
                    "name": orgName,
                    "accountId": this.sessionJson.user.accountId
                },
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            if(result.data.length == 0){
                return {
                    "code": 404
                };
            } else {
                let authOrgUser = result.data[0].org_users.find(ou => ou.userId == this.sessionJson.user.id);
                if(authOrgUser){
                    delete result.data[0].org_users; // Not storing all org users here, no need for it
                    this.sessionJson.organization = result.data[0];
                    this.sessionJson.orgUser = authOrgUser;
                    this._saveSession();

                    return {
                        "code": 200
                    };
                } else {
                    return {
                        "code": 403
                    };
                }
            }
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * getOrganizations
     * @param {*} query 
     */
    async getOrganizations(query) {
        let error = this._precheckFlight({auth: true});
        if(error) {
            return error;
        }
        try{
            let result = await this.app.service("organizations").find({
                query: query ? query : {},
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            return {
                "code": 200,
                "data": result.data
            };
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * getAvailableServices
     */
    async getAvailableServices() {
        let error = this._precheckFlight({auth: true});
        if(error) {
            return error;
        }
        try{
            let result = await this.app.service("cli").update(0, {
                "action": "available_services",
                "params": {}
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });

            return result;
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * instantiateNewService
     * @param {*} data 
     */
    async instantiateNewService(params) {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            params.socketId = this.socketId;
            params.workspaceId = this.sessionJson.workspace.id;
            let targetTmpConfigFile = null;
            if(params.configFilePath) {
                let hash = null;
                while(hash == null){
                    hash = shortid.generate().toLowerCase();
                    if(hash.indexOf("$") != -1 || hash.indexOf("@") != -1){
                        hash = null;
                    }
                }
                targetTmpConfigFile = path.join(require('os').homedir(), `.mycloud/${hash}.yaml`);
                
                let fileContent = fs.readFileSync(params.configFilePath, "utf8");
                fs.writeFileSync(targetTmpConfigFile, fileContent);
                await this._upload(targetTmpConfigFile);
                fs.unlinkSync(targetTmpConfigFile);
                params.overwriteConfigFilePath = `${hash}.yaml`;
            }
            let result = await this.app.service("cli").update(0, {
                "action": "install_service",
                "params": params
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            return result;
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * createWorkspace
     * @param {*} data 
     */
    async createWorkspace(data) {
        let error = this._precheckFlight({auth: true, org: true});
        if(error) {
            return error;
        }
        try{
            data.organizationId = this.sessionJson.organization.id;
            data.socketId = this.socketId;
            let result = await this.app.service("workspaces").create(data, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
           
            if(result.code == 200){
                this.sessionJson.workspace = result.data;
                this._saveSession();
            }
            return result;          
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * useWorkspace
     * @param {*} wsName 
     */
    async useWorkspace(wsName) {
        let error = this._precheckFlight({auth: true, org: true});
        if(error) {
            return error;
        }
        try{
            let result = await this.app.service("workspaces").find({
                query: {
                    "name": wsName,
                    "organizationId": this.sessionJson.organization.id
                },
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            
            if(result.data.length == 0){
                return {
                    "code": 404
                };
            } else {
                this.sessionJson.workspace = result.data[0];
                this._saveSession();
                return {
                    "code": 200
                };
            }
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * deleteWorkspace
     * @param {*} data 
     */
    async deleteWorkspace(data) {
        let error = this._precheckFlight({auth: true, org: true});
        if(error) {
            return error;
        }
        try{
            let result = await this.app.service("cli").update(0, {
                "action": "delete_workspace",
                "params": {
                    "name": data.name,
                    "organizationId": this.sessionJson.organization.id
                }
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });

            if(this.sessionJson.workspace && this.sessionJson.workspace.id == result.id){
                delete this.sessionJson.workspace;
                this._saveSession();
            }

            return result;
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * getWorkspaces
     * @param {*} query 
     */
    async getWorkspaces(query) {
        let error = this._precheckFlight({auth: true, org: true});
        if(error) {
            return error;
        }
        try{
            let _q = query ? query : {};
            _q.organizationId = this.sessionJson.organization.id;
           
            let result = await this.app.service("workspaces").find({
                query: _q,
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
           
            return {
                "code": 200,
                "data": result.data
            };
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * getKubectlConfigFile
     */
    async getKubectlConfigFile() {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            if (!fs.existsSync(path.join(os.homedir(), ".kube"))) {
                return {
                    "code": 424
                };
            }
            let result = await this.app.service("cli").update(0, {
                "action": "get_kubectl_config",
                "params": {
                    "workspaceId": this.sessionJson.workspace.id
                }
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });

            if(result.code == 200 && !result.clusterStatus) {
                let targetName = `config-${this.sessionJson.organization.name}-${this.sessionJson.workspace.name}`;
                let targetPath = path.join(os.homedir(), ".kube", targetName);
                if (fs.existsSync(targetPath)) {
                    fs.unlinkSync(targetPath);
                }
                fs.writeFileSync(targetPath, result.data, {encoding: 'base64'});
                let cfgFile = YAML.parse(fs.readFileSync(targetPath, 'utf8'));
                
                cfgFile.clusters[0].name = `${this.sessionJson.organization.name}-${this.sessionJson.workspace.name}-cluster`;
                cfgFile.users[0].name = `${this.sessionJson.organization.name}-${this.sessionJson.workspace.name}-admin`;
                cfgFile.contexts[0].context.cluster = `${this.sessionJson.organization.name}-${this.sessionJson.workspace.name}-cluster`;
                cfgFile.contexts[0].context.user = `${this.sessionJson.organization.name}-${this.sessionJson.workspace.name}-admin`;
                cfgFile.contexts[0].name = `${this.sessionJson.organization.name}-${this.sessionJson.workspace.name}`;

                fs.writeFileSync(targetPath, YAML.stringify(cfgFile));

                let bash_profile_path = path.join(os.homedir(), ".bash_profile");
                if (fs.existsSync(bash_profile_path)) {
                    let bashProfileArray = OSController.readFileToArray(bash_profile_path);

                    let foundKubeCfg = false;
                    bashProfileArray = bashProfileArray.map(l => {
                        if(l.trim().startsWith("export KUBECONFIG=")){
                            foundKubeCfg = true;
                            if(l.indexOf(`$HOME/.kube/${targetName}`) == -1){
                                l += `:$HOME/.kube/${targetName}`;
                            }
                            return l;
                        } else {
                            return l;
                        }
                    });
                    
                    if(!foundKubeCfg){
                        bashProfileArray.push(`export KUBECONFIG=$HOME/.kube/${targetName}`);
                    }
                    OSController.writeArrayToFile(bash_profile_path, bashProfileArray);
                    return {
                        "code": 200,
                        "path": targetPath,
                        "sourcePath": bash_profile_path,
                        "config": `${this.sessionJson.organization.name}-${this.sessionJson.workspace.name}`,
                        "bash_profile_updated": true
                    };
                } else {
                    return {
                        "code": 200,
                        "path": targetPath,
                        "config": `${this.sessionJson.organization.name}-${this.sessionJson.workspace.name}`,
                        "bash_profile_updated": false
                    };
                }          
            } else {
                return result;
            }          
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * configureCluster
     * @param {*} flags 
     */
    async configureCluster(flags) {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            let result = await this.app.service("cli").update(0, {
                "action": "config_k8s",
                "params": {
                    "flags": flags,
                    "socketId": this.socketId,
                    "workspaceId": this.sessionJson.workspace.id
                }
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            
            return result;
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * configureCluster
     */
    async getK8SState() {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            let result = await this.app.service("cli").update(0, {
                "action": "get_k8s_state",
                "params": {
                    "workspaceId": this.sessionJson.workspace.id
                }
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            
            return result;
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * createVolume
     * @param {*} flags 
     */
    async createVolume(params) {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            params.socketId = this.socketId;
            params.workspaceId = this.sessionJson.workspace.id;
            let result = await this.app.service("cli").update(0, {
                "action": "create_volume",
                "params": params
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            
            return result;
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * listVolumes
     */
    async listVolumes() {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            let result = await this.app.service("cli").update(0, {
                "action": "get_volume_details",
                "params": {
                    "workspaceId": this.sessionJson.workspace.id
                }
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            
            return result;
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * listServices
     */
    async listServices(params) {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            params.workspaceId = this.sessionJson.workspace.id;
            let result = await this.app.service("cli").update(0, {
                "action": "get_services_details",
                "params": params
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            
            return result;
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * getTaskList
     * @param {*} flags 
     */
    async getTaskList(params) {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            params.workspaceId = this.sessionJson.workspace.id;
            let result = await this.app.service("cli").update(0, {
                "action": "get_task_list",
                "params": params
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            
            return result;
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * deleteVolume
     * @param {*} params 
     */
    async deleteVolume(params) {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            params.socketId = this.socketId;
            params.workspaceId = this.sessionJson.workspace.id;
            let result = await this.app.service("cli").update(0, {
                "action": "delete_volume",
                "params": params
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            
            return result;
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * deleteService
     * @param {*} params 
     */
    async deleteService(params) {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            params.socketId = this.socketId;
            params.workspaceId = this.sessionJson.workspace.id;
            let result = await this.app.service("cli").update(0, {
                "action": "delete_service",
                "params": params
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            
            return result;
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }


    /**
     * fetchServiceConfig
     * @param {*} params 
     */
    async fetchServiceConfig(params) {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            params.workspaceId = this.sessionJson.workspace.id;
            let result = await this.app.service("cli").update(0, {
                "action": "get_service_config",
                "params": params
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            
            return result;
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }
    
    /**
     * createVolume
     * @param {*} flags 
     */
    async bindVolume(params) {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            params.socketId = this.socketId;
            params.workspaceId = this.sessionJson.workspace.id;
            let result = await this.app.service("cli").update(0, {
                "action": "bind_volume",
                "params": params
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            
            return result;
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * unbindVolume
     * @param {*} flags 
     */
    async unbindVolume(params) {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            params.socketId = this.socketId;
            params.workspaceId = this.sessionJson.workspace.id;
            let result = await this.app.service("cli").update(0, {
                "action": "unbind_volume",
                "params": params
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            
            return result;
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * getPersistedVolumes
     */
    async getPersistedVolumes(params) {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            params.workspaceId = this.sessionJson.workspace.id;
            let result = await this.app.service("cli").update(0, {
                "action": "get_k8s_persisted_volumes",
                "params": params
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            
            return result;
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * pushApp
     * @param {*} params 
     */
    async pushApp(params) {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            await this._upload(params.targetZip);
            
            let result = await this.app.service("cli").update(0, {
                "action": "push_k8s_app",
                "params": {
                    socketId: this.socketId,
                    workspaceId: this.sessionJson.workspace.id,
                    appFileName: path.basename(params.targetZip),
                    image: params.image,
                    version: params.version
                }
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            
            return result;
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * listRegistryImages
     */
    async listRegistryImages() {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            let result = await this.app.service("cli").update(0, {
                "action": "list_registry_images",
                "params": {
                    workspaceId: this.sessionJson.workspace.id
                }
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            
            return result;
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * deleteRegistryImage
     */
    async deleteRegistryImage(params) {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            params.workspaceId = this.sessionJson.workspace.id;
            let result = await this.app.service("cli").update(0, {
                "action": "delete_registry_images",
                "params": params
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            
            return result;
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * getDomains
     */
    async getDomains() {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            let result = await this.app.service("cli").update(0, {
                "action": "list_domains",
                "params": {
                    workspaceId: this.sessionJson.workspace.id,
                    organizationId: this.sessionJson.organization.id
                }
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            return result;
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * createDomain
     * @param {*} params 
     */
    async createDomain(params) {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            params.workspaceId = this.sessionJson.workspace.id;
            params.organizationId = this.sessionJson.organization.id;
            let result = await this.app.service("cli").update(0, {
                "action": "create_domain",
                "params": params
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            
            return result;
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * deleteDomain
     * @param {*} params 
     */
    async deleteDomain(params) {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            params.workspaceId = this.sessionJson.workspace.id;
            params.organizationId = this.sessionJson.organization.id;
            let result = await this.app.service("cli").update(0, {
                "action": "delete_domain",
                "params": params
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            
            return result;
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * getCertificates
     */
    async getCertificates() {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            let result = await this.app.service("cli").update(0, {
                "action": "list_certificates",
                "params": {
                    workspaceId: this.sessionJson.workspace.id,
                    organizationId: this.sessionJson.organization.id
                }
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            return result;
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * createCertificate
     * @param {*} params 
     */
    async createCertificate(params) {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            params.workspaceId = this.sessionJson.workspace.id;
            params.organizationId = this.sessionJson.organization.id;
            let result = await this.app.service("cli").update(0, {
                "action": "create_certificate",
                "params": params
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            
            return result;
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * deleteCertificate
     * @param {*} params 
     */
    async deleteCertificate(params) {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            params.workspaceId = this.sessionJson.workspace.id;
            params.organizationId = this.sessionJson.organization.id;
            let result = await this.app.service("cli").update(0, {
                "action": "delete_certificate",
                "params": params
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            
            return result;
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * getRoutes
     */
    async getRoutes() {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            let result = await this.app.service("cli").update(0, {
                "action": "list_routes",
                "params": {
                    workspaceId: this.sessionJson.workspace.id,
                    organizationId: this.sessionJson.organization.id
                }
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            return result;
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * createRoute
     * @param {*} params 
     */
    async createRoute(params) {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            params.workspaceId = this.sessionJson.workspace.id;
            params.organizationId = this.sessionJson.organization.id;
            let result = await this.app.service("cli").update(0, {
                "action": "create_route",
                "params": params
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            
            return result;
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * 
     * @param {deleteRoute} params 
     */
    async deleteRoute(params) {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            params.workspaceId = this.sessionJson.workspace.id;
            params.organizationId = this.sessionJson.organization.id;
            let result = await this.app.service("cli").update(0, {
                "action": "delete_route",
                "params": params
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            
            return result;
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * getApplications
     */
    async getApplications() {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            let result = await this.app.service("cli").update(0, {
                "action": "list_applications",
                "params": {
                    workspaceId: this.sessionJson.workspace.id,
                    organizationId: this.sessionJson.organization.id
                }
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            return result;
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * createApplication
     * @param {*} params 
     */
    async createApplication(params) {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            params.workspaceId = this.sessionJson.workspace.id;
            params.organizationId = this.sessionJson.organization.id;
            let result = await this.app.service("cli").update(0, {
                "action": "create_application",
                "params": params
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            
            return result;
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * deleteApplication
     * @param {*} params 
     */
    async deleteApplication(params) {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            params.workspaceId = this.sessionJson.workspace.id;
            params.organizationId = this.sessionJson.organization.id;
            let result = await this.app.service("cli").update(0, {
                "action": "delete_application",
                "params": params
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            
            return result;
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * createNamespace
     * @param {*} params 
     */
    async createNamespace(params) {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            params.workspaceId = this.sessionJson.workspace.id;
            params.organizationId = this.sessionJson.organization.id;
            let result = await this.app.service("cli").update(0, {
                "action": "create_namespace",
                "params": params
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            
            return result;
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * getNamespaces
     */
    async getNamespaces() {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            let result = await this.app.service("cli").update(0, {
                "action": "list_namespaces",
                "params": {
                    workspaceId: this.sessionJson.workspace.id
                }
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            
            return result;
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * createPvc
     */
    async createPvc(params) {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            params.workspaceId = this.sessionJson.workspace.id;
            params.organizationId = this.sessionJson.organization.id;
            let result = await this.app.service("cli").update(0, {
                "action": "create_pvc",
                "params": params
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            
            return result;
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * getPVCs
     */
    async getPVCs(params) {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            params.workspaceId = this.sessionJson.workspace.id;
            params.organizationId = this.sessionJson.organization.id;
            let result = await this.app.service("cli").update(0, {
                "action": "list_pvc",
                "params": params
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            
            return result;
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * deletePvc
     * @param {*} params 
     */
    async deletePvc(params) {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            params.workspaceId = this.sessionJson.workspace.id;
            params.organizationId = this.sessionJson.organization.id;
            let result = await this.app.service("cli").update(0, {
                "action": "delete_pvc",
                "params": params
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            
            return result;
        } catch(err) {
            return {
                "code": err.code
            };
        }
    }

    /**
     * _upload
     * @param {*} filePath 
     */
    _upload(filePath) {
        return new Promise((resolve, reject) => {
            request({
                method: "POST",
                // url: "http://localhost:3030/app-upload",
                url: `${this.apiJson.uri}/app-upload`,
                headers: {
                    "Content-Type": "multipart/form-data"
                },
                formData : {
                    "app" : fs.createReadStream(filePath)
                }
            }, (err, response) => {
                if(err) {
                    return reject(err);
                } else if(response.statusCode != 200){
                    let _err = new Error("Could not upload file");
                    _err.code = response.statusCode;
                    return reject(_err);
                }
                resolve();
            });
        });
    }
    
    /**
     * _saveSession
     */
    async _saveSession() {
        if (fs.existsSync(`${this.cfgDir}/session.json`)) {
            fs.unlinkSync(`${this.cfgDir}/session.json`);
        }
        fs.writeFileSync(`${this.cfgDir}/session.json`, JSON.stringify(this.sessionJson));
    }

    /**
     * _saveApi
     */
    async _saveApi() {
        if (fs.existsSync(`${this.cfgDir}/api.json`)) {
            fs.unlinkSync(`${this.cfgDir}/api.json`);
        }
        fs.writeFileSync(`${this.cfgDir}/api.json`, JSON.stringify(this.apiJson));
    }
}

module.exports = APIClient;