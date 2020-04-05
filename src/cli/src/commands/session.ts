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
			this.log(result.user ? `You are logged in as ${result.user.email}` : "You are not logged in");
			if(result.user){
				this.log(result.organization ? `The current selected organization is "${result.organization.name}"` : "No organization selected");
				this.log(result.workspace ? `The current selected workspace is "${result.workspace.name}"` : "No workspace selected");
			}
		} else if(result.code == 417){
			this.logError(`The cli API host has not been defined. Please run the command "mycloud join" to specity a target host for MyCloud.`);
		} else {
			this.logError("Something went wrong... Please inform the system administrator.");
		}
	}
}
