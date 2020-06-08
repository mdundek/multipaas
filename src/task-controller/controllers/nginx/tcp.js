const NginxConfFile = require('nginx-conf').NginxConfFile;
const DBController = require('../db/index');
const fs = require("fs");
const path = require("path");
const OSController = require('../os/index');

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
     * prepareTcpConfigFile
     */
    static prepareTcpConfigFile() {
        return new Promise((resolve, reject) => {
            (async () => {
                let nginxConfigFileContent = `/usr/src/app/nginx/conf.d/tcp.conf`;
                // let nginxConfigFileContent = `/usr/src/app/controllers/nginx/tcp.conf`;
                let workingTmpFile = nginxConfigFileContent + ".processing";
                if (fs.existsSync(nginxConfigFileContent)) {
                    if (fs.existsSync(workingTmpFile)) {
                        fs.unlinkSync(workingTmpFile);
                    }
                    fs.copyFileSync(nginxConfigFileContent, workingTmpFile);
                } else {
                    return reject(new Error("Could not find nginx tcp config file"));
                }
                NginxConfFile.create(workingTmpFile, function (err, conf) {
                    if (err) {
                        return reject(err);
                    }
                    resolve(conf);
                });
            })();
        });
    }

    /**
     * generateTcpProxyConfigForWorkspace
     * @param {*} workspaceId 
     * @param {*} accName 
     * @param {*} orgName 
     * @param {*} workspaceName 
     * @param {*} clusterIps 
     * @param {*} routesProfiles 
     * @param {*} reset 
     * @param {*} skipReload 
     */
    static async generateTcpProxyConfigForWorkspace(workspaceId, accName, orgName, workspaceName, clusterIps, routesProfiles, skipReload) {
        let config = await this.prepareTcpConfigFile();
        try {
            await this.deleteTcpConfigServersForVirtualPorts(routesProfiles, accName, orgName, workspaceName, null, config);
           
            for(let i=0; i<routesProfiles.length; i++){
                if(routesProfiles[i].tcpStream) {   
                    // Create workspace upstream
                    let upstreamName = `us-${accName}-${orgName}-${workspaceName}-${routesProfiles[i].ns}-${routesProfiles[i].instanceName}-${routesProfiles[i].virtualPort}`.toLowerCase();

                    // Remove previous upstream server for workspace
                    if(config.nginx.upstream){
                        // If more than one upstream server
                        if(config.nginx.upstream._value == undefined) {
                            for(let y=0; y<config.nginx.upstream.length; y++) {
                                if(config.nginx.upstream[y]._value == upstreamName) {    
                                    config.nginx._remove('upstream', y);
                                }
                            }
                        } 
                        // If only one upstream server
                        else {
                            if(config.nginx.upstream._value == upstreamName) {    
                                config.nginx._remove('upstream');
                            }
                        }
                    }

                    // Now add workspace upstream servers
                    config.nginx._add('upstream', upstreamName);
                    clusterIps.forEach(o => {
                        if(config.nginx.upstream._value == undefined) {
                            config.nginx.upstream[config.nginx.upstream.length - 1]._add('server', `${o.ip}:${routesProfiles[i].virtualPort}`);
                        } else {
                            config.nginx.upstream._add('server', `${o.ip}:${routesProfiles[i].virtualPort}`);
                        }
                    });

                    let serverBaseName = `${accName}-${orgName}-${workspaceName}-${routesProfiles[i].ns}-${routesProfiles[i].instanceName}-${routesProfiles[i].virtualPort}`.toLowerCase();
                    // Now add server block(s) for this service / app
                    await this.addTcpServerBlock(
                        routesProfiles[i].localIp,
                        config,
                        routesProfiles[i].domain,
                        routesProfiles[i].ssl,
                        routesProfiles[i].virtualPort,
                        upstreamName,
                        serverBaseName
                    );
                }
            }
            
            config.flush();
            await _sleep(2000);
            let backupString = await this.saveAndApplyTcpProxyConfig(skipReload);
            return backupString;
        } catch (error) {
            let nginxConfigFileContentNew = `/usr/src/app/nginx/conf.d/tcp.conf.processing`;
            if (fs.existsSync(nginxConfigFileContentNew)) {
                fs.unlinkSync(nginxConfigFileContentNew);
            }
            throw error;
        }
    }

    /**
     * deleteTcpConfigServersForVirtualPorts
     * @param {*} routesToDel 
     * @param {*} accountName 
     * @param {*} orgName 
     * @param {*} workspaceName 
     * @param {*} serviceName 
     */
    static async deleteTcpConfigServersForVirtualPorts(routesToDel, accountName, orgName, workspaceName, serviceName, existingConfig, skipReload) {
       let config = null;
        if(!existingConfig)
            config = await this.prepareTcpConfigFile();
        else
            config = existingConfig;

        try {
            let _processServerCleanup = (_configServer, _upstreamBaseNameTcp, _index) => {
                if(_configServer.proxy_pass._value.indexOf(_upstreamBaseNameTcp) == 0) {
                    if(_index != null){
                        config.nginx._remove('server', _index);
                        return true;
                    } else {
                        config.nginx._remove('server');
                        return true;
                    }
                } else {
                    return false;
                }
            }

            // First remove the non-domain servers
            for(let z=0; z<routesToDel.length; z++) {
                if(routesToDel[z].tcpStream) {
                    // Create workspace upstream
                    let upstreamName = `us-${accountName}-${orgName}-${workspaceName}-${routesToDel[z].namespace ? routesToDel[z].namespace : routesToDel[z].ns}${serviceName ? ("-" + serviceName) : ""}${serviceName ? ("-" + routesToDel[z].virtualPort) : ""}`.toLowerCase();

                    // Remove previous upstream server for workspace
                    if(config.nginx.upstream){
                        // If more than one upstream server
                        if(config.nginx.upstream._value == undefined) {
                            for(let y=0; y<config.nginx.upstream.length; y++) {
                                if(config.nginx.upstream[y]._value == upstreamName) {    
                                    config.nginx._remove('upstream', y);
                                }
                            }
                        } 
                        // If only one upstream server
                        else {
                            if(config.nginx.upstream._value == upstreamName) {    
                                config.nginx._remove('upstream');
                            }
                        }
                    }

                    if(config.nginx.server){
                        let hasMoreServers = true;
                        while(config.nginx.server && hasMoreServers){
                            if(config.nginx.server.length) {   
                                for(let y=0; y<config.nginx.server.length; y++) {     
                                    // let removed = _processServerCleanup(config.nginx.server[y], null, routesToDel[z].virtualPort, y);
                                    let removed = _processServerCleanup(config.nginx.server[y], upstreamName, y);
                                    if(removed){
                                        y--;
                                    }
                                }
                                if(config.nginx.server.length) {
                                    hasMoreServers = false;
                                }
                            } else if(config.nginx.server) {
                                // _processServerCleanup(config.nginx.server, null, routesToDel[z].virtualPort, null);
                                _processServerCleanup(config.nginx.server, upstreamName, null);
                                hasMoreServers = false;
                            } else {
                                hasMoreServers = false;
                            }
                        }
                    }
                }
            }

            if(!existingConfig) {
                config.flush();
                await _sleep(2000);
                let backupString = await this.saveAndApplyTcpProxyConfig(skipReload);
                return backupString;
            }
        } catch (error) {
            if(!existingConfig) {
                let nginxConfigFileContentNew = `/usr/src/app/nginx/conf.d/tcp.conf.processing`;
                if (fs.existsSync(nginxConfigFileContentNew)) {
                    fs.unlinkSync(nginxConfigFileContentNew);
                }
            }
            throw error;
        }
    }

   /**
    * addTcpServerBlock
    * @param {*} localIp 
    * @param {*} config 
    * @param {*} domain 
    * @param {*} sslEnabled 
    * @param {*} virtualPort 
    * @param {*} upstreamName 
    * @param {*} serverBaseName 
    */
    static async addTcpServerBlock(localIp, config, domain, sslEnabled, virtualPort, upstreamName, serverBaseName) {
        // ------------ public service -----------
        if(domain && process.env.ENABLE_NGINX_STREAM_DOMAIN_NAME == "true"){
            config.nginx._add('server');
            let lanServerBlock = config.nginx.server.length ? config.nginx.server[config.nginx.server.length - 1] : config.nginx.server;
            
            if(domain.cert) {
                await OSController.execSilentCommand(`mkdir -p /certs/${domain.name}`);
                await OSController.execSilentCommand(`echo "${domain.cert.key}" > /certs/${domain.name}/fullchain.key`);
                await OSController.execSilentCommand(`echo "${domain.cert.crt}" > /certs/${domain.name}/privkey.crt`);
            }

            // See if any of this domains has HTTPS enabled
            lanServerBlock._add('listen', `${(domain.subdomain && domain.subdomain.length > 0) ? (domain.subdomain + ".") : ""}${domain.name}:${virtualPort}`);
            if (sslEnabled) {
                lanServerBlock._add('proxy_ssl', `on`);
                lanServerBlock._add('proxy_ssl_certificate', `/certs/users/${domain.name}/fullchain.crt`);
                lanServerBlock._add('proxy_ssl_certificate_key', `/certs/users/${domain.name}/privkey.key`);
            }
            lanServerBlock._add('proxy_pass', `${upstreamName}`);
        }

        // ---------- lan service ----------
        config.nginx._add('server');
        let lanServerBlock = config.nginx.server.length ? config.nginx.server[config.nginx.server.length - 1] : config.nginx.server;

        // See if any of this domains has HTTPS enabled
        lanServerBlock._add('listen', `${localIp}:${virtualPort}`);
        lanServerBlock._add('proxy_pass', `${upstreamName}`);
    }

    /**
     * saveAndApplyTcpProxyConfig
     * @param {*} skipReload 
     */
    static async saveAndApplyTcpProxyConfig(skipReload) {
        let nginxConfigFileContent = `/usr/src/app/nginx/conf.d/tcp.conf`;
        let nginxConfigFileContentNew = `/usr/src/app/nginx/conf.d/tcp.conf.processing`;
        let nginxConfigFileContentValide = `/usr/src/app/nginx/conf.d/tcp.valide`;
        let nginxConfigFileContentBack = `/usr/src/app/nginx/conf.d/tcp.back`;
        fs.copyFileSync(nginxConfigFileContent, nginxConfigFileContentBack);

        let backupString = fs.readFileSync(nginxConfigFileContent, 'utf8');
        if(fs.existsSync(nginxConfigFileContent)){
            fs.unlinkSync(nginxConfigFileContent);
        }
        fs.renameSync(nginxConfigFileContentNew, nginxConfigFileContent);
        try {
            if(!skipReload){
                await OSController.execSilentCommand("docker exec -t multipaas-nginx nginx -s reload");
                // If no errors, we make a copy of this last config to revert to if necessary
                fs.copyFileSync(nginxConfigFileContent, nginxConfigFileContentValide);
            }
            if(fs.existsSync(nginxConfigFileContentBack)){
                fs.unlinkSync(nginxConfigFileContentBack);
            }
            return backupString;
        } catch (error) {
            if(fs.existsSync(nginxConfigFileContent)){
                fs.unlinkSync(nginxConfigFileContent);
            }
            if(fs.existsSync(nginxConfigFileContentValide)){
                fs.copyFileSync(nginxConfigFileContentValide, nginxConfigFileContent);
            } else {
                fs.copyFileSync(nginxConfigFileContentBack, nginxConfigFileContent);
            }
            if(!skipReload){
                try { await OSController.execSilentCommand("docker exec -t multipaas-nginx nginx -s reload");} catch (_e) {}
            }   
            throw error;
        }   
    }

    /**
     * restoreTcpConfig
     * @param {*} backupString 
     */
    static async restoreTcpConfig(backupString) {
        let nginxConfigFileContent = `/usr/src/app/nginx/conf.d/tcp.conf`;
        if(fs.existsSync(nginxConfigFileContent)){
            fs.unlinkSync(nginxConfigFileContent);
        }
        fs.writeFileSync(nginxConfigFileContent, backupString);
        await OSController.execSilentCommand("docker exec -t multipaas-nginx nginx -s reload");
    }
}

module.exports = NGinxController;