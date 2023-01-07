import { Client, Collection, CommandInteraction, GatewayIntentBits, REST, Routes } from "discord.js";
import { readdirSync } from "fs";
import { createServer } from "http";
import path from "path";
import configJson from './config.json';

const commandsExec = new Collection<String, Function>();
const config = process.argv.includes('--debug') ? configJson.debug : configJson;
const client = new Client({ 
    intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates ]
});

client.once('ready', client => {
    console.log(`Logged in as ${client.user.tag}.`);
    registerCommands();
});
client.on('interactionCreate', interaction => {
    if(!interaction.isCommand()) return;
    commandsExec.get((interaction as CommandInteraction).commandName)?.call(this, interaction).catch((e: any) => {
        console.error(`Unable to execute the command /${(interaction as CommandInteraction).commandName}.`);
        console.error(e);
    });
});
process.once('SIGTERM', () => {
    client.destroy();
});

client.login(config.token);

async function registerCommands() {
    let commandFiles = readdirSync('./commands');
    let commands = [];
    for(let filename of commandFiles) {
        
        let command = await import(path.resolve(`./commands/${filename}`));
        commands.push(command.data.toJSON());
        commandsExec.set(command.data.name, command.execute);
    }

    let data = await new REST({ version: '10' })
            .setToken(config.token)
            .put(Routes.applicationCommands(config.clientId), { body: commands }) as object[];

    console.log(`Successfully loaded ${data.length} applications commands.`);
}

createServer((req, res) => {
    let url = new URL('https://discord.com/api/oauth2/authorize?permissions=0&scope=bot%20applications.commands');
    url.searchParams.set('client_id', config.clientId);
    res.statusCode = 302;
    res.setHeader('Location', url.toString());
    res.end();
}).listen(8000);