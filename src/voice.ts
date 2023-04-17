import { AudioPlayerStatus, VoiceConnectionReadyState, VoiceConnectionStatus, createAudioPlayer, createAudioResource, demuxProbe, getVoiceConnection } from "@discordjs/voice";
import { spawn } from "child_process";
import { BaseMessageOptions, Colors, EmbedBuilder } from "discord.js";
import config from './config.json' assert { type: 'json' }
import { request } from "https";
import { Routes } from "discord.js";
import { REST } from "discord.js";

const voiceData : Map<string, {
    channelId? : string,
    index : number,
    queue : {
        url : string,
        title : string
    }[]
}> = new Map();

export class Voice {
    static add(guildId : string, url : string) {
        try {
            new URL(url);
        } catch (e) {
            url = 'ytsearch:' + url;
        }
        return new Promise<{ count : number, title : string }>(async (resolve, reject) => {
            let guildVoiceData = voiceData.get(guildId);
            if(!guildVoiceData) {
                guildVoiceData = {
                    index: 0,
                    queue: []
                };
                voiceData.set(guildId, guildVoiceData);
            }
            let autoplayIndex = guildVoiceData.queue.length;
            let ytdlRawResponse = await getURLInfo(url).catch(reject);
            if(!ytdlRawResponse) return;
            let ytdlResponse = JSON.parse(ytdlRawResponse);
            if(ytdlResponse._type === 'playlist') {
                for(let entry of ytdlResponse.entries) {
                    guildVoiceData.queue.push({
                        url: entry.url,
                        title: entry.title
                    });
                }
                resolve({
                    count: ytdlResponse.entries.length,
                    title: ytdlResponse.title
                });
            }
            else if(ytdlResponse._type === 'video') {
                guildVoiceData.queue.push({
                    url: ytdlResponse.webpage_url,
                    title: ytdlResponse.title
                });
                resolve({
                    count: 1,
                    title: ytdlResponse.title
                });
            }
            else {
                reject(new YtdlError(`Returned type is invalid. Receiving "${ytdlResponse._type}".`));
                return;
            }

            let connection = getVoiceConnection(guildId);
            if(connection && connection.state.status === VoiceConnectionStatus.Ready) {
                let player = connection.state.subscription?.player;
                if(!player || player.state.status === AudioPlayerStatus.Idle)
                    this.skipTo(guildId, autoplayIndex)
                        .then(message => this.#sendMessage(guildId, { embeds: [ message.data ]}).catch(console.error))
                        .catch(e => {
                            console.error(e);
                            if(!(e instanceof Error)) return;
                            let message = new EmbedBuilder()
                                .setTitle(e.name)
                                .setDescription(e.message)
                                .setColor(Colors.Red);
                            this.#sendMessage(guildId, { embeds: [ message.data ]}).catch(console.error);
                        });
            }
        });
    }

    static skipTo(guildId : string, index : number) {
        const url = voiceData.get(guildId)?.queue[index]?.url;
        const playPromise = new Promise<void>(async (resolve, reject) => {
            if(!url) {
                reject(new Error('No such item.'));
                return;
            }
            const connection = getVoiceConnection(guildId);
            if(!connection || connection.state.status !== VoiceConnectionStatus.Ready) {
                reject(new Error('Voice connection is not ready.'));
                return;
            }
            const player = connection.state.subscription?.player ?? 
                createAudioPlayer().on(AudioPlayerStatus.Idle, () => {
                    const queueLength = voiceData.get(guildId)?.queue.length ?? 0;
                    if(queueLength > index + 1) this.next(guildId).catch(console.error);
                }).on('unsubscribe', () => console.log('Player is unsubscribed.'));
            if(!connection.state.subscription) connection.subscribe(player);
            player.stop(true);
            
            const ytdlProcess = spawn('yt-dlp', [
                '--rm-cache-dir',
                '--no-warnings',
                '-q',
                '-o', '-',
                '--', url
            ]).on('error', e => {
                this.#sendMessage(guildId, { embeds: [
                    new EmbedBuilder()
                        .setTitle(e.name)
                        .setDescription(e.message)
                        .setColor(Colors.Red)
                        .data
                ]}).catch(console.error);
            }).on('close', (code, signal) => {
                if(code === 0 || signal === 'SIGINT') return;
                this.#sendMessage(guildId, { embeds: [
                    new EmbedBuilder()
                        .setTitle('Youtube-dl Playback Error')
                        .setDescription(ytdlProcess.stderr.read())
                        .setColor(Colors.Red)
                        .data
                ]}).catch(console.error);
            });
            let probeInfo = await demuxProbe(ytdlProcess.stdout).catch(reject);
            if(!probeInfo) return;
            player.once(AudioPlayerStatus.Idle, () => {
                if(ytdlProcess.exitCode === null) ytdlProcess.kill('SIGINT');
            }).play(createAudioResource(probeInfo.stream, { inputType: probeInfo.type }));
            resolve();
        });
        const metadataPromise = new Promise<EmbedBuilder>((resolve, reject) => {
            const queueLength = voiceData.get(guildId)?.queue.length;
            getURLInfo(url ?? '').then(ytdlRawResponse => {
                let ytdlResponse = JSON.parse(ytdlRawResponse);
                const message = new EmbedBuilder()
                    .setTitle(ytdlResponse.title)
                    .setDescription(`Playing #${index + 1}, ${queueLength} item(s) queued.`)
                    .setURL(ytdlResponse.webpage_url)
                    .setThumbnail(ytdlResponse.thumbnail)
                    .setColor(Colors.Green);
                if(ytdlResponse.uploader) message.setAuthor({
                    name: ytdlResponse.uploader,
                    url: ytdlResponse.uploader_url
                });
                resolve(message);
            }).catch(e => {
                const message = new EmbedBuilder()
                    .setTitle('Unable to Get the Metadata')
                    .setDescription('An error has occurred.')
                    .setColor(Colors.Red);
                if(e instanceof Error) 
                    message.setTitle(e.name).setDescription(e.message);
                resolve(message);
            });
        });
        
        return new Promise<EmbedBuilder>((resolve, reject) => 
            Promise.all([playPromise, metadataPromise])
                .then(([, message]) => resolve(message))
                .catch(reject));
    }

    static next(guildId : string) {
        return this.skipTo(guildId, (voiceData.get(guildId)?.index ?? -1) + 1);
    }
    
    static cleanup(guildId : string) {
        voiceData.delete(guildId);
    }

    static setChannel(guildId : string, channelId : string) {
        let guildVoiceData = voiceData.get(guildId);
        if(!guildVoiceData) return;
        guildVoiceData.channelId = channelId;
    }

    static #sendMessage(guildId : string, message : BaseMessageOptions) {
        return new Promise<void>((resolve, reject) => {
            let channelId = voiceData.get(guildId)?.channelId;
            if(!channelId) {
                reject(new Error('Channel ID is not specified.\n' + JSON.stringify(message)));
                return;
            }
            new REST().setToken(config.token)
                .post(Routes.channelMessages(channelId), { body: message })
                .then(() => resolve())
                .catch(reject);
        });
    }
}

class YtdlError extends Error {}

const getURLInfo = (url : string) => new Promise<any>((resolve, reject) => {
    let ytdlProcess = spawn('yt-dlp', [
        '--flat-playlist',
        '--rm-cache-dir',
        '--no-warnings',
        '-q',
        '-J',
        '--playlist-end', '100',
        '--', url
    ]);
    let ytdlResponse = '', ytdlError = '';
    ytdlProcess.stdout.on('data', data => ytdlResponse += data);
    ytdlProcess.stderr.on('data', data => ytdlError += data);
    ytdlProcess.once('close', code => {
        if(code === 0) resolve(ytdlResponse);
        else reject(new YtdlError(ytdlError));
    }).once('error', e => reject(e));
});