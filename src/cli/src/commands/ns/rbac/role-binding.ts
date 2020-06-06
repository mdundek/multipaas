import {flags} from '@oclif/command'
import Command from '../../../base'
import cli from 'cli-ux'
import * as inquirer from 'inquirer'

export default class NsRbacBindings extends Command {
	static description = 'define a Role Binding for this namespace'
	
	static flags = {
		help: flags.help({char: 'h'}),
		users: flags.string({
			char: 'u',
			description: 'User emails to add, separated by comma (,)'
		})
	}

	static args = [
	  	{	
			name: 'orgName',
			description: 'The name of the organization'
		}
	]

	/**
	 * run
	 */
	async run() {
		let apiData = {
			ns: null,
			emails: new Array<any>(),
			groups: new Array<any>() 
		};

		let groups = await this.api("workspace", {
			method: "get-cluster-rbac-groups"
		});
		if(!this.handleError(groups)){
			return;
		}
		if(groups.data.length == 0) {
			return this.logError("There are no groups available for this cluster.");
		}

		let session = await this.api("status");
		if(!session.namespace) {
			let resultNs = await this.api("namespaces", {
				method: "get-namespaces",
				data: {}
			});
			if(!this.handleError(resultNs)){
				return;
			}
			if(resultNs.data.length == 0) {
				return this.logError("There are no namespaces configured on your cluster. Namespaces are like separate isolated environements on your cluster that you can deploy resources on. Start by creating a namespace using the command 'mp create:ns', then try again.");
			}

			// Select namespace
			let nsChoice: any = await inquirer.prompt([{
				name: 'name',
				message: 'For what namespace do you wish to apply a role binding?',
				type: 'list',
				choices: resultNs.data.map((o: { NAME: string }) => {
					return {
						name: o.NAME
					}
				})
			}]);
			apiData.ns = nsChoice.name;
		} else {
			apiData.ns = session.namespace;
		}

		let orgUsers = await this.api("organization", {
			method: "get_users"
		});
		if(!this.handleError(orgUsers)){
			return;
		}
		if(orgUsers.data.length == 0) {
			return this.logError("There are no users available in this organization.");
		}
		
		// Select users
		let usersChoice: any = await inquirer.prompt([{
			name: 'name',
			message: 'Select which users to apply the role binding to',
			type: 'checkbox',
			choices: orgUsers.data.map((o: { user: any }) => {
				return {
					name: o.user.email
				}
			})
		}]);
		apiData.emails = usersChoice.name;
		if(apiData.emails.length == 0) {
			return this.logError("You need to select at least one user.");
		}

		// Select target service version
		let roleChoices: any = await inquirer.prompt([{
			name: 'name',
			message: 'What RBAC groups should this user belong to (no groups removes all permissions)?',
			type: 'checkbox',
			choices: groups.data.map((o: { name: any; id: any }) => {
				return {
					name: o.name,
					value: o.name
				};
			})
		}]);
		apiData.groups = roleChoices.name;
		
		let response = await this.api("workspace", {
			method: "apply-rbac-bindings",
			data: apiData
		});

		if(this.handleError(response)){
			this.logMessage("Bindings applyed successfully");
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
			this.logError(`You do not have sufficient permissions to create a persistant volume claim`);
			return false;
		} else if(result.code == 409){
			this.logError(`The PVC name already exists`);
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