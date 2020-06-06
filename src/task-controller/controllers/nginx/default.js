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
     * prepareHttpConfigFile
     */
    static prepareHttpConfigFile() {
        return new Promise((resolve, reject) => {
            (async () => {
                let nginxConfigFileContent = `/usr/src/app/nginx/conf.d/default.conf`;
                // let nginxConfigFileContent = `/usr/src/app/controllers/nginx/default.conf`;
                let workingTmpFile = nginxConfigFileContent + ".processing";
                if (fs.existsSync(nginxConfigFileContent)) {
                    if (fs.existsSync(workingTmpFile)) {
                        fs.unlinkSync(workingTmpFile);
                    }
                    fs.copyFileSync(nginxConfigFileContent, workingTmpFile);
                } else {
                    return reject(new Error("Could not find nginx config file"));
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
     * generateHttpProxyConfigForWorkspace
     * @param {*} workspaceId 
     * @param {*} accName 
     * @param {*} orgName 
     * @param {*} workspaceName 
     * @param {*} clusterIps 
     * @param {*} routesProfiles 
     * @param {*} reset 
     * @param {*} skipReload 
     */
    static async generateHttpProxyConfigForWorkspace(workspaceId, accName, orgName, workspaceName, clusterIps, routesProfiles, reset, skipReload) {
        let config = await this.prepareHttpConfigFile();
        try {
            // Create workspace upstream
            let upstreamName = `us-${accName}-${orgName}-${workspaceName}`;
            
            // Remove previous upstream server for workspace
            if(config.nginx.upstream){
                // If more than one upstream server
                if(config.nginx.upstream._value == undefined) {
                    for(let y=0; y<config.nginx.upstream.length; y++) {
                        if(reset || config.nginx.upstream[y]._value == upstreamName) {    
                            config.nginx._remove('upstream', y);
                        }
                    }
                } 
                // If only one upstream server
                else {
                    if(reset || config.nginx.upstream._value == upstreamName) {    
                        config.nginx._remove('upstream');
                    }
                }
            }

            // Now add workspace upstream servers
            config.nginx._add('upstream', upstreamName);
            clusterIps.forEach(o => {
                if(config.nginx.upstream._value == undefined) {
                    config.nginx.upstream[config.nginx.upstream.length - 1]._add('server', `${o.ip}:${o.port}`);
                } else {
                    config.nginx.upstream._add('server', `${o.ip}:${o.port}`);
                }
            });

            // Count available ports for each service
            let baseNamesPortCount = {};
            for(let i=0; i<routesProfiles.length; i++){
                if(!routesProfiles[i].tcpStream) {
                    let serverBaseName = `${accName}-${orgName}-${workspaceName}-${routesProfiles[i].ns}-${routesProfiles[i].instanceName}`.toLowerCase();
                    if(!baseNamesPortCount[serverBaseName]) {
                        baseNamesPortCount[serverBaseName] = 1;
                    } else {
                        baseNamesPortCount[serverBaseName] = baseNamesPortCount[serverBaseName]+1;
                    }
                }
            }

            // Remove previous occurences of this server first
            await this.deleteHttpConfigServersForVirtualPorts(routesProfiles, accName, orgName, workspaceName, null, config);
           
            for(let i=0; i<routesProfiles.length; i++){
                if(!routesProfiles[i].tcpStream) {
                    let serverBaseName = `${accName}-${orgName}-${workspaceName}-${routesProfiles[i].ns}-${routesProfiles[i].instanceName}`.toLowerCase();
                    if(baseNamesPortCount[serverBaseName] > 1){
                        serverBaseName = `${serverBaseName}-${routesProfiles[i].port}`;
                    }

                    // Now add server block(s) for this service / app
                    await this.addHttpServerBlock(
                        routesProfiles[i].localIp,
                        config,
                        routesProfiles[i].domain,
                        routesProfiles[i].subdomain,
                        routesProfiles[i].ssl,
                        routesProfiles[i].virtualPort,
                        upstreamName,
                        serverBaseName
                    );
                }
            }
           
            config.flush();
          
            await _sleep(2000);
            let backupString = await this.saveAndApplyHttpProxyConfig(skipReload);
           
            return backupString;
        } catch (error) {
            let nginxConfigFileContentNew = `/usr/src/app/nginx/conf.d/default.conf.processing`;
            if (fs.existsSync(nginxConfigFileContentNew)) {
                fs.unlinkSync(nginxConfigFileContentNew);
            }
            throw error;
        }
    }

    /**
     * deleteHttpConfigServersForVirtualPorts
     * @param {*} routesToDel 
     * @param {*} accountName 
     * @param {*} orgName 
     * @param {*} workspaceName 
     * @param {*} serviceName 
     */
    static async deleteHttpConfigServersForVirtualPorts(routesToDel, accountName, orgName, workspaceName, serviceName, existingConfig, skipReload) {
        let config = null;
        if(!existingConfig)
            config = await this.prepareHttpConfigFile();
        else
            config = existingConfig;

        try {
            let _processServerCleanup = (_configServer, _serverHostNameHttp, _index) => {
                let _doDel = false;
                for(let y=0; y<_configServer.location.proxy_set_header.length; y++) {
                    if(_configServer.location.proxy_set_header[y]._value.indexOf(_serverHostNameHttp) != -1) {
                        _doDel = true;
                    }
                }
                if(_doDel) {
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

            // First we remove the servers without domain names
            for(let z=0; z<routesToDel.length; z++) {
                if(!routesToDel[z].tcpStream) {

                    let serverHostNameHttp = `Host ${accountName}-${orgName}-${workspaceName}-${routesToDel[z].namespace ? routesToDel[z].namespace : routesToDel[z].ns}${serviceName ? ("-" + serviceName) : ""}`;
                    if(config.nginx.server){
                        let hasMoreServers = true;
                        while(config.nginx.server && hasMoreServers){

                            if(config.nginx.server.length) {   
                                for(let y=0; y<config.nginx.server.length; y++) {     
                                    // let removed = _processServerCleanup(config.nginx.server[y], null, routesToDel[z].virtualPort, y);
                                    let removed = _processServerCleanup(config.nginx.server[y], serverHostNameHttp, y);
                                    if(removed){
                                        y--;
                                    }
                                }
                                if(config.nginx.server.length) {
                                    hasMoreServers = false;
                                }
                            } else if(config.nginx.server) {
                                // _processServerCleanup(config.nginx.server, null, routesToDel[z].virtualPort, null);
                                _processServerCleanup(config.nginx.server, serverHostNameHttp, null);
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
                let backupString = await this.saveAndApplyHttpProxyConfig(skipReload);
                return backupString;
            }
        } catch (error) {
            if(!existingConfig) {
                let nginxConfigFileContentNew = `/usr/src/app/nginx/conf.d/default.conf.processing`;
                if (fs.existsSync(nginxConfigFileContentNew)) {
                    fs.unlinkSync(nginxConfigFileContentNew);
                }
            }
            throw error;
        }
    }

    /**
     * addHttpServerBlock
     * @param {*} localIp 
     * @param {*} config 
     * @param {*} domain 
     * @param {*} subdomain 
     * @param {*} sslEnabled 
     * @param {*} virtualPort 
     * @param {*} upstreamName 
     * @param {*} serverBaseName 
     */
    static async addHttpServerBlock(localIp, config, domain, subdomain, sslEnabled, virtualPort, upstreamName, serverBaseName) {
        // ------------ public service -----------
        if(domain){
            config.nginx._add('server');
            let publicServerBlock = config.nginx.server.length ? config.nginx.server[config.nginx.server.length - 1] : config.nginx.server;
            publicServerBlock._add('server_name', `${(subdomain && subdomain.length > 0) ? (subdomain + ".") : ""}${domain.name}`);

            if(domain.cert) {
                await OSController.execSilentCommand(`mkdir -p /certs/${domain.name}`);
                await OSController.execSilentCommand(`echo "${domain.cert.crt}" > /certs/${domain.name}/fullchain.crt`);
                await OSController.execSilentCommand(`echo "${domain.cert.key}" > /certs/${domain.name}/privkey.key`);
            }

            publicServerBlock._add('client_max_body_size', '0');
            publicServerBlock._add('chunked_transfer_encoding', 'on');
            publicServerBlock._add('access_log', 'off');
            publicServerBlock._add('underscores_in_headers', 'on');

            // See if any of this domains has HTTPS enabled
            if (sslEnabled) {
                publicServerBlock._add('listen', '443 ssl');
                publicServerBlock._add('ssl_certificate', `/certs/users/${domain.name}/fullchain.crt`);
                publicServerBlock._add('ssl_certificate_key', `/certs/users/${domain.name}/privkey.key`);
                // publicServerBlock._add('include', `/certs/nginx.conf`);
                // publicServerBlock._add('ssl_dhparam', `/certs/ssl-dhparams.pem`);
            } else {
                publicServerBlock._add('listen', "80");
            }

            publicServerBlock._add('location', '/');
            let targetLocation = publicServerBlock.location.length ? publicServerBlock.location[publicServerBlock.location.length - 1] : publicServerBlock.location;
            targetLocation._add('proxy_pass', `http://${upstreamName}`);
            targetLocation._add('proxy_bind', '$server_addr');
            targetLocation._add('proxy_set_header', `Host ${serverBaseName}.${domain.name}`);
            targetLocation._add('proxy_set_header', 'X-Forwarded-For  $remote_addr');
            targetLocation._add('proxy_set_header', 'X-Real-IP        $remote_addr');
            targetLocation._add('proxy_set_header', 'X-Client-Verify  SUCCESS');
            targetLocation._add('proxy_set_header', 'Upgrade $http_upgrade');
            targetLocation._add('proxy_set_header', 'Connection "Upgrade"');
            if (sslEnabled) {
                targetLocation._add('proxy_set_header', 'X-Client-DN      $ssl_client_s_dn');
                targetLocation._add('proxy_set_header', 'X-SSL-Subject    $ssl_client_s_dn');
                targetLocation._add('proxy_set_header', 'X-SSL-Issuer     $ssl_client_i_dn');
            }
            targetLocation._add('proxy_read_timeout', '1800');
            targetLocation._add('proxy_connect_timeout', '1800');
        }

        // ---------- lan service ----------
        config.nginx._add('server');
        let lanServerBlock = config.nginx.server.length ? config.nginx.server[config.nginx.server.length - 1] : config.nginx.server;
        lanServerBlock._add('listen', `${localIp}:${virtualPort} default_server`);
        lanServerBlock._add('client_max_body_size', `0`);
        lanServerBlock._add('chunked_transfer_encoding', `on`);
        lanServerBlock._add('access_log', 'off');
        lanServerBlock._add('underscores_in_headers', 'on');

        lanServerBlock._add('location', '/');
        let lanTargetLocation = lanServerBlock.location.length ? lanServerBlock.location[lanServerBlock.location.length - 1] : lanServerBlock.location;
        lanTargetLocation._add('proxy_pass', `http://${upstreamName}`);
        lanTargetLocation._add('proxy_bind', '$server_addr');
        lanTargetLocation._add('proxy_set_header', `Host ${serverBaseName}${domain ? ("."+domain.name) : ""}`);
        lanTargetLocation._add('proxy_set_header', 'X-Forwarded-For  $remote_addr');
        lanTargetLocation._add('proxy_set_header', 'X-Real-IP        $remote_addr');
        lanTargetLocation._add('proxy_set_header', 'X-Client-Verify  SUCCESS');
        lanTargetLocation._add('proxy_set_header', 'Upgrade $http_upgrade');
        lanTargetLocation._add('proxy_set_header', 'Connection "Upgrade"');
        lanTargetLocation._add('proxy_read_timeout', '1800');
        lanTargetLocation._add('proxy_connect_timeout', '1800');
    }

    /**
     * saveAndApplyHttpProxyConfig
     * @param {*} skipReload 
     */
    static async saveAndApplyHttpProxyConfig(skipReload) {
        let nginxConfigFileContent = `/usr/src/app/nginx/conf.d/default.conf`;
        let nginxConfigFileContentNew = `/usr/src/app/nginx/conf.d/default.conf.processing`;
        let nginxConfigFileContentValide = `/usr/src/app/nginx/conf.d/default.valide`;
        let nginxConfigFileContentBack = `/usr/src/app/nginx/conf.d/default.back`;
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
     * restoreHttpConfig
     * @param {*} backupString 
     */
    static async restoreHttpConfig(backupString) {
        let nginxConfigFileContent = `/usr/src/app/nginx/conf.d/default.conf`;
        if(fs.existsSync(nginxConfigFileContent)){
            fs.unlinkSync(nginxConfigFileContent);
        }
        fs.writeFileSync(nginxConfigFileContent, backupString);
        await OSController.execSilentCommand("docker exec -t multipaas-nginx nginx -s reload");
    }
}

module.exports = NGinxController;