import {flags} from '@oclif/command'
import Command from '../../base'

export default class AccountList extends Command {
	static description = 'get accounts for logged in user'
	
	static flags = {
		help: flags.help({char: 'h'})
	}

	/**
	 * run
	 */
	async run() {
		let result = await this.api("account", {
			method: "get"
		});
		if(result.code == 200){
			if(result.data.length == 0) {
				this.logMessage("There are currently no accounts");
			} else {
				let session = await this.api("status");

				this.logMessage("Account name", "blue");
				result.data.forEach((o:any) => {
					this.logMessage(o.name + (o.acc_users.find((o: { userId: any; }) => o.userId == session.user.id).isAccountOwner ? " (account owner)":""));
				});
			}
		} else if(result.code == 401){
			this.logError(`You are not logged in`);
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