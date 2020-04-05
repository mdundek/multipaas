import {flags} from '@oclif/command'
import Command from '../../base'
import cli from 'cli-ux'
import * as inquirer from 'inquirer'

export default class Image extends Command {
	static description = 'delete a volume from this workspace'
	
	static flags = {
		help: flags.help({char: 'h'})
	}

	/**
	 * run
	 */
	async run() {
		cli.action.start("Fetching images");
		let result = await this.api("image", {
			method: "list-images"
		});
		cli.action.stop();
		
		if(this.handleError(result)){
			if(result.data.length == 0) {
				return this.log("There are no images to delete");
			}

			let options: { name: string }[] = [];
			result.data.forEach((o: { name: string }) => {
				options.push({
					name: `${o.name}`
				});
			});

			let response: any = await inquirer.prompt([{
				name: 'target',
				message: 'What image do you wish to delete?',
				type: 'list',
				choices: options,
			}])

			cli.action.start("Deleting image");
			result = await this.api("image", {
				method: "delete",
				data: {
					"image": response.target
				}
			});
			cli.action.stop();

			this.handleError(result);
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
		} else if(result.code == 403){
			this.logError(`You do not have sufficient permissions to delete volumes`);
			return false;
		} else if(result.code == 404){
			this.logError(`This volume does not exist`);
			return false;
		} else if(result.code == 409){
			this.logError(`This volume is in use, therefore it cant be deleted`);
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