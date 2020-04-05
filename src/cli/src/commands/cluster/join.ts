import {flags} from '@oclif/command'
import Command from '../../base'
import cli from 'cli-ux'

export default class JoinMcServer extends Command {
    static description = 'specify a MyCloud API target server'

	static flags = {
		help: flags.help({char: 'h'}),
		host: flags.string({
			char: 'h',
			description: 'MyCloud API host url'
		})
	}

	/**
	 * run
	 */
	async run() {
		const {flags} = this.parse(JoinMcServer)
		let params = {
			host: ""
		}
		
		if(!flags.host){
			params.host = await cli.prompt('What is the MyCloud API host url?')
		} else {
			params.host = flags.host
		}
		if(params.host.toLowerCase().indexOf("http://") != 0 && params.host.toLowerCase().indexOf("https://") != 0){
			params.host = "http://" + params.host;
		}
		
		let result = await this.api("join", params);

		if(result.code == 200){
			this.log(`Success!`);
		} else if(result.code == 404){
			this.logError(`This host does not seem to be valid`);
		} else {
			this.logError("Something went wrong... Please inform the system administrator.");
		}
	}
}
