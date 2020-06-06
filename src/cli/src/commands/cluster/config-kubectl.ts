import {flags} from '@oclif/command'
import Command from '../../base'
const chalk = require('chalk')
import {cli} from 'cli-ux'

export default class Kubectl extends Command {
	static description = 'install the workspace kubectl configuration file on your local machine'
	
	static flags = {
		help: flags.help({char: 'h'})
	}

	/**
	 * run
	 */
	async run() {
		cli.action.start("Processing");
		let result = await this.api("config", {
			method: "kubectl"
		});
		cli.action.stop();
		if(result.code == 200){
			if(result.clusterStatus == "ERROR"){
				result.logs
					.filter((log: any) => log.type == "ERROR")
					.map((log: any) => log.message)
					.forEach((log: string) => {
						this.logError(log);
					}
				);
			} else if(result.clusterStatus == "IN_PROGRESS") {
				this.logMessage("This workspace is currently being provisioned. Please try again later.");
			} else if(result.clusterStatus == "PENDING") {
				this.logMessage("This workspace is currently being provisioned. Please try again later.");
			} else {
				if(result.bash_profile_updated){
					this.logMessage(`Please execute the following command:`);
					this.logMessage(chalk.cyan(`source ${result.sourcePath}`));
				} else {
					this.logMessage(`The kubectl config file has been downloaded, and is located under '${result.path}'. You need to add/append this config file to your 'KUBECONFIG' environement variable.`);
				}

				this.logMessage(`In order to switch to your cluster configuration file, execute the command:`);
				this.logMessage(chalk.cyan(`kubectl config use-context ${result.config}`));
			}
		} else if(result.code == 401){
			this.logError(`You are not logged in`);
		} else if(result.code == 404){
			this.logError(`The current workspace does not exist anymore`);
		} else if(result.code == 412){
			this.logError(`You need to select a workspace first`);
		} else if(result.code == 417){
			this.logError(`The cli API host has not been defined. Please run the command "multipaas join" to specity a target host for MultiPaaS.`);
		} else if(result.code == 424){
			this.logError(`You need to install kubectl first`);
		} else if(result.code == 503){
			this.logError(`MultiPaaS is not accessible. Please make sure that you are connected to the right network and try again.`);
		} else {
			console.log(result);
			this.logError("Something went wrong... Please inform the system administrator.");
		}
	}
}