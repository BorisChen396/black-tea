const { MessageEmbed } = require('discord.js');

const string = require('./string.json');

const MessageType = {
    Warning: 'type_warning',
    Error: 'type_error'
}

class Message {
    constructor(type, content, data) {
        this.type = type;
        this.content = content;
        this.data = data ? data : {};
    }
    
    addData(key, value) {
        this.data[key] = value;
        return this;
    }
    
    createMessage() {
        const message = new MessageEmbed();
        message.setDescription(this.content);
        if(this.data) {
            const dataKeys = Object.keys(this.data);
            for(var i in dataKeys) {
                const title = string[dataKeys[i]] ? string[dataKeys[i]] : dataKeys[i];
                message.addField(title, this.data[dataKeys[i]]);
            }
        }
        switch(this.type) {
            case MessageType.Warning:
                message.setTitle(string.MESSAGE_TITLE_WARNING)
                    .setColor('#FEDE00');
                break;
            case MessageType.Error:
                message.setTitle(string.MESSAGE_TITLE_ERROR)
                    .setColor('#FF0000');
                break;
        }
        return message;
    }
}

module.exports = {
    Message, MessageType
}