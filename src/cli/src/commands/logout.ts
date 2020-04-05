import {flags} from '@oclif/command'
import Command from '../base'

export default class Logout extends Command {
    static description = 'log out'

	static flags = {
		help: flags.help({char: 'h'}),
	}

	// static args = [
	//   {name: 'file'}
	// ]

	/**
	 * run
	 */
	async run() {
		if(!this.fapi.sessionJson){
			return this.logError(`You are not logged in`);
		}

		let result = await this.api("logout");
		if(result.code == 200){
			this.log(`Success!`);
		} else if(result.code == 401){
			this.logError(`Wrong username or password`);
		} else if(result.code == 417){
			this.logError(`The cli API host has not been defined. Please run the command "mycloud join" to specity a target host for MyCloud.`);
		} else if(result.code == 503){
			this.logError(`MyCloud is not accessible. Please make sure that you are connected to the right network and try again.`);
		} else {
			this.logError("Something went wrong... Please inform the system administrator.");
		}
	}
}
