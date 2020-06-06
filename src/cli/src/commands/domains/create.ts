import {flags} from '@oclif/command'
import Command from '../../base'
import cli from 'cli-ux'

export default class Domain extends Command {
	static description = 'create a new domain for your account'
	
	static flags = {
		help: flags.help({char: 'h'})
	}

	static args = [
	  	{	
			name: 'domainName',
			description: 'The name of the new domain'
		}
	]

	/**
	 * run
	 */
	async run() {
		const {args} = this.parse(Domain)
		if(!args.domainName){
			return this.logError("Missing domain name.");
		}
		
		let result = await this.api("domains", {
			method: "create",
			data: {
				"name": args.domainName
			}
		});

		if(this.handleError(result, args.domainName)){
			this.logMessage("Domain created successfully");
		}
	}

	/**
	 * handleError
	 * @param result 
	 */
	handleError(result: { code: number }, name: string) {
		if(result.code == 401){
			this.logError(`You are not logged in`);
			return false;
		} else if(result.code == 403){
			this.logError(`You do not have sufficient permissions to create new domains`);
			return false;
		} else if(result.code == 409){
			this.logError(`The domain '${name}' already exists`);
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