const voice = require('@discordjs/voice');
const { Permissions } = require('discord.js');

const { Table } = require ('./table.js');

const { Message, MessageType } = require('./message.js');
const { getResourceString } = require('./string.js');

const HIGH_PING = 200;
const ITEMS_PER_PAGE = 10;

class Player {
    constructor(messageChannel, locale) {
        this.messageChannel = messageChannel;
        this.locale = locale;
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
            const errorMessage = new Message(MessageType.Warning, 'WARNING_PLAYER_ERROR');
            errorMessage.addData('MESSAGE_FIELD_TITLE_DETAILS', error.toString());
            this.messageChannel.send({embeds: [ errorMessage.createMessage(locale) ]});
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
    
    static join(messageChannel, voiceChannel, locale) {
        return new Promise(async (resolve, reject) => {
            if(!voiceChannel) {
                reject(new Message(MessageType.Error, 'ERROR_VOICE_CHANNEL_USER_NOT_JOIN'));
                return;
            }
            if(voiceChannel.guild.me.voice.channel && voice.getVoiceConnection(voiceChannel.guild.id)) {
                reject(new Message(MessageType.Error, 'ERROR_VOICE_CHANNEL_ALREADY_JOINED', {
                    'MESSAGE_FIELD_TITLE_BOT_VOICE_CHANNEL': voiceChannel.guild.me.voice.channel.name,
                    'MESSAGE_FIELD_TITLE_USER_VOICE_CHANNEL': voiceChannel.name
                }));
                return;
            }
            const permissions = voiceChannel.guild.me.permissionsIn(voiceChannel);
            if(!permissions.has(Permissions.FLAGS.CONNECT)) {
                reject(new Message(MessageType.Error, 'ERROR_VOICE_CHANNEL_PERMISSION_DENIED', {
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
                reject(new Message(MessageType.Error, 'ERROR_VOICE_CHANNEL_TIMEOUT', {
                    'MESSAGE_FIELD_TITLE_USER_VOICE_CHANNEL': voiceChannel.name
                }));
                return;
            }
            resolve(new Player(messageChannel, locale));
        });
    }
    
    disconnect() {
        if(this.subscription) {
            if(this.queueLock) {
                return new Message(MessageType.Error, 'ERROR_PLAYER_QUEUE_LOCKED');
            }
            this.queue = [];
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
    
    getQueue(page) {
        if(this.queue.length == 0) {
            return new Message(MessageType.Warning, 'WARNING_PLAYER_QUEUE_EMPTY');
        }
        const table = new Table();
        table.addRow('No.', 'Title');
        for(var i = page * ITEMS_PER_PAGE; i < this.queue.length; i++) {
            var title = this.queue[i].title ? this.queue[i].title : this.queue[i].url;
            var byteLength = 0;
            for(var j in title) {
                var s = title.charCodeAt(j);
                while(s > 0) {
                    s = s >> 8;
                    byteLength++;
                }
                if(byteLength >= 20) {
                    title = title.slice(0, byteLength == 20 ? j : --j) + '...';
                    break;
                }
            }
            table.addRow(`#${i}`, title);
            if(i + 1 == (page + 1) * ITEMS_PER_PAGE) break;
        }
        return {list: table.create(), length: this.queue.length};
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
        if(highPing) console.log(`${this.messageChannel.guild.id}: High ping detected! Will use low quality sources if possible. (ping=${connection.ping.udp})`);
        try {
            const resource = await nextTrack.createAudioResource(highPing);
            this.subscription.player.play(resource);
			this.queueLock = false;
		} catch (error) {
			// If an error occurred, try the next item of the queue instead
            const content = getResourceString('WARNING_PLAYER_CREATE_SOURCE_ERROR', this.locale, nextTrack.title ? nextTrack.title : nextTrack.url);
            const errorMessage = new Message(MessageType.Warning, content);
            errorMessage.addData('MESSAGE_FIELD_TITLE_DETAILS', error.toString());
            this.messageChannel.send({embeds: [ errorMessage.createMessage(locale) ]});
			this.queueLock = false;
			return await this.next();
		}
    }
}

module.exports = {
    Player
}