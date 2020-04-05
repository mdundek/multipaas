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
     * getIpsInUse
     */
    static async getIpsInUse() {
        this.client = await this.pool.connect();
        try {
            const res = await this.client.query('SELECT "ip" FROM k8s_nodes');
            return res.rows.map(o => o.ip)
        } finally {
            this.client.release();
        }
    }

    /**
     * getTask
     * @param {*} taskId 
     */
    static async getTask(taskId) {
        this.client = await this.pool.connect();
        try {
            const res = await this.client.query('SELECT * FROM tasks WHERE "id" = $1', [taskId]);
            return res.rows.length == 1 ? res.rows[0] : null;
        } finally {
            this.client.release();
        }
    }

    /**
     * getPendingTasks
     */
    static async getPendingTasks() {
        this.client = await this.pool.connect();
        try {
            const res = await this.client.query('SELECT * FROM tasks WHERE "status" = $1 ORDER BY "createdAt"', ["PENDING"]);
            return res.rows;
        } finally {
            this.client.release();
        }
    }

    /**
     * getK8sNode
     * @param {*} id 
     */
    static async getK8sNode(id) {
        this.client = await this.pool.connect();
        try {
            const res = await this.client.query('SELECT * FROM k8s_nodes WHERE "id" = $1', [id]);
            return res.rows.length == 1 ? res.rows[0] : null;
        } finally {
            this.client.release();
        }
    }

    /**
     * getWorkspace
     * @param {*} id 
     */
    static async getWorkspace(id) {
        this.client = await this.pool.connect();
        try {
            const res = await this.client.query('SELECT * FROM workspaces WHERE "id" = $1', [id]);
            return res.rows.length == 1 ? res.rows[0] : null;
        } finally {
            this.client.release();
        }
    }

    /**
     * deleteWorkspace
     * @param {*} id 
     */
    static async deleteWorkspace(id) {
        this.client = await this.pool.connect();
        try {
            await this.client.query('DELETE FROM workspaces WHERE "id" = $1', [id]);
        } finally {
            this.client.release();
        }
    }

    /**
     * getK8sWorkspaceNodes
     * @param {*} wsId 
     */
    static async getK8sWorkspaceNodes(wsId) {
        this.client = await this.pool.connect();
        try {
            const res = await this.client.query('SELECT * FROM k8s_nodes WHERE "workspaceId" = $1', [wsId]);
            return res.rows;
        } finally {
            this.client.release();
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
    static async getOrgForWorkspace(workspaceId) {
        let client = await this.pool.connect();
        try {
            const res = await client.query(`SELECT organizations.* FROM 
                                                organizations, 
                                                workspaces 
                                            WHERE 
                                                organizations."id" = workspaces."organizationId" AND 
                                                workspaces."id" = $1`, [workspaceId]);
            return res.rows.length == 1 ? res.rows[0] : null;
        } finally {
            client.release();
        }
    }

    /**
     * getAccountForOrg
     * @param {*} orgId 
     */
    static async getAccountForOrg(orgId) {
        let client = await this.pool.connect();
        try {
            const res = await client.query(`SELECT accounts.* FROM 
                                                organizations, 
                                                accounts 
                                            WHERE 
                                                organizations."accountId" = accounts."id" AND 
                                                organizations."id" = $1`, [orgId]);
            return res.rows.length == 1 ? res.rows[0] : null;
        } finally {
            client.release();
        }
    }

    /**
     * getCertificates
     * @param {*} domainIds 
     */
    static async getCertificates(domainIds) {
        let client = await this.pool.connect();
        try {
            const res = await client.query(`SELECT * FROM certificates WHERE certificates."domainId" IN (${domainIds.join(',')})`);
            return res.rows;
        } finally {
            client.release();
        }
    }

    /**
     * getServicesForWsRoutes
     * @param {*} wsId 
     * @param {*} ns 
     */
    static async getServicesForWsRoutes(wsId, ns) {
        let client = await this.pool.connect();
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
                routes."tcpStream" as "tcpStream"
            FROM routes
            LEFT JOIN services
                ON routes."serviceId"=services."id"
            LEFT JOIN domains
                ON routes."domainId"=domains."id"
            WHERE services."workspaceId" = $1`;
            if(ns) {
                query += ' AND services."namespace" = $2';
            }

            const res = await client.query(query, ns ? [wsId, ns] : [wsId]);
            return res.rows;
        } finally {
            client.release();
        }
    }

    /**
     * getApplicationsForWsRoutes
     * @param {*} wsId 
     * @param {*} ns 
     */
    static async getApplicationsForWsRoutes(wsId, ns) {
        let client = await this.pool.connect();
        try {
            let query = `SELECT 
                applications."name",
                applications."namespace",
                applications."externalServiceName",
                applications."dedicatedPv" as "dedicatedPv",
                applications."dedicatedPvc" as "dedicatedPvc",
                domains."name" as "domainName",
                domains."id" as "domainId",
                routes."virtualPort" as "virtualPort",
                routes."port" as "port",
                routes."serviceType" as "serviceType",
                routes."tcpStream" as "tcpStream"
            FROM routes
            LEFT JOIN applications
                ON routes."applicationId"=applications."id"
            LEFT JOIN domains
                ON routes."domainId"=domains."id"
            WHERE applications."workspaceId" = $1`;
            if(ns) {
                query += ' AND applications."namespace" = $2';
            }
            const res = await client.query(query, ns ? [wsId, ns] : [wsId]);
            return res.rows;
        } finally {
            client.release();
        }
    }

    /**
     * setVolumePortIndex
     * @param {*} id 
     * @param {*} portIndex 
     */
    static async setVolumePortIndex(id, portIndex) {
        console.log("Setting volume port index ", portIndex);
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
     * getAllVirtualPorts
     */
    static async getAllVirtualPorts() {
        this.client = await this.pool.connect();
        try {
            const res = await this.client.query('SELECT routes."virtualPort" FROM routes');
            return res.rows;
        } finally {
            this.client.release();
        }
    }

    /**
     * getVirtualPortsForWorkspace
     * @param {*} wsId 
     */
    static async getVirtualPortsForWorkspace(wsId) {
        this.client = await this.pool.connect();
        try {
            const res = await this.client.query('SELECT routes."virtualPort" as "virtualPort" FROM routes LEFT JOIN services ON routes."serviceId"=services."id" LEFT JOIN applications ON routes."applicationId"=applications."id" WHERE services."workspaceId" = $1', [wsId]);
            return res.rows;
        } finally {
            this.client.release();
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
        let client = await this.pool.connect();
        try {
            const res = await client.query(`SELECT * FROM volumes WHERE "workspaceId" = $1`, [wId]);
            return res.rows;
        } finally {
            client.release();
        }
    }

    /**
     * getVolume
     * @param {*} id 
     */
    static async getVolume(id) {
        let client = await this.pool.connect();
        try {
            const res = await client.query(`SELECT * FROM volumes WHERE "id" = $1`, [id]);
            return res.rows.length == 1 ? res.rows[0] : null;
        } finally {
            client.release();
        }
    }

    /**
     * getVolumeBindingsForWorkspace
     * @param {*} wsId 
     */
    static async getVolumeBindingsForWorkspace(wsId) {
        let client = await this.pool.connect();
        try {
            const res = await client.query(`SELECT * FROM volume_bindings WHERE "target" = $1 AND "targetId" = $2`, ["workspace", wsId]);
            return res.rows;
        } finally {
            client.release();
        }
    }

    /**
     * getService
     * @param {*} id 
     */
    static async getService(id) {
        let client = await this.pool.connect();
        try {
            const res = await client.query(`SELECT * FROM services WHERE "id" = $1`, [id]);
            return res.rows.length == 1 ? res.rows[0] : null;
        } finally {
            client.release();
        }
    }

    /**
     * getVolumeByName
     * @param {*} wsId 
     * @param {*} name 
     */
    static async getVolumeByName(wsId, name) {
        let client = await this.pool.connect();
        try {
            const res = await client.query(`SELECT * FROM volumes WHERE "workspaceId" = $1 AND "name" = $2`, [wsId, name]);
            return res.rows.length == 1 ? res.rows[0] : null;
        } finally {
            client.release();
        }
    }

    /**
     * getGlusterHostsByVolumeId
     * @param {*} vId 
     */
    static async getGlusterHostsByVolumeId(vId) {
        let client = await this.pool.connect();
        try {
            const res = await client.query(`SELECT gluster_hosts.* FROM 
                    volumes, 
                    gluster_hosts, 
                    gluster_vol_replicas 
                WHERE 
                    gluster_vol_replicas."volumeId" = volumes."id" AND 
                    gluster_vol_replicas."glusterHostId" = gluster_hosts."id" AND
                    volumes."id" = $1`, [vId]);
            return res.rows;
        } finally {
            client.release();
        }
    }

    /**
     * getK8SHostsByVolumeId
     * @param {*} vId 
     */
    static async getK8SNodesByVolumeId(vId) {
        let client = await this.pool.connect();
        try {
            const res = await client.query(`SELECT k8s_nodes.* FROM 
                    volumes,
                    k8s_nodes
                WHERE 
                    volumes."workspaceId" = k8s_nodes."workspaceId" AND
                    volumes."id" = $1`, [vId]);
            return res.rows;
        } finally {
            client.release();
        }
    }

    /**
     * getGlusteVolumeBindingsByVolumeId
     * @param {*} vId 
     */
    static async getGlusteVolumeBindingsByVolumeId(vId) {
        let client = await this.pool.connect();
        try {
            const res = await client.query(`SELECT volume_bindings.* FROM 
                    volumes, 
                    volume_bindings
                WHERE 
                    volume_bindings."volumeId" = volumes."id" AND 
                    volumes."id" = $1`, [vId]);
            return res.rows;
        } finally {
            client.release();
        }
    }

    /**
     * getWorkspaceRoutes
     * @param {*} wsId 
     */
    static async getWorkspaceRoutes(wsId) {
        let _client = await this.pool.connect();
        try {
            let resServices = await _client.query(`SELECT routes.* FROM routes, services WHERE routes."serviceId" = services."id" AND services."workspaceId" = $1`, [wsId]);
            let resApps = await _client.query(`SELECT routes.* FROM routes, applications WHERE routes."applicationId" = applications."id" AND applications."workspaceId" = $1`, [wsId]);
            return resServices.rows.concat(resApps.rows);
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
            let services = await _client.query(`SELECT routes.*, services."namespace" FROM routes, services WHERE routes."serviceId" = services."id" AND routes."serviceId" = $1`, [serviceId]);
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
            let services = await _client.query(`SELECT routes.*, applications."namespace" FROM routes, applications WHERE routes."applicationId" = applications."id" AND routes."applicationId" = $1`, [appId]);
            return services.rows;
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