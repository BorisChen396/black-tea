const voice = require('@discordjs/voice');
const { Permissions } = require('discord.js');

const { Message, MessageType } = require('./message.js');
const string = require('./string.json');

const HIGH_PING = 200;

class Player {
    constructor(messageChannel) {
        this.messageChannel = messageChannel;
        this.queue = [];
        this.queueLock = false;
        
        const connection = voice.getVoiceConnection(messageChannel.guild.id);
        this.subscription = connection.subscribe(voice.createAudioPlayer());
        this.subscription.player.on('stateChange', (oldState, newState) => {
            if(oldState.status !== voice.AudioPlayerStatus.Idle && newState.status === voice.AudioPlayerStatus.Idle) {
                //Skip to next item.
                this.next();
            }
        });
        this.subscription.player.on('error', (error) => {
            //Try to skip to next item or stop the player.
            const errorMessage = new Message(MessageType.Warning, string.WARNING_PLAYER_ERROR);
            errorMessage.addData('MESSAGE_FIELD_TITLE_DETAILS', error.toString());
            this.messageChannel.send({embeds: [ errorMessage.createMessage() ]});
            this.next();
        });
        connection.on(voice.VoiceConnectionStatus.Disconnected, async () => {
            try {
                    await Promise.race([
                        voice.entersState(connection, voice.VoiceConnectionStatus.Signalling, 5000),
                        voice.entersState(connection, voice.VoiceConnectionStatus.Connecting, 5000),
                    ]);
                    // Seems to be reconnecting to a new channel - ignore disconnect
                } catch (error) {
                    // Seems to be a real disconnect which SHOULDN'T be recovered from
                    const connection = voice.getVoiceConnection(messageChannel.guild.id);
                    if(connection) connection.destroy();
                }
        });
    }
    
    static join(messageChannel, voiceChannel) {
        return new Promise(async (resolve, reject) => {
            if(!voiceChannel) {
                reject(new Message(
                    MessageType.Error, 
                    string.ERROR_VOICE_CHANNEL_USER_NOT_JOIN));
                return;
            }
            if(voiceChannel.guild.me.voice.channel && voice.getVoiceConnection(voiceChannel.guild.id)) {
                reject(new Message(
                        MessageType.Error,
                        string.ERROR_VOICE_CHANNEL_ALREADY_JOINED, {
                            'MESSAGE_FIELD_TITLE_BOT_VOICE_CHANNEL': voiceChannel.guild.me.voice.channel.name,
                            'MESSAGE_FIELD_TITLE_USER_VOICE_CHANNEL': voiceChannel.name
                        }));
                return;
            }
            const permissions = voiceChannel.guild.me.permissionsIn(voiceChannel);
            if(!permissions.has(Permissions.FLAGS.CONNECT)) {
                reject(new Message(
                    MessageType.Error,
                    string.ERROR_VOICE_CHANNEL_PERMISSION_DENIED, {
                        'MESSAGE_FIELD_TITLE_USER_VOICE_CHANNEL': voiceChannel.name
                    }));
                return;
            }
            const connection = voice.joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: voiceChannel.guild.id,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator
            });
            try {
                await Promise.race([
                        voice.entersState(connection, voice.VoiceConnectionStatus.Ready, 10000),
                ]);
            } catch (e) {
                connection.destroy();
                reject(new Message(
                    MessageType.Error,
                    string.ERROR_VOICE_CHANNEL_TIMEOUT, {
                        'MESSAGE_FIELD_TITLE_USER_VOICE_CHANNEL': voiceChannel.name
                    }));
                return;
            }
            resolve(new Player(messageChannel, connection));
        });
    }
    
    disconnect() {
        if(this.subscription) {
            this.subscription.player.stop(true);
            this.subscription.unsubscribe();
        }
        const connection = voice.getVoiceConnection(this.messageChannel.guild.id);
        if(connection) connection.disconnect();
    }

    enqueue(track) {
        this.queue.push(track);
        this.next();
    }

    pause() {
        this.subscription.player.pause();
    }

    resume() {
        this.subscription.player.unpause();
    }

    stop() {
        if(this.queueLock) return;
        this.queue = [];
        this.subscription.player.stop(true);
    }
    
    async next() {
        if(this.queueLock || this.subscription.player.state.status !== voice.AudioPlayerStatus.Idle || this.queue.length === 0) return;
        this.queueLock = true;
        const connection = voice.getVoiceConnection(this.messageChannel.guild.id);
        const nextTrack = this.queue.shift();
        const highPing = connection.ping.udp >= HIGH_PING;
        if(highPing) console.log(`${guild.id}: High ping detected! Will use low quality sources if possible. (ping=${connection.ping.udp})`);
        try {
            const resource = await nextTrack.createAudioResource(highPing);
            this.subscription.player.play(resource);
			this.queueLock = false;
		} catch (error) {
			// If an error occurred, try the next item of the queue instead
			this.queueLock = false;
			return await this.next();
		}
    }
}

module.exports = {
    Player
}