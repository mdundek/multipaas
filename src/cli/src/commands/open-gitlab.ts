import {flags} from '@oclif/command'
import Command from '../base'
import cli from 'cli-ux'

export default class OpenGitlab extends Command {
    static description = 'Open the private gitlab web UI in your default browser'

	/**
	 * run
	 */
	async run() {		
		await cli.open('https://multipaas.gitlab.com')
	}
}
