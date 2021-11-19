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
        const messageObject = {};
        messageObject.description = this.content;
        messageObject.fields = [];
        if(this.data) {
            const dataKeys = Object.keys(this.data);
            for(var i in dataKeys) {
                const field = {};
                field.name = string[dataKeys[i]] ? string[dataKeys[i]] : dataKeys[i];
                field.value = this.data[dataKeys[i]];
                messageObject.fields.push(field);
            }
        }
        switch(this.type) {
            case MessageType.Warning:
                messageObject.title = string.MESSAGE_TITLE_WARNING;
                messageObject.color = 0xfcd734;
                break;
            case MessageType.Error:
                messageObject.title = string.MESSAGE_TITLE_ERROR;
                messageObject.color = 0xff0000;
                break;
        }
        return messageObject;
    }
}

module.exports = {
    Message, MessageType
}