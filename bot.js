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
const { getTranslated, getResourceString } = require('./string.js');

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
        const errorMessage = new Message(MessageType.Error, 'ERROR_GUILD_CHECK_PERMISSION');
        await guild.channels.cache.get(guild.systemChannelId).send({embeds: [errorMessage.createMessage(data[guild.id].locale)]});
        await guild.leave();
        return;
    }
    console.log(`Setting data for server ${guild.name}. (${guild.id})`);
    if(!data[guild.id]) data[guild.id] = {locale: 'default'};
    await setCommands(guild);
}

const setCommands = async guild => {
    try {
        await guild.commands.set([
            {
                name: 'join',
                description: getResourceString('COMMAND_DESCRIPTION_JOIN', data[guild.id].locale)
            },
            {
                name: 'play',
                description: getResourceString('COMMAND_DESCRIPTION_PLAY', data[guild.id].locale),
                options: [{
                    name: 'track',
                    type: 'STRING',
                    description: getResourceString('COMMAND_DESCRIPTION_PARAM_TRACK_URL', data[guild.id].locale),
                    required: true
                }]
            },
            {
                name: 'queue',
                description: getResourceString('COMMAND_DESCRIPTION_QUEUE', data[guild.id].locale)
            },
            {
                name: 'pause',
                description: getResourceString('COMMAND_DESCRIPTION_PAUSE', data[guild.id].locale)
            },
            {
                name: 'resume',
                description: getResourceString('COMMAND_DESCRIPTION_RESUME', data[guild.id].locale)
            },
            {
                name: 'next',
                description: getResourceString('COMMAND_DESCRIPTION_NEXT', data[guild.id].locale)
            },
            {
                name: 'stop',
                description: getResourceString('COMMAND_DESCRIPTION_STOP', data[guild.id].locale)
            },
            {
                name: 'dc',
                description: getResourceString('COMMAND_DESCRIPTION_DISCONNECT', data[guild.id].locale)
            },
            {
                name: 'lang',
                description: getResourceString('COMMAND_DESCRIPTION_SET_LOCALE', data[guild.id].locale),
                options: [{
                    name: 'locale',
                    type: 'STRING',
                    description: getResourceString('COMMAND_DESCRIPTION_PARAM_LOCALE', data[guild.id].locale),
                    required: true
                }]
            },
            {
                name: 'leave-server',
                description: getResourceString('COMMAND_DESCRIPTION_LEAVE_SERVER', data[guild.id].locale)
            }
        ]);
    } catch (error) {
        console.error(`Failed to set slash commands. Leaving server. (${guild.id})\n${error}`);
        const errorMessage = new Message(MessageType.Error, 'ERROR_GUILD_SET_COMMANDS');
        errorMessage.addData('MESSAGE_FIELD_TITLE_DETAILS', error.toString());
        await guild.channels.cache.get(guild.systemChannelId).send({embeds: [errorMessage.createMessage(data[guild.id].locale)]});
        await guild.leave();
    }
};

client.on('ready', async () => {
    console.log(`${client.user.username} started at ${client.readyAt.toISOString()}.`);
    client.user.setActivity(`/play`, { type: 'LISTENING' });
    client.guilds.cache.forEach(async value => {
        const content = getResourceString('INFO_BOT_ACTIVATED', data[value.id]?.locale, client.user.username);
        const message = new Message(MessageType.Info, content);
        value.systemChannel.send({embeds:[message.createMessage(data[value.id]?.locale)]}).catch(e => console.log(e));
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
                Player.join(interaction.channel, voiceChannel, data[interaction.guild.id].locale)
                    .then(async player => {
                        data[interaction.guild.id].player = player;
                        const content = getResourceString(
                            'SUCCESS_VOICE_CHANNEL_JOINED', 
                            data[interaction.guild.id].locale, 
                            voiceChannel.name);
                        const message = new Message(MessageType.Success, content);
                        await interaction.editReply({embeds: [message.createMessage(data[interaction.guild.id].locale)]});
                    })
                    .catch(async error => {
                        await interaction.editReply( {embeds: [error.createMessage(data[interaction.guild.id].locale)]} );
                    });
            }
            break;

        case 'dc':
            if(!data[interaction.guild.id].player) {
                const errorMessage = new Message(MessageType.Error, 'ERROR_VOICE_CHANNEL_NOT_JOINED');
                await interaction.reply({ embeds:[errorMessage.createMessage(data[interaction.guild.id].locale)] });
                break;
            }
            if(interaction.guild.me.voice.channel && !interaction.guild.me.voice.channel.members.has(interaction.user.id)) {
                const errorMessage = new Message(MessageType.Error, 'ERROR_VOICE_CHANNEL_USER_NOT_IN_SAME_CHANNEL');
                await interaction.reply({ embeds:[errorMessage.createMessage(data[interaction.guild.id].locale)] });
                break;
            }
            if((errorMessage = data[interaction.guild.id].player.disconnect()) instanceof Message) {
                await interaction.reply({ embeds:[errorMessage.createMessage(data[interaction.guild.id].locale)] })
                break;
            }
            delete data[interaction.guild.id].player;
            const message = new Message(MessageType.Success, 'SUCCESS_VOICE_CHANNEL_DISCONNECTED');
            await interaction.reply({embeds: [message.createMessage(data[interaction.guild.id].locale)]});
            break;
            
        case 'queue':
            if(data[interaction.guild.id].player) {
                await interaction.deferReply();
                var currentPage = 0;
                if((result = data[interaction.guild.id].player.getQueue(currentPage)) instanceof Message) {
                    await interaction.editReply({ embeds: [result.createMessage(data[interaction.guild.id].locale)] });
                }
                else {
                    const content = getResourceString('INFO_PLAYER_QUEUE', data[interaction.guild.id].locale, result.length, result.list);
                    await interaction.editReply({ embeds: [new Message(MessageType.Info, content).createMessage(data[interaction.guild.id].locale)] })
                        .then(queueMessage => {
                            const filter = (reaction, user) => ['⬅️', '➡️'].includes(reaction.emoji.name) && user.id === interaction.user.id;
                            const collector = queueMessage.createReactionCollector({ filter, time: 60000, dispose: true });
                            const turnPage = async (next) => {
                                if(!data[queueMessage.guild.id].player) {
                                    if(!queueMessage.deleted) await queueMessage.delete();
                                    return;
                                }
                                if(currentPage == 0 && !next) return;
                                const result = data[queueMessage.guild.id].player.getQueue(next ? ++currentPage : --currentPage);
                                const content = getResourceString('INFO_PLAYER_QUEUE', data[interaction.guild.id].locale, result.length, result.list);
                                queueMessage.edit({ embeds: [new Message(MessageType.Info, content).createMessage(data[interaction.guild.id].locale)] });
                                collector.resetTimer();
                            };
                            collector.on('collect', r => turnPage(r.emoji.name === '➡️'));
                            collector.on('remove', r => turnPage(r.emoji.name === '➡️'));
                            collector.on('end', () => {if(!queueMessage.deleted) queueMessage.delete()});
                            queueMessage.react('⬅️');
                            queueMessage.react('➡️');
                        })
                        .catch(async error => {
                            const errorMessage = new Message(MessageType.Error, 'ERROR_UNKNOWN');
                            errorMessage.addData('MESSAGE_FIELD_TITLE_DETAILS', error.toString());
                            await interaction.editReply({embeds: [ errorMessage.createMessage(data[interaction.guild.id].locale) ]});
                        });
                }
            }
            else {
                await interaction.reply({embeds: [
                    new Message(MessageType.Error, 'ERROR_VOICE_CHANNEL_NOT_JOINED').createMessage(data[interaction.guild.id].locale)
                ]});
            }
            break;

        case 'play':
            if(interaction.guild.me.voice.channel && !interaction.guild.me.voice.channel.members.has(interaction.user.id)) {
                const errorMessage = new Message(MessageType.Error, 'ERROR_VOICE_CHANNEL_USER_NOT_IN_SAME_CHANNEL').createMessage(data[interaction.guild.id].locale);
                await interaction.reply({ embeds:[errorMessage] });
                break;
            }
            await interaction.deferReply();
            var url;
            try {
                url = new URL(interaction.options.get('track').value);
            } catch (e) {
                const errorMessage = new Message(MessageType.Error, getResourceString(
                    'ERROR_INVALID_URL', 
                    data[interaction.guild.id], 
                    interaction.options.get('track').value));
                errorMessage.addData('MESSAGE_FIELD_TITLE_DETAILS', interaction.user.tag);
                await interaction.editReply({ embeds:[errorMessage.createMessage(data[interaction.guild.id].locale)] });
                break;
            }
            if(!data[interaction.guild.id].player && interaction.member instanceof Discord.GuildMember)
                try {
                    const player = await Player.join(interaction.channel, interaction.member.voice.channel, data[interaction.guild.id].locale);
                    data[interaction.guild.id].player = player;
                } catch (e) {
                    await interaction.editReply( {embeds: [e.createMessage(data[interaction.guild.id].locale)]} );
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
                    const content = getResourceString('ERROR_PLAYLIST_FAILED', data[interaction.guild.id].locale, url.href);
                    const errorMessage = new Message(MessageType.Error, content);
                    errorMessage.addData('MESSAGE_FIELD_TITLE_DETAILS', e.toString());
                    await interaction.editReply({embeds: [ errorMessage.createMessage(data[interaction.guild.id].locale) ]});
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
                    const content = getResourceString('ERROR_GET_INFO_FROM_URL', data[interaction.guild.id].locale, url.href);
                    const errorMessage = new Message(MessageType.Error, content);
                    errorMessage.addData('MESSAGE_FIELD_TITLE_DETAILS', e.stderr ? e.stderr : e.toString());
                    await interaction.editReply({embeds: [ errorMessage.createMessage(data[interaction.guild.id].locale) ]});
                    break;
                }
            }
            for(var i in tracks) data[interaction.guild.id].player.enqueue(tracks[i]);
            const content = getResourceString('SUCCESS_PLAYER_QUEUED', data[interaction.guild.id].locale, tracks.length);
            await interaction.editReply({embeds:[new Message(MessageType.Success, content).createMessage(data[interaction.guild.id].locale)]});
            break;

        case 'pause':
            if(interaction.guild.me.voice.channel && !interaction.guild.me.voice.channel.members.has(interaction.user.id)) {
                const errorMessage = new Message(MessageType.Error, 'ERROR_VOICE_CHANNEL_USER_NOT_IN_SAME_CHANNEL').createMessage(data[interaction.guild.id].locale);
                await interaction.reply({ embeds:[errorMessage] });
                break;
            }
            if(data[interaction.guild.id].player) {
                data[interaction.guild.id].player.pause();
                await interaction.reply({embeds:[new Message(MessageType.Success, 'SUCCESS_PLAYER_PAUSED').createMessage(data[interaction.guild.id].locale)]});
            }
            else {
                const errorMessage = new Message(MessageType.Error, 'ERROR_VOICE_CHANNEL_NOT_JOINED');
                await interaction.reply({embeds: [ errorMessage.createMessage(data[interaction.guild.id].locale) ]});
            }
            break;

        case 'resume':
            if(interaction.guild.me.voice.channel && !interaction.guild.me.voice.channel.members.has(interaction.user.id)) {
                const errorMessage = new Message(MessageType.Error, 'ERROR_VOICE_CHANNEL_USER_NOT_IN_SAME_CHANNEL').createMessage(data[interaction.guild.id].locale);
                await interaction.reply({ embeds:[errorMessage] });
                break;
            }
            if(data[interaction.guild.id].player) {
                data[interaction.guild.id].player.resume();
                await interaction.reply({embeds:[new Message(MessageType.Success, 'SUCCESS_PLAYER_RESUMED').createMessage(data[interaction.guild.id].locale)]});
            }
            else {
                const errorMessage = new Message(MessageType.Error, 'ERROR_VOICE_CHANNEL_NOT_JOINED');
                await interaction.reply({embeds: [ errorMessage.createMessage(data[interaction.guild.id].locale) ]});
            }
            break;

        case 'next':
            if(interaction.guild.me.voice.channel && !interaction.guild.me.voice.channel.members.has(interaction.user.id)) {
                const errorMessage = new Message(MessageType.Error, 'ERROR_VOICE_CHANNEL_USER_NOT_IN_SAME_CHANNEL').createMessage(data[interaction.guild.id].locale);
                await interaction.reply({ embeds:[errorMessage] });
                break;
            }
            if(data[interaction.guild.id].player) {
                data[interaction.guild.id].player.subscription.player.stop();
                await interaction.reply({embeds:[new Message(MessageType.Success, 'SUCCESS_PLAYER_NEXT').createMessage(data[interaction.guild.id].locale)]});
            }
            else {
                const errorMessage = new Message(MessageType.Error, 'ERROR_VOICE_CHANNEL_NOT_JOINED');
                await interaction.reply({embeds: [ errorMessage.createMessage(data[interaction.guild.id].locale) ]});
            }
            break;

        case 'stop':
        case 'clear':
            if(interaction.guild.me.voice.channel && !interaction.guild.me.voice.channel.members.has(interaction.user.id)) {
                const errorMessage = new Message(MessageType.Error, 'ERROR_VOICE_CHANNEL_USER_NOT_IN_SAME_CHANNEL').createMessage(data[interaction.guild.id].locale);
                await interaction.reply({ embeds:[errorMessage] });
                break;
            }
            if(data[interaction.guild.id].player) {
                data[interaction.guild.id].player.stop();
                await interaction.reply({embeds:[new Message(MessageType.Success, 'SUCCESS_PLAYER_STOPPED').createMessage(data[interaction.guild.id].locale)]});
            }
            else {
                const errorMessage = new Message(MessageType.Error, 'ERROR_VOICE_CHANNEL_NOT_JOINED');
                await interaction.reply({embeds: [ errorMessage.createMessage(data[interaction.guild.id].locale) ]});
            }
            break;

        case 'lang':
            await interaction.deferReply();
            if(await isAdmin(interaction.member)) {
                const locale = interaction.options.get('locale').value;
                if(locale === 'list') {
                    await interaction.editReply({embeds: [new Message(MessageType.Success, getTranslated().join(', ')).createMessage()]});
                    break;
                }
                if(getTranslated().includes(locale)) {
                    data[interaction.guild.id].locale = locale;
                    await setCommands(interaction.guild);
                    const message = new Message(MessageType.Success, 'SUCCESS_SET_LOCALE');
                    await interaction.editReply({embeds: [message.createMessage(data[interaction.guild.id].locale)]});
                }
                else {
                    const errorMessage = new Message(MessageType.Error, 'ERROR_COMMAND_LOCALE_NOT_SUPPORTED');
                    await interaction.editReply({embeds: [errorMessage.createMessage(data[interaction.guild.id].locale)]});
                }
            }
            else {
                const errorMessage = new Message(MessageType.Error, 'ERROR_COMMAND_PERMISSION_DENIED');
                await interaction.editReply({embeds: [errorMessage.createMessage(data[interaction.guild.id].locale)]});
            }
            break;

        case 'leave-server':
            await interaction.deferReply();
            if(await isAdmin(interaction.member)) {
                const content = getResourceString('SUCCESS_GUILD_LEAVE', data[interaction.guild.id].locale, interaction.guild.name);
                await interaction.editReply({embeds: [new Message(MessageType.Success, content).createMessage(data[interaction.guild.id].locale)]});
                interaction.guild.leave();
            }
            else {
                const errorMessage = new Message(MessageType.Error, 'ERROR_COMMAND_PERMISSION_DENIED');
                await interaction.editReply({embeds: [errorMessage.createMessage(data[interaction.guild.id].locale)]});
            }
            break;
    }
});

const isAdmin = async member => {
    if (!client.application.owner) await client.application.fetch();
    return member.permissions.has('ADMINISTRATOR') || member.id === client.application.owner.id
}

var isExiting = false;
const onExit = exit => {
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