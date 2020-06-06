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
     * getAllClusterMasters
     */
    static async getAllClusterMasters() {
        let client = await this.pool.connect();
        try {
            const res = await client.query(`SELECT * FROM volumes WHERE "workspaceId" = $1 AND "name" = $2`, [wsId, name]);
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
     * getVolumeByHash
     * @param {*} wsId 
     * @param {*} name 
     */
    static async getVolumeByHash(wsId, hash) {
        let client = await this.pool.connect();
        try {
            const res = await client.query(`SELECT * FROM volumes WHERE "workspaceId" = $1 AND "secret" = $2`, [wsId, hash]);
            return res.rows.length == 1 ? res.rows[0] : null;
        } finally {
            client.release();
        }
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
     * @param {*} ip 
     * @param {*} hostname 
     * @param {*} status 
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
     * getAllK8sWorkspaceNodes
     * @param {*} workspaceId 
     */
    static async getAllK8sWorkspaceNodes(workspaceId) {
        let _client = await this.pool.connect();
        try {
            let query = workspaceId != undefined ? `SELECT * FROM k8s_nodes WHERE "workspaceId" = $1` : `SELECT * FROM k8s_nodes`;
            let res = await _client.query(query, workspaceId != undefined ? [workspaceId] : []);
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
     * deleteAllWorkspaceTasks
     */
    static async deleteAllWorkspaceTasks(workspaceId) {
        let _client = await this.pool.connect();
        try {
            let query = `DELETE FROM tasks WHERE "target" = $1 AND "targetId" = $2`;
            await _client.query(query, ["workspace", workspaceId]);
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
     * getAccountForWs
     * @param {*} wsId 
     */
    static async getAccountForWs(wsId) {
        let client = await this.pool.connect();
        try {
            const res = await client.query(`SELECT accounts.* FROM 
                workspaces, 
                organizations,
                accounts 
            WHERE 
                workspaces."organizationId" = organizations."id" AND 
                organizations."accountId" = accounts."id" AND
                workspaces."id" = $1`, [wsId]);
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
     * getCertificateForDomains
     * @param {*} domainIds 
     */
    static async getCertificateForDomains(domainIds) {
        let client = await this.pool.connect();
        try {
            let query = `SELECT
                certificates.*
            FROM certificates
            WHERE certificates."domainId" IN (${domainIds.join(',')})`;
          
            const res = await client.query(query);
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
                services."id", 
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
                routes."subdomain" as "subdomain",
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
        let _client = await this.pool.connect();
        try {
            let query = `SELECT
                    applications."id" as "applicationId",
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
     * getApplicationVersionsForWs
     * @param {*} wsId 
     * @param {*} ns 
     */
    static async getApplicationVersionsForWs(wsId, ns) {
        let client = await this.pool.connect();
        try {
            let query = `SELECT 
                    application_version."applicationId" as "applicationId",
                    application_version."externalServiceName" as "externalServiceName",
                    application_version."weight" as "weight",
                    application_version."tag" as "tag"
                FROM application_version, applications
                WHERE applications."id" = application_version."applicationId" AND applications."workspaceId" = $1`;
            
            if(ns) {
                query += ` AND applications."namespace" = $2`;
            }
            const res = await client.query(query, ns ? [wsId, ns] : [wsId]);
            return res.rows;
        } finally {
            client.release();
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

    /**
     * getOrgByName
     * @param {*} orgId 
     */
    static async getOrgByName(orgId) {
        let client = await this.pool.connect();
        try {
            const res = await client.query(`SELECT * FROM organizations WHERE organizations."name" = $1`, [orgId]);
            return res.rows.length == 1 ? res.rows[0] : null;
        } finally {
            client.release();
        }
    }

    /**
     * getAccountByName
     * @param {*} accountName 
     */
    static async getAccountByName(accountName) {
        let client = await this.pool.connect();
        try {
            const res = await client.query(`SELECT * FROM accounts WHERE accounts."name" = $1`, [accountName]);
            return res.rows.length == 1 ? res.rows[0] : null;
        } finally {
            client.release();
        }
    }
}

module.exports = DBController;