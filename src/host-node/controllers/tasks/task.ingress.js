const TaskRuntimeController = require('./task.runtime');

const OSController = require("../os/index");
const DBController = require("../db/index");

const shortid = require('shortid');
shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$@');
const path = require('path');
const fs = require('fs');
const YAML = require('yaml');

// const ssh = new node_ssh();

// Sleep promise for async
let _sleep = (duration) => {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, duration);
    });
}

let _normalizeName = (base) => {
    base = base.replace(/[^a-z0-9+]+/gi, '-');
    return base;
}

class TaskIngressController {
    
    /**
     * init
     */
    static init(parent, mqttController) {
        this.parent = parent;
        this.mqttController = mqttController;
    }

     /**
     * requestUpdateClusterIngressRules
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestUpdateClusterIngressRules(topicSplit, data) {
        let backupConfigs = [];
        let newConfigs = [];
        try {
            let org = await DBController.getOrgForWorkspace(data.node.workspaceId);
            let account = await DBController.getAccountForOrg(org.id);

            // Services first
            let services = await DBController.getServicesForWsRoutes(data.node.workspaceId);

            if(data.scope.services) {
                let targetServicesHttp = services.filter(o => {
                    return  o.namespace == data.ns && 
                            !o.tcpStream && 
                            (
                                data.scope.serviceId == null || 
                                data.scope.serviceId == undefined || 
                                data.scope.serviceId == o.id
                            );
                });
                
                if(targetServicesHttp.length > 0) {
                    await this.updateClusterIngressRulesForNsServicesHTTP(
                        data, 
                        org, 
                        account, 
                        targetServicesHttp, 
                        (backupConfig) => {
                            backupConfigs.push(backupConfig);
                        },
                        (newConfig) => {
                            newConfigs.push(newConfig);
                        }
                    );
                }
            }

            // Now applications
            let applications = await DBController.getApplicationsForWs(data.node.workspaceId);
            let applicationRoutes = await DBController.getApplicationRoutesForWs(data.node.workspaceId);
            let applicationVersions = await DBController.getApplicationVersionsForWs(data.node.workspaceId);

            if(data.scope.apps) {
                // Build application objects for HTTP
                let allApplicationsHttp = applications.map(application => {
                    return {
                        id: application.id,
                        name: application.name,
                        namespace: application.namespace,
                        workspaceName: application.workspaceName,
                        routes: applicationRoutes.filter(o => o.applicationId == application.id && !o.tcpStream).map(route => {
                            return {
                                port: route.port,
                                virtualPort: route.virtualPort,
                                serviceType: route.serviceType,
                                tcpStream: route.tcpStream,
                                domainName: route.domainName,
                                subdomain: route.subdomain
                            };
                        }),
                        versions: applicationVersions.filter(o => o.applicationId == application.id).map(version => {
                            return {
                                externalServiceName: version.externalServiceName,
                                weight: version.weight
                            };
                        })
                    }
                }).filter(o => o.routes.length > 0);

                let targetApps = allApplicationsHttp.filter(o => {
                    return  o.namespace == data.ns && (
                                data.scope.appId == null || 
                                data.scope.appId == undefined || 
                                data.scope.appId == o.id
                            );
                });
                await this.updateClusterIngressRulesForNsApplicationsHTTP(
                    data, 
                    org, 
                    account, 
                    targetApps, 
                    (backupConfig) => {
                        backupConfigs.push(backupConfig);
                    },
                    (newConfig) => {
                        newConfigs.push(newConfig);
                    }
                );
            } 

            if(data.scope.tcp) {
                // Build application objects for TCP. If the app has TCP streaming ports, then only one version is allowed as of now (TransportServer might not support traffic splitting yet)
                let allApplicationsTcp = applicationRoutes.filter(o => o.tcpStream).map(appRoute => {
                    let application = applications.find(a => a.id == appRoute.applicationId);
                    let version = applicationVersions.find(a => a.applicationId == appRoute.applicationId);
                    return {
                        "id": application.id,
                        "name": application.name,
                        "externalServiceName": version.externalServiceName,
                        "namespace": application.namespace,
                        "domainName": appRoute.domainName,
                        "subdomain": appRoute.subdomain,
                        "virtualPort": appRoute.virtualPort,
                        "port": appRoute.port,
                        "tcpStream": appRoute.tcpStream,
                        "serviceType": appRoute.serviceType,
                        "workspaceName": application.workspaceName
                    }
                });

                await this.updateClusterIngressGlobalRulesTCP(
                    data, 
                    services.filter(o => o.tcpStream).concat(allApplicationsTcp), 
                    (backupConfig) => {
                        backupConfigs.push(backupConfig);
                    },
                    (newConfig) => {
                        newConfigs.push(newConfig);
                    }
                );

                let targetServiceRoutes = [];
                if(data.scope.apps) {
                    targetServiceRoutes = allApplicationsTcp.filter(o => o.id == data.scope.appId);
                } 
                else if(data.scope.services) {
                    targetServiceRoutes = services.filter(o => o.tcpStream && o.id == data.scope.serviceId);
                }
                if(targetServiceRoutes.length > 0) {
                    await this.updateClusterIngressRulesTCP(
                        data, 
                        targetServiceRoutes, 
                        (backupConfig) => {
                            backupConfigs.push(backupConfig);
                        },
                        (newConfig) => {
                            newConfigs.push(newConfig);
                        }
                    );
                }
            }

            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "update cluster ingress",
                backupConfigs: backupConfigs,
                newConfigs: newConfigs
            }));
        } catch (error) {
            console.error(error);
            // Restore what has been updated & delete new resources
            await TaskRuntimeController.rollbackK8SConfigs({
                node: data.node,
                ns: data.ns,
                backupConfigs: backupConfigs,
                newConfigs: newConfigs
            });
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "update cluster ingress",
                data: data
            }));
        }
    }

    /**
     * updateClusterIngressRulesForNsServicesHTTP
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async updateClusterIngressRulesForNsServicesHTTP(data, org, account, allServices, backupCb, newCb) {
        // Count available ports for each service
        let baseNamesPortCount = {};
        for(let i=0; i<allServices.length; i++){
            if(allServices[i].serviceType == "ClusterIP" && allServices[i].externalServiceName){
                let serverBaseName = `${account.name}-${org.name}-${allServices[i].workspaceName}-${allServices[i].namespace}-${allServices[i].name}`.toLowerCase();
                if(!baseNamesPortCount[serverBaseName]) {
                    baseNamesPortCount[serverBaseName] = 1;
                } else {
                    baseNamesPortCount[serverBaseName] = baseNamesPortCount[serverBaseName]+1;
                }
            }
        }

        // Loop over services first
        for(let i=0; i<allServices.length; i++){
            if(allServices[i].serviceType == "ClusterIP" && allServices[i].externalServiceName && !allServices[i].tcpStream){
                let baseHostPath = `${account.name}-${org.name}-${allServices[i].workspaceName}-${allServices[i].namespace}-${allServices[i].name}`.toLowerCase();
                if(baseNamesPortCount[baseHostPath] > 1){
                    baseHostPath = `${baseHostPath}-${allServices[i].port}`;
                }
                let vsContent = {
                    apiVersion: "k8s.nginx.org/v1",
                    kind: "VirtualServer",
                    metadata: { name: `${allServices[i].namespace}-${allServices[i].name}-${allServices[i].virtualPort}`},
                    spec: {
                        host: `${baseHostPath}${allServices[i].domainName ? `.${allServices[i].domainName}` : ""}`.toLowerCase(),
                        upstreams: [
                            {
                                name: `${allServices[i].namespace}-${allServices[i].name}`,
                                service: allServices[i].externalServiceName,
                                port: allServices[i].port
                            }
                        ],
                        routes: [
                            {
                                path: "/",
                                action: { pass: `${allServices[i].namespace}-${allServices[i].name}` }
                            }
                        ]
                    }
                };

                let tmpFileName = null;
                while(tmpFileName == null){
                    tmpFileName = shortid.generate();
                    if(tmpFileName.indexOf("$") != -1 || tmpFileName.indexOf("@") != -1){
                        tmpFileName = null;
                    }
                }
                let ingressFilePath = path.join(process.env.VM_BASE_DIR, "workplaces", data.node.workspaceId.toString(), data.node.hostname, `${tmpFileName}.yaml`);
                   
                try {
                    fs.writeFileSync(ingressFilePath, YAML.stringify(vsContent));
                    let backupConfig = await TaskRuntimeController.getCurrentResourceJson(data.node, data.ns, "VirtualServer", `${allServices[i].namespace}-${allServices[i].name}-${allServices[i].virtualPort}`);
                    await TaskRuntimeController.applyK8SYaml(ingressFilePath, data.ns, data.node);
                    if(backupConfig) {
                        backupCb(backupConfig);
                    } else {
                        newCb(vsContent);
                    }
                } finally {
                    if(fs.existsSync(ingressFilePath))
                        fs.unlinkSync(ingressFilePath);
                }
            }
        }
    }

    /**
     * updateClusterIngressRulesForNsApplicationsHTTP
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async updateClusterIngressRulesForNsApplicationsHTTP(data, org, account, allApplications, backupCb, newCb) {
        // Loop over services first
        for(let i=0; i<allApplications.length; i++){
            // If exposed as a service
            if(allApplications[i].versions.find(o => o.externalServiceName && o.externalServiceName.length > 0)) {
                for(let y=0; y<allApplications[i].routes.length; y++){
                    let appPortRoute = allApplications[i].routes[y];
                    if(appPortRoute.serviceType == "ClusterIP" && !appPortRoute.tcpStream){
                        let baseHostPath = `${account.name}-${org.name}-${allApplications[i].workspaceName}-${allApplications[i].namespace}-${allApplications[i].name}`.toLowerCase();
                        // If more than one port, append port to hostPath
                        if(allApplications[i].routes.filter(o => o.serviceType == "ClusterIP").length > 1) {
                            baseHostPath = `${baseHostPath}-${appPortRoute.port}`;
                        }

                        let vsContent = {
                            apiVersion: "k8s.nginx.org/v1",
                            kind: "VirtualServer",
                            metadata: { name: `${allApplications[i].namespace}-${allApplications[i].name}-${appPortRoute.virtualPort}`},
                            spec: {
                                host: `${baseHostPath}${appPortRoute.domainName ? ("." + appPortRoute.domainName) : ""}`.toLowerCase(),
                                upstreams: []
                            }
                        };

                        for(let z=0; z<allApplications[i].versions.length; z++){
                            let version = allApplications[i].versions[z];

                            vsContent.spec.upstreams.push({
                                name: `${allApplications[i].namespace}-${version.externalServiceName}-${appPortRoute.port}`,
                                service: version.externalServiceName,
                                port: appPortRoute.port
                            });
                        }

                        if(allApplications[i].versions.length > 1) {
                            vsContent.spec.routes = [{
                                path: "/",
                                splits: []
                            }];
                            for(let z=0; z<allApplications[i].versions.length; z++){
                                let version = allApplications[i].versions[z];
    
                                vsContent.spec.routes[0].splits.push({
                                    weight: version.weight,
                                    action: { pass: `${allApplications[i].namespace}-${version.externalServiceName}-${appPortRoute.port}` }
                                });
                            }
                        } else {
                            vsContent.spec.routes = [{
                                path: "/",
                                action: { pass: `${allApplications[i].namespace}-${allApplications[i].versions[0].externalServiceName}-${appPortRoute.port}` }
                            }];
                        }

                        let tmpFileName = null;
                        while(tmpFileName == null){
                            tmpFileName = shortid.generate();
                            if(tmpFileName.indexOf("$") != -1 || tmpFileName.indexOf("@") != -1){
                                tmpFileName = null;
                            }
                        }
                        
                        let ingressFilePath = path.join(process.env.VM_BASE_DIR, "workplaces", data.node.workspaceId.toString(), data.node.hostname, `${tmpFileName}.yaml`);
                        try {
                            fs.writeFileSync(ingressFilePath, YAML.stringify(vsContent));
                            let backupConfig = await TaskRuntimeController.getCurrentResourceJson(data.node, allApplications[i].namespace, "VirtualServer", `${allApplications[i].namespace}-${allApplications[i].name}-${appPortRoute.virtualPort}`);
                            await TaskRuntimeController.applyK8SYaml(ingressFilePath, allApplications[i].namespace, data.node);
                            if(backupConfig) {
                                backupCb(backupConfig);
                            } else {
                                newCb(vsContent);
                            }
                        } finally {
                            if(fs.existsSync(ingressFilePath))
                                fs.unlinkSync(ingressFilePath);
                        }
                    }
                }
            }
        }
    }

    /**
     * updateClusterIngressGlobalTCP
     * @param {*} data 
     * @param {*} allServices 
     * @param {*} backupCb 
     * @param {*} newCb 
     */
    static async updateClusterIngressGlobalTCP(data, allServices, backupCb, newCb) {
        let tmpFolderHash = null;
        while(tmpFolderHash == null){
            tmpFolderHash = shortid.generate();
            if(tmpFolderHash.indexOf("$") != -1 || tmpFolderHash.indexOf("@") != -1){
                tmpFolderHash = null;
            }
        }
        let ingressFilePath = path.join(process.env.VM_BASE_DIR, "workplaces", data.node.workspaceId.toString(), data.node.hostname, `${tmpFolderHash}.yaml`);

        if(process.env.MP_MODE == "unipaas") {
            await OSController.copyFile(path.join(process.cwd(), "resources", "k8s_templates", "ingress-controller", "daemon-set", "nginx-ingress.yaml"), ingressFilePath);
        } else {
            await OSController.fetchFileSsh(data.node.ip, ingressFilePath, "/home/vagrant/deployment_templates/ingress-controller/daemon-set/nginx-ingress.yaml");
        }
        
        // Update NGinx ingress deamonset config
        let ingressDeamonSetYaml = YAML.parse(fs.readFileSync(ingressFilePath, 'utf8'));
        let backupIngressDeamonSet = JSON.parse(JSON.stringify(ingressDeamonSetYaml));
        let index = 1;
        let ingressOpenPorts = [
            { name: 'http', containerPort: 80, hostPort: 80 },
            { name: 'https', containerPort: 443, hostPort: 443 }
        ];
        
        // Update NGinx GlobalConfiguration
        let globalConfig = {
            apiVersion: "k8s.nginx.org/v1alpha1",
            kind: "GlobalConfiguration", 
            metadata: {
                name: "nginx-configuration",
                namespace: "nginx-ingress"
            },
            spec: {
                listeners: []
            }
        }

        for(let i=0; i<allServices.length; i++){
            if(allServices[i].serviceType == "ClusterIP" && allServices[i].externalServiceName && allServices[i].tcpStream){
                ingressOpenPorts.push({ name: `${index++}xtcp`, containerPort: allServices[i].virtualPort, hostPort: allServices[i].virtualPort });
                globalConfig.spec.listeners.push({ 
                    name: `tcp-${allServices[i].virtualPort}`, 
                    port: allServices[i].virtualPort, 
                    protocol: "TCP"
                });
                globalConfig.spec.listeners.push({ 
                    name: `udp-${allServices[i].virtualPort}`, 
                    port: allServices[i].virtualPort, 
                    protocol: "UDP"
                });
            }
        }

        // Update deamonset with ports first
        ingressDeamonSetYaml.spec.template.spec.containers[0].ports = ingressOpenPorts;

        // Write global config file
        let tmpFileName = null;
        while(tmpFileName == null){
            tmpFileName = shortid.generate();
            if(tmpFileName.indexOf("$") != -1 || tmpFileName.indexOf("@") != -1){
                tmpFileName = null;
            }
        }
        let globalConfigPath = path.join(process.env.VM_BASE_DIR, "workplaces", data.node.workspaceId.toString(), data.node.hostname, `${tmpFileName}.yaml`);
        try {
            fs.writeFileSync(ingressFilePath, YAML.stringify(ingressDeamonSetYaml));
            let backupConfig = await TaskRuntimeController.getCurrentResourceJson(data.node, "nginx-ingress", "DaemonSet", "nginx-ingress");

            await TaskRuntimeController.applyK8SYaml(ingressFilePath, null, data.node);
            if(backupConfig) {
                backupIngressDeamonSet.spec.template.spec.containers[0].ports = backupConfig.spec.template.spec.containers[0].ports;
                if(backupCb)
                    backupCb(backupIngressDeamonSet);
            }
            
            fs.writeFileSync(globalConfigPath, YAML.stringify(globalConfig));
            backupConfig = await TaskRuntimeController.getCurrentResourceJson(data.node, "nginx-ingress", "GlobalConfiguration", "nginx-configuration");
            await TaskRuntimeController.applyK8SYaml(globalConfigPath, "nginx-ingress", data.node);
            if(backupConfig) {
                if(backupCb)
                    backupCb(backupConfig);
            } else {
                if(newCb)
                    newCb(globalConfig);
            }
        } finally {
            if(fs.existsSync(ingressFilePath))
                fs.unlinkSync(ingressFilePath);
            if(fs.existsSync(globalConfigPath))
                fs.unlinkSync(globalConfigPath);
        }
    }

    /**
     * updateClusterIngressRulesTCP
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async updateClusterIngressRulesTCP(data, allServices, backupCb, newCb) {
        let portTransportServers = [];
        for(let i=0; i<allServices.length; i++){
            if(allServices[i].serviceType == "ClusterIP" && allServices[i].externalServiceName && allServices[i].tcpStream){
                let upstreamNameTcp = _normalizeName(`${allServices[i].name}-${allServices[i].namespace}-${allServices[i].virtualPort}-tcp`);
                portTransportServers.push({
                    fileName: `${upstreamNameTcp}.yaml`,
                    namespace: allServices[i].namespace,
                    content: {
                        apiVersion: "k8s.nginx.org/v1alpha1",
                        kind: "TransportServer",
                        metadata: {
                            name: upstreamNameTcp
                        },
                        spec: {
                            listener: {
                                name: `tcp-${allServices[i].virtualPort}`,
                                protocol: "TCP"
                            },
                            upstreams: [
                                {
                                    name: upstreamNameTcp,
                                    service: allServices[i].externalServiceName,
                                    port: allServices[i].port
                                }
                            ],
                            action: {
                                pass: upstreamNameTcp
                            }
                        }
                    }
                });

                let upstreamNameUdp = _normalizeName(`${allServices[i].name}.${allServices[i].namespace}-${allServices[i].virtualPort}-udp`);
                portTransportServers.push({
                    fileName: `${upstreamNameUdp}.yaml`,
                    namespace: allServices[i].namespace,
                    content: {
                        apiVersion: "k8s.nginx.org/v1alpha1",
                        kind: "TransportServer",
                        metadata: {
                            name: upstreamNameUdp
                        },
                        spec: {
                            listener: {
                                name: `udp-${allServices[i].virtualPort}`,
                                protocol: "UDP"
                            },
                            upstreams: [
                                {
                                    name: upstreamNameUdp,
                                    service: allServices[i].externalServiceName,
                                    port: allServices[i].port
                                }
                            ],
                            upstreamParameters: {
                                udpRequests: 1,
                                udpResponses: 1
                            },
                            action: {
                                pass: upstreamNameUdp
                            }
                        }
                    }
                });
            }
        }

        // Now write service ingress rules
        for(let i=0; i<portTransportServers.length; i++) {
            let serviceIngressConfigPath = path.join(process.env.VM_BASE_DIR, "workplaces", data.node.workspaceId.toString(), data.node.hostname, portTransportServers[i].fileName);
           
            fs.writeFileSync(serviceIngressConfigPath, YAML.stringify(portTransportServers[i].content));
            let backupConfig = await TaskRuntimeController.getCurrentResourceJson(data.node, portTransportServers[i].namespace, portTransportServers[i].content.kind, portTransportServers[i].content.metadata.name);
            await TaskRuntimeController.applyK8SYaml(serviceIngressConfigPath, portTransportServers[i].namespace, data.node);
            if(backupConfig) {
                if(backupCb)
                    backupCb(backupConfig);
            } else {
                if(newCb)
                    newCb(portTransportServers[i].content);
            }
        }
    }

    /**
     * updateClusterIngressGlobalRulesTCP
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async updateClusterIngressGlobalRulesTCP(data, allServices, backupCb, newCb) {
        let tmpFileNameHash = null;
        while(tmpFileNameHash == null){
            tmpFileNameHash = shortid.generate();
            if(tmpFileNameHash.indexOf("$") != -1 || tmpFileNameHash.indexOf("@") != -1){
                tmpFileNameHash = null;
            }
        }
        let deamonsetIngressFilePath = path.join(process.env.VM_BASE_DIR, "workplaces", data.node.workspaceId.toString(), data.node.hostname, `${tmpFileNameHash}.yaml`);
        
        if(process.env.MP_MODE == "unipaas") {
            await OSController.copyFile(path.join(process.cwd(), "resources", "k8s_templates", "ingress-controller", "daemon-set", "nginx-ingress.yaml"), deamonsetIngressFilePath);
        } else {
            await OSController.fetchFileSsh(data.node.ip, deamonsetIngressFilePath, "/home/vagrant/deployment_templates/ingress-controller/daemon-set/nginx-ingress.yaml");
        }
        
        // Update NGinx ingress deamonset config
        let ingressDeamonSetYaml = YAML.parse(fs.readFileSync(deamonsetIngressFilePath, 'utf8'));
        let backupIngressDeamonSet = JSON.parse(JSON.stringify(ingressDeamonSetYaml));
        let index = 1;
        let ingressOpenPorts = [
            { name: 'http', containerPort: 80, hostPort: 80 },
            { name: 'https', containerPort: 443, hostPort: 443 }
        ];
        
        // Update NGinx GlobalConfiguration
        let globalConfig = {
            apiVersion: "k8s.nginx.org/v1alpha1",
            kind: "GlobalConfiguration", 
            metadata: {
                name: "nginx-configuration",
                namespace: "nginx-ingress"
            },
            spec: {
                listeners: []
            }
        }
      
        for(let i=0; i<allServices.length; i++){
            if(allServices[i].serviceType == "ClusterIP" && allServices[i].externalServiceName && allServices[i].tcpStream){
                ingressOpenPorts.push({ name: `${index++}xtcp`, containerPort: allServices[i].virtualPort, hostPort: allServices[i].virtualPort });
                globalConfig.spec.listeners.push({ 
                    name: `tcp-${allServices[i].virtualPort}`, 
                    port: allServices[i].virtualPort, 
                    protocol: "TCP"
                });
                globalConfig.spec.listeners.push({ 
                    name: `udp-${allServices[i].virtualPort}`, 
                    port: allServices[i].virtualPort, 
                    protocol: "UDP"
                });
            }
        }

        // Update deamonset with ports first
        ingressDeamonSetYaml.spec.template.spec.containers[0].ports = ingressOpenPorts;

        // Write global config file
        let tmpFileName = null;
        while(tmpFileName == null){
            tmpFileName = shortid.generate();
            if(tmpFileName.indexOf("$") != -1 || tmpFileName.indexOf("@") != -1){
                tmpFileName = null;
            }
        }
        let globalConfigPath = path.join(process.env.VM_BASE_DIR, "workplaces", data.node.workspaceId.toString(), data.node.hostname, `${tmpFileName}.yaml`);
        try {
            fs.writeFileSync(deamonsetIngressFilePath, YAML.stringify(ingressDeamonSetYaml));
            let backupConfig = await TaskRuntimeController.getCurrentResourceJson(data.node, "nginx-ingress", "DaemonSet", "nginx-ingress");

            await TaskRuntimeController.applyK8SYaml(deamonsetIngressFilePath, null, data.node);
            if(backupConfig) {
                backupIngressDeamonSet.spec.template.spec.containers[0].ports = backupConfig.spec.template.spec.containers[0].ports;
                if(backupCb)
                    backupCb(backupIngressDeamonSet);
            }
            
            fs.writeFileSync(globalConfigPath, YAML.stringify(globalConfig));
            backupConfig = await TaskRuntimeController.getCurrentResourceJson(data.node, "nginx-ingress", "GlobalConfiguration", "nginx-configuration");
            await TaskRuntimeController.applyK8SYaml(globalConfigPath, "nginx-ingress", data.node);
            if(backupConfig) {
                if(backupCb)
                    backupCb(backupConfig);
            } else {
                if(newCb)
                    newCb(globalConfig);
            }
        } finally {
            if(fs.existsSync(deamonsetIngressFilePath))
                fs.unlinkSync(deamonsetIngressFilePath);
            if(fs.existsSync(globalConfigPath))
                fs.unlinkSync(globalConfigPath);
        }
    }

    /**
     * cleanupIngressRulesForServices
     * @param {*} service 
     * @param {*} node 
     */
    static async cleanupIngressRulesForServices(service, node, skipGlobalTcp) {
        let serviceRoutes = await DBController.getServiceRoutes(service.id);

        let toDelServiceRoutes = serviceRoutes.filter(o => o.id == service.id);
        let hasTcpStreamingPorts = false;
        for(let i=0; i<toDelServiceRoutes.length; i++) {
            if(toDelServiceRoutes[i].tcpStream) {
                hasTcpStreamingPorts = true;
                let upstreamNameTcp = _normalizeName(`${toDelServiceRoutes[i].name}-${toDelServiceRoutes[i].namespace}-${toDelServiceRoutes[i].virtualPort}-tcp`);
                let upstreamNameUdp = _normalizeName(`${toDelServiceRoutes[i].name}-${toDelServiceRoutes[i].namespace}-${toDelServiceRoutes[i].virtualPort}-udp`);
                await TaskRuntimeController.kubectl(`kubectl delete TransportServer ${upstreamNameTcp} --namespace=${toDelServiceRoutes[i].namespace}`, node, true);
                await TaskRuntimeController.kubectl(`kubectl delete TransportServer ${upstreamNameUdp} --namespace=${toDelServiceRoutes[i].namespace}`, node, true);
            } else {
                await TaskRuntimeController.kubectl(`kubectl delete VirtualServer ${toDelServiceRoutes[i].namespace}-${toDelServiceRoutes[i].instanceName}-${toDelServiceRoutes[i].virtualPort} --namespace=${toDelServiceRoutes[i].namespace}`, node, true);
            }
        }

        if(hasTcpStreamingPorts && !skipGlobalTcp) {
            // Build application objects for TCP
            let services = await DBController.getServicesForWsRoutes(service.workspaceId);
            let allServicesTcp = services.filter(o => o.tcpStream && o.id != service.id);
           
            
            let applications = await DBController.getApplicationsForWs(service.workspaceId);
            let applicationRoutes = await DBController.getApplicationRoutesForWs(service.workspaceId);
            let applicationVersions = await DBController.getApplicationVersionsForWs(service.workspaceId);

            let allApplicationsTcp = applicationRoutes.filter(o => o.tcpStream).map(appRoute => {

                let application = applications.find(a => a.id == appRoute.applicationId);
                let version = applicationVersions.find(a => a.applicationId == appRoute.applicationId);
                return {
                    "name": application.name,
                    "externalServiceName": version.externalServiceName,
                    "namespace": application.namespace,
                    "domainName": appRoute.domainName,
                    "virtualPort": appRoute.virtualPort,
                    "port": appRoute.port,
                    "tcpStream": appRoute.tcpStream,
                    "serviceType": appRoute.serviceType,
                    "workspaceName": application.workspaceName
                }
            });
            
            await this.updateClusterIngressGlobalTCP(
                { node }, 
                allServicesTcp.concat(allApplicationsTcp)
            );
        }
    }

    /**
     * cleanupIngressRulesForApplications
     * @param {*} application 
     * @param {*} node 
     */
    static async cleanupIngressRulesForApplications(application, node, skipGlobalTcp) {
        let applications = await DBController.getApplicationsForWs(application.workspaceId);
        let applicationRoutes = await DBController.getApplicationRoutesForWs(application.workspaceId);
        let applicationVersions = await DBController.getApplicationVersionsForWs(application.workspaceId);

        let firstVersionInstance = applicationVersions.find(a => a.applicationId == application.id);

        let toDelAppRoutesTcp = applicationRoutes.filter(
                o => o.tcpStream && 
                o.applicationId == application.id
            ).map(appRoute => {
            let application = applications.find(a => a.id == appRoute.applicationId);
            return {
                "name": application.name,
                "externalServiceName": firstVersionInstance.externalServiceName,
                "namespace": application.namespace,
                "domainName": appRoute.domainName,
                "virtualPort": appRoute.virtualPort,
                "port": appRoute.port,
                "tcpStream": appRoute.tcpStream,
                "serviceType": appRoute.serviceType,
                "workspaceName": application.workspaceName
            }
        });
        let toDelAppRoutesHttp = applicationRoutes.filter(
                o => !o.tcpStream && 
                o.applicationId == application.id
            ).map(appRoute => {
            let application = applications.find(a => a.id == appRoute.applicationId);
            return {
                "name": application.name,
                "namespace": application.namespace,
                "domainName": appRoute.domainName,
                "virtualPort": appRoute.virtualPort,
                "port": appRoute.port,
                "tcpStream": appRoute.tcpStream,
                "serviceType": appRoute.serviceType,
                "workspaceName": application.workspaceName
            }
        });

        for(let i=0; i<toDelAppRoutesTcp.length; i++) {
            let upstreamNameTcp = _normalizeName(`${toDelAppRoutesTcp[i].name}-${toDelAppRoutesTcp[i].namespace}-${toDelAppRoutesTcp[i].virtualPort}-tcp`);
            let upstreamNameUdp = _normalizeName(`${toDelAppRoutesTcp[i].name}-${toDelAppRoutesTcp[i].namespace}-${toDelAppRoutesTcp[i].virtualPort}-udp`);
            await TaskRuntimeController.kubectl(`kubectl delete TransportServer ${upstreamNameTcp} --namespace=${toDelAppRoutesTcp[i].namespace}`, node, true);
            await TaskRuntimeController.kubectl(`kubectl delete TransportServer ${upstreamNameUdp} --namespace=${toDelAppRoutesTcp[i].namespace}`, node, true);
        }

        for(let i=0; i<toDelAppRoutesHttp.length; i++) {
            await TaskRuntimeController.kubectl(`kubectl delete VirtualServer ${toDelAppRoutesHttp[i].namespace}-${toDelAppRoutesHttp[i].name}-${toDelAppRoutesHttp[i].virtualPort} --namespace=${toDelAppRoutesHttp[i].namespace}`, node, true);
        }

        if(toDelAppRoutesTcp.length > 0 && !skipGlobalTcp) {
            // Build application objects for TCP
            let services = await DBController.getServicesForWsRoutes(application.workspaceId);
            let allServicesTcp = services.filter(o => o.tcpStream);
            
            await this.updateClusterIngressGlobalTCP(
                { node: node }, 
                allServicesTcp.concat(applicationRoutes.filter(o => o.tcpStream && o.applicationId != application.id).map(appRoute => {
                    let application = applications.find(a => a.id == appRoute.applicationId);
                   
                    return {
                        "name": application.name,
                        "externalServiceName": firstVersionInstance.externalServiceName,
                        "namespace": application.namespace,
                        "domainName": appRoute.domainName,
                        "virtualPort": appRoute.virtualPort,
                        "port": appRoute.port,
                        "tcpStream": appRoute.tcpStream,
                        "serviceType": appRoute.serviceType,
                        "workspaceName": application.workspaceName
                    }
                }))
            );
        }
    }

}

module.exports = TaskIngressController;