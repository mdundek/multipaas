import {flags} from '@oclif/command'
import Command from '../../base'
import cli from 'cli-ux'
import * as inquirer from 'inquirer'

export default class ServicePvc extends Command {
	static description = 'delete a persistant volume claim'
	
	static flags = {
		help: flags.help({char: 'h'})
	}

	/**
	 * run
	 */
	async run() {
		let resultNs = await this.api("namespaces", {
			method: "get-namespaces",
			data: {}
		});
		
		if(!this.handleError(resultNs)){
			return;
		}
		if(resultNs.data.length == 0) {
			return this.logError("There are no namespaces configured on your cluster. Namespaces are like separate isolated environements on your cluster that you can deploy resources on. Start by creating a namespace using the command 'mc create:ns', then try again.");
		}

		// Select namespace
		let nsChoice: any = await inquirer.prompt([{
			name: 'name',
			message: 'From which namespace do you wish to delete a PVC from?',
			type: 'list',
			choices: resultNs.data.map((o: { NAME: string }) => {
				return {
					name: o.NAME
				}
			})
		}]);

		let result = await this.api("pvc", {
			method: "get-pvcs",
			data: {
				"ns": nsChoice.name
			}
		});
		if(!this.handleError(result)){
			return;
		}
		if(result.data.length == 0){
			return this.logError("There are no PVCs deployed in this namespace");
		}

		// Select PVC
		let pvcChoice: any = await inquirer.prompt([{
			name: 'name',
			message: 'What PVC do you wish to delete?',
			type: 'list',
			choices: result.data.map((o: { NAME: string }) => {
				return {
					name: o.NAME
				}
			})
		}]);

		cli.action.start('Deleting PVC and cleaning up volume')
		result = await this.api("pvc", {
			method: "delete",
			data: {
				name: pvcChoice.name,
				ns: nsChoice.name
			}
		});
		cli.action.stop();

		if(this.handleError(result)){
			this.log("PVC deleted successfully");
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
		} else if(result.code == 404){
			this.logError(`This PVC does not exist`);
			return false;
		} else if(result.code == 409){
			this.logError(`This PVC is in use, therefore it cant be deleted`);
			return false;
		} else if(result.code == 412){
			this.logError(`You need to select a workspace first`);
			return false;
		} else if(result.code == 417){
			this.logError(`The cli API host has not been defined. Please run the command "mycloud join" to specity a target host for MyCloud.`);
			return false;
		} else if(result.code == 425){
			this.logError(`Your cluster is in the process of being updated. Please wait a bit until all tasks are finished to perform further configurations.`);
			return false;
		} else if(result.code == 503){
			this.logError(`MyCloud is not accessible. Please make sure that you are connected to the right network and try again.`);
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