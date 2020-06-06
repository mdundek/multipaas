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

export default class Deploy extends Command {
	static description = 'Deploy an application from your registry'
	
	validNameRegEx = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/g

	static flags = {
		help: flags.help({char: 'h'}),
		ns: flags.string({
			description: 'target namespace'
		}),
		name: flags.string({
			description: 'application name'
		}),
		"new-version": flags.boolean({
			description: 'add an app version to the existing app',
			dependsOn: ['new-reg-image']
		}),
		"replace-version": flags.boolean({
			description: 'replace an app version of an existing app',
			dependsOn: ['replace-reg-image']
		}),
		"new-reg-image": flags.string({
			description: 'target image registry name',
			dependsOn: ['new-version']
		}),
		"replace-reg-image": flags.string({
			description: 'target image registry name to replace',
			dependsOn: ['replace-version']
		}),
		instances: flags.integer({
			description: 'application instances to start'
		}),
		weights: flags.string({
			description: `the image weight split params in JSON format. ex: [{"image": "<name of image>", "weight": 80}, {"image": "<name of image>", "weight": 20}]`
		}),
		expose: flags.boolean({
			description: 'expose application outside of cluster',
			dependsOn: ['ports']
		}),
		"no-expose": flags.boolean({
			description: 'do not expose application outside of cluster'
		}),
		"require-storage": flags.boolean({
			description: 'does this application require storage',
			dependsOn: ['pvc']
		}),
		"no-storage": flags.boolean({
			description: 'this application requires no storage'
		}),
		pvc: flags.string({
			description: 'PVC name to claim for this deployment',
			dependsOn: ['require-storage']
		}),
		"pvc-subpaths": flags.string({
			description: `PVC subpaths mappings in JSON format. ex: [{ "hasSubPath": true, "subPath": "/foo", "mountPath": "foo" }, ...]`,
			dependsOn: ['pvc']
		}),
		"no-envs": flags.boolean({
			description: 'do not declare any environement variables'
		}),
		envs: flags.string({
			description: `environement variables in JSON format. ex: [{"name": "FOO", "value": "bar"}, ...]`
		}),
		ports: flags.string({
			description: `ports configuration in JSON format. ex: [{ "name": "<port name>", "containerPort": "3001", "protocol": "TCP", "isTcpStream": false }, ...]`
		}),
		"use-liveness-check": flags.boolean({
			description: 'use application lifeness check',
			dependsOn: ['ports']
		}),
		"no-liveness-check": flags.boolean({
			description: 'do not use application lifeness check'
		}),
		"liveness-check": flags.string({
			description: `application lifeness check in JSON format. ex: {"portName": "http", "path": "/healthz"}`
		}),
		"use-readyness-check": flags.boolean({
			description: 'use application readyness check',
			dependsOn: ['ports']
		}),
		"no-readyness-check": flags.boolean({
			description: 'do not use application readyness check'
		}),
		"readyness-check": flags.string({
			description: `application readyness check in JSON format. ex: {"portName": "http", "path": "/readyz"}`
		}),	
		"no-domain": flags.boolean({
			description: 'do not bind application to domain'
		}),
		domain: flags.string({
			description: 'domain name to bind to'
		}),
	}

	/**
	 * run
	 */
	async run() {
		const {flags} = this.parse(Deploy)
		// console.log(JSON.stringify(flags, null, 4));
		cli.action.start("Fetching data");

		let result = await this.api("image", {
			method: "list-images"
		});
				
		if(!this.handleError(result)){
			return;
		}
		result.data = result.data.filter((o: { tags: string | any[] | null; }) => o.tags != null && o.tags.length > 0);

		if(result.data.length == 0){
			cli.action.stop();
			return this.logError("There are no images to deploy");
		}

		let session = await this.api("status");
		let resultNs = null;
		if(!session.namespace){
			resultNs = await this.api("namespaces", {
				method: "get-namespaces",
				data: {}
			});
			if(!this.handleError(resultNs)){
				return;
			}
			if(resultNs.data.length == 0){
				cli.action.stop();
				return this.logError("There are no namespaces configured on your cluster. Namespaces are like separate isolated environements on your cluster that you can deploy resources on. Start by creating a namespace using the command 'mp create:ns', then try again.");
			}
		}
		
		let action = "";

		let apiData = {
			image: "",
			appVersionReplaceId: null,
			name: "",
			appId: null,
			replicaCount: 1,
			pvc: new Array,
			ports: new Array,
			envs: new Array,
			exposeService: false,
			domainId: null,
			livenessProbe: {
				enabled: false,
				path: "",
				port: ""
			},
			readynessProbe: {
				enabled: false,
				path: "",
				port: ""
			},
			ns: "",
			socketId: null,
			registry: null,
            repository: null,
			tag: null,
			trafficSplit: new Array
		};
		
		// Select namespace
		if(flags.ns) {
			apiData.ns = flags.ns;
		} else if(session.namespace) {
			apiData.ns = session.namespace;
		} else {
			cli.action.stop();
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
		}
		
		if(flags.name) {
			apiData.name = flags.name;
		} else {
			cli.action.stop();
			apiData.name = await cli.prompt('Specify a name for this application deployment');
		}
		if(!this.validNameRegEx.test(apiData.name)){
			return this.logError("The application name must consist of lower case alphanumeric characters, '-', and must start and end with an alphanumeric character");
		}

		let existingApps = await this.api("applications", {
			method: "get-applications"
		});

		if(!this.handleError(existingApps)){
			return;
		}
		cli.action.stop();

		existingApps.data = existingApps.data.filter((o: { namespace: null; }) => o.namespace == apiData.ns);

		let foundExisting = existingApps.data.find((o: { name: string; }) => o.name.toLowerCase() == apiData.name.toLowerCase());
		if(foundExisting) {
			apiData = JSON.parse(foundExisting.config);
			apiData.appId = foundExisting.id;

			if(flags["new-version"] == undefined && flags["replace-version"] == undefined) {
				// Ask if want to deploy new image for this app
				let overwriteAnswer: any = await inquirer.prompt([{
					name: 'overwrite',
					message: 'This application already exists. do you wish to:',
					type: 'list',
					choices: [{
						name: "Add a new image tag (canary deployment)",
						value: "add"
					}, {
						name: "Replace an existing image tag",
						value: "replace"
					}]
				}]);

				action = overwriteAnswer.overwrite;
			} else {
				action = flags["new-version"] ? "add" : "replace";
			}

			if(action == "add") {
				apiData.appVersionReplaceId = null;
				let remainingImages = result.data.map((o: { registry: any; name: any; tags: any[]; }) => {
					o.tags = o.tags.filter((t: string) => {
						let found = false;
						for(let i=0; i<foundExisting.application_versions.length; i++) {
							if(
								o.registry == foundExisting.application_versions[i].registry && 
								o.name == foundExisting.application_versions[i].image && 
								t == foundExisting.application_versions[i].tag
							) {
								found = true;
							}
						}
						return !found;
					});
					return o;
				}).filter((o: { tags: any[]; }) => o.tags.length > 0);

				if(remainingImages.length == 0) {
					this.logError(`There are no new images available to deploy`);
					return;
				}

				if(flags["new-reg-image"]) {
					let foundImage = false;
					remainingImages.forEach((o: { name: string, registry: string, tags: Array<any> }) => {
						if(o.tags && o.tags.length > 0){
							o.tags.forEach(b => {
								if(`${o.registry}/${o.name}:${b}` == flags["new-reg-image"])
									foundImage = true;
							});
						}
					});
					if(!foundImage){
						this.logError(`The image you wish to deploy does not exist or is already deployed`);
						return;
					}

					let checkAlreadyAdded = foundExisting.application_versions.find((version: { id: any, registry: any; image: any; tag: any; }) => {
						return flags["new-reg-image"] == `${version.registry}/${version.image}:${version.tag}`;
					});
					if(checkAlreadyAdded) {
						this.logError(`The image you wish to deploy is already part of this application`);
						return;
					}

					apiData.image = flags["new-reg-image"];
				} else {
					apiData.image = await this._selectImage(remainingImages);
				}
				
				let imageSplit = apiData.image.split("/");
				let registry = imageSplit.shift();
				let remaining = imageSplit.join("/");
				let tagSplit = remaining.split(":");
				let tag = tagSplit.pop();
				let imagePath = tagSplit.join("/");
				if(apiData.repository != imagePath) {
					this.logError(`This image does not match the original image "${apiData.repository}"`);
					return;
				}
				
				if(flags.instances != undefined){
					apiData.replicaCount = flags.instances;
				} else {
					apiData.replicaCount = await cli.prompt('How many instances of your application should be started');
				}

				if(flags.weights) {
					apiData.trafficSplit = JSON.parse(flags.weights);
					for(let i=0; i<apiData.trafficSplit.length; i++) {
						if(isNaN(apiData.trafficSplit[i].weight)) {
							this.logError(`Value must be an integer`);
							return;
						}

						if(apiData.trafficSplit[i].image != flags["new-reg-image"]) {
							let imageExists = foundExisting.application_versions.find((v: { registry: any; image: any; tag: any; }) => apiData.trafficSplit[i].image == `${v.registry}/${v.image}:${v.tag}`);
							if(!imageExists) {
								this.logError(`The target image ${apiData.trafficSplit[i].image} does not exist`);
								return;
							}
						}
					}
					if(apiData.trafficSplit.length != (foundExisting.application_versions.length+1)) {
						this.logError(`The weight split array is inconsistent with the expected image version count`);
						return;
					}
				} else {
					this.logMessage('Assign traffic split weights for your different image versions (total must add up to 100%):');
					apiData.trafficSplit = [];
					let weightData = {
						image: `${registry}/${imagePath}:${tag}`,
						weight: await cli.prompt(`Traffic share for tag "${imagePath}:${tag}"`)
					};
					if(isNaN(weightData.weight)) {
						this.logError(`Value must be an integer`);
						return;
					}
					weightData.weight = parseInt(weightData.weight);
					apiData.trafficSplit.push(weightData);
					
					for(let i=0; i<foundExisting.application_versions.length; i++) {
						weightData = {
							image: `${foundExisting.application_versions[i].registry}/${foundExisting.application_versions[i].image}:${foundExisting.application_versions[i].tag}`,
							weight: await cli.prompt(`Traffic share for tag "${foundExisting.application_versions[i].image}:${foundExisting.application_versions[i].tag}"`)
						};
						if(isNaN(weightData.weight)) {
							this.logError(`Value must be an integer`);
							return;
						}
						weightData.weight = parseInt(weightData.weight);
						apiData.trafficSplit.push(weightData);
					}
				}

				if(apiData.trafficSplit.reduce((a, b) => +a + +b.weight, 0) != 100) {
					this.logError(`The total sum of weights must add up to 100`);
					return;
				}

				apiData.pvc = [];
				// ***************** PVCs *******************
				await this._populatePvc(apiData, flags);
				// ***************** ENVS *******************
				await this._populateEnv(apiData, flags);
				
			} else {
				if(flags["replace-reg-image"]) {
					let targetImageToRep = foundExisting.application_versions.find((version: { id: any, registry: any; image: any; tag: any; }) => {
						return flags["replace-reg-image"] == `${version.registry}/${version.image}:${version.tag}`;
					});
					if(targetImageToRep) {
						apiData.appVersionReplaceId = targetImageToRep.id;
					} else {
						this.logError(`The image you wish to replace is not deployed for this app`);
						return;
					}
				} else {
					let imageSelect: any = await inquirer.prompt([{
						name: 'response',
						message: 'Which image version do you want to replace',
						type: 'list',
						choices: foundExisting.application_versions.map((version: { id: any, registry: any; image: any; tag: any; }) => {
							return {
								"name": `${version.registry}/${version.image}:${version.tag}`,
								"value": version.id
							};
						})
					}]);
					apiData.appVersionReplaceId = imageSelect.response;
				}

				let remainingImages = result.data.map((o: { registry: any; name: any; tags: any[]; }) => {
					o.tags = o.tags.filter((t: string) => {
						let found = false;
						for(let i=0; i<foundExisting.application_versions.length; i++) {
							if(
								o.registry == foundExisting.application_versions[i].registry && 
								o.name == foundExisting.application_versions[i].image && 
								t == foundExisting.application_versions[i].tag
							) {
								found = true;
							}
						}
						return !found;
					});
					return o;
				}).filter((o: { tags: any[]; }) => o.tags.length > 0);

				if(flags["new-reg-image"]) {
					let foundImage = false;
					remainingImages.forEach((o: { name: string, registry: string, tags: Array<any> }) => {
						if(o.tags && o.tags.length > 0){
							o.tags.forEach(b => {
								if(`${o.registry}/${o.name}:${b}` == flags["new-reg-image"])
									foundImage = true;
							});
						}
					});
					if(!foundImage){
						this.logError(`The image you wish to deploy does not exist or is already deployed`);
						return;
					}
					apiData.image = flags["new-reg-image"];
				} else {
					apiData.image = await this._selectImage(remainingImages);
				}

				if(flags.instances != null && flags.instances != undefined && flags.instances != NaN){
					apiData.replicaCount = flags.instances;
				} else {
					apiData.replicaCount = await cli.prompt('How many instances of your application should be started');
				}
				
				apiData.pvc = [];
				// ***************** PVCs *******************
				await this._populatePvc(apiData, flags);
				// ***************** ENVS *******************
				await this._populateEnv(apiData, flags);
				action = "replace";
			}
		} else {
			if(flags["new-reg-image"]) {
				let foundImage = false;
				result.data.forEach((o: { name: string, registry: string, tags: Array<any> }) => {
					if(o.tags && o.tags.length > 0){
						o.tags.forEach(b => {
							if(`${o.registry}/${o.name}:${b}` == flags["new-reg-image"])
								foundImage = true;
						});
					}
				});
				if(!foundImage){
					this.logError(`The image you wish to deploy does not exist`);
					return;
				}
				apiData.image = flags["new-reg-image"];
			} else {
				apiData.image = await this._selectImage(result.data);
			}

			if(flags.instances != null && flags.instances != undefined && flags.instances != NaN){
				apiData.replicaCount = flags.instances;
			} else {
				apiData.replicaCount = await cli.prompt('How many instances of your application should be started');
			}

			await this._collectDeploymentInfo(apiData, flags);
			action = "create";
		}

		apiData.socketId = null;
		apiData.registry = null;
		apiData.repository = null;
		apiData.tag = null;
		
		result = await this.api("applications", {
			method: action,
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
	}

	/**
	 * _collectDeploymentInfo
	 * @param apiData 
	 */
	async _collectDeploymentInfo(apiData: any, flags: any) {
		// ***************** PVCs *******************
		await this._populatePvc(apiData, flags);

		if(flags.ports) {
			apiData.ports = JSON.parse(flags.ports);
		} else {
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
			}
		}

		if(apiData.ports.length > 0) {
			if(flags["use-liveness-check"] != undefined) {
				apiData.livenessProbe = {
					enabled: true,
					port: flags["liveness-check"].portName,
					path: flags["liveness-check"].path
				};
			} else if(flags["no-liveness-check"] == undefined) {
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
			} else {
				apiData.livenessProbe = {
					enabled: false
				};
			}
			
			if(flags["use-readyness-check"] != undefined) {
				apiData.readynessProbe = {
					enabled: true,
					port: flags["readyness-check"].portName,
					path: flags["readyness-check"].path
				};
			} else if(flags["no-readyness-check"] == undefined) {
				let readynessEnabled: any = await inquirer.prompt([{
					name: 'response',
					message: 'Do you wish to enable a readyness health check for this app? (check application dependencies)',
					type: 'list',
					choices: [
						{ name: "Yes", value: true },
						{ name: "No", value: false }
					]
				}]);
				if(readynessEnabled.response) {
					apiData.readynessProbe.enabled = true;
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
					apiData.readynessProbe.port = readynessPorts.response;
					apiData.readynessProbe.path = await cli.prompt('Enter the path that is supposed to return a 200 code on this port (ex. "/readyz")');
				}
			} else {
				apiData.readynessProbe = {
					enabled: false
				};
			}
		
			// ***************** EXPOSE OUTSIDE OF CLUSTER *******************
			if(flags.expose != undefined) {
				apiData.exposeService = true;
			} else if(flags["no-expose"] != undefined) {
				apiData.exposeService = false;
			} else {
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
			}
		} else {
			apiData.exposeService = false;
		}

		// ***************** ENVS *******************
		await this._populateEnv(apiData, flags);
	}

	/**
	 * _populatePvc
	 * @param apiData 
	 */
	async _populatePvc(apiData: any, flags: any) {
		if(flags["require-storage"] != undefined) {
			let pvcData = await this._selectPvc(apiData.pvc, apiData.ns, flags);
			if(pvcData) {
				pvcData.mounts = await this._specifyPvcVolumeMounts(flags);
				apiData.pvc.push(pvcData);
			}
		} else if(flags["no-storage"] == undefined) {
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
					let pvcData = await this._selectPvc(apiData.pvc, apiData.ns, flags);
					if(pvcData) {
						pvcData.mounts = await this._specifyPvcVolumeMounts(flags);
						apiData.pvc.push(pvcData);
						
					}
				} else {
					let pvcData = await this._createPvc(apiData.ns);
					if(pvcData) {
						pvcData.mounts = await this._specifyPvcVolumeMounts(flags);
						apiData.pvc.push(pvcData);
					}
				}
			}
		}
	}

	/**
	 * _populateEnv
	 * @param apiData 
	 */
	async _populateEnv(apiData: any, flags: any) {
		if(flags["no-envs"] == undefined && flags.envs != undefined ) {
			apiData.envs = JSON.parse(flags.envs);
		} else if(flags["no-envs"] == undefined) {
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
	 * @param flags 
	 */
	async _specifyPvcVolumeMounts(flags: any) {
		let mountPoints = [];
		
		if(flags["pvc-subpaths"] != null && flags["pvc-subpaths"] != undefined) {
			mountPoints = JSON.parse(flags["pvc-subpaths"]);
		} else {
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
	async _selectPvc(selectedPvcs: any[], ns: any, flags: any) {
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

		if(flags.pvc) {
			let existingFound = resultPvcList.data.find((pvc: any) => flags.pvc == pvc.NAME);
			if(!existingFound) {
				this.logError(`The PVC ${flags.pvc} does not exist`);
				process.exit(1);
			}
			return {
				name: existingFound.NAME,
				mounts: new Array(),
				mountPath: existingFound.MOUNT_PATH
			}
		} else {
			let useExistingPvc: any = await inquirer.prompt([{
				name: 'response',
				message: 'What PVC do you wish to bind to this app?',
				type: 'list',
				choices: resultPvcList.data.map((pvc: any) => {
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
			cli.action.stop();
			this.logError(`You are not logged in`);
			return false;
		} else if(result.code == 412){
			cli.action.stop();
			this.logError(`You need to select a workspace first`);
			return false;
		} else if(result.code == 417){
			cli.action.stop();
			this.logError(`The cli API host has not been defined. Please run the command "multipaas join" to specity a target host for MultiPaaS.`);
			return false;
		} else if(result.code == 425){
			cli.action.stop();
			this.logError(`Your cluster is in the process of being updated. Please wait a bit until all tasks are finished to perform further configurations.`);
			return false;
		} else if(result.code == 503){
			cli.action.stop();
			this.logError(`MultiPaaS is not accessible. Please make sure that you are connected to the right network and try again.`);
			return false;
		} else if(result.code != 200){
			cli.action.stop();
			console.log(JSON.stringify(result, null, 4));
			this.logError("Something went wrong... Please inform the system administrator.");
			return false;
		} else {
			return true;
		}
	}
}


// Create new app
/*
mp apps:deploy \
	--ns dev-ns \
	--name foo-app \
	--new-version \
	--new-reg-image 'registry.multipaas.org/airbus/dto/gitlab-test-project:0.0.3' \
	--expose \
	--ports '[{ "name": "http", "containerPort": "3001", "protocol": "TCP", "isTcpStream": false }]' \
	--instances 1 \
	--no-storage \
	--no-readyness-check \
	--no-liveness-check \
	--no-domain \
	--no-envs
*/


// Add new version to existing app
/*
mp apps:deploy \
	--ns dev-ns \
	--name foo-app \
	--new-version \
	--new-reg-image 'registry.multipaas.org/airbus/dto/gitlab-test-project:0.0.1' \
	--weights '[{"image": "registry.multipaas.org/airbus/dto/gitlab-test-project:0.0.1", "weight": 70}, {"image": "registry.multipaas.org/airbus/dto/gitlab-test-project:0.0.3", "weight": 30}]' \
	--instances 1 \
	--no-envs \
	--no-storage
*/


// Replace existing version of app instance
/*
mp apps:deploy \
	--ns dev-ns \
	--name foo-app \
	--replace-version \
	--replace-reg-image 'registry.multipaas.org/airbus/dto/gitlab-test-project:0.0.1' \
	--new-reg-image 'registry.multipaas.org/airbus/dto/gitlab-test-project:0.0.2' \
	--instances 1 \
	--no-storage \
	--no-envs
*/

