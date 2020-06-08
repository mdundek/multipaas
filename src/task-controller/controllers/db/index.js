const { Pool } = require('pg');

class DBController {

    /**
     * init
     */
    static init() {
        this.pool = new Pool({
            user: process.env.DB_USER,
            host: process.env.DB_HOST,
            database: 'postgres',
            password: process.env.DB_PASS,
            port: process.env.DB_PORT,
        });
        this.pool.on('error', (err, client) => {
            console.error('Unexpected error on idle client', err);
        });
        
    }

    /**
     * startTransaction
     */
    static async startTransaction() {
        let _client = await this.pool.connect();
        await _client.query('BEGIN');
        return _client;
    }

    /**
     * commitTransaction
     * @param {*} _client 
     */
    static async commitTransaction(_client) {
        try {
            await _client.query('COMMIT');
        } finally {
            _client.release();
        }
    }

    /**
     * rollbackTransaction
     * @param {*} _client 
     */
    static async rollbackTransaction(_client) {
        try {
            await _client.query('ROLLBACK');
        } finally {
            _client.release();
        }
    }

    /**
     * getIpsInUse
     */
    static async getIpsInUse() {
        let _client = await this.pool.connect();
        try {
            const res = await _client.query('SELECT "ip" FROM k8s_nodes');
            return res.rows.map(o => o.ip)
        } finally {
            _client.release();
        }
    }

    /**
     * getTask
     * @param {*} taskId 
     */
    static async getTask(taskId) {
        let _client = await this.pool.connect();
        try {
            const res = await _client.query('SELECT * FROM tasks WHERE "id" = $1', [taskId]);
            return res.rows.length == 1 ? res.rows[0] : null;
        } finally {
            _client.release();
        }
    }

    /**
     * getPendingTasks
     */
    static async getPendingTasks() {
        let _client = await this.pool.connect();
        try {
            const res = await _client.query('SELECT * FROM tasks WHERE "status" = $1 ORDER BY "createdAt"', ["PENDING"]);
            return res.rows;
        } finally {
            _client.release();
        }
    }

    /**
     * getK8sNode
     * @param {*} id 
     */
    static async getK8sNode(id) {
        let _client = await this.pool.connect();
        try {
            const res = await _client.query('SELECT * FROM k8s_nodes WHERE "id" = $1', [id]);
            return res.rows.length == 1 ? res.rows[0] : null;
        } finally {
            _client.release();
        }
    }

    /**
     * getKeycloakAdminClientSecret
     */
    static async getKeycloakAdminClientSecret() {
        let _client = await this.pool.connect();
        try {
            const res = await _client.query('SELECT * FROM settings WHERE "key" = $1', ["KEYCLOAK_SECRET"]);
            return res.rows.length == 1 ? res.rows[0] : null;
        } finally {
            _client.release();
        }
    }

    /**
     * getWorkspace
     * @param {*} id 
     */
    static async getWorkspace(id) {
        let _client = await this.pool.connect();
        try {
            const res = await _client.query('SELECT * FROM workspaces WHERE "id" = $1', [id]);
            return res.rows.length == 1 ? res.rows[0] : null;
        } finally {
            _client.release();
        }
    }

    /**
     * getWorkspacesForOrg
     * @param {*} id 
     */
    static async getWorkspacesForOrg(id) {
        let _client = await this.pool.connect();
        try {
            const res = await _client.query('SELECT * FROM workspaces WHERE "organizationId" = $1', [id]);
            return res.rows;
        } finally {
            _client.release();
        }
    }

    /**
     * deleteWorkspace
     * @param {*} id 
     */
    static async deleteWorkspace(id) {
        let _client = await this.pool.connect();
        try {
            await _client.query('DELETE FROM workspaces WHERE "id" = $1', [id]);
        } finally {
            _client.release();
        }
    }

    /**
     * deleteOrganization
     * @param {*} id 
     */
    static async deleteOrganization(id) {
        let _client = await this.pool.connect();
        try {
            await _client.query('DELETE FROM organizations WHERE "id" = $1', [id]);
        } finally {
            _client.release();
        }
    }

    /**
     * getK8sWorkspaceNodes
     * @param {*} wsId 
     */
    static async getK8sWorkspaceNodes(wsId) {
        let _client = await this.pool.connect();
        try {
            const res = await _client.query('SELECT * FROM k8s_nodes WHERE "workspaceId" = $1', [wsId]);
            return res.rows;
        } finally {
            _client.release();
        }
    }

    /**
     * addVolumeBinding
     * @param {*} ip 
     * @param {*} hostname 
     * @param {*} status 
     */
    static async addVolumeBinding(target, targetId, volumeId) {
        let _client = await this.pool.connect();
        try {
            let query = `INSERT INTO volume_bindings ("target", "targetId", "volumeId", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5)`;
            let values = [target, targetId, volumeId, new Date().toISOString(), new Date().toISOString()];
            return await _client.query(query, values);
        } finally {
            _client.release()
        }
    }

    /**
     * removeVolumeBinding
     * @param {*} target 
     * @param {*} targetId 
     * @param {*} volumeId 
     */
    static async removeVolumeBinding(target, targetId, volumeId) {
        let _client = await this.pool.connect();
        try {
            let query = `DELETE FROM volume_bindings WHERE "target" = $1 AND "targetId" = $2 AND "volumeId" = $3`;
            let values = [target, targetId, volumeId];
            return await _client.query(query, values);
        } finally {
            _client.release()
        }
    }

    /**
     * removeVolume
     * @param {*} volumeId 
     */
    static async removeVolume(volumeId) {
        let _client = await this.pool.connect();
        try {
            let query = `DELETE FROM volumes WHERE "id" = $1`;
            let values = [volumeId];
            return await _client.query(query, values);
        } finally {
            _client.release()
        }
    }

    /**
     * removeService
     * @param {*} serviceId 
     */
    static async removeService(serviceId) {
        let _client = await this.pool.connect();
        try {
            let query = `DELETE FROM services WHERE "id" = $1`;
            let values = [serviceId];
            return await _client.query(query, values);
        } finally {
            _client.release()
        }
    }

    /**
     * removeApp
     * @param {*} appId 
     * @param {*} client 
     */
    static async removeApp(appId, client) {
        let query = `DELETE FROM applications WHERE "id" = $1`;
        let values = [appId];
        if(client){
            await client.query(query, values);
        } else {
            let _client = await this.pool.connect();
            try {
                await _client.query(query, values);
            } finally {
                _client.release()
            }
        }
    }

    /**
     * removeAppVersion
     * @param {*} appVersionId 
     */
    static async removeAppVersion(appVersionId, client) {
        let query = `DELETE FROM application_version WHERE "id" = $1`;
        let values = [appVersionId];
        if(client){
            await client.query(query, values);
        } else {
            let _client = await this.pool.connect();
            try {
                await _client.query(query, values);
            } finally {
                _client.release()
            }
        }
    }

    /**
     * removeWorkspace
     * @param {*} serviceId 
     */
    static async removeWorkspace(wsId) {
        let _client = await this.pool.connect();
        try {
            let query = `DELETE FROM workspaces WHERE "id" = $1`;
            let values = [wsId];
            return await _client.query(query, values);
        } finally {
            _client.release()
        }
    }

    /**
     * removeRoute
     * @param {*} routeId 
     */
    static async removeRoute(routeId) {
        let _client = await this.pool.connect();
        try {
            let query = `DELETE FROM routes WHERE "id" = $1`;
            let values = [routeId];
            return await _client.query(query, values);
        } finally {
            _client.release()
        }
    }

     /**
     * getOrgForWorkspace
     * @param {*} workspaceId 
     */
    static async getOrgForWorkspace(workspaceId, client) {
        let _client = client ? client : await this.pool.connect();
        try {
            const res = await _client.query(`SELECT organizations.* FROM 
                                                organizations, 
                                                workspaces 
                                            WHERE 
                                                organizations."id" = workspaces."organizationId" AND 
                                                workspaces."id" = $1`, [workspaceId]);
            return res.rows.length == 1 ? res.rows[0] : null;
        } finally {
            if(!client)
                _client.release();
        }
    }

    /**
     * getAccountForOrg
     * @param {*} orgId 
     */
    static async getAccountForOrg(orgId, client) {
        let _client = client ? client : await this.pool.connect();
        try {
            const res = await _client.query(`SELECT accounts.* FROM 
                                                organizations, 
                                                accounts 
                                            WHERE 
                                                organizations."accountId" = accounts."id" AND 
                                                organizations."id" = $1`, [orgId]);
            return res.rows.length == 1 ? res.rows[0] : null;
        } finally {
            if(!client)
                _client.release();
        }
    }

    /**
     * getCertificates
     * @param {*} domainIds 
     */
    static async getCertificates(domainIds) {
        let _client = await this.pool.connect();
        try {
            const res = await _client.query(`SELECT * FROM certificates WHERE certificates."domainId" IN (${domainIds.join(',')})`);
            return res.rows;
        } finally {
            _client.release();
        }
    }

    /**
     * getServicesForWsRoutes
     * @param {*} wsId 
     * @param {*} ns 
     */
    static async getServicesForWsRoutes(wsId, ns) {
        let _client = await this.pool.connect();
        try {
            let query = `SELECT 
                services."instanceName" as "name",
                services."externalServiceName",
                services."serviceName",
                services."serviceVersion",
                services."namespace",
                services."dedicatedPv" as "dedicatedPv",
                services."dedicatedPvc" as "dedicatedPvc",
                domains."name" as "domainName",
                domains."id" as "domainId",
                routes."virtualPort" as "virtualPort",
                routes."port" as "port",
                routes."serviceType" as "serviceType",
                routes."tcpStream" as "tcpStream",
                routes."subdomain" as "subdomain"
            FROM routes
            LEFT JOIN services
                ON routes."serviceId"=services."id"
            LEFT JOIN domains
                ON routes."domainId"=domains."id"
            WHERE services."workspaceId" = $1`;
            if(ns) {
                query += ' AND services."namespace" = $2';
            }

            const res = await _client.query(query, ns ? [wsId, ns] : [wsId]);
            return res.rows;
        } finally {
            _client.release();
        }
    }

    /**
     * getCertificatesForDomains
     * @param {*} domainIds 
     */
    static async getCertificatesForDomains(domainIds) {
        let _client = await this.pool.connect();
        try {
            let query = `SELECT 
                certificates."name" as "certName",
                domains."name" as "domainName",
                certificates."key" as "key",
                certificates."crt" as "crt",
            FROM certificates, domains
            WHERE certificates."domainId" = domains."id" AND domains."id" IN (${domainIds.join(',')})`;
            const res = await _client.query(query);
            return res.rows;
        } finally {
            _client.release();
        }
    }

    /**
     * getApplicationsForWsRoutes
     * @param {*} wsId 
     * @param {*} ns 
     */
    static async getApplicationsForWsRoutes(wsId, ns) {
        let _client = await this.pool.connect();
        try {
            let query = `SELECT
                    applications."name",
                    applications."config",
                    applications."namespace",
                    domains."name" as "domainName",
                    domains."id" as "domainId",
                    routes."virtualPort" as "virtualPort",
                    routes."port" as "port",
                    routes."tcpStream" as "tcpStream",
                    routes."serviceType" as "serviceType",
                    routes."subdomain" as "subdomain"
                FROM routes
                LEFT JOIN applications
                    ON routes."applicationId"=applications."id"
                LEFT JOIN domains
                    ON routes."domainId"=domains."id"
                WHERE applications."workspaceId" = $1`;
            
            if(ns) {
                query += ` AND applications."namespace" = $2`;
            }
            const res = await _client.query(query, ns ? [wsId, ns] : [wsId]);

            return res.rows;
        } finally {
            _client.release();
        }
    }

    /**
     * setVolumePortIndex
     * @param {*} id 
     * @param {*} portIndex 
     */
    static async setVolumePortIndex(id, portIndex) {
        let _client = await this.pool.connect();
        try {
            let query = `UPDATE volumes SET "portIndex" = $1 WHERE "id" = $2`;
            let res = await _client.query(query, [portIndex, id]);
            return res.rows.length == 1 ? res.rows[0] : null;
        } finally {
            _client.release()
        }
    }

    /**
     * updateTaskStatus
     * @param {*} task 
     * @param {*} status 
     * @param {*} log 
     */
    static async updateTaskStatus(task, status, log) {
        task.payload.push(log);
        await this.updateTask(task.id, {
            status: status,
            payload: JSON.stringify(task.payload)
        });
    }

    /**
     * updateTask
     * @param {*} taskId 
     * @param {*} data 
     * @param {*} client 
     */
    static async updateTask(taskId, data, client) {
        let index = 1;
        let updArray = Object.keys(data).map(o => `${o} = $${index++}`);
        let query = `UPDATE tasks SET ${updArray.join(", ")} where "id" = $${index}`;
        let values = Object.keys(data).map(o => data[o]);
        values.push(taskId);
        if(client){
            await _client.query(query, values);
        } else {
            let _client = await this.pool.connect();
            try {
                await _client.query(query, values);
            } finally {
                _client.release()
            }
        }
    }

    /**
     * updateRouteDomainData
     * @param {*} routeId 
     * @param {*} domainId 
     * @param {*} subdomain 
     * @param {*} client 
     */
    static async updateRouteDomainData(routeId, domainId, subdomain, client) {
        let query = `UPDATE routes SET "domainId" = $1, "subdomain" = $2 WHERE "id" = $3`;
        let values = [domainId, subdomain, routeId];
        if(client){
            await client.query(query, values);
        } else {
            let _client = await this.pool.connect();
            try {
                await _client.query(query, values);
            } finally {
                _client.release()
            }
        }
    }

    /**
     * createTask
     * @param {*} taskId 
     * @param {*} taskType 
     * @param {*} target 
     * @param {*} targetId 
     * @param {*} status 
     * @param {*} payload 
     * @param {*} client 
     */
    static async createTask(taskId, taskType, target, targetId, status, payload, client) {
        let query = `INSERT INTO tasks ("taskId", "taskType", "target", "targetId", "status", "payload", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`;
        let values = [taskId, taskType, target, targetId, status, payload, new Date().toISOString(), new Date().toISOString()];
        if(client){
            let res = await _client.query(query, values);
            return res.rows[0];
        } else {
            let _client = await this.pool.connect();
            try {
                let res = await _client.query(query, values);
                return res.rows[0];
            } finally {
                _client.release()
            }
        }
    }

    /**
     * createVolume
     * @param {*} size 
     * @param {*} name 
     * @param {*} secret 
     * @param {*} workspaceId 
     * @param {*} type 
     */
    static async createVolume(size, name, secret, workspaceId, type, portIndex, client) {
        let query = `INSERT INTO volumes ("size", "name", "secret", "workspaceId", "type", "portIndex", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`;
        let values = [size, name, secret, workspaceId, type, portIndex != undefined ? portIndex : null, new Date().toISOString(), new Date().toISOString()];
        if(client){
            let res = await _client.query(query, values);
            return res.rows[0];
        } else {
            let _client = await this.pool.connect();
            try {
                let res = await _client.query(query, values);
                return res.rows[0];
            } finally {
                _client.release()
            }
        }
    }

    /**
     * createService
     * @param {*} workspaceId 
     * @param {*} serviceName 
     * @param {*} serviceVersion 
     * @param {*} instanceName 
     * @param {*} namespace 
     * @param {*} externalServiceName 
     * @param {*} hasDedicatedVolume 
     * @param {*} volumeId 
     * @param {*} dedicatedPv 
     * @param {*} dedicatedPvc 
     * @param {*} client 
     */
    static async createService(workspaceId, serviceName, serviceVersion, instanceName, namespace, externalServiceName, hasDedicatedVolume, volumeId, dedicatedPv, dedicatedPvc, size, client) {
        let query = `INSERT INTO services ("workspaceId", "serviceName", "serviceVersion", "instanceName", "namespace", "externalServiceName", "hasDedicatedVolume", "volumeId", "dedicatedPv", "dedicatedPvc", "pvcSize", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`;
        let values = [workspaceId, serviceName, serviceVersion, instanceName, namespace, externalServiceName, hasDedicatedVolume, volumeId, dedicatedPv, dedicatedPvc, size, new Date().toISOString(), new Date().toISOString()];
        if(client){
            let res = await _client.query(query, values);
            return res.rows[0];
        } else {
            let _client = await this.pool.connect();
            try {
                let res = await _client.query(query, values);
                return res.rows[0];
            } finally {
                _client.release()
            }
        }
    }

    /**
     * createApplication
     * @param {*} workspaceId 
     * @param {*} name 
     * @param {*} namespace 
     * @param {*} config 
     * @param {*} client 
     */
    static async createApplication(workspaceId, name, namespace, config, client) {
        let query = `INSERT INTO applications (
            "workspaceId", 
            "name", 
            "namespace", 
            "config",
            "createdAt", 
            "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`;
        let values = [workspaceId, name, namespace, config, new Date().toISOString(), new Date().toISOString()];
        if(client){
            let res = await _client.query(query, values);
            return res.rows[0];
        } else {
            let _client = await this.pool.connect();
            try {
                let res = await _client.query(query, values);
                return res.rows[0];
            } finally {
                _client.release()
            }
        }
    }

    /**
     * createApplicationVersion
     * @param {*} externalServiceName 
     * @param {*} registry 
     * @param {*} tag 
     * @param {*} image 
     * @param {*} replicas 
     * @param {*} dedicatedPv 
     * @param {*} dedicatedPvc 
     * @param {*} hasDedicatedVolume 
     * @param {*} pvcSize 
     * @param {*} weight 
     * @param {*} volumeId 
     * @param {*} applicationId 
     * @param {*} client 
     */
    static async createApplicationVersion(externalServiceName, registry, tag, image, replicas, dedicatedPv, dedicatedPvc, hasDedicatedVolume, pvcSize, weight, volumeId, applicationId, client) {
        let query = `INSERT INTO application_version (
            "externalServiceName", 
            "registry", 
            "tag", 
            "image", 
            "replicas", 
            "dedicatedPv", 
            "dedicatedPvc", 
            "hasDedicatedVolume", 
            "pvcSize", 
            "weight", 
            "volumeId", 
            "applicationId",
            "createdAt", 
            "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`;
        let values = [externalServiceName, registry, tag, image, replicas, dedicatedPv, dedicatedPvc, hasDedicatedVolume, pvcSize, weight, volumeId, applicationId, new Date().toISOString(), new Date().toISOString()];
        if(client){
            let res = await client.query(query, values);
            return res.rows[0];
        } else {
            let _client = await this.pool.connect();
            try {
                let res = await _client.query(query, values);
                return res.rows[0];
            } finally {
                _client.release()
            }
        }
    }

    /**
     * updateApplicationVersionWeight
     * @param {*} appId 
     * @param {*} registry 
     * @param {*} repo 
     * @param {*} tag 
     * @param {*} weight 
     */
    static async updateApplicationVersionWeight(appId, registry, repo, tag, weight, client) {
        let query = `UPDATE 
                        application_version 
                     SET 
                        "weight" = $1 
                     WHERE 
                        "applicationId" = $2 AND 
                        "registry" = $3 AND 
                        "image" = $4 AND
                        "tag" = $5`;
        let values = [weight, appId, registry, repo, tag];
        if(client){
            await client.query(query, values);
        } else {
            let _client = await this.pool.connect();
            try {
                await _client.query(query, values);
            } finally {
                _client.release()
            }
        }
    }

    /**
     * createRoute
     * @param {*} domainId 
     * @param {*} applicationId 
     * @param {*} serviceId 
     * @param {*} virtualPort 
     * @param {*} port 
     * @param {*} tcpStream 
     * @param {*} serviceType 
     * @param {*} client 
     */
    static async createRoute(domainId, applicationId, serviceId, virtualPort, port, tcpStream, serviceType, client) {
        let query = `INSERT INTO routes ("domainId", "applicationId", "serviceId", "virtualPort", "port", "tcpStream", "serviceType", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`;
        let values = [domainId, applicationId, serviceId, virtualPort, port, tcpStream, serviceType, new Date().toISOString(), new Date().toISOString()];
        if(client){
            let res = await _client.query(query, values);
            return res.rows[0];
        } else {
            let _client = await this.pool.connect();
            try {
                let res = await _client.query(query, values);
                return res.rows[0];
            } finally {
                _client.release()
            }
        }
    }

    /**
     * getAllVirtualPorts
     */
    static async getAllVirtualPorts() {
        let _client = await this.pool.connect();
        try {
            const res = await _client.query('SELECT routes."virtualPort" FROM routes');
            return res.rows;
        } finally {
            _client.release();
        }
    }

    /**
     * getVirtualPortsForWorkspace
     * @param {*} wsId 
     */
    static async getVirtualPortsForWorkspace(wsId) {
        let _client = await this.pool.connect();
        try {
            const resApps = await _client.query(`SELECT routes."virtualPort" as "virtualPort" FROM routes
                            LEFT JOIN applications ON routes."applicationId"=applications."id"
                            LEFT JOIN services ON routes."serviceId" = services."id" 
                            WHERE services."workspaceId" = $1 OR applications."workspaceId" = $2`, [wsId, wsId]);
            return resApps.rows;
        } finally {
            _client.release();
        }
    }
    
    /**
     * createK8sHost
     * @param {*} ip 
     * @param {*} hostname 
     * @param {*} status 
     */
    static async createK8sHost(ip, hostname, status) {
        let _client = await this.pool.connect();
        try {
            let query = `INSERT INTO k8s_hosts ("ip", "hostname", "status", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5)`;
            let values = [ip, hostname, status, new Date().toISOString(), new Date().toISOString()];
            return await _client.query(query, values);
        } finally {
            _client.release()
        }
    }

    /**
     * createK8sHost
     * @param {*} ip 
     * @param {*} hostname 
     * @param {*} status 
     */
    static async createGlusterHost(ip, hostname, status) {
        let _client = await this.pool.connect();
        try {
            let query = `INSERT INTO gluster_hosts ("ip", "hostname", "status", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5)`;
            let values = [ip, hostname, status, new Date().toISOString(), new Date().toISOString()];
            return await _client.query(query, values);
        } finally {
            _client.release()
        }
    }

    /**
     * getAllK8sNodes
     * @param {*} workspaceId 
     */
    static async getAllK8sWorkspaceNodes(workspaceId) {
        let _client = await this.pool.connect();
        try {
            let query = `SELECT * FROM k8s_nodes WHERE "workspaceId" = $1`;
            let res = await _client.query(query, [workspaceId]);
            return res.rows
        } finally {
            _client.release()
        }
    }

    /**
     * getAllK8sHosts
     */
    static async getAllK8sHosts() {
        let _client = await this.pool.connect();
        try {
            let query = `SELECT * FROM k8s_hosts`;
            let res = await _client.query(query);
            return res.rows
        } finally {
            _client.release()
        }
    }

    /**
     * getK8sHost
     * @param {*} id 
     */
    static async getK8sHost(id) {
        let _client = await this.pool.connect();
        try {
            let query = `SELECT * FROM k8s_hosts where "id" = $1`;
            let res = await _client.query(query, [id]);
            return res.rows.length == 1 ? res.rows[0] : null;
        } finally {
            _client.release()
        }
    }

    /**
     * getVolumesForK8SCluster
     * @param {*} vId 
     */
    static async getVolumesForK8SCluster(wId) {
        let _client = await this.pool.connect();
        try {
            const res = await _client.query(`SELECT * FROM volumes WHERE "workspaceId" = $1 ORDER BY "portIndex" ASC`, [wId]);
            return res.rows;
        } finally {
            _client.release();
        }
    }

    /**
     * getVolume
     * @param {*} id 
     */
    static async getVolume(id) {
        let _client = await this.pool.connect();
        try {
            const res = await _client.query(`SELECT * FROM volumes WHERE "id" = $1`, [id]);
            return res.rows.length == 1 ? res.rows[0] : null;
        } finally {
            _client.release();
        }
    }

    /**
     * getApplication
     * @param {*} id 
     */
    static async getApplication(id, client) {
        let query = `SELECT * FROM applications WHERE "id" = $1`;
        if(client){
            const res = await client.query(query, [id]);
            return res.rows.length == 1 ? res.rows[0] : null;
        } else {
            let _client = await this.pool.connect();
            try {
                const res = await _client.query(query, [id]);
                return res.rows.length == 1 ? res.rows[0] : null;
            } finally {
                _client.release()
            }
        }
    }

    /**
     * getApplicationVersion
     * @param {*} id 
     */
    static async getApplicationVersion(id) {
        let _client = await this.pool.connect();
        try {
            const res = await _client.query(`SELECT * FROM application_version WHERE "id" = $1`, [id]);
            return res.rows.length == 1 ? res.rows[0] : null;
        } finally {
            _client.release();
        }
    }

    /**
     * getApplicationVersionsForApp
     * @param {*} id 
     */
    static async getApplicationVersionsForApp(id, client) {
        let query = `SELECT application_version.* FROM application_version, applications WHERE application_version."applicationId" = applications."id" AND applications."id" = $1`;
        if(client){
            const res = await client.query(query, [id]);
            return res.rows;
        } else {
            let _client = await this.pool.connect();
            try {
                const res = await _client.query(query, [id]);
                return res.rows;
            } finally {
                _client.release()
            }
        }
    }

    /**
     * getVolumeBindingsForWorkspace
     * @param {*} wsId 
     */
    static async getVolumeBindingsForWorkspace(wsId) {
        let _client = await this.pool.connect();
        try {
            const res = await _client.query(`SELECT * FROM volume_bindings WHERE "target" = $1 AND "targetId" = $2`, ["workspace", wsId]);
            return res.rows;
        } finally {
            _client.release();
        }
    }

    /**
     * getService
     * @param {*} id 
     */
    static async getService(id) {
        let _client = await this.pool.connect();
        try {
            const res = await _client.query(`SELECT * FROM services WHERE "id" = $1`, [id]);
            return res.rows.length == 1 ? res.rows[0] : null;
        } finally {
            _client.release();
        }
    }

    /**
     * getVolumeByName
     * @param {*} wsId 
     * @param {*} name 
     */
    static async getVolumeByName(wsId, name) {
        let _client = await this.pool.connect();
        try {
            const res = await _client.query(`SELECT * FROM volumes WHERE "workspaceId" = $1 AND "name" = $2`, [wsId, name]);
            return res.rows.length == 1 ? res.rows[0] : null;
        } finally {
            _client.release();
        }
    }

    /**
     * getVolumeByHash
     * @param {*} wsId 
     * @param {*} hash 
     */
    static async getVolumeByHash(wsId, hash) {
        let _client = await this.pool.connect();
        try {
            const res = await _client.query(`SELECT * FROM volumes WHERE "workspaceId" = $1 AND "secret" = $2`, [wsId, hash]);
            return res.rows.length == 1 ? res.rows[0] : null;
        } finally {
            _client.release();
        }
    }

    /**
     * getGlusterHostsByVolumeId
     * @param {*} vId 
     */
    static async getGlusterHostsByVolumeId(vId) {
        let _client = await this.pool.connect();
        try {
            const res = await _client.query(`SELECT gluster_hosts.* FROM 
                    volumes, 
                    gluster_hosts, 
                    gluster_vol_replicas 
                WHERE 
                    gluster_vol_replicas."volumeId" = volumes."id" AND 
                    gluster_vol_replicas."glusterHostId" = gluster_hosts."id" AND
                    volumes."id" = $1`, [vId]);
            return res.rows;
        } finally {
            _client.release();
        }
    }

    /**
     * getK8SHostsByVolumeId
     * @param {*} vId 
     */
    static async getK8SNodesByVolumeId(vId) {
        let _client = await this.pool.connect();
        try {
            const res = await _client.query(`SELECT k8s_nodes.* FROM 
                    volumes,
                    k8s_nodes
                WHERE 
                    volumes."workspaceId" = k8s_nodes."workspaceId" AND
                    volumes."id" = $1`, [vId]);
            return res.rows;
        } finally {
            _client.release();
        }
    }

    /**
     * getGlusteVolumeBindingsByVolumeId
     * @param {*} vId 
     */
    static async getGlusteVolumeBindingsByVolumeId(vId) {
        let _client = await this.pool.connect();
        try {
            const res = await _client.query(`SELECT volume_bindings.* FROM 
                    volumes, 
                    volume_bindings
                WHERE 
                    volume_bindings."volumeId" = volumes."id" AND 
                    volumes."id" = $1`, [vId]);
            return res.rows;
        } finally {
            _client.release();
        }
    }

    /**
     * getWorkspaceRoutes
     * @param {*} wsId 
     */
    static async getWorkspaceRoutes(wsId) {
        let _client = await this.pool.connect();
        try {
            let res = await _client.query(`SELECT 
                                                routes.* 
                                            FROM 
                                                routes, 
                                                services, 
                                                applications 
                                            WHERE (
                                                routes."serviceId" = services."id" AND 
                                                services."workspaceId" = $1
                                            ) OR (
                                                routes."applicationId" = applications."id" AND 
                                                applications."workspaceId" = $2
                                            )`, [wsId, wsId]);
            return res.rows;
        } finally {
            _client.release()
        }
    }

    /**
     * getServiceRoutes
     * @param {*} serviceId 
     */
    static async getServiceRoutes(serviceId) {
        let _client = await this.pool.connect();
        try {
            let services = await _client.query(`SELECT 
                                                    services."namespace",
                                                    domains."name" as "domainName",
                                                    domains."id" as "domainId",
                                                    routes.*
                                                FROM routes
                                                LEFT JOIN services
                                                    ON routes."serviceId"=services."id"
                                                LEFT JOIN domains
                                                    ON routes."domainId"=domains."id"
                                                WHERE services."id" = $1`, [serviceId]);
            return services.rows;
        } finally {
            _client.release()
        }
    }

    /**
     * getApplicationRoutes
     * @param {*} appId 
     */
    static async getApplicationRoutes(appId) {
        let _client = await this.pool.connect();
        try {
            let applications = await _client.query(`SELECT 
                                                        applications."namespace",
                                                        domains."name" as "domainName",
                                                        domains."id" as "domainId",
                                                        routes.*
                                                    FROM routes
                                                    LEFT JOIN applications
                                                        ON routes."applicationId"=applications."id"
                                                    LEFT JOIN domains
                                                        ON routes."domainId"=domains."id"
                                                    WHERE applications."id" = $1`, [appId]);
            return applications.rows;
        } finally {
            _client.release()
        }
    }

    /**
     * getAllGlusterHosts
     */
    static async getAllGlusterHosts() {
        let _client = await this.pool.connect();
        try {
            let query = `SELECT * FROM gluster_hosts`;
            let res = await _client.query(query);
            return res.rows
        } finally {
            _client.release()
        }
    }
}

module.exports = DBController;