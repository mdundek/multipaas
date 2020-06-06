import {flags} from '@oclif/command'
import Command from '../../base'

export default class Organization extends Command {
	static description = 'delete an organization for your account'
	
	static flags = {
		help: flags.help({char: 'h'})
	}

	static args = [
	  	{	
			name: 'orgName',
			description: 'The name of the organization to delete'
		}
	]

	/**
	 * run
	 */
	async run() {
		const {args} = this.parse(Organization)
		if(!args.orgName){
			return this.logError("Missing organization name.");
		}
		let result = await this.api("organization", {
			method: "delete",
			data: {
				"name": args.orgName
			}
		});
		if(result.code == 200){
			this.logMessage("Organization deleted successfully");
		} else if(result.code == 401){
			this.logError(`You are not logged in`);
		} else if(result.code == 403){
			this.logError(`You are not entitled to delete this organization`);
		} else if(result.code == 404){
			this.logError(`The organization '${args.orgName}' does not exist`);
		} else if(result.code == 413){
			this.logError(`You need to select an account first using 'mp account:use <account name>'`);
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