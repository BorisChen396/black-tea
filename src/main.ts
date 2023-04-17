import { Client, GatewayIntentBits, Events, SlashCommandBuilder, CommandInteraction, EmbedBuilder, Colors, Routes, REST } from 'discord.js';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import config from './config.json' assert { type: 'json' }
import { readdirSync } from 'fs';
import { ActivityType } from 'discord.js';

const commands : Map<string, {
    data : any,
    execute : Function
}> = new Map();
await (async () => {
    console.log('Importing commands...');
    let commandDir = join(dirname(fileURLToPath(import.meta.url)), 'commands');
    for(let cmdFile of readdirSync(commandDir).filter(file => file.endsWith('.js'))) {
        let command = await import(pathToFileURL(join(commandDir, cmdFile)).toString());
        if(command.data && command.execute) commands.set(command.data.name, {
            data: command.data.toJSON(),
            execute: command.execute
        });
        else console.log(`Warning: File "${cmdFile}" is missing required property, skipping.`);
    }
})()

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});
client.on(Events.ClientReady, client => {
    console.log(`Logged in as ${client.user.tag}.`);

    client.user.setActivity({
        type: ActivityType.Listening,
        name: '/play'
    });
    (async () => {
        let rest = new REST().setToken(config.token);
        let result : any = await rest.put(Routes.applicationCommands(client.user.id),
            { body: Array.from(commands.values()).map(value => value.data) });
        console.log(`Successfully loaded ${result.length} application commands.`);
    })();
    
}).on(Events.InteractionCreate, interaction => {
    if(!(interaction instanceof CommandInteraction)) return;
    let command = commands.get(interaction.commandName);
    if(command) {
        command.execute(interaction).catch((error : any) => {
            let errorMessage;
            if(error instanceof EmbedBuilder) {
                console.error(`${error.data.title}: ${error.data.description}`);
                errorMessage = error;
            }
            else {
                console.error(error);
                errorMessage = new EmbedBuilder()
                    .setTitle('Unknown Error')
                    .setDescription('An unknown error occurred.')
                    .setColor(Colors.Red);
                if(error instanceof Error) 
                    errorMessage.setTitle(error.name).setDescription(error.message);
            }
            if (interaction.replied || interaction.deferred) 
                interaction.followUp({ embeds: [ errorMessage.data ], ephemeral: true }).catch(console.error);
            else 
                interaction.reply({ embeds: [ errorMessage.data ], ephemeral: true }).catch(console.error);
        });
    }
    else {
        let embed = new EmbedBuilder()
            .setTitle('Unknown Command')
            .setDescription(`"${interaction.commandName}" is not a valid command.`)
            .setColor(Colors.Red);
        interaction.reply({ embeds: [ embed.data ]}).catch(console.error);
    }
});
client.login(config.token);

function cleanup() {
    if(client.isReady()) {
        client.destroy();
        console.log(`Client destroyed.`);
    }
}

process.once('SIGINT', () => cleanup())
    .once('SIGTERM', () => cleanup())
    .once('uncaughtException', e => {
        console.error(e);
        cleanup();
    })
    .once('unhandledRejection', e => {
        console.error(e);
        cleanup();
    });