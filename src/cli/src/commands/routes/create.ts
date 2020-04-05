import {flags} from '@oclif/command'
import Command from '../../base'
import cli from 'cli-ux'
import * as inquirer from 'inquirer'

export default class Route extends Command {
	static description = 'create a new route for your account'
	
	static flags = {
		help: flags.help({char: 'h'})
	}

	/**
	 * run
	 */
	async run() {
		let domainYesNo: any = await inquirer.prompt([{
			name: 'choice',
			message: 'Do you want to link this route to a domain name?',
			type: 'list',
			choices: [{
				name: `Yes`,
				value: 1
			}, {
				name: `no`,
				value: 0
			}]
		}]);

		let domainId = null;

		if(domainYesNo.choice == 1) {
			let result = await this.api("domains", {
				method: "get-domains",
				data: {}
			});
			if(this.handleError(result)){
				if(result.data.length == 0){
					return this.logError("no domains found");
				}
				// Select target domain
				let domainChoice: any = await inquirer.prompt([{
					name: 'domain',
					message: 'What domain is this certificate for:',
					type: 'list',
					choices: result.data.map((o: { name: any, id: any }) => {
						return {
							name: o.name,
							value: o.id
						}
					})
				}]);
				domainId = domainChoice.domain;
			} else {
				return;
			}
		}

		let result = await this.api("applications", {
			method: "get-applications",
			data: {}
		});
		if(this.handleError(result)){
			if(result.data.length == 0){
				return this.logError("no applications found");
			}
			// Select target domain
			let appChoice: any = await inquirer.prompt([{
				name: 'app',
				message: 'What application do you want to create a route for:',
				type: 'list',
				choices: result.data.map((o: { name: any, id: any }) => {
					return {
						name: o.name,
						value: o.id
					}
				})
			}]);

			result = await this.api("routes", {
				method: "create",
				data: {
					"appId": appChoice.app,
					"domainId": domainId
				}
			});
			
			if(this.handleError(result, )){
				this.log("Route created successfully");
			}
		} else {
			return;
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
			this.logError(`You do not have sufficient permissions to create new routes`);
			return false;
		} else if(result.code == 409){
			this.logError(`The route for this application already exists`);
			return false;
		} else if(result.code == 417){
			this.logError(`The cli API host has not been defined. Please run the command "mycloud join" to specity a target host for MyCloud.`);
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