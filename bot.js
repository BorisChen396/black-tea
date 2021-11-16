require('dotenv').config();

const Discord = require('discord.js');
const voice = require('@discordjs/voice');
const ytdl = require('youtube-dl-exec');
const ytpl = require('ytpl');
const client = new Discord.Client({ intents: [
    Discord.Intents.FLAGS.GUILD_MESSAGES, 
    Discord.Intents.FLAGS.GUILD_VOICE_STATES, 
    Discord.Intents.FLAGS.GUILDS
] });
const track = require('./track.js');
const tools = require('./tools.js');

const string = require('./string.json');

const HIGH_PING = 150;

class Music {

    constructor () {
        this.data = {};
    }
    
    join(guild, messageChannel, voiceChannel) {
        return new Promise(async (resolve, reject) => {
            if(!guild || !voiceChannel) {
                reject();
                return;
            }
            const permissions = guild.me.permissionsIn(voiceChannel);
            if(!permissions.has(Discord.Permissions.FLAGS.CONNECT)) {
                reject('Permission denied.');
                return;
            }
            const connection = voice.joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: guild.id,
                adapterCreator: guild.voiceAdapterCreator
            });
            try {
                await Promise.race([
                        voice.entersState(connection, voice.VoiceConnectionStatus.Ready, 10000),
                ]);
            } catch (e) {
                connection.destroy();
                reject('Connection timeout.');
                return;
            }
            connection.on(voice.VoiceConnectionStatus.Disconnected, async () => {
                try {
                    await Promise.race([
                        voice.entersState(connection, voice.VoiceConnectionStatus.Signalling, 5000),
                        voice.entersState(connection, voice.VoiceConnectionStatus.Connecting, 5000),
                    ]);
                    // Seems to be reconnecting to a new channel - ignore disconnect
                } catch (error) {
                    // Seems to be a real disconnect which SHOULDN'T be recovered from
                    delete this.data[connection.joinConfig.guildId];
                    tools.log('Connection destroyed.', connection.joinConfig.guildId);
                    connection.destroy();
                }
            });
            this.data[guild.id] = {
                messageChannel: messageChannel,
                subscription: null,
                queue: [],
                index: -1
            };
            tools.log(`Joined ${client.channels.cache.get(voiceChannel.id).name}.`, guild.id);
            resolve();
        });
    }
    
    enqueue(guild, url) {
        return new Promise(async (resolve, reject) => {
            try {
                url = new URL(url);
            } catch (e) {
                tools.error(`Invalid url. (url=${url})`)
                reject('Invalid url.');
                return;
            }
            const addQueue = [];
            if((url.hostname.includes('youtube.com') || url.hostname === 'youtu.be') && 
                url.searchParams.has('list')) {
                    try {
                        const response = await ytpl(url.toString());
                        for(var i in response.items) {
                            addQueue.push(`https://youtu.be/${response.items[i].id}`);
                        }
                    } catch (e) {
                        tools.error('Failed to get the playlist info.', guild.id);
                        console.error(e);
                        reject(e);
                        return;
                    }
            }
            else {
                try {
                    const response = await ytdl(url.toString(), {
                        dumpSingleJson: true,
                        noWarnings: true
                    });
                    if(response._type === 'playlist') {
                        for(var i in response.entries) {
                            addQueue.push(response.entries[i].webpage_url);
                        }
                    }
                    else addQueue.push(url.toString());
                } catch (e) {
                    tools.error('Failed to get the url info.', guild.id);
                    console.error(e);
                    reject('Failed to get the url info.');
                    return;
                }
            }
            for(var i in addQueue) {
                this.data[guild.id].queue.push(new track.Track(addQueue[i]));
                if(this.data[guild.id].queue.length == 1) this.skip(guild, 0);
            }
            resolve();
        });
    }
    
    async skip(guild, index) {
        if(!this.data[guild.id] || !guild || isNaN(index) || !this.data[guild.id].queue[index]) {
            return false;
        }
        const connection = voice.getVoiceConnection(guild.id);
        if(!this.data[guild.id].subscription) {
            const player = voice.createAudioPlayer();
            player.on('stateChange', (oldState, newState) => {
                if(oldState.status !== voice.AudioPlayerStatus.Idle && newState.status === voice.AudioPlayerStatus.Idle) {
                    this.next(guild)
                }
            });
            player.on('error', (error) => {
                tools.error('An unexpected error occurred in AudioPlayer.', guild.id);
                console.error(error);
                if(!this.next(guild)) this.disconnect(guild.id);
            });
            this.data[guild.id].subscription = connection.subscribe(player);
        }
        const highPing = connection.ping.udp >= HIGH_PING;
        if(highPing) tools.log(
            `High ping detected! Will use low quality sources if possible. (ping=${connection.ping.udp})`, guild.id);
        const resource = await this.data[guild.id].queue[index].createAudioResource(highPing);
        if(resource) {
            this.data[guild.id].subscription.player.play(resource);
            this.data[guild.id].index = index;
            tools.log(`Playing #${index}. ${JSON.stringify(this.data[guild.id].queue[index])}`, guild.id)
        }
        else return false;
        return true;
    }

    async pause(gid) {
        if(!gid || !this.data[gid] || !this.data[gid].subscription) return false;
        try {
            this.data[gid].subscription.player.pause();
        } catch (e) {
            tools.error('An unexpected error occurred when pausing the player.', gid);
            console.error(e);
            return false;
        }
    }

    async resume(gid) {
        if(!gid || !this.data[gid] || !this.data[gid].subscription) return false;
        try {
            this.data[gid].subscription.player.unpause();
        } catch (e) {
            tools.error('An unexpected error occurred when pausing the player.', gid);
            console.error(e);
            return false;
        }
    }

    async next(guild) {
        if(!this.data[guild.id]) return false;
        return await this.skip(guild, this.data[guild.id].index + 1);
    }

    async prev(guild) {
        if(!this.data[guild.id]) return false;
        return await this.skip(guild, this.data[guild.id].index - 1);
    }

    clear(gid) {
        if(!this.data[gid]) return false;
        if(this.data[gid].subscription) {
            this.data[gid].subscription.player.stop();
            this.data[gid].subscription.unsubscribe();
            delete this.data[gid].subscription;
        }
        this.data[gid].index = -1;
        this.data[gid].queue = [];
        return true;
    }
    
    disconnect(gid) {
        if(!gid || !this.checkConnectionState(gid)) return false;
        const connection = voice.getVoiceConnection(gid);
        if(connection) {
            tools.log(`Disconnecting from ${client.channels.cache.get(connection.joinConfig.channelId).name}.`, gid);
            this.clear(gid);
            try {
                connection.disconnect();
                return true;
            } catch (e) {
                tools.error('An unexpected error occurred when disconnecting.', gid);
                console.error(e);
                return false;
            }
        }
        else return false;
    }
    
    async disconnectAll() {
        for(var gid in this.data) this.disconnect(gid);
    }
    
    checkUserVoiceChannel(member) {
        if(!member) return false;
        const connection = voice.getVoiceConnection(member.guild.id);
        if(!connection || !connection.joinConfig.channelId || !member.voice.channel) return false;
        return connection.joinConfig.channelId === member.voice.channel.id;
    }

    checkConnectionState(gid) {
        const connection = voice.getVoiceConnection(gid);
        if(!connection) return false;
        return connection.state.status === voice.VoiceConnectionStatus.Ready;
    }
}

const music = new Music();

client.on('ready', async () => {
    console.log(`${client.user.username} started at ${new Date().toISOString()}.`);
    client.user.setActivity(`${string.prefix}play`, { type: 'LISTENING' });
})

client.on('messageCreate', async message => {
    if(message.author.bot || !message.content.startsWith(string.prefix)) return;
    const cmd = message.content.replace(string.prefix, '').split(' ')[0];
    const params = message.content.split(' ');
    params.shift();
    tools.log(`Command "${cmd}" from ${message.author.tag} received.`, message.guild.id);
    switch(cmd) {
        case 'join':
            if(!message.member.voice.channel) {
                message.reply(string.USER_NOT_IN_VOICE_CHANNEL);
                return;
            }
            if(!voice.getVoiceConnection(message.guild.id)) {
                music.join(message.guild, message.channel, message.member.voice.channel)
                    .then(value => message.react('🎶'))
                    .catch(error => message.reply(`${string.FAILED_TO_JOIN_VOICE_CHANNEL} ${error}`));
            }
            else {
                const id = voice.getVoiceConnection(message.guild.id).joinConfig.channelId;
                const name = message.guild.channels.cache.get(id).name;
                if(music.checkUserVoiceChannel(message.member))
                    message.reply(string.BOT_ALREADY_IN_VOICE_CHANNEL.replace('$CHANNEL_NAME$', name));
                else
                    message.reply(string.USER_NOT_IN_SAME_VOICE_CHANNEL.replace('$CHANNEL_NAME$', name))
            }
            break;

        case 'play':
            if(params.length < 1) {
                message.reply(string.MISSING_PARAMS);
                return;
            }
            if(!message.member.voice.channel) {
                message.reply(string.USER_NOT_IN_VOICE_CHANNEL);
                return;
            }
            if(!voice.getVoiceConnection(message.guild.id))
                try {
                    await music.join(message.guild, message.channel, message.member.voice.channel);
                } catch (e) {
                    message.reply(`${string.FAILED_TO_JOIN_VOICE_CHANNEL} ${e}`);
                    return;
                }
            const addItem = () => {
                if(music.checkUserVoiceChannel(message.member)) {
                    message.react('⌛');
                    music.enqueue(message.guild, params[0])
                        .then(() => message.react('✅'))
                        .catch(error => message.reply(`${string.FAILED_TO_PLAY_ITEM}\n${error}`));
                }
                else {
                    const id = voice.getVoiceConnection(message.guild.id).joinConfig.channelId;
                    const name = message.guild.channels.cache.get(id).name;
                    message.reply(string.USER_NOT_IN_SAME_VOICE_CHANNEL.replace('$CHANNEL_NAME$', name));
                }
            };
            if(voice.getVoiceConnection(message.guild.id).state.status === voice.VoiceConnectionStatus.Ready) {
                addItem();
            }
            voice.getVoiceConnection(message.guild.id).on(voice.VoiceConnectionStatus.Ready, addItem);
            break;

        case 'skip':
            if(params.length < 1) {
                message.reply(string.MISSING_PARAMS);
                return;
            }
            if(music.checkUserVoiceChannel(message.member))
                if(await music.skip(message.guild, params[0])) message.react('✅');
                else message.reply(string.FAILED_TO_SKIP_TO_ITEM);
            else {
                const connection = voice.getVoiceConnection(message.guild.id);
                if(connection) {
                    const name = message.guild.channels.cache.get(connection.joinConfig.channelId).name;
                    message.reply(string.USER_NOT_IN_SAME_VOICE_CHANNEL.replace('$CHANNEL_NAME$', name), message.guild.id);
                }
                else message.reply(string.BOT_NOT_IN_VOICE_CHANNEL);
            }
            break;

        case 'pause':
            if(music.checkUserVoiceChannel(message.member)) {
                if(await music.pause(message.guild.id)) message.react('✅');
                else message.reply(string.FAILED_TO_PAUSE_PLAYER);
            }
            else {
                const connection = voice.getVoiceConnection(message.guild.id);
                if(connection) {
                    const name = message.guild.channels.cache.get(connection.joinConfig.channelId).name;
                    message.reply(string.USER_NOT_IN_SAME_VOICE_CHANNEL.replace('$CHANNEL_NAME$', name), message.guild.id);
                }
                else message.reply(string.BOT_NOT_IN_VOICE_CHANNEL);
            }
            break;

        case 'resume':
            if(music.checkUserVoiceChannel(message.member)) {
                if(await music.resume(message.guild.id)) message.react('✅');
                else message.reply(string.FAILED_TO_RESUME_PLAYER);
            }
            else {
                const connection = voice.getVoiceConnection(message.guild.id);
                if(connection) {
                    const name = message.guild.channels.cache.get(connection.joinConfig.channelId).name;
                    message.reply(string.USER_NOT_IN_SAME_VOICE_CHANNEL.replace('$CHANNEL_NAME$', name), message.guild.id);
                }
                else message.reply(string.BOT_NOT_IN_VOICE_CHANNEL);
            }
            break;

        case 'next':
            if(music.checkUserVoiceChannel(message.member)) {
                if(await music.next(message.guild)) message.react('✅');
                else message.reply(string.FAILED_TO_SKIP_TO_NEXT);
            }
            else {
                const connection = voice.getVoiceConnection(message.guild.id);
                if(connection) {
                    const name = message.guild.channels.cache.get(connection.joinConfig.channelId).name;
                    message.reply(string.USER_NOT_IN_SAME_VOICE_CHANNEL.replace('$CHANNEL_NAME$', name), message.guild.id);
                }
                else message.reply(string.BOT_NOT_IN_VOICE_CHANNEL);
            }
            break;

        case 'prev':
            if(music.checkUserVoiceChannel(message.member)) {
                if(await music.prev(message.guild)) message.react('✅');
                else message.reply(string.FAILED_TO_SKIP_TO_PREV);
            }
            else {
                const connection = voice.getVoiceConnection(message.guild.id);
                if(connection) {
                    const name = message.guild.channels.cache.get(connection.joinConfig.channelId).name;
                    message.reply(string.USER_NOT_IN_SAME_VOICE_CHANNEL.replace('$CHANNEL_NAME$', name), message.guild.id);
                }
                else message.reply(string.BOT_NOT_IN_VOICE_CHANNEL);
            }
            break;

        case 'stop':
        case 'clear':
            if(music.checkUserVoiceChannel(message.member)) {
                if(await music.clear(message.guild.id)) message.react('✅');
                else message.reply(string.FAILED_TO_CLEAR_QUEUE);
            }
            else {
                const connection = voice.getVoiceConnection(message.guild.id);
                if(connection) {
                    const name = message.guild.channels.cache.get(connection.joinConfig.channelId).name;
                    message.reply(string.USER_NOT_IN_SAME_VOICE_CHANNEL.replace('$CHANNEL_NAME$', name), message.guild.id);
                }
                else message.reply(string.BOT_NOT_IN_VOICE_CHANNEL);
            }
            break;

        case 'dc':
            if(music.checkUserVoiceChannel(message.member)) {
                if(music.disconnect(message.guild.id)) message.react('👋');
                else message.reply(string.FAILED_TO_DISCONNECT_VOICE_CHANNEL);
            }
            else {
                const connection = voice.getVoiceConnection(message.guild.id);
                if(connection) {
                    const name = message.guild.channels.cache.get(connection.joinConfig.channelId).name;
                    message.reply(string.USER_NOT_IN_SAME_VOICE_CHANNEL.replace('$CHANNEL_NAME$', name), message.guild.id);
                }
                else message.reply(string.BOT_NOT_IN_VOICE_CHANNEL);
            }
            break;

        default:
            tools.log(`Invalid command "${cmd}".`, message.guild.id);
            message.reply(string.UNSUPPORTED_COMMAND);
            break;
    }
});

var isExiting = false;

process.on('SIGINT', () => {
    if(isExiting) return;
    isExiting = true;
    music.disconnectAll();
    process.exit();
});

process.on('SIGHUP', () => {
    if(isExiting) return;
    isExiting = true;
    music.disconnectAll();
});

process.on('SIGTERM', () => {
    if(isExiting) return;
    isExiting = true;
    music.disconnectAll();
});

client.login(process.env.DISCORD_TOKEN);
