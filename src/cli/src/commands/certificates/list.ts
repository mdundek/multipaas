import {flags} from '@oclif/command'
import Command from '../../base'
import {cli} from 'cli-ux'

const chalk = require('chalk')

export default class Certificates extends Command {
	static description = 'list your current certificates'
	
	static flags = {
		help: flags.help({char: 'h'})
	}

	/**
	 * run
	 */
	async run() {
		let result = await this.api("certificates", {
			method: "get-certificates",
			data: {}
		});
		if(this.handleError(result)){
			console.log(JSON.stringify(result.data, null, 4));
			if(result.data.length > 0){
				// cli.table(result.data, {
				// 	taskType: {
				// 		header: 'TASK',
				// 		minWidth: 28,
				// 	},
				// 	status: {
				// 		header: 'STATUS',
				// 		minWidth: 15,
				// 	},
				// 	createdAt: {
				// 		header: 'DATE',
				// 		minWidth: 20,
				// 	},
				// 	details: {
				// 		header: 'INFO'
				// 	}
				// });	
			} else {
				this.logMessage("No certificates found");
			}				
		}
	}

	/**
	 * handleError
	 * @param result 
	 */
	handleError(result: { code: number }) {
		if(result.code == 401){
			this.logError(`You are not logged in`);
			return false;
		} else if(result.code == 412){
			this.logError(`You need to select a workspace first`);
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