import { spawn } from "child_process";
import { REST, Routes } from "discord.js";
import { BaseMessageOptions } from "discord.js";
import { EmbedBuilder } from "discord.js";
import config from './config.json' assert { type: 'json' };
import { Colors } from "discord.js";
import { AudioPlayerStatus, VoiceConnectionStatus, createAudioPlayer, createAudioResource, demuxProbe, getVoiceConnection } from "@discordjs/voice";
import { errorEmbed } from "./embeds.js";

const ytdlExec = 'yt-dlp';
const ytdlArgs = [
    '--rm-cache-dir',
    '--no-warnings',
    '-q'
];
const voiceData = new Map<string, {
    channelId? : string,
    autoplayIndex? : number, 
    queueLock : boolean, 
    queue : {
        url : string,
        title : string
    }[]
}>();

export class Voice {
    static addItem(guildId : string, url : string) {
        try {
            new URL(url);
        } catch (e) {
            url = `ytsearch:${url}`;
        }
        return new Promise<{ title : string, count : number }>(async (resolve, reject) => {
            let guildVoiceData = voiceData.get(guildId);
            if(!guildVoiceData) {
                guildVoiceData = {
                    queueLock: false,
                    queue: []
                };
                voiceData.set(guildId, guildVoiceData);
            }
            if(guildVoiceData.queueLock) {
                reject(new Error('Queue lock is held.'));
                return;
            }
            guildVoiceData.queueLock = true;
            
            let autoplayIndex = guildVoiceData.queue.length;
            let urlInfo = await getURLInfo(url).catch(reject);
            if(urlInfo._type === 'video') {
                guildVoiceData.queue.push({
                    url: urlInfo.webpage_url,
                    title: urlInfo.title
                });
                resolve({ title: urlInfo.title, count: 1 });
            }
            else if(urlInfo._type === 'playlist') {
                for(let entry of urlInfo.entries) {
                    guildVoiceData.queue.push({
                        url: entry.url,
                        title: entry.title
                    });
                }
                resolve({
                    title: urlInfo.entries.length > 1 ? urlInfo.title : urlInfo.entries[0]?.title,
                    count: urlInfo.entries.length
                });
            }
            else {
                reject(new Error(`Unsupported type "${urlInfo._type}".`));
                return;
            }
            guildVoiceData.queueLock = false;

            let connection = getVoiceConnection(guildId);
            if(connection?.state.status === VoiceConnectionStatus.Ready) {
                let player = connection.state.subscription?.player;
                if(!player || player.state.status === AudioPlayerStatus.Idle)
                    this.skipTo(guildId, autoplayIndex).then(message => {
                        this.#sendMessage(guildId, { embeds: [ message.data ]}).catch(console.error);
                    }).catch(e => {
                        this.#sendMessage(guildId, { embeds: [ errorEmbed(e).data ]}).catch(console.error);
                    });
            }
        }).finally(() => {
            let guildVoiceData = voiceData.get(guildId);
            if(guildVoiceData) guildVoiceData.queueLock = false;
        });
    }

    static skipTo(guildId : string, index : number) {
        const playPromise = new Promise<void>(async (resolve, reject) => {
            let guildVoiceData = voiceData.get(guildId);
            if(!guildVoiceData) {
                reject(new Error('This guild does not have a voice data.'));
                return;
            }
            if(guildVoiceData.queueLock) {
                reject(new Error('Queue lock is held.'));
                return;
            }
            guildVoiceData.queueLock = true;
            let item = guildVoiceData.queue[index];
            if(!item) {
                reject(new Error('No such item.'));
                return;
            }
            let connection = getVoiceConnection(guildId);
            if(connection?.state.status !== VoiceConnectionStatus.Ready) {
                reject(new Error(`Voice connection is not in ready state. (state=${connection?.state.status})`));
                return;
            }
            connection.state.subscription?.unsubscribe();

            let ytdlProcess = spawn(ytdlExec, ytdlArgs.concat([
                '-f', 'bestaudio[ext=webm]/bestaudio/best',
                '-o', '-',
                '--', item.url
            ]));
            let ytdlStderr : any[] = [];
            ytdlProcess.stderr.on('data', chunk => ytdlStderr.push(chunk));
            ytdlProcess.on('close', (code, signal) => {
                if(code === 0 || ytdlProcess.killed) return;
                this.#sendMessage(guildId, { embeds: [
                    new EmbedBuilder()
                        .setTitle('Youtube-dl Playback Error')
                        .setDescription(`Process exited with code ${code}, signal ${signal}.\n${Buffer.concat(ytdlStderr).toString().trim() || 'No error output.'}`)
                        .setColor(Colors.Red)
                        .data
                ]}).catch(console.error);
            });
            let probeInfo = await demuxProbe(ytdlProcess.stdout).catch(reject);
            if(!probeInfo) return;
            
            let player = createAudioPlayer().on('unsubscribe', subscription => {
                if(subscription.player.state.status !== AudioPlayerStatus.Idle)
                    subscription.player.stop(true);
            }).on(AudioPlayerStatus.Idle, () => {
                if(ytdlProcess.exitCode === null && !ytdlProcess.killed)
                    ytdlProcess.kill('SIGINT');
            });
            let subscription = connection.subscribe(player);
            player.on(AudioPlayerStatus.Idle, () => {
                subscription?.unsubscribe();
            });
            player.play(createAudioResource(probeInfo.stream, { inputType: probeInfo.type }));

            guildVoiceData.autoplayIndex = index;
            resolve();
        }).finally(() => {
            let guildVoiceData = voiceData.get(guildId);
            if(guildVoiceData) guildVoiceData.queueLock = false;
        });
        const metadataPromise = new Promise<EmbedBuilder>((resolve, reject) => {
            getURLInfo(voiceData.get(guildId)?.queue[index]?.url ?? '').then(response => {
                let message = new EmbedBuilder()
                    .setTitle(response.title)
                    .setDescription(`Playing #${index + 1}, ${voiceData.get(guildId)?.queue.length} item(s) queued.`)
                    .setColor(Colors.Green)
                    .setURL(response.webpage_url)
                    .setThumbnail(response.thumbnail);
                if(response.uploader) message.setAuthor({
                    name: response.uploader,
                    url: response.uploader_url
                });
                resolve(message);
            }).catch(reject);
        });
        return new Promise<EmbedBuilder>((resolve, reject) => {
            Promise.all([playPromise, metadataPromise])
                .then(([, message]) => resolve(message))
                .catch(reject);
        });
    }

    static next(guildId : string) {
        let nextIndex = (voiceData.get(guildId)?.autoplayIndex ?? -1) + 1;
        return this.skipTo(guildId, nextIndex);
    }

    static setChannel(guildId : string, channelId : string) {
        let guildVoiceData = voiceData.get(guildId);
        if(guildVoiceData) guildVoiceData.channelId = channelId;
        else console.log(`Warning: Not setting channel ID as guild ${guildId} does not have a voice data.`);
    }

    static cleanup(guildId : string) {
        voiceData.delete(guildId);
    }

    static #sendMessage(guildId : string, message : BaseMessageOptions) {
        return new Promise<void>((resolve, reject) => {
            let channelId = voiceData.get(guildId)?.channelId;
            if(!channelId) {
                reject(new Error(`No channel ID is specified. Raw message:\n${JSON.stringify(message)}`));
                return;
            }
            new REST().setToken(config.token)
                .post(Routes.channelMessages(channelId), { body: message })
                .then(() => resolve()).catch(reject);
        });
    }
}

const getURLInfo = (url : string) => new Promise<any>((resolve, reject) => {
    let ytdlProcess = spawn(ytdlExec, ytdlArgs.concat([
        '--flat-playlist',
        '-J',
        '--playlist-end', '100',
        '--', url
    ]));
    const ytdlStdout : any[] = [], ytdlStderr : any[] = [];
    ytdlProcess.stdout.on('data', chunk => ytdlStdout.push(chunk));
    ytdlProcess.stderr.on('data', chunk => ytdlStderr.push(chunk));
    ytdlProcess.on('close', code => {
        if(code === 0) resolve(JSON.parse(Buffer.concat(ytdlStdout).toString()));
        else reject(new YtdlError(Buffer.concat(ytdlStderr).toString()));
    });
});

class YtdlError extends Error {}