import {flags} from '@oclif/command'
import Command from '../../base'
import cli from 'cli-ux'
import * as inquirer from 'inquirer'

const chalk = require('chalk')
const EventsController = require('../../controllers/events/index.js');

export default class Unbind extends Command {
	static description = 'unbind a service or an app route from a domain name or sub-domain name'
	
	static flags = {
		help: flags.help({char: 'h'})
	}

	/**
	 * run
	 */
	async run() {
		let session = await this.api("status");
		let ns = null;
		
		let resultNs = null;
		if(!session.namespace) {
			resultNs = await this.api("namespaces", {
				method: "get-namespaces",
				data: {}
			});
			
			if(!this.handleError(resultNs)){
				return;
			}
			if(resultNs.data.length == 0) {
				return this.logError("There are no namespaces configured on your cluster. Namespaces are like separate isolated environements on your cluster that you can deploy resources on. Start by creating a namespace using the command 'mp create:ns', then try again.");
			}
		}

		// domain
		let domainResult = await this.api("domains", {
			method: "get-domains",
			data: {}
		});
		if(!this.handleError(domainResult)){
			return;
		}
		if(domainResult.data.length == 0) {
			this.logError("There are no domains configured to use");
			process.exit(1);
		}

		let targetDomainChoice: any = await inquirer.prompt([{
			name: 'id',
			message: 'Please select a target domain',
			type: 'list',
			choices: domainResult.data.map((o: { id: any; name: any }) => {
				return {
					value: o.id,
					name: o.name
				}
			})
		}]);

		if(!session.namespace) {
			// Select namespace
			let nsChoice: any = await inquirer.prompt([{
				name: 'name',
				message: 'Please select a namespace first:',
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
		
		// domain routes
		let domainRoutes = await this.api("domains", {
			method: "get-routes",
			data: {
				domainId: targetDomainChoice.id,
				ns: ns
			}
		});
		if(!this.handleError(domainRoutes)){
			return;
		} else if(domainRoutes.data.length == 0) {
			this.logError(`There is nothing to unbind for this domain in this namespace`);
		}

		let unbindTargetRoute: any = await inquirer.prompt([{
			name: 'value',
			message: 'Select a target to unbind from?',
			type: 'list',
			choices: domainRoutes.data.map((o: { subdomain: any; applicationId: null; application: { namespace: any; name: any }; service: { namespace: any; name: any }; id: any }) => {
				return {
					name: o.subdomain ? (`Subdomain: ${o.subdomain} (${o.applicationId != null ? o.application.name : o.service.name })`) : o.applicationId != null ? o.application.name : o.service.name,
					value: o
				};
			})
		}]);

		// Now make the call
		let result = await this.api("domains", {
			method: "unbind",
			data: {
				target: unbindTargetRoute.value.applicationId != null ? "app" : "service",
				targetId: unbindTargetRoute.value.applicationId != null ? unbindTargetRoute.value.application.id : unbindTargetRoute.value.service.id,
				ns: ns,
				routeId: unbindTargetRoute.value.id,
				domainId: targetDomainChoice.id,
				subdomain: unbindTargetRoute.value.subdomain,
				tcp: unbindTargetRoute.value.tcpStream
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
	handleError(result: { code: number; doubles: { subdomain: any }[] }) {
		if(result.code == 401){
			this.logError(`You are not logged in`);
			return false;
		} else if(result.code == 403){
			this.logError(`You do not have sufficient permissions to do this binding`);
			return false;
		} else if(result.code == 409){
			this.logError(`The following subdomains already exist for this domain: ${result.doubles.map((o: { subdomain: any }) => o.subdomain).join(', ')}`);
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