import {flags} from '@oclif/command'
import Command from '../../base'
import {cli} from 'cli-ux'
const EventsController = require('../../controllers/events/index.js');
import * as inquirer from 'inquirer'
const chalk = require('chalk')
const fs = require('fs');
const path = require('path');
const shortid = require('shortid');
shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$@');

export default class Canary extends Command {
	static description = 'Split traffic amongst application versions'
	
	/**
	 * run
	 */
	async run() {	
		let session = await this.api("status");
		let resultNs = null;
		if(!session.namespace) {
			resultNs = await this.api("namespaces", {
				method: "get-namespaces",
				data: {}
			});
			if(!this.handleError(resultNs)){
				return;
			}
			if(resultNs.data.length == 0){
				return this.logError("There are no namespaces configured on your cluster. Namespaces are like separate isolated environements on your cluster that you can deploy resources on. Start by creating a namespace using the command 'mp create:ns', then try again.");
			}
		}
		
		let apiData = {
			ns: null,
			appId: null,
			trafficSplit: new Array
		};
		
		if(!session.namespace) {
			// Select namespace
			let nsChoice: any = await inquirer.prompt([{
				name: 'name',
				message: 'In what namespace do you wish to deploy an application to?',
				type: 'list',
				choices: resultNs.data.map((o: { NAME: string }) => {
					return {
						name: o.NAME
					}
				})
			}]);
			apiData.ns = nsChoice.name;
		} else {
			apiData.ns = session.namespace;
		}

		let existingApps = await this.api("applications", {
			method: "get-applications"
		});
		if(!this.handleError(existingApps)){
			return;
		}
		existingApps.data = existingApps.data.filter((o: { namespace: null; }) => o.namespace == apiData.ns);

		let appChoice: any = await inquirer.prompt([{
			name: 'response',
			message: 'Select an application:',
			type: 'list',
			choices: existingApps.data.map((o: { name: any; id: any; }) => {
				return {
					name: o.name,
					value: o
				}
			})
		}]);

		apiData.appId = appChoice.response.id;

		this.logMessage('Assign traffic split weights for your different image versions (total must add up to 100%):');
		apiData.trafficSplit = [];
		
		for(let i=0; i<appChoice.response.application_versions.length; i++) {
			let weightData = {
				image: `${appChoice.response.application_versions[i].registry}/${appChoice.response.application_versions[i].image}:${appChoice.response.application_versions[i].tag}`,
				weight: await cli.prompt(`Traffic share for tag "${appChoice.response.application_versions[i].image}:${appChoice.response.application_versions[i].tag}"`)
			};
			if(isNaN(weightData.weight)) {
				this.logError(`Value must be an integer`);
				return;
			}
			weightData.weight = parseInt(weightData.weight);
			apiData.trafficSplit.push(weightData);
		}

		if(apiData.trafficSplit.reduce((a, b) => +a + +b.weight, 0) != 100) {
			this.logError(`The total sum of weights must add up to 100`);
			return;
		}

		let result = await this.api("applications", {
			method: "canary",
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

		this.handleError(result);
	}

	/**
	 * _collectCanarymentInfo
	 * @param apiData 
	 */
	async _collectCanarymentInfo(apiData: any) {
		// ***************** PVCs *******************
		await this._populatePvc(apiData);

		// ***************** PORTS *******************
		let portsNeeded: any = await inquirer.prompt([{
			name: 'response',
			message: 'Do you need to expose ports?',
			type: 'list',
			choices: [
				{ name: "Yes", value: true },
				{ name: "No", value: false }
			]
		}]);
		if(portsNeeded.response) {
			let needMorePorts = true;
			while(needMorePorts) {
				let portData = await this._declarePort(apiData.ports);
				if(portData) {
					apiData.ports.push(portData);
				}

				let morePortsNeeded: any = await inquirer.prompt([{
					name: 'response',
					message: 'Do you wish to expose another port for this deployment?',
					type: 'list',
					choices: [
						{ name: "Yes", value: true },
						{ name: "No", value: false }
					]
				}]);
				if(!morePortsNeeded.response) {
					needMorePorts = false;
				}
			}

			let livenessEnabled: any = await inquirer.prompt([{
				name: 'response',
				message: 'Do you wish to enable a liveness health check or this app?',
				type: 'list',
				choices: [
					{ name: "Yes", value: true },
					{ name: "No", value: false }
				]
			}]);
			if(livenessEnabled.response) {
				apiData.livenessProbe.enabled = true;
				let livenessPorts: any = await inquirer.prompt([{
					name: 'response',
					message: 'Which port do you want to use for the liveness probe? (check application health)',
					type: 'list',
					choices: apiData.ports.map((port: { name: any; }) => {
						return {
							name: port.name
						};
					})
				}]);
				apiData.livenessProbe.port = livenessPorts.response;
				apiData.livenessProbe.path = await cli.prompt('Enter the path that is supposed to return a 200 code on this port (ex. "/" or "/healthz")');
			}

			let readynessEnabled: any = await inquirer.prompt([{
				name: 'response',
				message: 'Do you wish to enable a readyness health check or this app? (check application dependencies)',
				type: 'list',
				choices: [
					{ name: "Yes", value: true },
					{ name: "No", value: false }
				]
			}]);
			if(readynessEnabled.response) {
				apiData.readynessrobe.enabled = true;
				let readynessPorts: any = await inquirer.prompt([{
					name: 'response',
					message: 'Which port do you want to use for the readyness probe?',
					type: 'list',
					choices: apiData.ports.map((port: { name: any; }) => {
						return {
							name: port.name
						};
					})
				}]);
				apiData.readynessrobe.port = readynessPorts.response;
				apiData.readynessrobe.path = await cli.prompt('Enter the path that is supposed to return a 200 code on this port (ex. "/readyz")');
			}
		}

		// ***************** ENVS *******************
		await this._populateEnv(apiData);

		// ***************** EXPOSE OUTSIDE OF CLUSTER *******************
		if(apiData.ports.length > 0) {
			let exposeChoice: any = await inquirer.prompt([{
				name: 'exposeService',
				message: 'Do you want this application to be exposed outside of your workspace cluster?',
				type: 'list',
				choices: [
					{ name: "Yes", value: true },
					{ name: "No", value: false }
				]
			}]);
			apiData.exposeService = exposeChoice.exposeService;

			// ***************** USE DOMAIN NAME *******************
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
					let result = await this.api("domains", {
						method: "get-domains",
						data: {}
					});
					if(!this.handleError(result)){
						return;
					}
					if(result.data.length == 0){
						return this.logError(`There are no domains configured yet. Please create a domain using the command "mp create:domain", and try again.`);
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
		} else {
			apiData.exposeService = false;
		}
	}


	/**
	 * _populatePvc
	 * @param apiData 
	 */
	async _populatePvc(apiData: any) {
		// ***************** PVCs *******************
		let storageNeeded: any = await inquirer.prompt([{
			name: 'response',
			message: 'Do you need to persist data for this deployment?',
			type: 'list',
			choices: [
				{ name: "Yes", value: true },
				{ name: "No", value: false }
			]
		}]);
		if(storageNeeded.response) {
			let pvcNeeded: any = await inquirer.prompt([{
				name: 'response',
				message: 'Did you already provision a PVC that you would like to use?',
				type: 'list',
				choices: [
					{ name: "Yes", value: true },
					{ name: "No", value: false }
				]
			}]);
			if(pvcNeeded.response) {
				let pvcData = await this._selectPvc(apiData.pvc, apiData.ns);
				if(pvcData) {
					pvcData.mounts = await this._specifyPvcVolumeMounts();
					apiData.pvc.push(pvcData);
					
				}
			} else {
				let pvcData = await this._createPvc(apiData.ns);
				if(pvcData) {
					pvcData.mounts = await this._specifyPvcVolumeMounts();
					apiData.pvc.push(pvcData);
				}
			}
		}
	}

	/**
	 * _populateEnv
	 * @param apiData 
	 */
	async _populateEnv(apiData: any) {
		let envsNeeded: any = await inquirer.prompt([{
			name: 'response',
			message: 'Do you want to declare environement variables?',
			type: 'list',
			choices: [
				{ name: "Yes", value: true },
				{ name: "No", value: false }
			]
		}]);
		if(envsNeeded.response) {
			let needMoreEnvs = true;
			while(needMoreEnvs) {
				let envData = await this._declareEnv(apiData.envs);
				if(envData) {
					apiData.envs.push(envData);
				}

				let moreEnvsNeeded: any = await inquirer.prompt([{
					name: 'response',
					message: 'Do you wish to declare another environement variable for this deployment?',
					type: 'list',
					choices: [
						{ name: "Yes", value: true },
						{ name: "No", value: false }
					]
				}]);
				if(!moreEnvsNeeded.response) {
					needMoreEnvs = false;
				}
			}
		}
	}



	/**
	 * _selectImage
	 * @param images 
	 */
	async _selectImage(images: { name: string; registry: string; tags: any[]; }[]) {
		let choices: { name: string; }[] = [];
		images.forEach((o: { name: string, registry: string, tags: Array<any> }) => {
			if(o.tags && o.tags.length > 0){
				o.tags.forEach(b => {
					choices.push({
						name: `${o.registry}/${o.name}:${b}`
					});
				});
			}
		});

		let imageChoice: any = await inquirer.prompt([{
			name: 'image',
			message: 'Specify the image you wish to deploy:',
			type: 'list',
			choices: choices
		}]);
		return imageChoice.image;
	}

	/**
	 * _specifyPvcVolumeMounts
	 */
	async _specifyPvcVolumeMounts() {
		let mountPoints = [];
		let _collectMountDetails = async (withSubPath: boolean) => {
			let data = {
				mountPath: await cli.prompt('Enter the container path to mount'),
				hasSubPath: false,
				subPath: null
			};
		
			if(withSubPath) {
				data.hasSubPath = true;
				data.subPath = await cli.prompt('Enter the volume sub folder name for this mount');
			}
			return data;
		}

		let multipleMounts: any = await inquirer.prompt([{
			name: 'response',
			message: 'Would you like to mount multiple container volumes?',
			type: 'list',
			choices: [
				{ name: "Yes, I need to mount multiple folders", value: true },
				{ name: "No, I only need one mount one folder", value: false }
			]
		}]);

		if(multipleMounts.response) {
			// What mount path in container
			// sub path on volume
			let needMore = true;
			while(needMore) {
				let mountDetails = await _collectMountDetails(true);
				if(mountDetails) {
					mountPoints.push(mountDetails);
				}
				let moreFoldersNeeded: any = await inquirer.prompt([{
					name: 'response',
					message: 'Do you wish to mount another sub folder?',
					type: 'list',
					choices: [
						{ name: "Yes", value: true },
						{ name: "No", value: false }
					]
				}]);
				if(!moreFoldersNeeded.response) {
					needMore = false;
				}
			}
		} else {
			let mountDetails = await _collectMountDetails(false);
			if(mountDetails) {
				mountPoints.push(mountDetails);
			}
		}
		return mountPoints;
	}

	/**
	 * _declareEnv
	 * @param selectedEnv 
	 */
	async _declareEnv(selectedEnv: any[]) {
		let envName = await cli.prompt('Provide a name for your environement variable');
		if(selectedEnv.find(o => o.name == envName)) {
			this.logError("This environement variable name is already declared");
			return null;
		}
		let envValue = await cli.prompt('Provide a value for your environement variable');
		return {
			name: envName,
			value: envValue
		};
	}

	/**
	 * _declarePort
	 * @param selectedPorts 
	 */
	async _declarePort(selectedPorts: any[]) {
		let portName = await cli.prompt('Provide a name for your port (ex. http, https...)');
		if(selectedPorts.find(o => o.name == portName)) {
			this.logError("This port name is already in use");
			return null;
		}
		let port = await cli.prompt('What container ports do you wish to expose');
		if(selectedPorts.find(o => o.containerPort == port)) {
			this.logError("This port is already declared");
			return null;
		}
		let portTransportType: any = await inquirer.prompt([{
			name: 'response',
			message: 'Is this port used for streaming services (ex. Database access, mqtt protocol...)?',
			type: 'list',
			choices: [
				{ name: "No", value: false },
				{ name: "Yes", value: true }
			]
		}]);
		return {
			name: portName,
			containerPort: port,
			protocol: "TCP",
			isTcpStream: portTransportType.response
		};
	}

	/**
	 * _selectPvc
	 * @param selectedPvcs 
	 * @param ns 
	 */
	async _selectPvc(selectedPvcs: any[], ns: any) {
		let resultPvcList = await this.api("pvc", {
			method: "get-pvcs",
			data: {
				"ns": ns
			}
		});
		
		if(!this.handleError(resultPvcList)){
			process.exit(1);
		}
		if(resultPvcList.data.length == 0){
			this.logError("You do not have any PVCs provisioned.");
			process.exit(1);
		}

		let resultVolumes = await this.api("volume", {
			method: "list"
		});
		if(!this.handleError(resultVolumes)){
			process.exit(1);
		}

		resultPvcList.data = resultPvcList.data.filter((pvc: any[]) => {
			let inUse = false;
			resultVolumes.data.forEach((volume: { bindings: { services: any[]; applications: any[]; }[]; }) => {
				volume.bindings.forEach((binding: { services: any[]; applications: any[]; }) => {
					if(binding.services.find((service: { dedicatedPvc: any; }) => service.dedicatedPvc == pvc.NAME)) {
						inUse = true;
					} else if(binding.applications.find((application: { dedicatedPvc: any; }) => application.dedicatedPvc == pvc.NAME)) {
						inUse = true;
					}
				});
			});
			return !inUse;
		});
		resultPvcList.data = resultPvcList.data.filter((pvc: any) => !selectedPvcs.find(o => o.name == pvc.NAME));
		if(resultPvcList.data.length == 0){
			this.logError("You do not have any PVCs available.");
			process.exit(1);
		}

		let useExistingPvc: any = await inquirer.prompt([{
			name: 'response',
			message: 'What PVC do you wish to bind to this app?',
			type: 'list',
			choices: resultPvcList.data.map((pvc: any[]) => {
				return {
					name: pvc.NAME,
					value: pvc
				};
			})
		}]);

		return {
			name: useExistingPvc.response.NAME,
			mounts: new Array(),
			mountPath: useExistingPvc.response.MOUNT_PATH
		}
	}

	/**
	 * _createPvc
	 * @param apiData 
	 */
	async _createPvc(ns: any) {
		let apiData = {
			ns: ns,
			name: null,
			volumeName: null,
			pvcSize: -1
		};

		let result = await this.api("volume", {
			method: "list"
		});
		if(!this.handleError(result)){
			process.exit(1);
		}

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
			return this.logError("You do not have any volumes provisioned with sufficient remaining space. Please provision and bind a new volume to your cluster first and try again.");
		}

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

		apiData.name = await cli.prompt(`Please provide a name for this PVC`);	
		
		// apiData.targetPv = valideVolumes.find((o:any) => o.name == apiData.volumeName).bindings[0].pv.NAME;				
		let totalCapacity = valideVolumes.find((o:any) => o.name == apiData.volumeName).remainingCapacity;				
		const pvcSizeString = await cli.prompt(`What size in MB do you want to assign to this service (Maximum ${totalCapacity} MB)`);		
		
		apiData.pvcSize = parseInt(pvcSizeString);

		cli.action.start('Creating PVC and mounting volume');
		let pvcResult = await this.api("pvc", {
			method: "create",
			data: apiData
		});
		cli.action.stop();
		if(this.handleError(pvcResult)){
			return {
				name: apiData.name,
				mounts: new Array(),
				mountPath: result.data
			}
		} else {
			process.exit(1);
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
		} else if(result.code == 412){
			this.logError(`You need to select a workspace first`);
			return false;
		} else if(result.code == 417){
			this.logError(`The cli API host has not been defined. Please run the command "multipaas join" to specity a target host for MultiPaaS.`);
			return false;
		} else if(result.code == 425){
			this.logError(`Your cluster is in the process of being updated. Please wait a bit until all tasks are finished to perform further configurations.`);
			return false;
		} else if(result.code == 503){
			this.logError(`MultiPaaS is not accessible. Please make sure that you are connected to the right network and try again.`);
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
