/* Ref: https://github.com/discordjs/voice/blob/main/examples/music-bot/src/music/track.ts */

const ytdl = require('youtube-dl-exec');
const voice = require('@discordjs/voice');

class Track {
    constructor(url) {
        this.url = url;
    }

    createAudioResource(useLowQuality) {
        return new Promise((resolve, reject) => {
            const lowQualityParams = {
                o: '-',
                f: 'worstaudio[ext=webm]/worst[ext=webm]/worstaudio/worst'
            };
            const highQualityParams = {
                o: '-',
                f: 'bestaudio[ext=webm]/best[ext=webm]/bestaudio/best'
            };
            const process = ytdl.raw(
                this.url, 
                useLowQuality ? lowQualityParams : highQualityParams,
                { stdio: ['ignore', 'pipe', 'ignore'] }
            );
            if(!process.stdout) {
                reject('No audio source available.');
                return;
            }
            const stream = process.stdout;
            const onError = (error) => {
                if (!process.killed) process.kill();
                stream.resume();
                reject(error);
            };
            process.once('spawn', () => {
                voice.demuxProbe(stream)
                    .then(probe => {
                        if(probe.type !== voice.StreamType.WebmOpus) console.log('Warning: Not selecting a webm opus stream.')
                        resolve(voice.createAudioResource(probe.stream, { metadata: this, inputType: probe.type }));
                    }).catch(onError);
                }).catch(onError);
        });
    }
}

module.exports = {
    Track
}