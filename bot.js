require('dotenv').config();

const Discord = require('discord.js');
const ytdl = require('youtube-dl-exec');
const ytpl = require('ytpl');
const client = new Discord.Client({ intents: [
    Discord.Intents.FLAGS.GUILD_MESSAGES, 
    Discord.Intents.FLAGS.GUILD_VOICE_STATES, 
    Discord.Intents.FLAGS.GUILDS
] });

const { Track } = require('./track.js');
const { Player } = require('./player.js');
const { Message, MessageType } = require('./message.js');

const string = require('./string.json');

const data = {};

client.on('ready', async () => {
    console.log(`${client.user.username} started at ${new Date().toISOString()}.`);
    client.user.setActivity(`${string.prefix}play`, { type: 'LISTENING' });
})

client.on('messageCreate', async message => {
    if(message.author.bot || !message.content.startsWith(string.prefix)) return;
    if(!data[message.guild.id]) data[message.guild.id] = {};
    const cmd = message.content.replace(string.prefix, '').split(' ')[0];
    const params = message.content.split(' ');
    params.shift();
    switch(cmd) {
        case 'join':
            Player.join(message.channel, message.member.voice.channel)
                .then(player => {
                    data[message.guild.id].player = player;
                    message.react('🎶');
                })
                .catch(error => {
                    error.addData('MESSAGE_FIELD_TITLE_REQUESTED_BY', message.author.tag);
                    message.reply( {embeds: [error.createMessage()]} );
                });
            break;

        case 'play':
        case 'add':
            const tracks = [];
            try {
                new URL(params[0]);
            } catch (e) {
                const errorMessage = new Message(MessageType.Error, 'Invalid url.');
                errorMessage.addData('MESSAGE_FIELD_TITLE_REQUESTED_BY', message.author.tag);
                message.reply( {embeds: [errorMessage.createMessage()]} );
                break;
            }
            if(!data[message.guild.id].player)
                try {
                    const player = await Player.join(message.channel, message.member.voice.channel);
                    data[message.guild.id].player = player;
                } catch (e) {
                    e.addData('MESSAGE_FIELD_TITLE_REQUESTED_BY', message.author.tag);
                    message.reply( {embeds: [e.createMessage()]} );
                    break;
                }
            message.react('⌛');
            try {
                if(ytpl.validateID(params[0])) {
                    const response = await ytpl(params[0]).json();
                    for(var i in response.items) {
                        const track = new Track(
                            `https://youtu.be/${response.items[i].id}`,
                            response.items[i].title
                        );
                        tracks.push(track);
                    }
                }
                else {
                    const response = await ytdl(params[0], {
                        dumpSingleJson: true,
                        noWarnings: true
                    });
                    if(response._type === 'playlist') {
                        for(var i in response.entries) {
                            const track = new Track(
                                response.entries[i].webpage_url,
                                response.entries[i].title
                            );
                            tracks.push(track);
                        }
                    }
                    else tracks.push(new Track(params[0], response.title));
                }
            } catch (e) {
                const errorMessage = new Message(MessageType.Error, `Failed to get info from ${params[0]}.`);
                if(e.stderr) errorMessage.addData('MESSAGE_FIELD_TITLE_DETAILS', e.stderr);
                errorMessage.addData(string.MESSAGE_FIELD_TITLE_REQUESTED_BY, message.author.tag);
                message.reply({embeds: [ errorMessage.createMessage() ]});
                break;
            }
            for(var i in tracks) data[message.guild.id].player.enqueue(tracks[i]);
            message.react('✅');
            break;

        case 'pause':
            if(data[message.guild.id].player) {
                data[message.guild.id].player.pause();
                message.react('⏸️');
            }
            else {
                const errorMessage = new Message(MessageType.Error, string.ERROR_VOICE_CHANNEL_NOT_JOINED);
                errorMessage.addData(string.MESSAGE_FIELD_TITLE_REQUESTED_BY, message.author.tag);
                message.reply({embeds: [ errorMessage.createMessage() ]});
            }
            break;

        case 'resume':
            if(data[message.guild.id].player) {
                data[message.guild.id].player.resume();
                message.react('▶️');
            }
            else {
                const errorMessage = new Message(MessageType.Error, string.ERROR_VOICE_CHANNEL_NOT_JOINED);
                errorMessage.addData(string.MESSAGE_FIELD_TITLE_REQUESTED_BY, message.author.tag);
                message.reply({embeds: [ errorMessage.createMessage() ]});
            }
            break;

        case 'next':
            if(data[message.guild.id].player) {
                await data[message.guild.id].player.next();
                message.react('⏭️');
            }
            else {
                const errorMessage = new Message(MessageType.Error, string.ERROR_VOICE_CHANNEL_NOT_JOINED);
                errorMessage.addData(string.MESSAGE_FIELD_TITLE_REQUESTED_BY, message.author.tag);
                message.reply({embeds: [ errorMessage.createMessage() ]});
            }
            break;

        case 'stop':
        case 'clear':
            if(data[message.guild.id].player) {
                data[message.guild.id].player.stop();
                message.react('⏹️');
            }
            else {
                const errorMessage = new Message(MessageType.Error, string.ERROR_VOICE_CHANNEL_NOT_JOINED);
                errorMessage.addData(string.MESSAGE_FIELD_TITLE_REQUESTED_BY, message.author.tag);
                message.reply({embeds: [ errorMessage.createMessage() ]});
            }
            break;

        case 'dc':
            if(!data[message.guild.id].player) {
                const errorMessage = new Message(MessageType.Error, string.ERROR_VOICE_CHANNEL_NOT_JOINED).createMessage();
                message.reply({ embeds:[errorMessage] });
                return;
            }
            data[message.guild.id].player.disconnect();
            delete data[message.guild.id].player;
            message.react('👋');
            break;
    }
});

var isExiting = false;
const onExit = exit => {
    if(isExiting) return;
    isExiting = true;
    if(exit) process.exit();
};
process.on('SIGINT', () => onExit(true));
process.on('SIGHUP', () => onExit());
process.on('SIGTERM', () => onExit());

client.login(process.env.DISCORD_TOKEN);