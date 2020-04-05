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
	
	// validImageRegEx = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/g
	// validTagRegEx = /^(?:[\dx]{1,3}\.){0,3}[\dx]{1,3}$/g

	// static flags = {
	// 	help: flags.help({char: 'h'}),
	// 	image: flags.string({
	// 		char: 'n',
	// 		description: 'Docker image name'
	// 	}),
	// 	version: flags.string({
	// 		char: 'v',
	// 		description: 'Image version'
	// 	}),
	// }

	/**
	 * run
	 */
	async run() {	
		let result = await this.api("image", {
			method: "list-images"
		});
		
		if(this.handleError(result)){
			if(result.data.length > 0){

				let apiData = {
					image: null,
					instanceName: null,
					replicaCount: null,
					volumeName: null,
					pvcSize: -1,
					exposeService: null,
					domainId: null
				};

				let choices: { name: string; }[] = [];
				result.data.forEach((o: { name: string, tags: Array<any> }) => {
					if(o.tags.length > 0){
						o.tags.forEach(b => {
							choices.push({
								name: `${o.name}:${b}`
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

				apiData.image = imageChoice.image;

				apiData.instanceName = await cli.prompt('Specify a name for this application deployment');
				apiData.replicaCount = await cli.prompt('How many instances of your application should be started');


				// Map volumes
				let pvNeeded: any = await inquirer.prompt([{
					name: 'response',
					message: 'Do you need to persist data for this deployment?',
					type: 'list',
					choices: [
						{ name: "Yes", value: true },
						{ name: "No", value: false }
					]
				}]);
				if(pvNeeded.response) {
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
				}


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

				// result = await this.api("applications", {
				// 	method: "create",
				// 	data: {
				// 		"image": imageChoice.image,
				// 		"name": name,
				// 		"replicas": replicas
				// 	}
				// }, (event: any) => {
				// if(event.error){
				// 	this.logError(event.value);
				// } else {
				// 	this.log(event.value);
				// }
				// }, () => {
				// 	cli.action.stop();
				// });

			} else {
				this.logError("There are no immages to deploy");
			}
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
			this.logError(`The cli API host has not been defined. Please run the command "mycloud join" to specity a target host for MyCloud.`);
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
