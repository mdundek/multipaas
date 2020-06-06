import {flags} from '@oclif/command'
import Command from '../../base'
import {cli} from 'cli-ux'

const chalk = require('chalk')

export default class Images extends Command {
	static description = 'list your registry images for this organization'
	
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
		if(result.code == 200){
			result.data = result.data.filter((o: { tags: string | any[] | null; }) => o.tags != null && o.tags.length > 0);
			
			if(result.data.length > 0){
				let tree = cli.tree();
				result.data.forEach((o: { name: string, tags: Array<any> }) => {
					let imageName = `${chalk.cyan('Image name:')} ${o.name}`;
					tree.insert(imageName);
					if(o.tags && o.tags.length > 0){
						o.tags.forEach(b => {
							let tagName = `${chalk.grey('Tag:')} ${b}`;
							tree.nodes[imageName].insert(tagName);
						});
					} else {
						tree.nodes[imageName].insert(`- No tags -`);
					}
				});
				tree.display();
			} else {
				this.logMessage("No images found for this organization");
			}			
		} else if(result.code == 401){
			this.logError(`You are not logged in`);
		} else if(result.code == 412){
			this.logError(`You need to select a workspace first`);
		} else if(result.code == 417){
			this.logError(`The cli API host has not been defined. Please run the command "multipaas join" to specity a target host for MultiPaaS.`);
		} else if(result.code == 425){
			this.logError(`The cluster is updating. Please try again in a little while`);
		} else if(result.code == 503){
			this.logError(`MultiPaaS is not accessible. Please make sure that you are connected to the right network and try again.`);
		} else {
			console.log(JSON.stringify(result, null, 4));
			this.logError("Something went wrong... Please inform the system administrator.");
		}
	}
}