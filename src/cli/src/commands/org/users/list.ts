import {flags} from '@oclif/command'
import Command from '../../../base'
import {cli} from 'cli-ux'
const chalk = require('chalk')

export default class OrganizationUserList extends Command {
	static description = 'get organizations for your account'
	
	static flags = {
		help: flags.help({char: 'h'})
	}

	/**
	 * run
	 */
	async run() {
		let users = await this.api("organization", {
			method: "get_users"
		});
		if(!this.handleError(users)){
			return;
		}

		let usersGroups = await this.api("organization", {
			method: "get_groups_for_users",
			data: {
				emails: users.data.map((o: { user: { email: any; }; }) => o.user.email)
			}
		});
		if(!this.handleError(usersGroups)){
			return;
		}

		let tree = cli.tree();

		if(users.data.length > 0) {
			users.data.forEach((o: { user: { email: string | number }, permissions: string }) => {
				let userName = `${chalk.bold.redBright('User:')} ${o.user.email}, ${chalk.bold.redBright('Permissions:')} ${o.permissions}`;
				tree.insert(userName);
				if(usersGroups.data[o.user.email] && usersGroups.data[o.user.email].length > 0) {

					let wsList: any | any[] = [];
					usersGroups.data[o.user.email].forEach((g: { name: any; path: any }) => {
						let scopeDecomposition = g.path.substring(1).split('/')[1].split("-");
						if(wsList.indexOf(scopeDecomposition[2]) == -1){
							wsList.push(scopeDecomposition[2]);
						}
					});

					wsList.forEach((ws: any) => {
						let wsNode = `${chalk.green('Workspace:')} ${ws}`;
						tree.nodes[userName].insert(wsNode);

						let wsGroups = usersGroups.data[o.user.email].filter((g: { path: string | string[] }) => {
							return g.path.indexOf(`-${ws}/`) != -1;
						});
						wsGroups.forEach((g: { name: any; path: any }) => {
							let groupAssoc = `${chalk.blue('Group:')} ${g.name}, ${chalk.blue('Group path:')} ${g.path}`;
							tree.nodes[userName].nodes[wsNode].insert(groupAssoc);
						});

					});


				} else {
					tree.nodes[userName].insert(`- No roles -`);
				}
			});
		} else {
			tree.insert(`- No Users -`);
		}

		tree.display();
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