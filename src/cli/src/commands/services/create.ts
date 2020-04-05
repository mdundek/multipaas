import {flags} from '@oclif/command'
import Command from '../../base'
import {cli} from 'cli-ux'
import * as inquirer from 'inquirer'
const EventsController = require('../../controllers/events/index.js');
const chalk = require('chalk')

let _capacityToMb = (cap: string) => {
	let capFloat = parseFloat(cap.substring(0, cap.length-2));
	if(cap.indexOf("Pi") != -1) {
		return Math.round(capFloat * 1073741824);
	} else if(cap.indexOf("Ti") != -1) {
		return Math.round(capFloat * 1024.0 * 1024.0);
	} else if(cap.indexOf("Gi") != -1) {
		return Math.round(capFloat * 1024.0);
	} else if(cap.indexOf("Mi") != -1) {
		return Math.round(capFloat);
	} else if(cap.indexOf("Ki") != -1) {
		return Math.round(capFloat / 1024.0);
	} else {
		return 0;
	}
}

export default class CreateService extends Command {
	static description = 'Instantiate a new wervice from the service catalog'
	
	validVolNameRegEx = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/g

	static flags = {
		help: flags.help({char: 'h'})
	}

	/**
	 * run
	 */
	async run() {
		let resultNs = await this.api("namespaces", {
			method: "get-namespaces",
			data: {}
		});
		
		if(!this.handleError(resultNs)){
			return;
		}
		if(resultNs.data.length == 0) {
			return this.logError("There are no namespaces configured on your cluster. Namespaces are like separate isolated environements on your cluster that you can deploy resources on. Start by creating a namespace using the command 'mc create:ns', then try again.");
		}

		// Select namespace
		let nsChoice: any = await inquirer.prompt([{
			name: 'name',
			message: 'For what namespace do you wish to create a service for?',
			type: 'list',
			choices: resultNs.data.map((o: { NAME: string }) => {
				return {
					name: o.NAME
				}
			})
		}]);

		// Get all available services
		let result = await this.api("services", {
			method: "available"
		});
		if(this.handleError(result)){
			let apiData = {
				name: null,
				service: null,
				chartVersion: null,
				config: null,
				exposeService: false,
				domainId: null,
				volumeName: null,
				configFilePath: null,
				pvcSize: 0,
				ns: nsChoice.name
			};

			let allServices = result.data;

			let choices = [];
			for(let s in allServices){
				choices.push({
					name: `${s} - ${allServices[s].description}`,
					value: s
				});
			}

			// Select target service
			let serviceChoice: any = await inquirer.prompt([{
				name: 'serviceName',
				message: 'What service would you like to create:',
				type: 'list',
				choices: choices,
			}]);
			apiData.service = serviceChoice.serviceName;

			// Select target service version
			let serviceVersionChoice: any = await inquirer.prompt([{
				name: 'serviceVersion',
				message: 'What version do you wish to install:',
				type: 'list',
				choices: allServices[serviceChoice.serviceName].versions.map((o: { appVersion: any, version: any }) => {
					return {
						name: `v${o.appVersion}`,
						value: o.version
					}
				})
			}]);
			apiData.chartVersion = serviceVersionChoice.serviceVersion;

			let serviceVersionCfg = allServices[serviceChoice.serviceName].versions.find((o: { version: any }) => o.version == serviceVersionChoice.serviceVersion);

			if(serviceVersionCfg.provision_volume) {
				result = await this.api("volume", {
					method: "list"
				});
				if(!this.handleError(result)){
					return;
				}

				// console.log(JSON.stringify(result, null, 4));
				
				let valideVolumes = result.data.filter((volume: any) => volume.bindings.length == 0 || volume.bindings.find((o: { target: string }) => o.target != "k8s") ? false : true);
				valideVolumes = valideVolumes.map((volume : any) => {
					if(volume.bindings[0].services.length == 0 && volume.bindings[0].applications.length == 0) {
						volume.remainingCapacity = volume.size;
					} else {
						let usedServiceSize = volume.bindings[0].services.map((o:any) => o.pvcSize).reduce((a: any, b: any) => a + b, 0);
						let usedAppsSize = volume.bindings[0].applications.map((o:any) => o.pvcSize).reduce((a: any, b: any) => a + b, 0);
						volume.remainingCapacity = volume.size - usedServiceSize - usedAppsSize;
					}
					return volume;
				}).filter((volume: any) => volume.remainingCapacity > 1);

				if(valideVolumes.length == 0){
					return this.logError("You do not have any volumes provisioned with sufficient remain. Please provision and bind a new volume to your cluster first and try again.");
				}

				// Service name
				let sName = await cli.prompt('What name would you like to give to your service');
				if(!this.validVolNameRegEx.test(sName)){
					return this.logError("The service name must consist of lower case alphanumeric characters, '-', and must start and end with an alphanumeric character");
				}
				if(sName.toLowerCase().indexOf(apiData.service) != -1){
					return this.logError(`The service name cannot contain the word '${apiData.service}'`);
				}
				
				apiData.name = sName;

				// Select target service version
				let volChoice: any = await inquirer.prompt([{
					name: 'name',
					message: 'Which volume do you wish to use?',
					type: 'list',
					choices: valideVolumes.map((o: { name: string }) => {
						return {
							name: o.name
						}
					})
				}]);
				apiData.volumeName = volChoice.name;
				
				// apiData.targetPv = valideVolumes.find((o:any) => o.name == apiData.volumeName).bindings[0].pv.NAME;				
				let totalCapacity = valideVolumes.find((o:any) => o.name == apiData.volumeName).remainingCapacity;				
				const pvcSizeString = await cli.prompt(`What size in MB do you want to assign to this service (Maximum ${totalCapacity} MB)`);		
				
				apiData.pvcSize = parseInt(pvcSizeString);
			} else {
				// Service name
				let sName = await cli.prompt('What name would you like to give to your service');
				if(!this.validVolNameRegEx.test(sName)){
					return this.logError("The service name must consist of lower case alphanumeric characters, '-', and must start and end with an alphanumeric character");
				}
				if(sName.toLowerCase().indexOf(apiData.service) != -1){
					return this.logError(`The service name cannot contain the word '${apiData.service}'`);
				}
				apiData.name = sName;
			}

			let customConfigFile: any = await inquirer.prompt([{
				name: 'response',
				message: 'Provide your own config file?',
				type: 'list',
				choices: [
					{ name: "No", value: false },
					{ name: "Yes", value: true }
				]
			}]);

			let paramSettings: any = {};
			if(customConfigFile.response) {
				apiData.configFilePath = await cli.prompt('Path to config file');
			} else {
				let serviceParams = serviceVersionCfg.params;
				if(serviceParams) {
					for(let param in serviceParams){
						let paramCfg = serviceParams[param];
						if(!customConfigFile.response && paramCfg.prompt){
							const paramValue = await cli.prompt(paramCfg.prompt);
							paramSettings[param] = paramValue;
						}
					}
				}
			}
			apiData.config = paramSettings;
			// Collect user input for params
			
			// Expose outsoide of cluster?
			if(serviceVersionCfg.clusterIpServiceName) {
				let exposeChoice: any = await inquirer.prompt([{
					name: 'exposeService',
					message: 'Do you want this service to be exposed outside of your workspace cluster?',
					type: 'list',
					choices: [
						{ name: "Yes", value: true },
						{ name: "No", value: false }
					]
				}]);
				apiData.exposeService = exposeChoice.exposeService;

				if(apiData.exposeService){
					let bindDomain: any = await inquirer.prompt([{
						name: 'domainChoice',
						message: 'Do you want to bind this service to an existing domain?',
						type: 'list',
						choices: [
							{ name: "Yes", value: true },
							{ name: "No", value: false }
						]
					}]);
					if(bindDomain.domainChoice){
						result = await this.api("domains", {
							method: "get-domains",
							data: {}
						});
						if(!this.handleError(result)){
							return;
						}
						if(result.data.length == 0){
							return this.logError(`There are no domains configured yet. Please create a domain using the command "mc create:domain", and try again.`);
						}
						let domainChoice: any = await inquirer.prompt([{
							name: 'domainId',
							message: 'Which domain do you want to bind this service to?',
							type: 'list',
							choices: result.data.map((o: { name: any, id: any }) => {
								return {
									name: o.name,
									value: o.id
								}
							})
						}]);
						apiData.domainId = domainChoice.domainId;
					}
				}
			}

			// Now make the call
			result = await this.api("services", {
				method: "create",
				data: apiData
			}, (event: any) => {
				if(event.error){
					cli.action.stop();
					cli.action.start(chalk.red(event.value));
				} else {
					cli.action.stop();
					cli.action.start(event.value);
				}
			}, () => {
				cli.action.stop();
			});

			if(result.code != 200){
				EventsController.close();
			}

			this.handleError(result);
		}
	}

	/**
	 * handleError
	 * @param result 
	 */
	handleError(result: { code: number }) {
		if(result.code == 401){
			this.logError(`You are not logged in`);
			return false;
		} else if(result.code == 409){
			this.logError(`This service name is already in use`);
			return false;
		} else if(result.code == 412){
			this.logError(`You need to select a workspace first`);
			return false;
		} else if(result.code == 417){
			this.logError(`The cli API host has not been defined. Please run the command "mycloud join" to specity a target host for MyCloud.`);
			return false;
		} else if(result.code == 403){
			this.logError(`You do not have sufficient permissions to create new service`);
			return false;
		} else if(result.code == 425){
			this.logError(`Your cluster is in the process of being updated. Please wait a bit until all tasks are finished to perform further configurations.`);
			return false;
		} else if(result.code == 503){
			this.logError(`MyCloud is not accessible. Please make sure that you are connected to the right network and try again.`);
			return false;
		} else if(result.code != 200){
			// console.log(JSON.stringify(result, null, 4));
			this.logError("Something went wrong... Please inform the system administrator.");
			return false;
		} else {
			return true;
		}
	}
}