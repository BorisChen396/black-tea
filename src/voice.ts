import { AudioPlayerStatus, createAudioPlayer, createAudioResource, demuxProbe, DiscordGatewayAdapterCreator, entersState, getVoiceConnection, joinVoiceChannel, NoSubscriberBehavior, VoiceConnectionReadyState, VoiceConnectionStatus } from "@discordjs/voice";
import { spawn } from "child_process";
import { Collection, Colors, EmbedBuilder, Guild, MessageCreateOptions, MessagePayload, TextChannel } from "discord.js";
import { ChildProcess } from 'child_process';

export function join(channelId:string, guildId:string, adapterCreater:DiscordGatewayAdapterCreator):Promise<string> {
    return new Promise(async (resolve, reject) => {
        let connection = getVoiceConnection(guildId);
        if(connection) {
            if(connection.joinConfig.channelId == null) {
                reject(new Error('Channel ID is null.'));
                return;
            }
            if(connection.state.status === VoiceConnectionStatus.Disconnected) {
                reject('Previous connection hasn\'t been destroy.');
                return;
            }
            resolve(connection.joinConfig.channelId);
            return;
        }
        connection = joinVoiceChannel({
            channelId: channelId,
            guildId: guildId,
            adapterCreator: adapterCreater
        });
        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            if(!connection) return;
            try {
                await Promise.race([
                    entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
                ]);
                // Seems to be reconnecting to a new channel - ignore disconnect
            } catch (error) {
                // Seems to be a real disconnect which SHOULDN'T be recovered from
                connection.destroy();
                playerInfos.delete(connection.joinConfig.guildId);
            }
        });
        try {
            await entersState(connection, VoiceConnectionStatus.Ready, 5_000);
            resolve(channelId);
        } catch (e) {
            console.error(`Unable to connect to ${channelId}. (status=${connection.state.status})`);
            connection.destroy();
            reject();
        }
    });
}

export function addItem(query:string):Promise<ItemInfo[]> {
    return new Promise(async resolve => {
        try {
            new URL(query);
        } catch (e) {
            query = 'ytsearch:' + query;
        }
        let response = await getYtdlInfo(query || '');
        let result = [] as ItemInfo[];
        if(response._type === 'playlist') {
            for(let item of response.entries) {
                result.push({
                    url: item.url,
                    title: item.title
                });
            }
        }
        else result.push({
            url: response.webpage_url,
            title: response.title
        });
        resolve(result);
    });
}

export function skipTo(guild:Guild, index:number):Promise<void> {
    return new Promise(async (resolve, reject) => {
        let playerInfo = playerInfos.get(guild.id);
        if(!playerInfo) {
            reject(`Player info of ${guild.id} is null.`);
            return;
        }
        if(!playerInfo.queue[index]) {
            reject('No such item.');
            return;
        }

        let connection = getVoiceConnection(guild.id);
        if(connection?.state.status !== VoiceConnectionStatus.Ready) {
            reject(new Error('Connection is not ready.'));
            return;
        }

        let player = (connection?.state as VoiceConnectionReadyState).subscription?.player;
        if(!player) {
            player = createAudioPlayer({
                behaviors: {
                    noSubscriber: NoSubscriberBehavior.Pause,
                },
            });
            player.on(AudioPlayerStatus.Idle, () => {
                if(guild) next(guild).catch(console.error);
            });
            player.on('error', console.error);
            connection.subscribe(player);
        }

        if(playerInfo?.queuelock) {
            reject('Queue lock held.');
            return;
        }
        playerInfo.queuelock = true;

        if(playerInfo.ytdlProcess && playerInfo.ytdlProcess.exitCode === null)
            playerInfo.ytdlProcess.kill('SIGINT');

        let ytdlProcess = spawn('youtube-dl', [
            '--rm-cache-dir',
            '--no-warnings',
            '-q',
            '-f', 'bestaudio[ext=webm]/bestaudio/best',
            '-o', '-',
            '--', playerInfo.queue[index].url || ''
        ]);
        playerInfo.ytdlProcess = ytdlProcess;
        let ytdlError = '';
        ytdlProcess.stderr.on('data', data => ytdlError += data);
        ytdlProcess.once('close', code => {
            if(code === 0 || ytdlProcess.killed) return;
            process.stderr.write(ytdlError);
            let embed = new EmbedBuilder()
                    .setTitle('Youtube-dl Error')
                    .setDescription(ytdlError)
                    .setColor(Colors.Red);
            sendMessage(guild, playerInfo?.channelId, {embeds: [ embed ]});
        });
        try {
            let { stream, type } = await demuxProbe(ytdlProcess.stdout);
            player.play(createAudioResource(stream, { inputType: type }));
            playerInfo.currentIndex = index;
            playerInfos.set(guild.id, playerInfo);
        } catch (e) {
            reject(e);
            return;
        } finally {
            playerInfo.queuelock = false;
        }

        let response = await getYtdlInfo(playerInfo.queue[index].url || '');
        if(playerInfo.channelId) {
            let channel = guild.channels.cache.get(playerInfo.channelId);
            if(channel instanceof TextChannel) {
                let embed = new EmbedBuilder().setTitle(response.title)
                        .setDescription(`Playing #${index + 1}, ${playerInfo.queue.length} item(s) queued.`)
                        .setAuthor({
                            name: response.uploader,
                            url: response.uploader_url
                        })
                        .setThumbnail(response.thumbnail)
                        .setURL(response.webpage_url);
                await sendMessage(guild, playerInfo.channelId, {embeds: [ embed ]});
            }
        }
        resolve();
    });
}

function getYtdlInfo(url:string):Promise<any> {
    return new Promise((resolve, reject) => {
        let ytdl = spawn('youtube-dl', [
            '--rm-cache-dir',
            '--no-warnings',
            '--flat-playlist',
            '-q',
            '-f', 'bestaudio[ext=webm]/bestaudio/best',
            '-J',
            '--', url || ''
        ]);
        let errorData = '', responseData = '';
        ytdl.stderr.on('data', data => errorData += data);
        ytdl.stdout.on('data', data => responseData += data);
        ytdl.once('close', async code => {
            if(code !== 0) reject(errorData);
            else resolve(JSON.parse(responseData));
        });
    });
}

export function next(guild:Guild):Promise<number> {
    return new Promise((resolve, reject) => {
        let playerInfo = playerInfos.get(guild.id);
        let nextIndex = 0;
        if(playerInfo?.currentIndex != undefined) 
            nextIndex = playerInfo?.currentIndex;
        if(++nextIndex >= (playerInfo?.queue.length || 0)) {
            reject('Index out of bounds.');
            return;
        }
        skipTo(guild, nextIndex).then(() => resolve(nextIndex)).catch(reject);
    });
}

export function prev(guild:Guild):Promise<number> {
    return new Promise((resolve, reject) => {
        let playerInfo = playerInfos.get(guild.id);
        let prevIndex = 0;
        if(playerInfo?.currentIndex != undefined) 
            prevIndex = playerInfo?.currentIndex;
        if(--prevIndex < 0) {
            reject('Index out of bounds.');
            return;
        }
        skipTo(guild, prevIndex).then(() => resolve(prevIndex)).catch(reject);
    });
}

async function sendMessage(guild:Guild, channelId:string|undefined, message:string | MessagePayload | MessageCreateOptions) {
    if(channelId) {
        let channel = guild.channels.cache.get(channelId);
        if(channel instanceof TextChannel) try {
            await channel.send(message);
        } catch (e) {
            console.error('Unable to send the message.');
            console.error(message);
        }
    }
    else {
        console.error('Channel ID is null.');
        console.error(message);
    }
}

export const playerInfos = new Collection<string, PlayerInfo>();

export class PlayerInfo {
    guildId:string | null = null;
    queue:ItemInfo[] = [];
    queuelock? = false;
    currentIndex? = 0;
    channelId?:string;
    ytdlProcess?:ChildProcess
}

export class ItemInfo {
    url = null as string | null;
    title = null as string | null;
}