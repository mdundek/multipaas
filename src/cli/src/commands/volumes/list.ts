import {flags} from '@oclif/command'
import Command from '../../base'
import {cli} from 'cli-ux'

const chalk = require('chalk')

export default class Volumes extends Command {
	static description = 'list your volumes for a workspace'
	
	static flags = {
		help: flags.help({char: 'h'})
	}

	/**
	 * run
	 */
	async run() {
		let result = await this.api("volume", {
			method: "list"
		});
		
		if(result.code == 200){
			if(result.data.length > 0){
				let tree = cli.tree();

				result.data.forEach((o: { name: string, bindings: Array<any>, size: number }) => {
					let volName = `${chalk.bold.redBright('Name:')} ${o.name} (${o.size / 1024}Gi)`;
					tree.insert(volName);

					if(o.bindings.length > 0){
						o.bindings.forEach(b => {
							let bindingName = `${chalk.blue('Binding:')} ${b.target}`;
							tree.nodes[volName].insert(bindingName);
							
							if(b.services.length == 0 && b.applications.length == 0){
								tree.nodes[volName].nodes[bindingName].insert(`- No claims -`);
							}

							b.services.forEach((service: { instanceName: any, pvcSize: any }) => {
								let nodeName = `${chalk.grey('service:')} ${service.instanceName} (${service.pvcSize})`;
								tree.nodes[volName].nodes[bindingName].insert(nodeName);
							});

							b.applications.forEach((application: { instanceName: any, pvcSize: any }) => {
								let nodeName = `${chalk.grey('application:')} ${application.instanceName} (${application.pvcSize})`;
								tree.nodes[volName].nodes[bindingName].insert(nodeName);
							});							
						});
					} else {
						tree.nodes[volName].insert(`- No bindings -`);
					}
				});

				tree.display();
			} else {
				this.logMessage("No volumes found for this workspace");
			}				
		} else if(result.code == 401){
			this.logError(`You are not logged in`);
		} else if(result.code == 412){
			this.logError(`You need to select a workspace first`);
		} else if(result.code == 417){
			this.logError(`The cli API host has not been defined. Please run the command "multipaas join" to specity a target host for MultiPaaS.`);
		} else if(result.code == 425){
			this.logError(`The cluster is updating. Please try again in a little while`);
		} else if(result.code == 503){
			this.logError(`MultiPaaS is not accessible. Please make sure that you are connected to the right network and try again.`);
		} else {
			// console.log(JSON.stringify(result, null, 4));
			this.logError("Something went wrong... Please inform the system administrator.");
		}
	}
}