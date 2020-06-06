import {flags} from '@oclif/command'
import Command from '../../base'

export default class Namespace extends Command {
	static description = 'set the current namespace context'
	
	static flags = {
		help: flags.help({char: 'h'})
	}

	static args = [
	  	{	
			name: 'namespaceName',
			description: 'The name of the namespace to set'
		}
	]

	/**
	 * run
	 */
	async run() {
		const {args} = this.parse(Namespace)
		if(!args.namespaceName){
			return this.logError("Missing namespace name.");
		}
		let result = await this.api("namespaces", {
			method: "set",
			data: args.namespaceName
		});
		if(result.code == 200){
			this.logMessage("Namespace set");
		} else if(result.code == 401){
			this.logError(`You are not logged in`);
		} else if(result.code == 404){
			this.logError(`The namespace '${args.namespaceName}' does not exist`);
		} else if(result.code == 417){
			this.logError(`The cli API host has not been defined. Please run the command "multipaas join" to specity a target host for MultiPaaS.`);
		} else if(result.code == 503){
			this.logError(`MultiPaaS is not accessible. Please make sure that you are connected to the right network and try again.`);
		} else {
			// console.log(JSON.stringify(result, null, 4));
			this.logError("Something went wrong... Please inform the system administrator.");
		}
	}
}