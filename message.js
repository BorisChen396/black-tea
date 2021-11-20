const { Util } = require('discord.js');

const string = require('./string.json');

const MessageType = {
    Info: 'type_info',
    Success: 'type_success',
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
            case MessageType.Info:
                messageObject.title = string.MESSAGE_TITLE_INFO;
                messageObject.color = Util.resolveColor('BLUE');
                break;
            case MessageType.Success:
                messageObject.title = string.MESSAGE_TITLE_SUCCESS;
                messageObject.color = Util.resolveColor('GREEN');
                break;
            case MessageType.Warning:
                messageObject.title = string.MESSAGE_TITLE_WARNING;
                messageObject.color = Util.resolveColor('YELLOW');
                break;
            case MessageType.Error:
                messageObject.title = string.MESSAGE_TITLE_ERROR;
                messageObject.color = Util.resolveColor('RED');
                break;
        }
        return messageObject;
    }
}

module.exports = {
    Message, MessageType
}