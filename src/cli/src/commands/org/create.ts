import {flags} from '@oclif/command'
import Command from '../../base'
import cli from 'cli-ux'

export default class Organization extends Command {
	static description = 'create a new organization for your account'
	
	static flags = {
		help: flags.help({char: 'h'})
	}

	static args = [
	  	{	
			name: 'orgName',
			description: 'The name of the new organization'
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
		
		
		const {args} = this.parse(Organization)
		if(!args.orgName){
			return this.logError("Missing organization name.");
		}
		
		let rUser = await cli.prompt('Assign a registry username');
		let rPass = await cli.prompt('Assign a registry password');

		let result = await this.api("organization", {
			method: "create",
			data: {
				"name": args.orgName,
				"registryUser": rUser,
				"registryPass": rPass
			}
		});
		if(result.code == 200){
			this.logMessage("Organization created successfully");
		}  else if(result.code == 401){
			this.logError(`You are not logged in`);
		} else if(result.code == 403){
			this.logError(`You do not have sufficient permissions to create new organizations`);
		} else if(result.code == 409){
			this.logError(`The organization '${args.orgName}' already exists`);
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