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
        this.cfgDir = path.join(require('os').homedir(), ".multipaas");

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
        if (p.acc && !this.sessionJson.account){
            return {
                "code": 413
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
            let result = await this.app.service("cli").find({});
            console.log(result);
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
                strategy: 'keycloak',
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
                "account": this.sessionJson.account ? this.sessionJson.account : null,
                "organization": this.sessionJson.organization ? this.sessionJson.organization : null,
                "workspace": this.sessionJson.workspace ? this.sessionJson.workspace : null,
                "namespace": this.sessionJson.namespace ? this.sessionJson.namespace : null
            };
        }
    }

    /**
     * createOrganization
     * @param {*} data 
     */
    async createOrganization(data) {
        let error = this._precheckFlight({auth: true, acc: true});
        if(error) {
            return error;
        }
        try{
            data.accountId = this.sessionJson.account.id;
            let result = await this.app.service("organizations").create(data, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            if(result.code == 200){
                for(let p in result.data){
                    this.sessionJson[p] = result.data[p];
                }
                delete this.sessionJson.workspace;
                delete this.sessionJson.namespace;
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
        let error = this._precheckFlight({auth: true, acc: true});
        if(error) {
            return error;
        }
        try{
            let result = await this.app.service("cli").update(0, {
                "action": "delete_organization",
                "params": {
                    "name": data.name,
                    "accountId": this.sessionJson.account.id
                }
            }, {
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            if(this.sessionJson.organization && this.sessionJson.organization.id == result.id){
                delete this.sessionJson.workspace;
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
        let error = this._precheckFlight({auth: true, acc: true});
        if(error) {
            return error;
        }
        try{
            let result = await this.app.service("organizations").find({
                query: {
                    "name": orgName,
                    "accountId": this.sessionJson.account.id
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
     * useAccount
     * @param {*} accName 
     */
    async useAccount(accName) {
        let error = this._precheckFlight({auth: true});
        if(error) {
            return error;
        }
        try{
            let result = await this.app.service("accounts").find({
                query: {
                    "name": accName
                },
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
            if(result.data.length == 0){
                return {
                    "code": 404
                };
            } else {
                this.sessionJson.account = result.data[0];
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
     * useNamespace
     * @param {*} nsName 
     */
    async useNamespace(nsName) {
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
            if(!result.data.find(o => o.NAME.toLowerCase() == nsName.toLowerCase())){
                return {
                    "code": 404
                };
            } else {
                this.sessionJson.namespace = result.data.find(o => o.NAME.toLowerCase() == nsName.toLowerCase()).NAME;
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
     * getOrganizations
     * @param {*} query 
     */
    async getOrganizations(query) {
        let error = this._precheckFlight({auth: true, acc: true});
        
        if(error) {
            return error;
        }
        try{
            query = query ? query : {};

            query.accountId = this.sessionJson.account.id;

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
     * getAccounts
     * @param {*} query 
     */
    async getAccounts(query) {
        let error = this._precheckFlight({auth: true});
        if(error) {
            return error;
        }
        try{
            let result = await this.app.service("accounts").find({
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
                targetTmpConfigFile = path.join(require('os').homedir(), `.multipaas/${hash}.yaml`);
                
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
     * addRunner
     * @param {*} params 
     */
    async addRunner(params) {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            params.workspaceId = this.sessionJson.workspace.id;
            let result = await this.app.service("cli").update(0, {
                "action": "add_gitlab_runner",
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
     * getOrgUsers
     * @param {*} query 
     */
    async getOrgUsers(query) {
        let error = this._precheckFlight({auth: true, org: true});
        if(error) {
            return error;
        }
        try{
            let _q = query ? query : {};
            _q.organizationId = this.sessionJson.organization.id;
            let result = await this.app.service("org-users").find({
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
     * getGroupsOfUsers
     * @param {*} query 
     */
    async getGroupsOfUsers(query) {
        let error = this._precheckFlight({auth: true, org: true});
        if(error) {
            return error;
        }
        try{
            query.organizationId = this.sessionJson.organization.id;
            let result = await this.app.service("cli").update(0, {
                "action": "get_groups_for_users",
                "params": query
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
     * addOrgUsers
     * @param {*} query 
     */
    async addOrgUsers(query) {
        let error = this._precheckFlight({auth: true, acc: true});
        if(error) {
            return error;
        }
        try{
            let _q = query ? query : {};
            _q.accountId = this.sessionJson.account.id;
           
            let result = await this.app.service("cli").update(0, {
                "action": "add_org_users",
                "params": _q
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
     * getClusterRbacGroups
     * @param {*} query 
     */
    async getClusterRbacGroups(query) {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            let _q = query ? query : {};
            _q.accName = this.sessionJson.account.name;
            _q.orgName = this.sessionJson.organization.name;
            _q.wsName = this.sessionJson.workspace.name;
           
            let result = await this.app.service("cli").update(0, {
                "action": "get_available_cluster_groups",
                "params": _q
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
                let clusterName = `${this.sessionJson.account.name}-${this.sessionJson.organization.name}-${this.sessionJson.workspace.name}`;
                let targetPath = path.join(os.homedir(), ".kube", `config-${clusterName}`);
                if (fs.existsSync(targetPath)) {
                    fs.unlinkSync(targetPath);
                }
                fs.writeFileSync(targetPath, result.data, {encoding: 'base64'});
                let cfgFile = YAML.parse(fs.readFileSync(targetPath, 'utf8'));
                
                cfgFile['current-context'] = this.sessionJson.user.email;
                cfgFile.clusters[0].name = `${clusterName}-cluster`;
                cfgFile.contexts[0].context.cluster = `${clusterName}-cluster`;
                cfgFile.contexts[0].context.user = this.sessionJson.user.email;
                cfgFile.contexts[0].name = clusterName;

                cfgFile.users[0].name = this.sessionJson.user.email;
                cfgFile.users[0].user = {
                    exec: {
                        apiVersion: "client.authentication.k8s.io/v1beta1",
                        command: "kubectl",
                        args: [
                            "oidc-login",
                            "get-token",
                            "--oidc-issuer-url=https://multipaas.keycloak.com/auth/realms/master",
                            "--oidc-client-id=kubernetes-cluster",
                            "--insecure-skip-tls-verify=true",
                            "--oidc-redirect-url-hostname=127.0.0.1",
                            "--listen-address=127.0.0.1:12345",
                            "--oidc-extra-scope=email",
                            "--oidc-extra-scope=profile",
                            "--username=" + this.sessionJson.user.email
                        ]
                    }
                };

                fs.writeFileSync(targetPath, YAML.stringify(cfgFile));

                let bash_profile_path = path.join(os.homedir(), ".bash_profile");
                if (fs.existsSync(bash_profile_path)) {
                    let bashProfileArray = OSController.readFileToArray(bash_profile_path);

                    let foundKubeCfg = false;
                    bashProfileArray = bashProfileArray.map(l => {
                        if(l.trim().startsWith("export KUBECONFIG=")){
                            foundKubeCfg = true;
                            if(l.indexOf(`$HOME/.kube/config-${clusterName}`) == -1){
                                l += `:$HOME/.kube/config-${clusterName}`;
                            }
                            return l;
                        } else {
                            return l;
                        }
                    });
                    
                    if(!foundKubeCfg){
                        bashProfileArray.push(`export KUBECONFIG=$HOME/.kube/config-${clusterName}`);
                    }
                    OSController.writeArrayToFile(bash_profile_path, bashProfileArray);
                    return {
                        "code": 200,
                        "path": targetPath,
                        "sourcePath": bash_profile_path,
                        "config": clusterName,
                        "bash_profile_updated": true
                    };
                } else {
                    return {
                        "code": 200,
                        "path": targetPath,
                        "config": clusterName,
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
     * applyRbacBindings
     * @param {*} params 
     */
    async applyRbacBindings(params) {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            params.workspaceId = this.sessionJson.workspace.id;
            let result = await this.app.service("cli").update(0, {
                "action": "apply_rbac_bindings",
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
     * getRoutesForDomain
     * @param {*} params 
     */
    async getRoutesForDomain(params) {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            let result = await this.app.service("routes").find({
                "query": {
                    "domainId": params.domainId
                },
                headers: { 'Authorization': `Bearer ${this.sessionJson.accessToken}` }
            });
           
            let filteredData = result.data.filter(o => {
                if(o.applicationId != null) {
                    return o.application.namespace == params.ns;
                } else {
                    return o.service.namespace == params.ns;
                }
            });
            return {
                "code": 200,
                "data": filteredData
            };
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
     * bindDomain
     * @param {*} params 
     */
    async bindDomain(params) {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            params.socketId = this.socketId;
            params.workspaceId = this.sessionJson.workspace.id;
            params.organizationId = this.sessionJson.organization.id;
            let result = await this.app.service("cli").update(0, {
                "action": "bind_domain",
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
     * unbindDomain
     * @param {*} params 
     */
    async unbindDomain(params) {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            params.socketId = this.socketId;
            params.workspaceId = this.sessionJson.workspace.id;
            params.organizationId = this.sessionJson.organization.id;
            let result = await this.app.service("cli").update(0, {
                "action": "unbind_domain",
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
            params.socketId = this.socketId;
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
     * scaleApplication
     * @param {*} params 
     */
    async scaleApplication(params) {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            params.socketId = this.socketId;
            params.workspaceId = this.sessionJson.workspace.id;
            params.organizationId = this.sessionJson.organization.id;
            let result = await this.app.service("cli").update(0, {
                "action": "scale_application",
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
     * createApplication
     * @param {*} params 
     */
    async addApplicationVersion(params) {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            params.socketId = this.socketId;
            params.workspaceId = this.sessionJson.workspace.id;
            params.organizationId = this.sessionJson.organization.id;
            let result = await this.app.service("cli").update(0, {
                "action": "add_application_version",
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
     * createApplication
     * @param {*} params 
     */
    async canarySplit(params) {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            params.socketId = this.socketId;
            params.workspaceId = this.sessionJson.workspace.id;
            params.organizationId = this.sessionJson.organization.id;
            let result = await this.app.service("cli").update(0, {
                "action": "application_canary_split",
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
     * createApplication
     * @param {*} params 
     */
    async replaceApplicationVersion(params) {
        let error = this._precheckFlight({auth: true, ws: true});
        if(error) {
            return error;
        }
        try{
            params.socketId = this.socketId;
            params.workspaceId = this.sessionJson.workspace.id;
            params.organizationId = this.sessionJson.organization.id;
            let result = await this.app.service("cli").update(0, {
                "action": "replace_application_version",
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
            params.socketId = this.socketId;
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