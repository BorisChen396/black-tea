/* Ref: https://github.com/discordjs/voice/blob/main/examples/music-bot/src/music/track.ts */

const ytdl = require('youtube-dl-exec');
const voice = require('@discordjs/voice');
const { getInfo } = require('ytdl-core');

const TrackType = {
    YOUTUBE: 'type_youtube',
}

class Track {
    constructor(type, title, data) {
        this.type = type;
        this.title = title;
        this.data = data;
    }

    static async from(type, data) {
        switch(type) {
            case TrackType.YOUTUBE:
                return new this(type, (await getInfo(data.videoId)).videoDetails.title, data);
            default:
                return;
        }
    }

    createAudioResource(useLowQuality) {
        switch(this.type) {
            case TrackType.YOUTUBE:
                return this.createYouTubeAudioResource(useLowQuality);
            default:
                return;
        }
    }

    createYouTubeAudioResource(useLowQuality) {
        return new Promise((resolve, reject) => {
            const subprocess = ytdl.raw(
                `https://youtu.be/${this.data.videoId}`,
				{
					o: '-',
					q: '',
					f: useLowQuality ? '250' : '251',
					r: '100K',
				},
				{ stdio: ['ignore', 'pipe', 'ignore'] }
            );
            if(!subprocess.stdout) {
                console.error('Process has no output!');
                reject('Process has no output!');
                return;
            }
			const stream = subprocess.stdout;
			const onError = (error) => {
				if (!subprocess.killed) subprocess.kill();
				stream.resume();
				reject(error);
			};
			subprocess.once('spawn', () => {
                voice.demuxProbe(stream)
                    .then((probe) => {
                        if(probe.type !== voice.StreamType.WebmOpus) console.log('Not using webm opus stream!')
                        resolve(voice.createAudioResource(probe.stream, { metadata: this, inputType: probe.type }));
                    })
                    .catch(onError);
                })
                .catch(onError);
        });
    }
}

module.exports = {
    Track, TrackType
}