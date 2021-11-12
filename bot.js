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
    
    async join(message) {
        const guild = message.guild;
        const userChannel = message.member.voice.channel;
        const connection = voice.joinVoiceChannel({
            channelId: userChannel.id, 
            guildId: guild.id, 
            adapterCreator: guild.voiceAdapterCreator
        });
        connection.on(voice.VoiceConnectionStatus.Disconnected, async (oldState, newState) => {
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
        message.react('🎵');
        tools.log(`Joined ${client.channels.cache.get(userChannel.id).name}.`, guild.id);
    }
    
    async play(message) {
        if(message.content.split(' ').length < 2) return;
        const url = message.content.split(' ')[1];
        const list = await this.parseUrl(message.content.split(' ')[1]);
        if(!Array.isArray(list)) {
            message.reply(list);
            tools.log(`Failed to add the requested item from ${message.author.tag}. (url=${url})`, message.guild.id);
            return;
        }
        for(var i in list) {
            this.data[message.guild.id].queue.push(list[i]);
            if(this.data[message.guild.id].queue.length == 1) this.skip(message.guild, 0);
        }
        message.reply(string.ITEMS_ADDED
            .replace('$NUMBER$', list.length)
            .replace('$QUEUE_LENGTH$', this.data[message.guild.id].queue.length)
        );
    }
    
    async skip(guild, index) {
        if(!guild || index == null || isNaN(index) || this.data[guild.id].queue.length <= index || index < 0) return;
        const connection = voice.getVoiceConnection(guild.id);
        if(!connection) return;
        if(!this.data[guild.id].player) {
            this.data[guild.id].player = voice.createAudioPlayer();
            this.data[guild.id].player.on('stateChange', (oldState, newState) => {
                if(oldState.status !== voice.AudioPlayerStatus.Idle && newState.status === voice.AudioPlayerStatus.Idle) {
                    this.skip(guild, this.data[guild.id].index + 1);
                }
            });
            this.data[guild.id].player.on('error', (error) => {
                this.disconnect(guild.id);
            });
        }
        const data = this.data[guild.id].queue[index].data;
        var resource = null;
        switch(this.data[guild.id].queue[index].type) {
            case TYPE_YOUTUBE:
                resource = voice.createAudioResource(
                    ytdl(`https://youtu.be/${data.videoId}`, {
                        filter: 'audioonly',
                        quality: 'highestaudio'
                    })
                );
                break;
        }
        if(resource) {
            this.data[guild.id].subscription = connection.subscribe(this.data[guild.id].player);
            this.data[guild.id].player.play(resource);
            this.data[guild.id].index = index;
            tools.log(`Playing #${index}. ${JSON.stringify(this.data[guild.id].queue[index])}`, guild.id)
        }
    }

    async pause(message) {
        if(this.data[message.guild.id] && this.data[message.guild.id].player) {
            this.data[message.guild.id].player.pause();
            message.react('⏸️');
        }
        else {
            message.reply(string.BOT_NOT_IN_VOICE_CHANNEL);
        }
    }

    async resume(message) {
        if(this.data[message.guild.id] && this.data[message.guild.id].player) {
            this.data[message.guild.id].player.unpause();
            message.react('▶️');
        }
        else {
            message.reply(string.BOT_NOT_IN_VOICE_CHANNEL);
        }
    }
    
    async disconnect(gid) {
        const connection = voice.getVoiceConnection(gid);
        if(connection) {
            tools.log(`Disconnecting from ${client.channels.cache.get(connection.joinConfig.channelId).name}.`, gid);
            if(this.data[gid].subscription) this.data[gid].subscription.unsubscribe();
            if(this.data[gid].player) this.data[gid].player.stop();
            connection.disconnect();
        }
    }
    
    async disconnectAll() {
        for(var gid in this.data) this.disconnect(gid);
    }
    
    async parseUrl(content) {
        var hostname;
        try {
            hostname = new URL(content).hostname;
        } catch (e) {
            return string.INVALID_URL;
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
                    return string.YOUTUBE_PLAYLIST_UNAVAILABLE;
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
            else return string.YOUTUBE_NO_ID;
        }
        return string.INVALID_URL;
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
    console.log(`${client.user.username} started at ${new Date().toISOString()}.\n`);
})

client.on('messageCreate', async message => {
    if(message.author.bot || !message.content.startsWith(string.prefix)) return;
    const cmd = message.content.replace(string.prefix, '').split(' ')[0];
    tools.log(`Command "${cmd}" from ${message.author.tag} received.`, message.guild.id);
    switch(cmd) {
        case 'join':
            if(voice.getVoiceConnection(message.guild.id)) {
                const id = voice.getVoiceConnection(message.guild.id).joinConfig.channelId;
                const name = message.guild.cache.get(id).name;
                message.reply(string.BOT_ALREADY_IN_VOICE_CHANNEL.replace('$CHANNEL_NAME$', name));
            }
            else if(!message.member.voice.channel) message.reply(string.USER_NOT_IN_VOICE_CHANNEL);
            else music.join(message);
            break;

        case 'play':
            if(checkUserVoiceChannel(message.member)) music.play(message);
            else if(message.member.voice.channel) {
                await music.join(message);
                music.play(message);
            }
            else message.reply(string.USER_NOT_IN_VOICE_CHANNEL);
            break;

        case 'skip':
            const p = message.content.split(' ');
            if(p.length >= 2) {
                if(checkUserVoiceChannel(message.member)) music.skip(message.guild, p[1]);
                else {
                    const connection = voice.getVoiceConnection(message.guild.id);
                    if(connection) message.reply(string.USER_NOT_IN_SAME_VOICE_CHANNEL);
                    else message.reply(string.BOT_NOT_IN_VOICE_CHANNEL);
                }
            }
            break;

        case 'pause':
            if(checkUserVoiceChannel(message.member)) music.pause(message);
            break;

        case 'resume':
            if(checkUserVoiceChannel(message.member)) music.resume(message);
            break;

        case 'dc':
            if(checkUserVoiceChannel(message.member)) {
                music.disconnect(message.guild.id);
                message.react('👋');
            }
            else {
                if(voice.getVoiceConnection(message.guild.id)) {
                    const name = guild.channels.cache.get(connection.joinConfig.channelId).name;
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

function checkUserVoiceChannel(member) {
    const connection = voice.getVoiceConnection(member.guild.id);
    if(!connection || !connection.joinConfig.channelId || !member.voice.channel) return false;
    return connection.joinConfig.channelId === member.voice.channel.id;
}

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