import {flags} from '@oclif/command'
import Command from '../base'
import cli from 'cli-ux'

// let allowedChars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".split('');

export default class Login extends Command {
	static description = 'register a new account'
	validNameRegEx = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/g

	static flags = {
		help: flags.help({char: 'h'})
	}

	/**
	 * run
	 */
	async run() {
		let session = await this.api("status");
		if(session.unipaas) {
			this.logError("UniPaaS mode does not support this command.");
			return;
		}
		
		let params = {
			accountName: "",
			email: "",
			password: ""
		}
		
		params.accountName = await cli.prompt('What is the name of your company');
		if(!this.validNameRegEx.test(params.accountName)){
			return this.logError("The account name must consist of lower case alphanumeric characters, '-', and must start and end with an alphanumeric character");
		}
		params.email = await cli.prompt('Specify a user email address for the account owner');
		params.password = await cli.prompt('Specify a password for this account');
		
		// params.accountName = params.accountName.split('').map(c => allowedChars.indexOf(c) == -1 ? '_' : c).join('');
		
		let result = await this.api("register", params);
		if(result.code == 200){
			this.logMessage(`Account created. You can now login to your new account with "mp login"`);
		} else if(result.code == 409){
			this.logError(`The account '${params.accountName}' already exists`);
		} else if(result.code == 412){
			this.logError(`The user email '${params.email}' already exists`);
		} else if(result.code == 417){
			this.logError(`The cli API host has not been defined. Please run the command "multipaas join" to specity a target host for MultiPaaS.`);
		} else if(result.code == 503){
			this.logError(`MultiPaaS is not accessible. Please make sure that you are connected to the right network and try again.`);
		} else {
			// console.log(result);
			this.logError("Something went wrong... Please inform the system administrator.");
		}
	}
}
