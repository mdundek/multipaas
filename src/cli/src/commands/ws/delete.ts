import {flags} from '@oclif/command'
import Command from '../../base'

export default class Workspace extends Command {
	static description = 'delete an workspace for your organization'
	
	static flags = {
		help: flags.help({char: 'h'})
	}

	static args = [
	  	{	
			name: 'wsName',
			description: 'The name of the workspace to delete'
		}
	]

	/**
	 * run
	 */
	async run() {
		let session = await this.api("status");
		if(session.unipaas) {
			this.logError("UniPaaS mode does not support this command.");
			return;
		}
		
		const {args} = this.parse(Workspace)
		if(!args.wsName){
			return this.logError("Missing workspace name.");
		}
		let result = await this.api("workspace", {
			method: "delete",
			data: {
				"name": args.wsName
			}
		});
		if(result.code == 200){
			this.logMessage("Workspace deleted successfully");
		} else if(result.code == 401){
			this.logError(`You are not logged in`);
		} else if(result.code == 403){
			this.logError(`You are not entitled to delete this workspace`);
		} else if(result.code == 404){
			this.logError(`The workspace '${args.wsName}' does not exist`);
		} else if(result.code == 412){
			this.logError(`You need to select an organization first`);
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