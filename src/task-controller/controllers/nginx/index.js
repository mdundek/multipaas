const NginxConfFile = require('nginx-conf').NginxConfFile;
const DBController = require('../db/index');
const fs = require("fs");
const path = require("path");
const OSController = require('../os/index');

const HTTPConfig = require('./default');
const TCPConfig = require('./tcp');

let bussy = false;

// Sleep promise for async
let _sleep = (duration) => {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, duration);
    });
}

class NGinxController {

    /**
     * generateProxyConfigsForWorkspace
     * @param {*} workspaceId 
     * @param {*} accountName 
     * @param {*} orgName 
     * @param {*} workspaceName 
     * @param {*} clusterNodeProfiles 
     * @param {*} serviceProfiles 
     */
    static async generateProxyConfigsForWorkspace(workspaceId, accountName, orgName, workspaceName, clusterNodeProfiles, serviceProfiles) {
        let nginxHttpConfigBackup = null;
        try {
            while(bussy){
                await _sleep(2000);
            }
            bussy = true;
            nginxHttpConfigBackup = await HTTPConfig.generateHttpProxyConfigForWorkspace(workspaceId, accountName, orgName, workspaceName, clusterNodeProfiles, serviceProfiles, false, true);
            await TCPConfig.generateTcpProxyConfigForWorkspace(workspaceId, accountName, orgName, workspaceName, clusterNodeProfiles, serviceProfiles);
        } catch (error) {
            /* ************* ROLLBACK ************ */
            if(nginxHttpConfigBackup){
                await HTTPConfig.restoreHttpConfig(nginxHttpConfigBackup);
            }
            /* *********************************** */ 
            throw error;
        } finally {
            bussy = false;
        }
    }

    /**
     * updateUpstreamServersForCluster
     * @param {*} serverNodes 
     */
    static async updateUpstreamServersForCluster(serverNodes) {
        while(bussy){
            await _sleep(2000);
        }

        bussy = true;
        let configHttp = await HTTPConfig.prepareHttpConfigFile();
        let configTcp = await TCPConfig.prepareTcpConfigFile();
        let backupString = null;
        try {
            let _updateUpstream = (_upstream) => {
                let existingIps = [];
                let upstreamPort = null;
                if(_upstream.server._value == undefined) {
                    for(let y=0; y<_upstream.server.length; y++) {
                        let ipSplit = _upstream.server[y]._value.split(":");
                        existingIps.push(ipSplit[0]);
                        if(!upstreamPort){
                            upstreamPort = ipSplit[1];
                        }
                        if(!serverNodes.find(node => node.ip == ipSplit[0])){
                            _upstream._remove('server', y);
                        }
                    }
                    if(_upstream.server._value) {
                        let ipSplit = _upstream.server._value.split(":");
                        existingIps.push(ipSplit[0]);
                        if(!serverNodes.find(node => node.ip == ipSplit[0])){
                            _upstream._remove('server');
                        }
                    }
                }
                else {
                    let ipSplit = _upstream.server._value.split(":");
                    existingIps.push(ipSplit[0]);
                    if(!upstreamPort){
                        upstreamPort = ipSplit[1];
                    }
                    if(!serverNodes.find(node => node.ip == ipSplit[0])){
                        _upstream._remove('server');
                    }
                }
                serverNodes.filter(o => existingIps.indexOf(o.ip) == -1).forEach(node => {
                    _upstream._add('server', `${node.ip}:${upstreamPort}`);
                });
            }

            if(configHttp.nginx.upstream){
                // If more than one upstream server
                if(configHttp.nginx.upstream._value == undefined) {
                    for(let y=0; y<configHttp.nginx.upstream.length; y++) {
                        _updateUpstream(configHttp.nginx.upstream[y]);
                    }
                } 
                // If only one upstream server
                else {
                    _updateUpstream(configHttp.nginx.upstream);
                }
                configHttp.flush();
                await _sleep(2000);
                backupString = await HTTPConfig.saveAndApplyHttpProxyConfig(true);
            }

            // If more than one upstream server
            if(configTcp.nginx.upstream){
                if(configTcp.nginx.upstream._value == undefined) {
                    for(let y=0; y<configTcp.nginx.upstream.length; y++) {
                        _updateUpstream(configTcp.nginx.upstream[y]);
                    }
                } 
                // If only one upstream server
                else {
                    _updateUpstream(configTcp.nginx.upstream);
                }
                configTcp.flush();
                await _sleep(2000);
                await TCPConfig.saveAndApplyTcpProxyConfig();
            }
        } catch (error) {
            if(backupString){
                await HTTPConfig.restoreHttpConfig(backupString);
            }
            let nginxConfigFileContentNew = `/usr/src/app/nginx/conf.d/default.conf.processing`;
            if (fs.existsSync(nginxConfigFileContentNew)) {
                fs.unlinkSync(nginxConfigFileContentNew);
            }
            let nginxTcpConfigFileContentNew = `/usr/src/app/nginx/conf.d/tcp.conf.processing`;
            if (fs.existsSync(nginxTcpConfigFileContentNew)) {
                fs.unlinkSync(nginxTcpConfigFileContentNew);
            }
            throw error;
        } finally {
            bussy = false;
        }
    }

    /**
     * cleanupLoadbalancerAfterResourceDelete
     * @param {*} accountName 
     * @param {*} orgName 
     * @param {*} workspaceName 
     * @param {*} namespace 
     */
    static async cleanupLoadbalancerAfterResourceDelete(accountName, orgName, workspaceName, namespace) {     
        while(bussy){
            await _sleep(2000);
        }

        let upstreamBaseNameHttp = `us-${accountName}-${orgName}-${workspaceName}`;
        let serverHostNameHttp = `Host ${accountName}-${orgName}-${workspaceName}-${namespace ? namespace : ""}`;
        let upstreamBaseNameTcp = `us-${accountName}-${orgName}-${workspaceName}-${namespace ? namespace : ""}`;
        
        bussy = true;
        let configHttp = await HTTPConfig.prepareHttpConfigFile();
        let configTcp = await TCPConfig.prepareTcpConfigFile();
        let backupStringHttp = null;
        let backupStringTcp = null;
        try {
            /** ********************************
             * CLEAN UP HTTP CONFIGS FIRST
             * *********************************/
            if(!namespace && configHttp.nginx.upstream){
                if(configHttp.nginx.upstream._value == undefined) {
                    for(let y=0; y<configHttp.nginx.upstream.length; y++) {
                        if(configHttp.nginx.upstream[y]._value.indexOf(upstreamBaseNameHttp) == 0) {
                            configHttp.nginx._remove('upstream', y);
                        }
                    }
                }
                else {
                    if(configHttp.nginx.upstream._value.indexOf(upstreamBaseNameHttp) == 0) {
                        configHttp.nginx._remove('upstream');
                    }
                }
            }
            if(configHttp.nginx.server){
                let _processServerCleanupHttp = (configServer, index) => {
                    if(namespace) {
                        let _doDel = false;
                        for(let y=0; y<configServer.location.proxy_set_header.length; y++) {
                            if(configServer.location.proxy_set_header[y]._value.indexOf(serverHostNameHttp) != -1) {
                                _doDel = true;
                            }
                        }
                        if(_doDel) {
                            if(index != null){
                                configHttp.nginx._remove('server', index);
                                return true;
                            } else {
                                configHttp.nginx._remove('server');
                                return true;
                            }
                        } else {
                            return false; 
                        }
                    } else {
                        if(configServer.location.proxy_pass._value.indexOf(`//${upstreamBaseNameHttp}`) != -1) {
                            if(index != null){
                                configHttp.nginx._remove('server', index);
                                return true;
                            } else {
                                configHttp.nginx._remove('server');
                                return true;
                            }
                        } else {
                            return false;
                        }
                    }
                }

                let hasMoreServers = true;
                while(configHttp.nginx.server && hasMoreServers){
                    if(configHttp.nginx.server.length) {   
                        for(let y=0; y<configHttp.nginx.server.length; y++) {    
                            let removed = _processServerCleanupHttp(configHttp.nginx.server[y], y);
                            if(removed){
                                y--;
                            }
                        }
                        if(configHttp.nginx.server.length) {
                            hasMoreServers = false;
                        }
                    } else if(configHttp.nginx.server) {
                        _processServerCleanupHttp(configHttp.nginx.server, null);
                        hasMoreServers = false;
                    } else {
                        hasMoreServers = false;
                    }
                }
            }
            configHttp.flush();
            await _sleep(1000);
            backupStringHttp = await HTTPConfig.saveAndApplyHttpProxyConfig(true);

            /** ********************************
             * CLEAN UP TCP CONFIGS FIRST
             * *********************************/
            if(configTcp.nginx.upstream){
                if(configTcp.nginx.upstream._value == undefined) {
                    for(let y=0; y<configTcp.nginx.upstream.length; y++) {
                        if(configTcp.nginx.upstream[y]._value.indexOf(upstreamBaseNameTcp) == 0) {
                            configTcp.nginx._remove('upstream', y);
                        }
                    }
                }
                else {
                    if(configTcp.nginx.upstream._value.indexOf(upstreamBaseNameTcp) == 0) {
                        configTcp.nginx._remove('upstream');
                    }
                }
            }
            if(configTcp.nginx.server){
                let _processServerCleanupTcp = (configServer, index) => {
                    if(configServer.proxy_pass._value.indexOf(upstreamBaseNameTcp) == 0) {
                        if(index != null){
                            configTcp.nginx._remove('server', index);
                            return true;
                        } else {
                            configTcp.nginx._remove('server');
                            return true;
                        }
                    } else {
                        return false;
                    }
                }

                let hasMoreServers = true;
                while(configTcp.nginx.server && hasMoreServers){
                    if(configTcp.nginx.server.length) {   
                        for(let y=0; y<configTcp.nginx.server.length; y++) {     
                            let removed = _processServerCleanupTcp(configTcp.nginx.server[y], y);
                            if(removed){
                                y--;
                            }
                        }
                        if(configTcp.nginx.server.length) {
                            hasMoreServers = false;
                        }
                    } else if(configTcp.nginx.server) {
                        _processServerCleanupTcp(configTcp.nginx.server, null);
                        hasMoreServers = false;
                    } else {
                        hasMoreServers = false;
                    }
                }
            }
            configTcp.flush();
            await _sleep(1000);
            backupStringTcp = await TCPConfig.saveAndApplyTcpProxyConfig();
        } catch (error) {
            if(backupStringHttp){
                await HTTPConfig.restoreHttpConfig(backupStringHttp);
            }
            if(backupStringTcp){
                await TCPConfig.restoreTcpConfig(backupStringTcp);
            }
            let nginxConfigFileContentNew = `/usr/src/app/nginx/conf.d/default.conf.processing`;
            if (fs.existsSync(nginxConfigFileContentNew)) {
                fs.unlinkSync(nginxConfigFileContentNew);
            }
            let nginxTcpConfigFileContentNew = `/usr/src/app/nginx/conf.d/tcp.conf.processing`;
            if (fs.existsSync(nginxTcpConfigFileContentNew)) {
                fs.unlinkSync(nginxTcpConfigFileContentNew);
            }
            throw error;
        } finally {
            bussy = false;
        }
    }

    /**
     * deleteConfigServersForVirtualPorts
     * @param {*} serviceRoutes 
     * @param {*} accountName 
     * @param {*} orgName 
     * @param {*} workspaceName 
     * @param {*} dbService 
     */
    static async deleteConfigServersForVirtualPorts(serviceRoutes, accountName, orgName, workspaceName, dbService, skipReload) {
        // If already processing, wait for processing to be done before moving on
        while(bussy){
            await _sleep(2000);
        }
        bussy = true;
        let backupNginxHttpConfig = null;
        let backupNginxTcpConfig = null;
        try {
            backupNginxHttpConfig = await HTTPConfig.deleteHttpConfigServersForVirtualPorts(serviceRoutes, accountName, orgName, workspaceName, dbService.instanceName, null, true);
            backupNginxTcpConfig = await TCPConfig.deleteTcpConfigServersForVirtualPorts(serviceRoutes, accountName, orgName, workspaceName, dbService.instanceName, null, skipReload);
        } catch (error) {
            await NGinxController.restoreConfigs(backupNginxHttpConfig, backupNginxTcpConfig);
        } finally {
            bussy = false;
        }
    }

    /**
     * restoreConfigs
     * @param {*} backupNginxHttpConfig 
     * @param {*} backupNginxTcpConfig 
     */
    static async restoreConfigs(backupNginxHttpConfig, backupNginxTcpConfig) {
        if(backupNginxHttpConfig){
            await HTTPConfig.restoreHttpConfig(backupNginxHttpConfig);
        }
        if(backupNginxTcpConfig){
            await TCPConfig.restoreTcpConfig(backupNginxTcpConfig);
        }
    }

    /**
     * release
     */
    static release() {
        bussy = false;
    }
}

module.exports = NGinxController;