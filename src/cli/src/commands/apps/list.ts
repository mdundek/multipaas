import {flags} from '@oclif/command'
import Command from '../../base'
import {cli} from 'cli-ux'
import * as inquirer from 'inquirer'

const chalk = require('chalk')

export default class Applications extends Command {
	static description = 'list your current applications'
	
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
				message: 'For which namespace do you wish to list your apps for?',
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

		let result = await this.api("applications", {
			method: "get-applications",
			data: {
				"ns": ns
			}
		});

		if(this.handleError(result)){
			if(result.data.length > 0){
				let tree = cli.tree();
				result.data.forEach((o: { name: string, versions: Array<any>, routes: Array<any> }) => {
					let name = `${chalk.bold.redBright(o.name)}`;
					tree.insert(name);
					o.versions.forEach(v => {
						let instancesReady = "";
						if(v.status) {
							instancesReady = `, ${v.status.ready} instances`;
						}
						let dnsNameNode = `${chalk.green('Internal DNS:')} ${v.dns} (weight ${v.weight}%${instancesReady})`;
						tree.nodes[name].insert(dnsNameNode);
					});
					if(o.routes.length > 0){
						o.routes.forEach(b => {
							let routeName = `${chalk.blue('Route:')} ${b.lanUrl.ip}:${b.lanUrl.externalPort} -> ${b.lanUrl.internalPort}`;
							tree.nodes[name].insert(routeName);
							if(b.domainNameUrl) {
								let domainRouteName = "";
								if(!b.tcpStream && b.domainNameUrl.ssl) {
									domainRouteName = `${chalk.blue('Route:')} https://${b.domainNameUrl.url} -> ${b.domainNameUrl.internalPort}`;
								} 
								else if (!b.tcpStream) {
									domainRouteName = `${chalk.blue('Route:')} http://${b.domainNameUrl.url} -> ${b.domainNameUrl.internalPort}`;
								} 
								else if (b.domainNameUrl.ssl){
									domainRouteName = `${chalk.blue('Route (SSL):')} ${b.domainNameUrl.url}:${b.lanUrl.externalPort} -> ${b.domainNameUrl.internalPort}`;
								}
								else {
									domainRouteName = `${chalk.blue('Route:')} ${b.domainNameUrl.url}:${b.lanUrl.externalPort} -> ${b.domainNameUrl.internalPort}`;
								}
								tree.nodes[name].insert(domainRouteName);
							}
						});
					}
				});
				tree.display();
			} else {
				this.logMessage("No applications found");
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
			this.logError(`The cli API host has not been defined. Please run the command "multipaas join" to specity a target host for MultiPaaS.`);
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