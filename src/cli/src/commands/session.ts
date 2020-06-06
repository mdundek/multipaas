import {flags} from '@oclif/command'
import Command from '../base'
import cli from 'cli-ux'

export default class Status extends Command {
    static description = 'get the current status of your session'

	static flags = {
		help: flags.help({char: 'h'})
	}

	/**
	 * run
	 */
	async run() {		
		let result = await this.api("status");
		if(result.code == 200){
			this.logMessage(result.user ? `You are logged in as ${result.user.email}` : "You are not logged in");
			if(result.user){
				this.logMessage(result.account ? `The current selected account is "${result.account.name}"` : "No account selected");
				this.logMessage(result.organization ? `The current selected organization is "${result.organization.name}"` : "No organization selected");
				this.logMessage(result.workspace ? `The current selected workspace is "${result.workspace.name}"` : "No workspace selected");
				this.logMessage(result.namespace ? `The current selected namespace is "${result.namespace}"` : "No namespace selected");
			}
		} else if(result.code == 417){
			this.logError(`The cli API host has not been defined. Please run the command "multipaas join" to specity a target host for MultiPaaS.`);
		} else {
			this.logError("Something went wrong... Please inform the system administrator.");
		}
	}
}
