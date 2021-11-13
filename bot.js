require('dotenv').config();

const Discord = require('discord.js');
const voice = require('@discordjs/voice');
const ytdl = require('ytdl-core');
const ytpl = require('ytpl');
const client = new Discord.Client({ intents: [
    Discord.Intents.FLAGS.GUILD_MESSAGES, 
    Discord.Intents.FLAGS.GUILD_VOICE_STATES, 
    Discord.Intents.FLAGS.GUILDS
] });

const string = require('./string.json');
const tools = require('./tools.js');

const TYPE_YOUTUBE = 'type_youtube';

class Music {

    constructor () {
        this.data = {};
    }
    
    join(guild, voiceChannel) {
        if(!guild || !voiceChannel) return false;
        try {
            const connection = voice.joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: guild.id,
                adapterCreator: guild.voiceAdapterCreator
            });
            connection.on(voice.VoiceConnectionStatus.Disconnected, async () => {
                try {
                    await Promise.race([
                        entersState(connection, voice.VoiceConnectionStatus.Signalling, 5_000),
                        entersState(connection, voice.VoiceConnectionStatus.Connecting, 5_000),
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
                player: null,
                subscription: null,
                queue: [],
                index: -1,
                isPlaying: false
            };
            tools.log(`Joined ${client.channels.cache.get(voiceChannel.id).name}.`, guild.id);
            return true;
        } catch (e) {
            tools.error('An unexpected error occurred when joining the channel.', guild.id);
            console.error(e);
            return false;
        }
    }
    
    async play(guild, url) {
        if(!this.data[guild.id] || !guild || !url || !this.checkConnectionState(guild.id)) return false;
        const list = await this.parseUrl(url);
        if(!list) {
            tools.error(`Failed to resolve the requested item. (url=${url})`, guild.id);
            return false;
        }
        const autoplay = this.data[guild.id].queue.length == 0;
        for(var i in list) {
            this.data[guild.id].queue.push(list[i]);
        }
        if(autoplay && this.data[guild.id].queue.length > 0) await this.skip(guild, 0);
        return true;
    }
    
    async skip(guild, index) {
        if(!this.data[guild.id] || !guild || isNaN(index) || !this.data[guild.id].queue[index] || !this.checkConnectionState(guild.id)) {
            return false;
        }
        const connection = voice.getVoiceConnection(guild.id);
        if(!this.data[guild.id].player) {
            this.data[guild.id].player = voice.createAudioPlayer();
            this.data[guild.id].player.on('stateChange', (oldState, newState) => {
                if(oldState.status !== voice.AudioPlayerStatus.Idle && newState.status === voice.AudioPlayerStatus.Idle) {
                    if(!this.next(guild)) this.disconnect(guild.id);
                }
            });
            this.data[guild.id].player.on('error', (error) => {
                tools.error('An unexpected error occurred in AudioPlayer.', guild.id);
                console.error(error);
                if(!this.next(guild)) this.disconnect(guild.id);
            });
        }
        const data = this.data[guild.id].queue[index].data;
        var resource = null;
        if(connection.ping.udp >= 150) tools.log(
            `High ping detected! Will use low quality sources if possible. (ping=${connection.ping.udp})`, guild.id);
        try {
            switch(this.data[guild.id].queue[index].type) {
                case TYPE_YOUTUBE:
                    resource = voice.createAudioResource(
                        ytdl(`https://youtu.be/${data.videoId}`, {
                            quality: connection.ping.udp >= 150 ? 250 : 251
                        }), {
                            inputType: voice.StreamType.WebmOpus
                        });
                    break;
            }
        } catch (e) {
            tools.error('An unexpected error occurred when creating the resource.', guild.id);
            console.error(e);
            return false;
        }
        if(resource) {
            this.data[guild.id].subscription = connection.subscribe(this.data[guild.id].player);
            this.data[guild.id].player.play(resource);
            this.data[guild.id].index = index;
            tools.log(`Playing #${index}. ${JSON.stringify(this.data[guild.id].queue[index])}`, guild.id)
        }
        else return false;
        return true;
    }

    async pause(gid) {
        if(!gid || !this.data[gid] || !this.data[gid].player || !this.checkConnectionState(gid)) return false;
        try {
            this.data[gid].player.pause();
        } catch (e) {
            tools.error('An unexpected error occurred when pausing the player.', gid);
            console.error(e);
            return false;
        }
    }

    async resume(gid) {
        if(!gid || !this.data[gid] || !this.data[gid].player || !this.checkConnectionState(gid)) return false;
        try {
            this.data[gid].player.unpause();
        } catch (e) {
            tools.error('An unexpected error occurred when pausing the player.', gid);
            console.error(e);
            return false;
        }
    }

    async next(guild) {
        if(!this.data[guild.id] || !this.checkConnectionState(guild.id)) return false;
        return await this.skip(guild, this.data[guild.id].index + 1);
    }

    async prev(guild) {
        if(!this.data[guild.id] || !this.checkConnectionState(guild.id)) return false;
        return await this.skip(guild, this.data[guild.id].index - 1);
    }
    
    async disconnect(gid) {
        if(!gid || !this.checkConnectionState(gid)) return false;
        const connection = voice.getVoiceConnection(gid);
        if(connection) {
            tools.log(`Disconnecting from ${client.channels.cache.get(connection.joinConfig.channelId).name}.`, gid);
            if(this.data[gid].subscription) this.data[gid].subscription.unsubscribe();
            if(this.data[gid].player) this.data[gid].player.stop();
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
    
    async parseUrl(content) {
        var hostname;
        try {
            hostname = new URL(content).hostname;
        } catch (e) {
            console.error(e);
            return;
        }
        if(hostname === 'youtu.be') hostname = 'www.youtube.com';
        if(hostname.includes('youtube.com')) {
            if(ytpl.validateID(content)) {
                try {
                    const result = [];
                    const list = await ytpl(content);
                    for(var i in list.items) {
                        const videoId = list.items[i].id;
                        result.push(new TrackInfo(
                            TYPE_YOUTUBE, { videoId: videoId }
                        ));
                    }
                    return result;
                } catch (e) {
                    console.error(e);
                    return;
                }
            }
            if(ytdl.validateURL(content)) {
                return [
                    new TrackInfo(
                        TYPE_YOUTUBE, 
                        { videoId: ytdl.getURLVideoID(content) }
                    )
                ];
            }
        }
        return;
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
  
class TrackInfo {
    constructor(type, data) {
        this.type = type;
        this.data = data;
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
                if(music.join(message.guild, message.member.voice.channel)) message.react('🎶');
                else message.reply(string.FAILED_TO_JOIN_VOICE_CHANNEL);
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
                if(!music.join(message.guild, message.member.voice.channel)) {
                    message.reply(string.FAILED_TO_JOIN_VOICE_CHANNEL);
                    return;
                }
            voice.getVoiceConnection(message.guild.id).on(voice.VoiceConnectionStatus.Ready, () => {
                if(music.checkUserVoiceChannel(message.member)) {
                    if(music.play(message.guild, params[0])) message.react('✅');
                    else message.reply(string.FAILED_TO_PLAY_ITEM);
                }
                else {
                    const id = voice.getVoiceConnection(message.guild.id).joinConfig.channelId;
                    const name = message.guild.channels.cache.get(id).name;
                    message.reply(string.USER_NOT_IN_SAME_VOICE_CHANNEL.replace('$CHANNEL_NAME$', name));
                }
            })
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
                if(music.pause(message.guild.id)) message.react('✅');
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
                if(music.resume(message.guild.id)) message.react('✅');
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
                if(music.next(message.guild.id)) message.react('✅');
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

            case 'previous':
                if(music.checkUserVoiceChannel(message.member)) {
                    if(music.prev(message.guild.id)) message.react('✅');
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