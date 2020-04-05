import Command, {flags} from '@oclif/command'

const chalk = require('chalk')

const APIClient = require("./services/APIClient.js");
const EventsController = require("./controllers/events/index.js");


export default abstract class extends Command {
	fapi:any = null
	
	/**
	 * log
	 * @param data
	 */
	log(data:any, color?:string) {
		if(color){
			switch(color) {
				case "blue":
					console.log(chalk.blue(data))
					break;
				case "red":
					console.log(chalk.red(data))
					break;
				default:
					console.log(data)
			}
		} else {
			console.log(data)
		}
	}
	  
	/**
	 * logError
	 * @param msg
	 */
	logError(msg:string) {
        console.log(`${chalk.gray('[Error]')} ${msg}`)
  	}

	/**
	 * init
	 */
	async init() {
		// this.fapi = new APIClient("http://192.168.68.161:31484")
		this.fapi = new APIClient()
	}

	/**
	 * deleteSessionWorkspace
	 */
	deleteSessionWorkspace() {
		this.fapi.sessionJson.workspace = null;
		this.fapi._saveSession();
	}

	/**
	 * api
	 * @param task 
	 * @param params 
	 */
	async api(task:string, params?:any, onEvent?:any, done?:any) {
		if(onEvent) {
			this.fapi.socketId = await EventsController.open(this.fapi.apiJson.uri, (data: any) => {
				onEvent(data);
			}, () => {
				done();
			});
		}
		switch(task){
			case "join":
				return await this.fapi.join(params.host)
			case "login":
				return await this.fapi.login(params.email, params.password)
			case "register":
				return await this.fapi.register(params)
			case "logout":
				return await this.fapi.logout()
			case "status":
				return await this.fapi.getStatus()
			case "organization":
				if(params.method == "create"){
					return await this.fapi.createOrganization(params.data);
				} else if(params.method == "set"){
					return await this.fapi.useOrganization(params.data);
				} else if(params.method == "get"){
					return await this.fapi.getOrganizations(params.data);
				} else if(params.method == "delete"){
					return await this.fapi.deleteOrganization(params.data);
				}
				break
			case "workspace":
				if(params.method == "create"){
					return await this.fapi.createWorkspace(params.data);
				} else if(params.method == "set"){
					return await this.fapi.useWorkspace(params.data);
				} else if(params.method == "get"){
					return await this.fapi.getWorkspaces(params.data);
				} else if(params.method == "delete"){
					return await this.fapi.deleteWorkspace(params.data);
				} else if(params.method == "nodes"){
					return await this.fapi.getK8SState();
				} else if(params.method == "get-pvs"){
					return await this.fapi.getPersistedVolumes(params.data);
				} else if(params.method == "get-tasks"){
					return await this.fapi.getTaskList(params.data);
				}
				break
			case "config":
				if(params.method == "kubectl"){
					return await this.fapi.getKubectlConfigFile();
				} else if(params.method == "cluster"){
					return await this.fapi.configureCluster(params.data);
				}
				break
			case "image":
				if(params.method == "push"){
					return await this.fapi.pushApp(params);
				} else if(params.method == "list-images"){
					return await this.fapi.listRegistryImages();
				} else if(params.method == "delete"){
					return await this.fapi.deleteRegistryImage(params.data);
				}
				break
			case "volume":
				if(params.method == "create"){
					return await this.fapi.createVolume(params.data);
				} else if(params.method == "list"){
					return await this.fapi.listVolumes();
				} else if(params.method == "delete"){
					return await this.fapi.deleteVolume(params.data);
				} else if(params.method == "bind"){
					return await this.fapi.bindVolume(params.data);
				} else if(params.method == "unbind"){
					return await this.fapi.unbindVolume(params.data);
				}
				break
			case "services":
				if(params.method == "available"){
					return await this.fapi.getAvailableServices();
				} else if(params.method == "delete"){
					return await this.fapi.deleteService(params.data);
				} else if(params.method == "create"){
					return await this.fapi.instantiateNewService(params.data);
				} else if(params.method == "list"){
					return await this.fapi.listServices(params.data);
				} else if(params.method == "fetchConfig"){
					return await this.fapi.fetchServiceConfig(params.data);
				}
				break
			case "domains":
				if(params.method == "get-domains"){
					return await this.fapi.getDomains();
				} else if(params.method == "create"){
					return await this.fapi.createDomain(params.data);
				} else if(params.method == "delete"){
					return await this.fapi.deleteDomain(params.data);
				}
				break

			case "certificates":
				if(params.method == "get-certificates"){
					return await this.fapi.getCertificates();
				} else if(params.method == "create"){
					return await this.fapi.createCertificate(params.data);
				} else if(params.method == "delete"){
					return await this.fapi.deleteCertificate(params.data);
				}
				break

			case "routes":
				if(params.method == "get-routes"){
					return await this.fapi.getRoutes();
				} else if(params.method == "create"){
					return await this.fapi.createRoute(params.data);
				} else if(params.method == "delete"){
					return await this.fapi.deleteRoute(params.data);
				}
				break

			case "applications":
				if(params.method == "get-applications"){
					return await this.fapi.getApplications();
				} else if(params.method == "create"){
					return await this.fapi.createApplication(params.data);
				} else if(params.method == "delete"){
					return await this.fapi.deleteApplication(params.data);
				}
				break
			case "namespaces":
				if(params.method == "get-namespaces"){
					return await this.fapi.getNamespaces();
				} else if(params.method == "create"){
					return await this.fapi.createNamespace(params.data);
				}
			case "pvc":
				if(params.method == "get-pvcs"){
					return await this.fapi.getPVCs(params.data);
				} else if(params.method == "create"){
					return await this.fapi.createPvc(params.data);
				} else if(params.method == "delete"){
					return await this.fapi.deletePvc(params.data);
				}
		}
	}

	/**
	 * catch
	 * @param err 
	 */
	async catch(err:Error) {
		
	}

	/**
	 * finally
	 * @param err 
	 */
	async finally(err: Error) {
		
	}
}