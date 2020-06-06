import {flags} from '@oclif/command'
import Command from '../../base'
import cli from 'cli-ux'
import * as inquirer from 'inquirer'
const EventsController = require('../../controllers/events/index.js');
const chalk = require('chalk')

export default class ServiceDelete extends Command {
	static description = 'delete a service from this workspace'
	
	static flags = {
		help: flags.help({char: 'h'})
	}

	/**
	 * run
	 */
	async run() {
		let session = await this.api("status");
		let ns = null;
		if(!session.namespace) {
			let resultNs = await this.api("namespaces", {
				method: "get-namespaces",
				data: {}
			});
			
			if(!this.handleError(resultNs)){
				return;
			}
			if(resultNs.data.length == 0) {
				return this.logError("There are no namespaces configured on your cluster. Namespaces are like separate isolated environements on your cluster that you can deploy resources on. Start by creating a namespace using the command 'mp create:ns', then try again.");
			}
	
			// Select namespace
			let nsChoice: any = await inquirer.prompt([{
				name: 'name',
				message: 'From which namespace do you wish to delete a service from?',
				type: 'list',
				choices: resultNs.data.map((o: { NAME: string }) => {
					return {
						name: o.NAME
					}
				})
			}]);
			ns = nsChoice.name;
		} else {
			ns = session.namespace;
		}

		let servicesResult = await this.api("services", {
			method: "list",
			data: {
				"ns": ns
			}
		});
		if(!this.handleError(servicesResult)){
			return;
		}
		
		if(servicesResult.data.length == 0){
			return this.logError("There are no services deployed in this namespace");
		}

		// Select namespace
		let srvChoice: any = await inquirer.prompt([{
			name: 'name',
			message: 'What service do you wish to delete?',
			type: 'list',
			choices: servicesResult.data.map((o: { instanceName: any; serviceName: any; }) => {
				return {
					name: `${o.instanceName} (${o.serviceName})`,
					value: o.instanceName
				}
			})
		}]);

		// Now make the call
		let result = await this.api("services", {
			method: "delete",
			data: {
				name: srvChoice.name,
				ns: ns
			}
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

	/**
	 * handleError
	 * @param result 
	 */
	handleError(result: { code: number }) {
		if(result.code == 401){
			this.logError(`You are not logged in`);
			return false;
		} else if(result.code == 403){
			this.logError(`You do not have sufficient permissions to delete service`);
			return false;
		} else if(result.code == 404){
			this.logError(`This service does not exist`);
			return false;
		} else if(result.code == 409){
			this.logError(`This service is in use, therefore it can not be deleted`);
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