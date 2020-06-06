import {flags} from '@oclif/command'
import Command from '../../base'
import cli from 'cli-ux'
import * as inquirer from 'inquirer'

const chalk = require('chalk')
const EventsController = require('../../controllers/events/index.js');

export default class Bind extends Command {
	static description = 'bind a service or an app route to a domain name or sub-domain name'
	
	static flags = {
		help: flags.help({char: 'h'})
	}

	/**
	 * run
	 */
	async run() {
		let session = await this.api("status");
		let ns = null;
		let apiData = {
			ns: null,
			target: null,
			targetId: null,
			domainId: null,
			portDomainMappings: new Array()
		};
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

		// target
		let targetChoice: any = await inquirer.prompt([{
			name: 'type',
			message: 'On which type of resource do you with to create a binding for?',
			type: 'list',
			choices: [
				{
					name: "Application",
					value: "app"
				}, {
					name: "Service",
					value: "srv"
				}
			]
		}]);

		let targetRoutes = null;
		apiData.target = targetChoice.type;

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
			apiData.ns = nsChoice.name;
		} else {
			apiData.ns = session.namespace;
		}

		if(targetChoice.type == "app") {
			let appsResult = await this.api("applications", {
				method: "get-applications",
				data: {
					"ns": ns
				}
			});
			if(!this.handleError(appsResult)){
				return;
			}
			if(appsResult.data.length > 0){
				let appChoice: any = await inquirer.prompt([{
					name: 'id',
					message: 'Please select an application',
					type: 'list',
					choices: appsResult.data.map((o: { name: string, id: any }) => {
						return {
							value: o.id,
							name: o.name
						}
					})
				}]);
				apiData.targetId = appChoice.id;
				targetRoutes = appsResult.data.find((o: { id: any }) => o.id == appChoice.id).routes;
			} else {
				this.logError("No applications found");
				process.exit(1);
			}
		} else {
			let srvResult = await this.api("services", {
				method: "list",
				data: {
					"ns": ns
				}
			});
			if(!this.handleError(srvResult)){
				return;
			}
			if(srvResult.data.length > 0){
				let srvChoice: any = await inquirer.prompt([{
					name: 'id',
					message: 'Please select a target service',
					type: 'list',
					choices: srvResult.data.map((o: { id: any; instanceName: any; serviceName: any }) => {
						return {
							value: o.id,
							name: `${o.instanceName} (${o.serviceName})`
						}
					})
				}]);
				apiData.targetId = srvChoice.id;
				targetRoutes = srvResult.data.find((o: { id: any }) => o.id == srvChoice.id).routes;
			} else {
				this.logError("No services found");
				process.exit(1);
			}
		}

		if(targetRoutes.length == 0) {
			this.logError("There are no routes found to configure");
			process.exit(1);
		}

		let targetDomainChoice: any = await inquirer.prompt([{
			name: 'id',
			message: 'Please select a target domain to use',
			type: 'list',
			choices: domainResult.data.map((o: { id: any; name: any }) => {
				return {
					value: o.id,
					name: o.name
				}
			})
		}]);
		apiData.domainId = targetDomainChoice.id;
		
		for(let i=0; i<targetRoutes.length; i++) {
			let applySubdomain: any = await inquirer.prompt([{
				name: 'response',
				message: `Use a subdomain for port ${targetRoutes[i].lanUrl.internalPort}`,
				type: 'list',
				choices: [
					{ value: true, name: "Yes" },
					{ value: false, name: "No" }
				]
			}]);
			if(applySubdomain.response) {
				let portSubdomain = await cli.prompt(`Subdomain for port ${targetRoutes[i].lanUrl.internalPort}`);
				if(apiData.portDomainMappings.find(o => o.subdomain == portSubdomain)) {
					this.logError("This subdomain is already defined");
					i--;
				} else {
					apiData.portDomainMappings.push({
						internalPort: targetRoutes[i].lanUrl.internalPort,
						subdomain: portSubdomain
					});
				}
			} else {
				if(apiData.portDomainMappings.find(o => o.subdomain == null)) {
					this.logError("This domain is already defined");
					i--;
				}
				apiData.portDomainMappings.push({
					internalPort: targetRoutes[i].lanUrl.internalPort,
					subdomain: null
				});
			}
		}

		// Now make the call
		let result = await this.api("domains", {
			method: "bind",
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