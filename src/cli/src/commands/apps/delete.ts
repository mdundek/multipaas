import {flags} from '@oclif/command'
import Command from '../../base'
import {cli} from 'cli-ux'
const EventsController = require('../../controllers/events/index.js');
import * as inquirer from 'inquirer'
const chalk = require('chalk')

export default class Application extends Command {
	static description = 'delete a application from this workspace'
	
	static flags = {
		help: flags.help({char: 'h'})
	}

	/**
	 * run
	 */
	async run() {
		let apiData = {
			appId: null,
			appVersionId: null,
			ns: null
		};

		let session = await this.api("status");
		if(!session.namespace) {
			let resultNs = await this.api("namespaces", {
				method: "get-namespaces",
				data: {}
			});
			if(!this.handleError(resultNs)){
				return;
			}
			if(resultNs.data.length == 0){
				return this.logError("There are no namespaces configured on your cluster. Namespaces are like separate isolated environements on your cluster that you can deploy resources on. Start by creating a namespace using the command 'mp create:ns', then try again.");
			}

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
		
		let result = await this.api("applications", {
			method: "get-applications",
			data: {}
		});

		if(this.handleError(result)){
			result.data = result.data.filter((o: { namespace: null; }) => o.namespace == apiData.ns);

			if(result.data.length == 0){
				return this.logError("no applications found");
			}

			// Ask if want to deploy new image for this app
			let deleteTypeAnswer: any = await inquirer.prompt([{
				name: 'response',
				message: 'Do you wish to delete the whole application or only a specific image tag:',
				type: 'list',
				choices: [{
					name: "A whole application",
					value: "app"
				}, {
					name: "A specific tag version",
					value: "image"
				}]
			}]);

			if(deleteTypeAnswer.response == "app") {
				let appChoice: any = await inquirer.prompt([{
					name: 'response',
					message: 'What application do you want to delete:',
					type: 'list',
					choices: result.data.map((o: { name: any, id: any }) => {
						return {
							name: o.name,
							value: o.id
						}
					})
				}]);
				apiData.appId = appChoice.response;
			} else {
				let appChoice: any = await inquirer.prompt([{
					name: 'response',
					message: 'For what application do you want to delete an image tag:',
					type: 'list',
					choices: result.data.map((o: { name: any, id: any }) => {
						return {
							name: o.name,
							value: o.id
						}
					})
				}]);
				apiData.appId = appChoice.response;

				let targetApp = result.data.find((o: { id: any; }) => o.id == appChoice.response);
				if(targetApp.application_versions.length == 1) {
					this.logError(`There is only one image version deployed for this app`);
					return;
				}
				let imageSelect: any = await inquirer.prompt([{
					name: 'response',
					message: 'Which image version do you want to replace',
					type: 'list',
					choices: targetApp.application_versions.map((version: { registry: any; image: any; tag: any; id: any; }) => {
						return {
							"name": `${version.registry}/${version.image}/${version.tag}`,
							"value": version.id
						};
					})
				}]);
				apiData.appVersionId = imageSelect.response;
			}

			result = await this.api("applications", {
				method: "delete",
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
		} else if(result.code == 403){
			this.logError(`You do not have sufficient permissions to delete applications`);
			return false;
		} else if(result.code == 404){
			this.logError(`This application does not exist`);
			return false;
		} else if(result.code == 409){
			this.logError(`This application is in use, therefore it can not be deleted`);
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