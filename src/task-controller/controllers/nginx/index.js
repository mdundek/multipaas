const NginxConfFile = require('nginx-conf').NginxConfFile;
const DBController = require('../db/index');
const fs = require("fs");
const path = require("path");
const OSController = require('../os/index');

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
     * prepareHttpConfigFile
     */
    static prepareHttpConfigFile() {
        return new Promise((resolve, reject) => {
            (async () => {
                let nginxConfigFileContent = `/usr/src/app/nginx/conf.d/default.conf`;
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
     * generateHttpProxyConfig
     * @param {*} workspaceId 
     * @param {*} accName 
     * @param {*} orgName 
     * @param {*} workspaceName 
     * @param {*} clusterIps 
     * @param {*} routesProfiles 
     * @param {*} reset 
     * @param {*} skipReload 
     */
    static async generateHttpProxyConfig(workspaceId, accName, orgName, workspaceName, clusterIps, routesProfiles, reset, skipReload) {
        // If already processing, wait for processing to be done before moving on
        while(bussy){
            await _sleep(2000);
        }

        bussy = true;
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

            // Helper function to clean server if necessary
            let _processServerCleanup = (configServer, _serverName, _serverListen, index) => {
                if( reset || (_serverName && configServer.server_name && (configServer.listen._value == _serverListen || configServer.server_name._value.indexOf(`${_serverName}`) == 0))) {    
                    if(index != null){
                        config.nginx._remove('server', index);
                        return true;
                    } else {
                        config.nginx._remove('server');
                        return true;
                    }
                }  else if( _serverListen && !configServer.server_name && configServer.listen._value == _serverListen) {
                    if(index != null){
                        config.nginx._remove('server', index);
                        return true;
                    } else {
                        config.nginx._remove('server');
                        return true;
                    }
                } else {
                    return false;
                }
            }

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
            
            // Lets remove local virtual ports servers first
            let virtualPorts = await DBController.getVirtualPortsForWorkspace(workspaceId);
            for(let z=0; z<virtualPorts.length; z++) {
                for(let i=0; i<routesProfiles.length; i++){     
                    if(!routesProfiles[i].tcpStream) {
                        if(config.nginx.server){
                            let hasMoreServers = true;
                            while(config.nginx.server && hasMoreServers){
                                if(config.nginx.server.length) {   
                                    for(let y=0; y<config.nginx.server.length; y++) {     
                                        let removed = _processServerCleanup(config.nginx.server[y], null, `${routesProfiles[i].localIp}:${virtualPorts[z].virtualPort} default_server`, y);
                                        if(removed){
                                            y--;
                                        }
                                    }
                                    if(config.nginx.server.length) {
                                        hasMoreServers = false;
                                    }
                                } else if(config.nginx.server) {
                                    _processServerCleanup(config.nginx.server, null, `${routesProfiles[i].localIp}:${virtualPorts[z].virtualPort} default_server`, null);
                                    hasMoreServers = false;
                                } else {
                                    hasMoreServers = false;
                                }
                            }
                        }
                    }
                }
            }
            
            // Now we remove the domain servers
            let workspaceSubName = `${accName}-${orgName}-${workspaceName}-`.toLowerCase();
            for(let i=0; i<routesProfiles.length; i++){
                if(!routesProfiles[i].tcpStream) {
                    if(config.nginx.server){
                        let hasMoreServers = true;
                        while(config.nginx.server && hasMoreServers){
                            if(config.nginx.server.length) {
                                for(let y=0; y<config.nginx.server.length; y++) {
                                    let removed = _processServerCleanup(config.nginx.server[y], workspaceSubName, null, y);
                                    if(removed){
                                        y--;
                                    }
                                }
                                if(config.nginx.server.length) {
                                    hasMoreServers = false;
                                }
                            } else if(config.nginx.server) {
                                _processServerCleanup(config.nginx.server, workspaceSubName, null, null);
                                hasMoreServers = false;
                            } else {
                                hasMoreServers = false;
                            }
                        }
                    }
                }
            }
           
            for(let i=0; i<routesProfiles.length; i++){
                if(!routesProfiles[i].tcpStream) {
                    let serverBaseName = `${accName}-${orgName}-${workspaceName}-${routesProfiles[i].ns}-${routesProfiles[i].instanceName}`.toLowerCase();
                    if(baseNamesPortCount[serverBaseName] > 1){
                        serverBaseName = `${serverBaseName}-${routesProfiles[i].port}`;
                    }

                    // Now add server block(s) for this service / app
                    this.addHttpServerBlock(
                        routesProfiles[i].localIp,
                        config,
                        routesProfiles[i].domain ? routesProfiles[i].domain.name : null,
                        routesProfiles[i].ssl,
                        routesProfiles[i].virtualPort,
                        upstreamName,
                        serverBaseName
                    );
                }
            }
           
            config.flush();
          
            await _sleep(2000);
            let backupString = await this.deployHttpConfigFile(skipReload);
           
            return backupString;
        } catch (error) {
            let nginxConfigFileContentNew = `/usr/src/app/nginx/conf.d/default.conf.processing`;
            if (fs.existsSync(nginxConfigFileContentNew)) {
                fs.unlinkSync(nginxConfigFileContentNew);
            }
            bussy = false;
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
    static async deleteHttpConfigServersForVirtualPorts(routesToDel, accountName, orgName, workspaceName, serviceName) {
        // If already processing, wait for processing to be done before moving on
        while(bussy){
            await _sleep(2000);
        }

        bussy = true;
        let config = await this.prepareHttpConfigFile();
        
        try {
            // Helper function to clean server if necessary
            let _processServerCleanup = (configServer, _serverName, _virtualPort, index) => {
                if((_serverName && configServer.server_name && configServer.server_name._value.indexOf(`${_serverName}`) == 0)) {    
                    if(index != null){
                        config.nginx._remove('server', index);
                        return true;
                    } else {
                        config.nginx._remove('server');
                        return true;
                    }
                } else if( _virtualPort && !configServer.server_name && configServer.listen._value.indexOf(`:${_virtualPort} default_server`) != -1) {
                    if(index != null){
                        config.nginx._remove('server', index);
                        return true;
                    } else {
                        config.nginx._remove('server');
                        return true;
                    }
                } else {
                    return false;
                }
            }

            for(let z=0; z<routesToDel.length; z++) {
                if(config.nginx.server){
                    let hasMoreServers = true;
                    while(config.nginx.server && hasMoreServers){
                        if(config.nginx.server.length) {   
                            for(let y=0; y<config.nginx.server.length; y++) {     
                                let removed = _processServerCleanup(config.nginx.server[y], null, routesToDel[z].virtualPort, y);
                                if(removed){
                                    y--;
                                }
                            }
                            if(config.nginx.server.length) {
                                hasMoreServers = false;
                            }
                        } else if(config.nginx.server) {
                            _processServerCleanup(config.nginx.server, null, routesToDel[z].virtualPort, null);
                            hasMoreServers = false;
                        } else {
                            hasMoreServers = false;
                        }
                    }
                }
            }
           
            for(let z=0; z<routesToDel.length; z++) {
                // Now we remove the domain servers
                let workspaceSubName = `${accountName}-${orgName}-${workspaceName}-${routesToDel[z].namespace}-${serviceName}`.toLowerCase();
                if(config.nginx.server){
                    let hasMoreServers = true;
                    while(config.nginx.server && hasMoreServers){
                        if(config.nginx.server.length) {
                            for(let y=0; y<config.nginx.server.length; y++) {
                                let removed = _processServerCleanup(config.nginx.server[y], workspaceSubName, null, y);
                                if(removed){
                                    y--;
                                }
                            }
                            if(config.nginx.server.length) {
                                hasMoreServers = false;
                            }
                        } else if(config.nginx.server) {
                            _processServerCleanup(config.nginx.server, workspaceSubName, null, null);
                            hasMoreServers = false;
                        } else {
                            hasMoreServers = false;
                        }
                    }
                }
            }
            
            config.flush();
          
            await _sleep(2000);
            
            let backupString = await this.deployHttpConfigFile();

            bussy = false;
            return backupString;
        } catch (error) {
            let nginxConfigFileContentNew = `/usr/src/app/nginx/conf.d/default.conf.processing`;
            if (fs.existsSync(nginxConfigFileContentNew)) {
                fs.unlinkSync(nginxConfigFileContentNew);
            }
            bussy = false;
            throw error;
        }
    }

    /**
     * addHttpServerBlock
     * @param {*} localIp 
     * @param {*} config 
     * @param {*} domainName 
     * @param {*} sslEnabled 
     * @param {*} virtualPort 
     * @param {*} upstreamName 
     * @param {*} serverBaseName 
     */
    static addHttpServerBlock(localIp, config, domainName, sslEnabled, virtualPort, upstreamName, serverBaseName) {
        // ------------ public service -----------
        if(domainName){
            config.nginx._add('server');
            let publicServerBlock = config.nginx.server.length ? config.nginx.server[config.nginx.server.length - 1] : config.nginx.server;
            publicServerBlock._add('server_name', `${serverBaseName}.${domainName}`);
            publicServerBlock._add('client_max_body_size', '0');
            publicServerBlock._add('chunked_transfer_encoding', 'on');
            publicServerBlock._add('access_log', 'off');
            publicServerBlock._add('underscores_in_headers', 'on');

            // See if any of this domains has HTTPS enabled
            if (sslEnabled) {
                publicServerBlock._add('listen', '443 ssl');
                publicServerBlock._add('ssl_certificate', `/etc/letsencrypt/${domainName}/fullchain.pem`);
                publicServerBlock._add('ssl_certificate_key', `/etc/letsencrypt/${domainName}/privkey.pem`);
                publicServerBlock._add('include', `/etc/letsencrypt/options-ssl-nginx.conf`);
                publicServerBlock._add('ssl_dhparam', `/etc/letsencrypt/ssl-dhparams.pem`);
            } else {
                publicServerBlock._add('listen', "80");
            }

            publicServerBlock._add('location', '/');
            let targetLocation = publicServerBlock.location.length ? publicServerBlock.location[publicServerBlock.location.length - 1] : publicServerBlock.location;
            targetLocation._add('proxy_pass', `http://${upstreamName}`);
            targetLocation._add('proxy_bind', '$server_addr');
            targetLocation._add('proxy_set_header', `Host ${serverBaseName}.${domainName}`);
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
        lanTargetLocation._add('proxy_set_header', `Host ${serverBaseName}${domainName ? "."+domainName:""}`);
        lanTargetLocation._add('proxy_set_header', 'X-Forwarded-For  $remote_addr');
        lanTargetLocation._add('proxy_set_header', 'X-Real-IP        $remote_addr');
        lanTargetLocation._add('proxy_set_header', 'X-Client-Verify  SUCCESS');
        lanTargetLocation._add('proxy_set_header', 'Upgrade $http_upgrade');
        lanTargetLocation._add('proxy_set_header', 'Connection "Upgrade"');
        lanTargetLocation._add('proxy_read_timeout', '1800');
        lanTargetLocation._add('proxy_connect_timeout', '1800');
    }

    /**
     * deployHttpConfigFile
     */
    static async deployHttpConfigFile(skipReload) {
        let nginxConfigFileContent = `/usr/src/app/nginx/conf.d/default.conf`;
        let nginxConfigFileContentNew = `/usr/src/app/nginx/conf.d/default.conf.processing`;
       
        let nginxConfigFileContentBack = `/usr/src/app/nginx/conf.d/default.back`;
        fs.copyFileSync(nginxConfigFileContent, nginxConfigFileContentBack);

        let backupString = fs.readFileSync(nginxConfigFileContent, 'utf8');

        if(fs.existsSync(nginxConfigFileContent)){
            fs.unlinkSync(nginxConfigFileContent);
        }
        fs.renameSync(nginxConfigFileContentNew, nginxConfigFileContent);

        try {
            if(!skipReload){
                await OSController.execSilentCommand("docker exec -t mycloud-nginx nginx -s reload");
            }
            
            if(fs.existsSync(nginxConfigFileContentBack)){
                fs.unlinkSync(nginxConfigFileContentBack);
            }
            return backupString;
        } catch (error) {
            if(fs.existsSync(nginxConfigFileContent)){
                fs.unlinkSync(nginxConfigFileContent);
            }
            fs.copyFileSync(nginxConfigFileContentBack, nginxConfigFileContent);
            if(!skipReload){
                try { await OSController.execSilentCommand("docker exec -t mycloud-nginx nginx -s reload");} catch (_e) {}
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
        await OSController.execSilentCommand("docker exec -t mycloud-nginx nginx -s reload");
        bussy = false;
    }

    /**
     * prepareTcpConfigFile
     */
    static prepareTcpConfigFile() {
        return new Promise((resolve, reject) => {
            (async () => {
                let nginxConfigFileContent = `/usr/src/app/nginx/conf.d/tcp.conf`;
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
     * generateTcpProxyConfig
     * @param {*} workspaceId 
     * @param {*} accName 
     * @param {*} orgName 
     * @param {*} workspaceName 
     * @param {*} clusterIps 
     * @param {*} routesProfiles 
     * @param {*} reset 
     * @param {*} skipReload 
     */
    static async generateTcpProxyConfig(workspaceId, accName, orgName, workspaceName, clusterIps, routesProfiles, skipReload) {
        // If already processing, wait for processing to be done before moving on
        while(bussy){
            await _sleep(2000);
        }

        bussy = true;
        let config = await this.prepareTcpConfigFile();
  
        try {
            // Remove previous occurences of this server first

            // Helper function to clean server if necessary
            let _processServerCleanup = (configServer, _serverListen, index) => {
                if(configServer.listen._value == _serverListen || configServer.listen._value.indexOf(`${_serverListen}`) == 0) {
                    if(index != null){
                        config.nginx._remove('server', index);
                        return true;
                    } else {
                        config.nginx._remove('server');
                        return true;
                    }
                } else {
                    return false;
                }
            }
            
            let virtualPorts = await DBController.getVirtualPortsForWorkspace(workspaceId);
            // Lets remove local virtual ports servers first
            for(let z=0; z<virtualPorts.length; z++) {
                for(let i=0; i<routesProfiles.length; i++){  
                    if(routesProfiles[i].tcpStream) {   
                        if(config.nginx.server){
                            let hasMoreServers = true;
                            while(config.nginx.server && hasMoreServers){
                                if(config.nginx.server.length) {   
                                    for(let y=0; y<config.nginx.server.length; y++) {     
                                        let removed = _processServerCleanup(config.nginx.server[y], `${routesProfiles[i].localIp}:${virtualPorts[z].virtualPort}`, y);
                                        if(removed){
                                            y--;
                                        }
                                    }
                                    if(config.nginx.server.length) {
                                        hasMoreServers = false;
                                    }
                                } else if(config.nginx.server) {
                                    _processServerCleanup(config.nginx.server, `${routesProfiles[i].localIp}:${virtualPorts[z].virtualPort}`, null);
                                    hasMoreServers = false;
                                } else {
                                    hasMoreServers = false;
                                }
                            }
                        }
                    }
                }
            }
           
            // Now we remove the domain servers
            let workspaceSubName = `${accName}-${orgName}-${workspaceName}-`;
            for(let i=0; i<routesProfiles.length; i++){
                if(routesProfiles[i].tcpStream) {   
                    if(config.nginx.server){
                        let hasMoreServers = true;
                        while(config.nginx.server && hasMoreServers){
                            if(config.nginx.server.length) {
                                for(let y=0; y<config.nginx.server.length; y++) {
                                    let removed = _processServerCleanup(config.nginx.server[y], workspaceSubName, y);
                                    if(removed){
                                        y--;
                                    }
                                }
                                if(config.nginx.server.length) {
                                    hasMoreServers = false;
                                }
                            } else if(config.nginx.server) {
                                _processServerCleanup(config.nginx.server, workspaceSubName, null);
                                hasMoreServers = false;
                            } else {
                                hasMoreServers = false;
                            }
                        }
                    }
                }
            }
           
            for(let i=0; i<routesProfiles.length; i++){
                if(routesProfiles[i].tcpStream) {   
                    // Create workspace upstream
                    let upstreamName = `us-${accName}-${orgName}-${workspaceName}-${routesProfiles[i].instanceName}-${routesProfiles[i].ns}-${routesProfiles[i].virtualPort}`.toLowerCase();

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

                    let serverBaseName = `${accName}-${orgName}-${workspaceName}-${routesProfiles[i].instanceName}-${routesProfiles[i].ns}-${routesProfiles[i].virtualPort}`.toLowerCase();
                    // Now add server block(s) for this service / app
                    this.addTcpServerBlock(
                        routesProfiles[i].localIp,
                        config,
                        routesProfiles[i].domain ? routesProfiles[i].domain.name : null,
                        routesProfiles[i].ssl,
                        routesProfiles[i].virtualPort,
                        upstreamName,
                        serverBaseName
                    );
                }
            }
            
            config.flush();
            await _sleep(2000);
            let backupString = await this.deployTcpConfigFile(skipReload);
            return backupString;
        } catch (error) {
            let nginxConfigFileContentNew = `/usr/src/app/nginx/conf.d/tcp.conf.processing`;
            if (fs.existsSync(nginxConfigFileContentNew)) {
                fs.unlinkSync(nginxConfigFileContentNew);
            }
            bussy = false;
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
    static async deleteTcpConfigServersForVirtualPorts(routesToDel, accountName, orgName, workspaceName, serviceName) {
        // If already processing, wait for processing to be done before moving on
        while(bussy){
            await _sleep(2000);
        }

        bussy = true;
        let config = await this.prepareTcpConfigFile();

        try {
            

            // Helper function to clean server if necessary
            let _processServerCleanup = (configServer, _serverName, _virtualPort, index) => {
                if((_serverName && configServer.listen._value.indexOf(`${_serverName}`) == 0)) {    
                    if(index != null){
                        config.nginx._remove('server', index);
                        return true;
                    } else {
                        config.nginx._remove('server');
                        return true;
                    }
                } else if( _virtualPort && configServer.listen._value.indexOf(`:${_virtualPort}`) != -1) {
                    if(index != null){
                        config.nginx._remove('server', index);
                        return true;
                    } else {
                        config.nginx._remove('server');
                        return true;
                    }
                } else {
                    return false;
                }
            }

            for(let z=0; z<routesToDel.length; z++) {
                // Create workspace upstream
                let upstreamName = `us-${accountName}-${orgName}-${workspaceName}-${routesToDel[z].namespace}-${serviceName}-${routesToDel[z].virtualPort}`.toLowerCase();

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
                                let removed = _processServerCleanup(config.nginx.server[y], null, routesToDel[z].virtualPort, y);
                                if(removed){
                                    y--;
                                }
                            }
                            if(config.nginx.server.length) {
                                hasMoreServers = false;
                            }
                        } else if(config.nginx.server) {
                            _processServerCleanup(config.nginx.server, null, routesToDel[z].virtualPort, null);
                            hasMoreServers = false;
                        } else {
                            hasMoreServers = false;
                        }
                    }
                }
            }

            // Now we remove the domain servers
            for(let z=0; z<routesToDel.length; z++) {
                let workspaceSubName = `${accountName}-${orgName}-${workspaceName}-${routesToDel[z].namespace}-${serviceName}-${routesToDel[z].virtualPort}`.toLowerCase();
                if(config.nginx.server){
                    let hasMoreServers = true;
                    while(config.nginx.server && hasMoreServers){
                        if(config.nginx.server.length) {
                            for(let y=0; y<config.nginx.server.length; y++) {
                                let removed = _processServerCleanup(config.nginx.server[y], workspaceSubName, null, y);
                                if(removed){
                                    y--;
                                }
                            }
                            if(config.nginx.server.length) {
                                hasMoreServers = false;
                            }
                        } else if(config.nginx.server) {
                            _processServerCleanup(config.nginx.server, workspaceSubName, null, null);
                            hasMoreServers = false;
                        } else {
                            hasMoreServers = false;
                        }
                    }
                }
            }

            config.flush();
          
            await _sleep(2000);
            let backupString = await this.deployTcpConfigFile();
            bussy = false;
            return backupString;
        } catch (error) {
            let nginxConfigFileContentNew = `/usr/src/app/nginx/conf.d/tcp.conf.processing`;
            if (fs.existsSync(nginxConfigFileContentNew)) {
                fs.unlinkSync(nginxConfigFileContentNew);
            }
            bussy = false;
            throw error;
        }
    }

    /**
     * addTcpServerBlock
     * @param {*} localIp 
     * @param {*} config 
     * @param {*} domainName 
     * @param {*} sslEnabled 
     * @param {*} virtualPort 
     * @param {*} upstreamName 
     * @param {*} serverBaseName 
     */
    static addTcpServerBlock(localIp, config, domainName, sslEnabled, virtualPort, upstreamName, serverBaseName) {
        // ------------ public service -----------
        if(domainName && process.env.ENABLE_NGINX_STREAM_DOMAIN_NAME == "true"){
            config.nginx._add('server');
            let lanServerBlock = config.nginx.server.length ? config.nginx.server[config.nginx.server.length - 1] : config.nginx.server;

            // See if any of this domains has HTTPS enabled
            lanServerBlock._add('listen', `${serverBaseName}.${domainName}:${virtualPort}`);
            if (sslEnabled) {
                lanServerBlock._add('proxy_ssl', `on`);
                lanServerBlock._add('proxy_ssl_certificate', `/etc/letsencrypt/${domainName}/fullchain.pem`);
                lanServerBlock._add('proxy_ssl_certificate_key', `/etc/letsencrypt/${domainName}/privkey.pem`);
            }
            lanServerBlock._add('proxy_pass', `${upstreamName}`);
        }

        // ---------- lan service ----------
        config.nginx._add('server');
        let lanServerBlock = config.nginx.server.length ? config.nginx.server[config.nginx.server.length - 1] : config.nginx.server;

        // See if any of this domains has HTTPS enabled
        lanServerBlock._add('listen', `${localIp}:${virtualPort}`);
        // if (sslEnabled) {
        //     lanServerBlock._add('proxy_ssl', `on`);
        //     lanServerBlock._add('proxy_ssl_certificate', `/etc/letsencrypt/${domainName}/fullchain.pem`);
        //     lanServerBlock._add('proxy_ssl_certificate_key', `/etc/letsencrypt/${domainName}/privkey.pem`);
        // }
        lanServerBlock._add('proxy_pass', `${upstreamName}`);
    }

    /**
     * deployTcpConfigFile
     */
    static async deployTcpConfigFile(skipReload) {
        let nginxConfigFileContent = `/usr/src/app/nginx/conf.d/tcp.conf`;
        let nginxConfigFileContentNew = `/usr/src/app/nginx/conf.d/tcp.conf.processing`;

        let nginxConfigFileContentBack = `/usr/src/app/nginx/conf.d/tcp.back`;
        fs.copyFileSync(nginxConfigFileContent, nginxConfigFileContentBack);

        let backupString = fs.readFileSync(nginxConfigFileContent, 'utf8');

        if(fs.existsSync(nginxConfigFileContent)){
            fs.unlinkSync(nginxConfigFileContent);
        }
        fs.renameSync(nginxConfigFileContentNew, nginxConfigFileContent);

        // console.log(fs.readFileSync(nginxConfigFileContent, 'utf8'));

        try {
            if(!skipReload){
                await OSController.execSilentCommand("docker exec -t mycloud-nginx nginx -s reload");
            }
            if(fs.existsSync(nginxConfigFileContentBack)){
                fs.unlinkSync(nginxConfigFileContentBack);
            }
           
            return backupString;
        } catch (error) {
            if(fs.existsSync(nginxConfigFileContent)){
                fs.unlinkSync(nginxConfigFileContent);
            }
            fs.copyFileSync(nginxConfigFileContentBack, nginxConfigFileContent);
            if(!skipReload){
                try { await OSController.execSilentCommand("docker exec -t mycloud-nginx nginx -s reload");} catch (_e) {}
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
        await OSController.execSilentCommand("docker exec -t mycloud-nginx nginx -s reload");
        bussy = false;
    }

    /**
     * reloadConfig
     */
    static async reloadConfig() {
        await OSController.execSilentCommand("docker exec -t mycloud-nginx nginx -s reload"); 
    }

    /**
     * release
     */
    static release() {
        bussy = false;
    }
}

module.exports = NGinxController;