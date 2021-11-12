require('dotenv').config();

const Discord = require('discord.js');
const voice = require('@discordjs/voice');
const client = new Discord.Client({ intents: [
    Discord.Intents.FLAGS.GUILD_MESSAGES, 
    Discord.Intents.FLAGS.GUILD_VOICE_STATES, 
    Discord.Intents.FLAGS.GUILDS
] });

const string = require('./string.json');
const innertube = require('./innertube.js');
const tools = require('./tools.js');

const TYPE_YOUTUBE = 'type_youtube';

class Music {

    constructor () {
        this.data = {};
    }
    
    async join(message) {
        const guild = message.guild;
        const userChannel = message.member.voice.channel;
        if(voice.getVoiceConnection(guild.id)) {
            const connection = voice.getVoiceConnection(guild.id);
            if(!userChannel || connection.joinConfig.channelId !== userChannel.id) {
                const name = guild.channels.cache.get(connection.joinConfig.channelId).name;
                message.reply(string.USER_NOT_IN_SAME_VOICE_CHANNEL.replace('$CHANNEL_NAME$', name));
                tools.log(`User ${message.author.tag} isn't in the same voice channel.`)
                return false;
            }
            return true;
        }
        if(!userChannel) {
            message.reply(string.USER_NOT_IN_VOICE_CHANNEL);
            tools.log(`User ${message.author.tag} doesn't join any voice channel.`);
            return false;
        }
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
        tools.log(`Joined ${client.channels.cache.get(userChannel.id).name}.`, guild.id);
        return true;
    }
    
    async play(message) {
        if(!await this.join(message) || message.content.split(' ').length < 2) return;
        const list = await this.parseUrl(message.content.split(' ')[1]);
        if(list.length == 0) {
            message.reply(string.INVALID_URL);
            return;
        }
        for(var i in list) {
            this.data[message.guild.id].queue.push(list[i]);
            if(this.data[message.guild.id].queue.length == 1) this.skip(message.guild, 0);
            tools.log(`Item added. (${JSON.stringify(list[i])})`, message.guild.id);
        }
        message.reply(string.ITEMS_ADDED
            .replace('$NUMBER$', list.length)
            .replace('$QUEUE_LENGTH$', this.data[message.guild.id].queue.length)
        );
    }
    
    async skip(guild, index) {
        if(isNaN(index) || this.data[guild.id].queue.length <= index || index < 0) return;
        const connection = voice.getVoiceConnection(guild.id);
        if(!connection) return;
        if(!this.data[guild.id].player) {
            this.data[guild.id].player = voice.createAudioPlayer();
            this.data[guild.id].player.on(voice.AudioPlayerStatus.Idle, () => {
                if(this.data[guild.id].index + 1 < this.data[guild.id].queue.length)
                    this.skip(guild, ++this.data[guild.id].index);
            });
        }
        const data = this.data[guild.id].queue[index].data;
        var resource = null;
        switch(this.data[guild.id].queue[index].type) {
            case TYPE_YOUTUBE:
                const url = await innertube.getUrl(data.videoId);
                resource = voice.createAudioResource(url);
                break;
        }
        if(resource) {
            this.data[guild.id].subscription = connection.subscribe(this.data[guild.id].player);
            this.data[guild.id].player.play(resource);
            this.data[guild.id].index = index;
            tools.log(`Playing #${index}. ${JSON.stringify(this.data[guild.id].queue[index])}`)
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
        try {
            if(content.includes('youtu.be/')) {
                content = content.replace('youtu.be/', 'www.youtube.com/watch?v=');
            }
            const url = new URL(content);
            if(url.hostname.includes('youtube.com')) {
                if(url.searchParams.has('list')) {
                    const list = await innertube.getList(url.searchParams.get('list'));
                    for(var i in list)
                        list[i] = new TrackInfo(
                            TYPE_YOUTUBE,
                            { videoId: list[i] }
                        );
                    return list;
                }
                if(url.searchParams.has('v')) 
                    return [new TrackInfo(
                        TYPE_YOUTUBE,
                        { videoId: url.searchParams.get('v') }
                    )];
            }
        } catch (e) {}
        return [];
    }
}
  
class TrackInfo {
    constructor(type, data) {
        this.type = type;
        this.data = data;
    }
}

const music = new Music();

client.on('ready', () => {
    console.log(`${client.user.username} started at ${new Date().toISOString()}.\n`);
})

client.on('messageCreate', message => {
    if(message.author.bot || !message.content.startsWith(string.prefix)) return;
    const cmd = message.content.slice(1).split(' ')[0];
    tools.log(`Command "${cmd}" from User ${message.author.tag} received.`, message.guild.id);
    switch(cmd) {
        case 'join':
            music.join(message);
            break;
        case 'play':
            music.play(message);
            break;
        case 'skip':
            const p = message.split(' ');
            if(p.length >= 2) music.skip(message.guild, p[1])
            break;
        case 'dc':
            music.disconnect(message.guild.id);
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

client.login(process.env.DISCORD_TOKEN);