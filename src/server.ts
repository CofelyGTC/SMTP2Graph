import { log } from './classes/Logger';
import { Config } from './classes/Config';
import { MailQueue } from './classes/MailQueue';
import { SMTPServer } from './classes/SMTPServer';

(async ()=>{
    // Validate the config before continuing
    try {
        log("info", "Step1")
        Config.validate();
        log("info", "Step2")
    } catch(error) {
        await log('error', `Invalid config. ${String(error)}`, {error});
        process.exit(1);
    }

    const queue = new MailQueue();
    const server = new SMTPServer(queue);
    server.listen();
})();
