const TaskController = require('../../controllers/tasks/index');
const TaskRuntimeController = require("../../controllers/tasks/tasks.runtime");
const TaskVolumeController = require("../../controllers/tasks/tasks.volume");
const TaskServiceController = require("../../controllers/tasks/tasks.services");
const TaskApplicationsController = require("../../controllers/tasks/tasks.applications");
const TaskDomainsController = require("../../controllers/tasks/tasks.domains");
const TaskCertificatesController = require("../../controllers/tasks/tasks.certificates");
const TaskNamespaceController = require("../../controllers/tasks/tasks.ns");
const TaskPvcController = require("../../controllers/tasks/tasks.pvc");
const TaskKeycloakController = require("../../controllers/tasks/tasks.keycloak");

/* eslint-disable no-unused-vars */
exports.Cli = class Cli {
	constructor (options, app) {
		this.app = app;
	}

	async find (params) {
		return [];
	}

	async get (id, params) {
		return {};
	}

	/**
	 * create
	 * @param {*} data 
	 * @param {*} params 
	 */
	async create (data, params) {
		switch(data.action) {
			case "account":
				try {
					let existingAccount = await this.app.service('accounts').find({
						query: {
							"name": data.params.accountName
						},
						_internalRequest: true
					});

					if(existingAccount.total == 1){
						return {"code": 409};
					}
	
					let result = await this.app.service('accounts').create({
						"name": data.params.accountName,
						"email": data.params.email,
						"password": data.params.password
					});

					return {"code": result.code};
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "hostip":
				if(!data.params.target) {
					let k8s_node = await this.app.service('k8s_nodes').find({
						"paginate": false,
						"query": {
							"hostname": data.params.hostname
						},
						"_internalRequest": true
					});
					if(k8s_node.length == 1) {
						let updObj = JSON.parse(JSON.stringify(k8s_node[0]));
						updObj.ip = data.params.value;
						await this.app.service('k8s_nodes').update(k8s_node[0].id, updObj,	{"_internalRequest": true});
					}
				} else {
					let k8s_host = await this.app.service('k8s_hosts').find({
						"paginate": false,
						"query": {
							"hostname": data.params.hostname
						},
						"_internalRequest": true
					});
					if(k8s_host.length == 1) {
						let updObj = JSON.parse(JSON.stringify(k8s_host[0]));
						updObj.ip = data.params.value;
						await this.app.service('k8s_hosts').update(k8s_host[0].id, updObj,	{"_internalRequest": true});
					}

					let gluster_host = await this.app.service('gluster_hosts').find({
						"paginate": false,
						"query": {
							"hostname": data.params.hostname
						},
						"_internalRequest": true
					});
					if(gluster_host.length == 1) {
						let updObj = JSON.parse(JSON.stringify(gluster_host[0]));
						updObj.ip = data.params.value;
						await this.app.service('gluster_hosts').update(gluster_host[0].id, updObj,	{"_internalRequest": true});
					}
				}
			
				return {"code": 200};
				
			default:
				return {"code": 404};
		}
	}

	/**
	 * update
	 * @param {*} id 
	 * @param {*} data 
	 * @param {*} params 
	 */
	async update (id, data, params) {
		switch(data.action) {
			case "delete_organization":
				try {
					return await TaskController.scheduleOrgDelete(data.params.name, data.params.accountId, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "delete_workspace":
				try {
					return await TaskController.scheduleWorkspaceDelete(data.params.name, data.params.organizationId, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "get_kubectl_config":
				try{
					return await TaskRuntimeController.getK8SConfigFile(data, params);
				} catch(error){
					console.error(error);
					return {"code": error.code};
				}
			case "add_org_users":
				try{
					return await TaskRuntimeController.addOrgUsers(data, params);
				} catch(error){
					console.error(error);
					return {"code": error.code};
				}
			case "get_available_cluster_groups":
				try{
					return await TaskKeycloakController.getAvailableClusterGroups(data.params, params);
				} catch(error){
					console.error(error);
					return {"code": error.code};
				}
			case "apply_rbac_bindings":
				try{
					return await TaskKeycloakController.applyRbacBindings(data.params, params);
				} catch(error){
					console.error(error);
					return {"code": error.code};
				}
			case "get_groups_for_users":
				try{
					return await TaskKeycloakController.getGroupsForUsers(data.params, params);
				} catch(error){
					console.error(error);
					return {"code": error.code};
				}
			case "config_k8s":
				try {
					return await TaskRuntimeController.scheduleK8SConfig(data.params, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "create_volume":
				try {
					return await TaskVolumeController.scheduleCreateVolume(data.params, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "delete_volume":
				try {
					return await TaskVolumeController.scheduleDeleteVolume(data.params, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "get_volume_details":
				try {
					return await TaskVolumeController.getWorkspacesVolumes(data.params.workspaceId, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "bind_volume":
				try {
					return await TaskVolumeController.scheduleBindVolume(data.params, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "unbind_volume":
				try {
					return await TaskVolumeController.scheduleUnbindVolume(data.params, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "get_k8s_state":
				try {
					return await TaskRuntimeController.getK8SState(data.params.workspaceId, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "get_k8s_persisted_volumes":
				try {
					return await TaskVolumeController.getPersistedVolumes(data.params.workspaceId, data.params, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "get_task_list":
				try {
					return await TaskController.getTaskList(data.params.workspaceId, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "available_services":
				try {
					return await TaskServiceController.getAvailableServices(params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "install_service":
				try {
					return await TaskServiceController.installService(data.params, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "delete_service":
				try {
					return await TaskServiceController.scheduleDeleteService(data.params.workspaceId, data.params, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "get_services_details":
				try {
					return await TaskServiceController.getWorkspacesServices(data.params.workspaceId, data.params, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "get_service_config":
				try {
					return await TaskServiceController.getServiceBaseConfig(data.params.workspaceId, data.params, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "push_k8s_app":
				try {
					return await TaskApplicationsController.deployAppImage(data.params, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "list_registry_images":
				try {
					return await TaskApplicationsController.listOrgRegistryImages(data.params.workspaceId, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "delete_registry_images":
				try {
					return await TaskApplicationsController.deleteOrgRegistryImage(data.params.workspaceId, data.params, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "list_domains":
				try {
					return await TaskDomainsController.listDomains(data.params.organizationId, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "create_domain":
				try {
					return await TaskDomainsController.createDomain(data.params, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "delete_domain":
				try {
					return await TaskDomainsController.deleteDomain(data.params, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "bind_domain":
				try {
					return await TaskDomainsController.bindDomain(data.params, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "unbind_domain":
				try {
					return await TaskDomainsController.unbindDomain(data.params, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "list_certificates":
				try {
					return await TaskCertificatesController.listCertificates(data.params.organizationId, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "create_certificate":
				try {
					return await TaskCertificatesController.createCertificate(data.params, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "delete_certificate":
				try {
					return await TaskCertificatesController.deleteCertificate(data.params, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "list_applications":
				try {
					return await TaskApplicationsController.listApplications(data.params, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "create_application":
				try {
					return await TaskApplicationsController.scheduleCreateApplication(data.params, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "scale_application":
				try {
					return await TaskApplicationsController.scheduleScaleApplication(data.params, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "add_application_version":
				try {
					return await TaskApplicationsController.scheduleAddApplicationVersion(data.params, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "application_canary_split":
				try {
					return await TaskApplicationsController.appCanarySplit(data.params, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "replace_application_version":
				try {
					return await TaskApplicationsController.scheduleReplaceApplicationVersion(data.params, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "delete_application":
				try {
					return await TaskApplicationsController.scheduleDeleteApplication(data.params, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "create_namespace":
				try {
					return await TaskNamespaceController.createNamespace(data.params, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "delete_namespace":
				try {
					return await TaskNamespaceController.deleteNamespace(data.params, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "list_namespaces":
				try {
					return await TaskNamespaceController.listNamespaces(data.params, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "create_pvc":
				try {
					return await TaskPvcController.createPVC(data.params, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "delete_pvc":
				try {
					return await TaskPvcController.deletePVC(data.params, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "list_pvc":
				try {
					return await TaskPvcController.listPVCs(data.params, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			case "add_gitlab_runner":
				try {
					return await TaskController.addGitlabRunner(data.params, params);
				} catch (error) {
					console.error(error);
					return {"code": error.code};
				}
			default:
				return {"code": 404};
		}
	}

	async patch (id, data, params) {
		return data;
	}

	async remove (id, params) {
		return { id };
	}
};
