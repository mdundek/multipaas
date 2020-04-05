// import io from 'socket.io-client';
const socket = require('socket.io-client');

class EventsController {

	/**
	 * open
	 * @param {*} uri 
	 * @param {*} cb 
	 */
	static async open(uri, cb, done) {
		return new Promise((resolve, reject) => {
			this.client = socket(uri.substring(0, uri.lastIndexOf(":")) + ":3000");
			this.client.on('event', (data) => {
				cb(data);
			});
			this.client.on('connect', () => {
				resolve(this.client.id);
			});
			this.client.on('disconnect', () =>{
				done();
			});
		});
	}

	/**
	 * close
	 */
	static async close() {
		if(this.client){
			this.client.disconnect();
			this.client = null;
		}
	}
}

module.exports = EventsController;