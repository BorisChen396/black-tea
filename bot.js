require('dotenv').config();

const Discord = require('discord.js');
const ytdl = require('youtube-dl-exec');
const ytpl = require('ytpl');
const client = new Discord.Client({ intents: [
    Discord.Intents.FLAGS.GUILDS,
    Discord.Intents.FLAGS.GUILD_MESSAGES, 
    Discord.Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
    Discord.Intents.FLAGS.GUILD_VOICE_STATES
] });

const { Track } = require('./track.js');
const { Player } = require('./player.js');
const { Message, MessageType } = require('./message.js');

const string = require('./string.json');

const permissions = [
    Discord.Permissions.FLAGS.VIEW_CHANNEL,
    Discord.Permissions.FLAGS.SEND_MESSAGES,
    Discord.Permissions.FLAGS.ADD_REACTIONS,
    Discord.Permissions.FLAGS.CONNECT,
    Discord.Permissions.FLAGS.SPEAK,
    Discord.Permissions.FLAGS.USE_VAD,
];
const data = {};

async function setServerData(guild) {
    console.log(`Checking my permissions in server ${guild.name}. (${guild.id})`);
    if(!guild.me.permissions.has(permissions)) {
        console.error(`Permission rejected. Leaving server. (${guild.id})`);
        const errorMessage = new Message(MessageType.Error, string.ERROR_GUILD_CHECK_PERMISSION);
        await guild.channels.cache.get(guild.systemChannelId).send({embeds: [errorMessage.createMessage()]});
        await guild.leave();
        return;
    }
    console.log(`Setting data for server ${guild.name}. (${guild.id})`);
    data[guild.id] = {};
    guild.commands.set([
        {
            name: 'join',
            description: string.COMMAND_DESCRIPTION_JOIN
        },
        {
            name: 'play',
            description: string.COMMAND_DESCRIPTION_PLAY,
            options: [{
                name: 'track',
                type: 'STRING',
                description: 'The URL of the track.',
                required: true
            }]
        },
        {
            name: 'queue',
            description: string.COMMAND_DESCRIPTION_QUEUE
        },
        {
            name: 'pause',
            description: string.COMMAND_DESCRIPTION_PAUSE
        },
        {
            name: 'resume',
            description: string.COMMAND_DESCRIPTION_RESUME
        },
        {
            name: 'next',
            description: string.COMMAND_DESCRIPTION_NEXT
        },
        {
            name: 'stop',
            description: string.COMMAND_DESCRIPTION_STOP
        },
        {
            name: 'dc',
            description: string.COMMAND_DESCRIPTION_DISCONNECT
        },
        {
            name: 'leave-server',
            description: 'Leave the server. Only the administrators can use this command.'
        }
    ]).catch(async error => {
        console.error(`Failed to set slash commands. Leaving server. (${guild.id})\n${error}`);
        const errorMessage = new Message(MessageType.Error, string.ERROR_GUILD_SET_COMMANDS);
        errorMessage.addData('MESSAGE_FIELD_TITLE_DETAILS', error.toString());
        await guild.channels.cache.get(guild.systemChannelId).send({embeds: [errorMessage.createMessage()]});
        await guild.leave();
    });
}

client.on('ready', async () => {
    console.log(`${client.user.username} started at ${client.readyAt.toISOString()}.`);
    client.user.setActivity(`/play`, { type: 'LISTENING' });
    client.guilds.cache.forEach(async value => {
        const message = new Message(MessageType.Info, `Bot ${client.user.username} is back! >ωO`);
        value.systemChannel.send({embeds:[message.createMessage()]}).catch(e => console.log(e));
        await setServerData(value);
    });
})

client.on('guildCreate', async guild => {
    await setServerData(guild);
})

client.on('guildDelete', guild => {
    delete data[guild.id];
});

client.on('interactionCreate', async interaction => {
    if(!interaction.isCommand() || !interaction.guildId) return;
    if(!data[interaction.guild.id]) data[interaction.guild.id] = {};
    switch(interaction.commandName) {
        case 'join':
            if(interaction.member instanceof Discord.GuildMember) {
                const voiceChannel = interaction.member.voice.channel;
                await interaction.deferReply();
                Player.join(interaction.channel, voiceChannel)
                    .then(async player => {
                        data[interaction.guild.id].player = player;
                        await interaction.editReply({embeds: [new Message(MessageType.Success, `Joined ${voiceChannel.name}.`).createMessage()]});
                    })
                    .catch(async error => {
                        error.addData('MESSAGE_FIELD_TITLE_REQUESTED_BY', interaction.user.tag);
                        await interaction.editReply( {embeds: [error.createMessage()]} );
                    });
            }
            break;

        case 'dc':
            if(!data[interaction.guild.id].player) {
                const errorMessage = new Message(MessageType.Error, string.ERROR_VOICE_CHANNEL_NOT_JOINED).createMessage();
                await interaction.reply({ embeds:[errorMessage] });
                break;
            }
            if(interaction.guild.me.voice.channel && !interaction.guild.me.voice.channel.members.has(interaction.user.id)) {
                const errorMessage = new Message(MessageType.Error, string.ERROR_VOICE_CHANNEL_USER_NOT_IN_SAME_CHANNEL).createMessage();
                await interaction.reply({ embeds:[errorMessage] });
                break;
            }
            if((errorMessage = data[interaction.guild.id].player.disconnect()) instanceof Message) {
                errorMessage.addData(string.MESSAGE_FIELD_TITLE_REQUESTED_BY, interaction.user.tag);
                await interaction.reply({ embeds:[errorMessage.createMessage()] })
                break;
            }
            delete data[interaction.guild.id].player;
            await interaction.reply({embeds: [new Message(MessageType.Success, `Disconnected the voice channel.`).createMessage()]});
            break;
            
        case 'queue':
            if(data[interaction.guild.id].player) {
                await interaction.deferReply();
                var currentPage = 0;
                if((result = data[interaction.guild.id].player.getQueue(currentPage)) instanceof Message && result.type !== MessageType.Info) {
                    result.addData(string.MESSAGE_FIELD_TITLE_REQUESTED_BY, interaction.user.tag);
                    await interaction.editReply({ embeds: [result.createMessage()] });
                }
                else {
                    await interaction.editReply({ embeds: [result.createMessage()] }).then(queueMessage => {
                        const filter = (reaction, user) => ['⬅️', '➡️'].includes(reaction.emoji.name) && user.id === interaction.user.id;
                        const collector = queueMessage.createReactionCollector({ filter, time: 60000, dispose: true });
                        const turnPage = async (next) => {
                            if(!data[queueMessage.guild.id].player) {
                                if(!queueMessage.deleted) await queueMessage.delete();
                                return;
                            }
                            if(currentPage == 0 && !next) return;
                            const message = data[queueMessage.guild.id].player.getQueue(next ? ++currentPage : --currentPage).createMessage();
                            queueMessage.edit({ embeds: [message] });
                            collector.resetTimer();
                        };
                        collector.on('collect', r => turnPage(r.emoji.name === '➡️'));
                        collector.on('remove', r => turnPage(r.emoji.name === '➡️'));
                        collector.on('end', () => {if(!queueMessage.deleted) queueMessage.delete()});
                        queueMessage.react('⬅️');
                        queueMessage.react('➡️');
                    })
                    .catch(async error => {
                        const errorMessage = new Message(MessageType.Error, string.ERROR_UNNKNOWN);
                        errorMessage.addData('MESSAGE_FIELD_TITLE_DETAILS', error.toString());
                        errorMessage.addData(string.MESSAGE_FIELD_TITLE_REQUESTED_BY, interaction.user.tag);
                        await interaction.editReply({embeds: [ errorMessage.createMessage() ]});
                    });
                }
            }
            else {
                const errorMessage = new Message(MessageType.Error, string.ERROR_VOICE_CHANNEL_NOT_JOINED);
                errorMessage.addData(string.MESSAGE_FIELD_TITLE_REQUESTED_BY, interaction.user.tag);
                await interaction.reply({embeds: [ errorMessage.createMessage() ]});
            }
            break;

        case 'play':
            if(interaction.guild.me.voice.channel && !interaction.guild.me.voice.channel.members.has(interaction.user.id)) {
                const errorMessage = new Message(MessageType.Error, string.ERROR_VOICE_CHANNEL_USER_NOT_IN_SAME_CHANNEL).createMessage();
                await interaction.reply({ embeds:[errorMessage] });
                break;
            }
            await interaction.deferReply();
            var url;
            try {
                url = new URL(interaction.options.get('track').value);
            } catch (e) {
                const errorMessage = new Message(MessageType.Error, `${interaction.options.get('track').value} is not a valid URL.`);
                errorMessage.addData('MESSAGE_FIELD_TITLE_DETAILS', interaction.user.tag);
                errorMessage.addData('MESSAGE_FIELD_TITLE_REQUESTED_BY', interaction.user.tag);
                await interaction.editReply({ embeds:[errorMessage.createMessage()] });
                break;
            }
            if(!data[interaction.guild.id].player && interaction.member instanceof Discord.GuildMember)
                try {
                    const player = await Player.join(interaction.channel, interaction.member.voice.channel);
                    data[interaction.guild.id].player = player;
                } catch (e) {
                    e.addData('MESSAGE_FIELD_TITLE_REQUESTED_BY', interaction.user.tag);
                    interaction.followUp( {embeds: [e.createMessage()]} );
                    break;
                }
            const tracks = [];
            if(ytpl.validateID(url.href)) {
                try {
                    const response = await ytpl(url.href);
                    for(var i in response.items) {
                        const track = new Track(
                            `https://youtu.be/${response.items[i].id}`,
                            response.items[i].title
                        );
                        tracks.push(track);
                    }
                } catch (e) {
                    const errorMessage = new Message(MessageType.Error, `Failed to add the playlist from ${url.href}.`);
                    errorMessage.addData('MESSAGE_FIELD_TITLE_DETAILS', e.toString());
                    errorMessage.addData('MESSAGE_FIELD_TITLE_REQUESTED_BY', interaction.user.tag);
                    await interaction.editReply({embeds: [ errorMessage.createMessage() ]});
                    break;
                }
            }
            else {
                try {
                    const response = await ytdl(url.href, {
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
                    else tracks.push(new Track(url.href, response.title));
                } catch (e) {
                    const errorMessage = new Message(MessageType.Error, `Failed to get info from ${url.href}.`);
                    errorMessage.addData('MESSAGE_FIELD_TITLE_DETAILS', e.stderr ? e.stderr : e.toString());
                    errorMessage.addData(string.MESSAGE_FIELD_TITLE_REQUESTED_BY, interaction.user.tag);
                    await interaction.editReply({embeds: [ errorMessage.createMessage() ]});
                    break;
                }
            }
            for(var i in tracks) data[interaction.guild.id].player.enqueue(tracks[i]);
            await interaction.editReply({embeds:[new Message(MessageType.Success, `Queued ${tracks.length} item(s).`).createMessage()]});
            break;

        case 'pause':
            if(interaction.guild.me.voice.channel && !interaction.guild.me.voice.channel.members.has(interaction.user.id)) {
                const errorMessage = new Message(MessageType.Error, string.ERROR_VOICE_CHANNEL_USER_NOT_IN_SAME_CHANNEL).createMessage();
                await interaction.reply({ embeds:[errorMessage] });
                break;
            }
            if(data[interaction.guild.id].player) {
                data[interaction.guild.id].player.pause();
                await interaction.reply({embeds:[new Message(MessageType.Success, `Player paused.`).createMessage()]});
            }
            else {
                const errorMessage = new Message(MessageType.Error, string.ERROR_VOICE_CHANNEL_NOT_JOINED);
                errorMessage.addData(string.MESSAGE_FIELD_TITLE_REQUESTED_BY, interaction.user.tag);
                await interaction.reply({embeds: [ errorMessage.createMessage() ]});
            }
            break;

        case 'resume':
            if(interaction.guild.me.voice.channel && !interaction.guild.me.voice.channel.members.has(interaction.user.id)) {
                const errorMessage = new Message(MessageType.Error, string.ERROR_VOICE_CHANNEL_USER_NOT_IN_SAME_CHANNEL).createMessage();
                await interaction.reply({ embeds:[errorMessage] });
                break;
            }
            if(data[interaction.guild.id].player) {
                data[interaction.guild.id].player.resume();
                await interaction.reply({embeds:[new Message(MessageType.Success, `Player resumed.`).createMessage()]});
            }
            else {
                const errorMessage = new Message(MessageType.Error, string.ERROR_VOICE_CHANNEL_NOT_JOINED);
                errorMessage.addData(string.MESSAGE_FIELD_TITLE_REQUESTED_BY, interaction.user.tag);
                await interaction.reply({embeds: [ errorMessage.createMessage() ]});
            }
            break;

        case 'next':
            if(interaction.guild.me.voice.channel && !interaction.guild.me.voice.channel.members.has(interaction.user.id)) {
                const errorMessage = new Message(MessageType.Error, string.ERROR_VOICE_CHANNEL_USER_NOT_IN_SAME_CHANNEL).createMessage();
                await interaction.reply({ embeds:[errorMessage] });
                break;
            }
            if(data[interaction.guild.id].player) {
                data[interaction.guild.id].player.subscription.player.stop();
                await interaction.reply({embeds:[new Message(MessageType.Success, `Skipped to the next item.`).createMessage()]});
            }
            else {
                const errorMessage = new Message(MessageType.Error, string.ERROR_VOICE_CHANNEL_NOT_JOINED);
                errorMessage.addData(string.MESSAGE_FIELD_TITLE_REQUESTED_BY, interaction.user.tag);
                await interaction.reply({embeds: [ errorMessage.createMessage() ]});
            }
            break;

        case 'stop':
        case 'clear':
            if(interaction.guild.me.voice.channel && !interaction.guild.me.voice.channel.members.has(interaction.user.id)) {
                const errorMessage = new Message(MessageType.Error, string.ERROR_VOICE_CHANNEL_USER_NOT_IN_SAME_CHANNEL).createMessage();
                await interaction.reply({ embeds:[errorMessage] });
                break;
            }
            if(data[interaction.guild.id].player) {
                data[interaction.guild.id].player.stop();
                await interaction.reply({embeds:[new Message(MessageType.Success, `Player stopped.`).createMessage()]});
            }
            else {
                const errorMessage = new Message(MessageType.Error, string.ERROR_VOICE_CHANNEL_NOT_JOINED);
                errorMessage.addData(string.MESSAGE_FIELD_TITLE_REQUESTED_BY, interaction.user.tag);
                await interaction.reply({embeds: [ errorMessage.createMessage() ]});
            }
            break;

        case 'leave-server':
            interaction.deferReply();
            if (!client.application.owner) await client.application.fetch();
            if(interaction.member.permissions.has('KICK_MEMBERS') || interaction.user.id === client.application.owner.id) {
                const errorMessage = new Message(MessageType.Success, `Leaving ${interaction.guild.name}.`);
                await interaction.editReply({embeds: [errorMessage.createMessage()]});
                interaction.guild.leave();
            }
            else {
                const errorMessage = new Message(MessageType.Error, 'Permission denied.');
                await interaction.editReply({embeds: [errorMessage.createMessage()]});
            }
            break;
    }
});

var isExiting = false;
const onExit =  exit => {
    if(isExiting) return;
    isExiting = true;
    client.guilds.cache.forEach((value, key, map) => {
        if(data[key] && data[key].player) data[key].player.disconnect();
    });
    console.log('Shuting down...');
    if(exit) process.exit();
};
process.on('SIGINT', () => onExit(true));
process.on('SIGHUP', () => onExit());
process.on('SIGTERM', () => onExit());

client.login(process.env.DISCORD_TOKEN);