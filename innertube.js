const got = require('got');
const tools = require('./tools.js');

module.exports = {
    getList, getUrl
}

const contexts = {
    ANDROID: {
        context: {
            client: {
                clientName: 'ANDROID',
                clientVersion: '16.43.34'
            }
        }
    },
    WEB_REMIX: {
        context: {
            client: {
                clientName: 'WEB_REMIX',
                clientVersion: '1.20211101.00.00'
            }
        }
    }
}

async function getList(listId) {
    const result = [];
    const req = {
        playlistId: listId,
        context: contexts.WEB_REMIX.context
    };
    try {
        const response = await got.post(getAPIUrl('next'), { json: req }).json();
        const playlist = response.contents
            .singleColumnMusicWatchNextResultsRenderer
            .tabbedRenderer
            .watchNextTabbedResultsRenderer
            .tabs[0]
            .tabRenderer
            .content
            .musicQueueRenderer
            .content
            .playlistPanelRenderer
            .contents;
        for(var i in playlist) {
            if(playlist[i].playlistPanelVideoRenderer) {
                result[result.length] = playlist[i].playlistPanelVideoRenderer.videoId;
            }
        }
    } catch (e) {
        tools.log(`Failed to get the playlist info. (listId=${listId})`);
        console.log(e);
        console.log();
    }
    return result;
}

async function getUrl(videoId) {
    var result = null;
    const req = {
        videoId: videoId,
        context: contexts.ANDROID.context
    }
    try {
        const response = await got.post(getAPIUrl('player'), { json: req }).json();
        if(response.playabilityStatus.offlineability) {
            const formats = response.streamingData.adaptiveFormats;
            for(var i in formats) {
                if(formats[i].mimeType.includes('audio') && formats[i].audioQuality === "AUDIO_QUALITY_MEDIUM")
                    result = formats[i].url;
            }
        }
    } catch (e) {
        tools.log(`Failed to get the audio url. (videoId=${videoId})`);
        console.log(e);
        console.log();
    }
    return result;
}

function getAPIUrl(endpoint) {
    return `https://youtubei.googleapis.com/youtubei/v1/${endpoint}?key=AIzaSyDCU8hByM-4DrUqRUYnGn-3llEO78bcxq8`;
}
