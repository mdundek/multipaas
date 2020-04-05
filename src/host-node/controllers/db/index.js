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
     * getTask
     * @param {*} taskId 
     */
    static async getTask(taskId) {
        let client = await this.pool.connect();
        try {
            const res = await client.query('SELECT * FROM tasks WHERE "id" = $1', [taskId]);
            return res.rows.length == 1 ? res.rows[0] : null;
        } finally {
            client.release();
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
     * getServicesForWsRoutes
     * @param {*} wsId 
     */
    static async getServicesForWsRoutes(wsId, ns) {
        let client = await this.pool.connect();
        try {
            const res = await client.query(`SELECT 
                    services."instanceName" as "name",
                    services."externalServiceName",
                    services."namespace",
                    domains."name" as "domainName",
                    routes."virtualPort" as "virtualPort",
                    routes."port" as "port",
                    routes."tcpStream" as "tcpStream",
                    routes."serviceType" as "serviceType",
                    workspaces."name" as "workspaceName"
                FROM routes
                LEFT JOIN services
                    ON routes."serviceId"=services."id"
                LEFT JOIN domains
                    ON routes."domainId"=domains."id"
                LEFT JOIN workspaces
                    ON services."workspaceId"=workspaces."id"
                WHERE services."workspaceId" = $1 AND services."namespace" = $2`, [wsId, ns]);
            return res.rows;
        } finally {
            client.release();
        }
    }

    /**
     * getApplicationsForWsRoutes
     * @param {*} wsId 
     */
    static async getApplicationsForWsRoutes(wsId, ns) {
        let client = await this.pool.connect();
        try {
            const res = await client.query(`SELECT 
                    applications."name",
                    applications."externalServiceName",
                    applications."namespace",
                    domains."name" as "domainName",
                    routes."virtualPort" as "virtualPort",
                    routes."port" as "port",
                    routes."tcpStream" as "tcpStream",
                    routes."serviceType" as "serviceType",
                    workspaces."name" as "workspaceName"
                FROM routes
                LEFT JOIN applications
                    ON routes."applicationId"=applications."id"
                LEFT JOIN domains
                    ON routes."domainId"=domains."id"
                LEFT JOIN workspaces
                    ON applications."workspaceId"=workspaces."id"
                WHERE applications."workspaceId" = $1 AND applications."namespace" = $2`, [wsId, ns]);
            return res.rows;
        } finally {
            client.release();
        }
    }

    /**
     * getGlusterHostVolumes
     * @param {*} ip 
     */
    static async getGlusterHostVolumes(ip) {
        let client = await this.pool.connect();
        try {
            const res = await client.query(`SELECT * FROM 
                    volumes, 
                    gluster_hosts, 
                    gluster_vol_replicas 
                WHERE 
                    gluster_vol_replicas."volumeId" = volumes."id" AND 
                    gluster_vol_replicas."glusterHostId" = gluster_hosts."id" AND
                    gluster_hosts."ip" = $1`, [ip]);
            return res.rows;
        } finally {
            client.release();
        }
    }





    /**
     * getClusterRoutes
     * @param {*} workspaceId 
     */
    static async getClusterRoutes(workspaceId) {
        let client = await this.pool.connect();
        try {
            const res = await client.query(`SELECT routes.* FROM 
                    routes, 
                    applications, 
                    services 
                WHERE 
                    (routes."applicationId" = applications."id" AND applications."workspaceId" = $1) OR 
                    (routes."serviceId" = services."id" AND applications."workspaceId" = $2)`, [workspaceId, workspaceId]);
            return res.rows;
        } finally {
            client.release();
        }
    }



    /**
     * startTransaction
     */
    static async startTransaction() {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            return client;
        } catch (e) {
            client.release();
            return false;
        }
    }

    

    /**
     * commitTransaction
     */
    static async commitTransaction(client) {
        if(client){
            try {
                await client.query('COMMIT');
            } catch (e) {
                console.err(e);
            }
        }
    }

    /**
     * rollbackTransaction
     */
    static async rollbackTransaction(client) {
        if(client){
            try {
                await client.query('ROLLBACK');
            } catch (e) {
                console.err(e);
            }
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
     * getK8SHostByIp
     * @param {*} ip 
     */
    static async getK8SHostByIp(ip) {
        let _client = await this.pool.connect();
        try {
            let query = `SELECT * FROM k8s_hosts WHERE "ip" = $1`;
            let res = await _client.query(query, [ip]);
            return res.rows.length == 1 ? res.rows[0] : null;
        } finally {
            _client.release()
        }
    }

    /**
     * getGlusterHostByIp
     * @param {*} ip 
     */
    static async getGlusterHostByIp(ip) {
        let _client = await this.pool.connect();
        try {
            let query = `SELECT * FROM gluster_hosts WHERE "ip" = $1`;
            let res = await _client.query(query, [ip]);
            return res.rows.length == 1 ? res.rows[0] : null;
        } finally {
            _client.release()
        }
    }

    /**
     * getVolume
     * @param {*} id
     */
    static async getVolume(id) {
        let _client = await this.pool.connect();
        try {
            let query = `SELECT * FROM volumes WHERE "id" = $1`;
            let res = await _client.query(query, [id]);
            return res.rows.length == 1 ? res.rows[0] : null;
        } finally {
            _client.release()
        }
    }

    /**
     * getServices
     * @param {*} id
     */
    static async getServices(id) {
        let _client = await this.pool.connect();
        try {
            let query = `SELECT * FROM services WHERE "id" = $1`;
            let res = await _client.query(query, [id]);
            return res.rows.length == 1 ? res.rows[0] : null;
        } finally {
            _client.release()
        }
    }

    /**
     * getMasterNodesForWorkspaceId
     * @param {*} wsId
     */
    static async getMasterNodeForWorkspaceId(wsId) {
        let _client = await this.pool.connect();
        try {
            let query = `SELECT * FROM k8s_nodes WHERE "workspaceId" = $1`;
            let res = await _client.query(query, [id]);
            return res.rows.length > 0 ? res.rows[0] : null;
        } finally {
            _client.release()
        }
    }

    /**
     * getApplication
     * @param {*} id
     */
    static async getApplication(id) {
        let _client = await this.pool.connect();
        try {
            let query = `SELECT * FROM applications WHERE "id" = $1`;
            let res = await _client.query(query, [id]);
            return res.rows.length == 1 ? res.rows[0] : null;
        } finally {
            _client.release()
        }
    }

    /**
     * getDomain
     * @param {*} id
     */
    static async getDomain(id) {
        let _client = await this.pool.connect();
        try {
            let query = `SELECT * FROM domains WHERE "id" = $1`;
            let res = await _client.query(query, [id]);
            return res.rows.length == 1 ? res.rows[0] : null;
        } finally {
            _client.release()
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
     * getTaskById
     * @param {*} id 
     */
    static async getTaskById(id) {
        let _client = await this.pool.connect();
        try {
            let query = `SELECT * FROM tasks WHERE "id" = $1`;
            let res = await _client.query(query, [id]);
            return res.rows.length == 1 ? res.rows[0] : null;
        } finally {
            _client.release()
        }
    }

    /**
     * createK8SMasterNode
     * @param {*} ip 
     * @param {*} hostname 
     * @param {*} workspaceId 
     * @param {*} k8sHostId 
     */
    static async createK8SMasterNode(ip, hostname, workspaceId, k8sHostId, hash) {
        let _client = await this.pool.connect();
        try {
            let query = `INSERT INTO k8s_nodes ("nodeType", "ip", "hostname", "workspaceId", "k8sHostId", "createdAt", "updatedAt", "hash") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;
            await _client.query(query, ["MASTER", ip, hostname, workspaceId, k8sHostId, new Date().toISOString(), new Date().toISOString(), hash]);
        } finally {
            _client.release()
        }
    }

    /**
     * 
     * @param {*} size 
     * @param {*} name 
     * @param {*} secret 
     * @param {*} workspaceId 
     * @param {*} type 
     */
    static async createGlusterVolume(size, name, secret, workspaceId, type, client) {
        let query = `INSERT INTO volumes ("size", "name", "secret", "workspaceId", "type", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`;
        let values = [size, name, secret, workspaceId, type, new Date().toISOString(), new Date().toISOString()];
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
     * deleteGlusterVolume
     * @param {*} id 
     * @param {*} client 
     */
    static async deleteGlusterVolume(id, client) {
        let query = `DELETE FROM volumes WHERE "id" = $1`;
        let values = [id];
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
     * createGlusterVolumeReplica
     * @param {*} volumeId 
     * @param {*} hostId 
     */
    static async createGlusterVolumeReplica(volumeId, hostId, client) {
        let query = `INSERT INTO gluster_vol_replicas ("volumeId", "glusterHostId", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4)`;
        let values = [volumeId, hostId, new Date().toISOString(), new Date().toISOString()];

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
     * createK8SWorkerNode
     * @param {*} ip 
     * @param {*} hostname 
     * @param {*} workspaceId 
     * @param {*} k8sHostId 
     * @param {*} hash 
     */
    static async createK8SWorkerNode(ip, hostname, workspaceId, k8sHostId, hash) {
        let _client = await this.pool.connect();
        try {
            let query = `INSERT INTO k8s_nodes ("nodeType", "ip", "hostname", "workspaceId", "k8sHostId", "createdAt", "updatedAt", "hash") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;
            await _client.query(query, ["WORKER", ip, hostname, workspaceId, k8sHostId, new Date().toISOString(), new Date().toISOString(), hash]);
            
            let response = await _client.query(`SELECT "id" FROM k8s_nodes WHERE "hash" = $1`, [hash]);
            return response.rows[0].id;
        } finally {
            _client.release()
        }
    }

    /**
     * deleteK8SWorkerNode
     * @param {*} id 
     */
    static async deleteK8SWorkerNode(id) {
        let _client = await this.pool.connect();
        try {
            let query = `DELETE FROM k8s_nodes WHERE "id" = $1`;
            await _client.query(query, [id]);
        } finally {
            _client.release()
        }
    }
}

module.exports = DBController;