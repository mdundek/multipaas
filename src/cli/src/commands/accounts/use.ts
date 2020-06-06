import {flags} from '@oclif/command'
import Command from '../../base'

export default class Accounts extends Command {
	static description = 'set the current account for your user'
	
	static flags = {
		help: flags.help({char: 'h'})
	}

	static args = [
	  	{	
			name: 'accName',
			description: 'The name of the account to set'
		}
	]

	/**
	 * run
	 */
	async run() {
		const {args} = this.parse(Accounts)
		if(!args.accName){
			return this.logError("Missing account name.");
		}
		let result = await this.api("account", {
			method: "set",
			data: args.accName
		});
		if(result.code == 200){
			this.logMessage("Accounts set");
		} else if(result.code == 401){
			this.logError(`You are not logged in`);
		} else if(result.code == 404){
			this.logError(`The account '${args.accName}' does not exist`);
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