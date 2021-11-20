const { Util } = require('discord.js');
const { getResourceString } = require('./string');

const MessageType = {
    Info: 'type_info',
    Success: 'type_success',
    Warning: 'type_warning',
    Error: 'type_error'
}

class Message {

    //Content and Keys in data can be a string resource.
    constructor(type, content, data) {
        this.type = type;
        this.content = content;
        this.data = data ? data : {};
    }
    
    addData(key, value) {
        this.data[key] = value;
        return this;
    }
    
    createMessage(locale) {
        const messageObject = {};
        messageObject.description = getResourceString(this.content, locale);
        messageObject.fields = [];
        if(this.data) {
            const dataKeys = Object.keys(this.data);
            for(var i in dataKeys) {
                const field = {};
                field.name = getResourceString(dataKeys[i], locale)
                field.value = this.data[dataKeys[i]];
                messageObject.fields.push(field);
            }
        }
        switch(this.type) {
            case MessageType.Info:
                messageObject.title = getResourceString('MESSAGE_TITLE_INFO', locale);
                messageObject.color = Util.resolveColor('BLUE');
                break;
            case MessageType.Success:
                messageObject.title = getResourceString('MESSAGE_TITLE_SUCCESS', locale);
                messageObject.color = Util.resolveColor('GREEN');
                break;
            case MessageType.Warning:
                messageObject.title = getResourceString('MESSAGE_TITLE_WARNING', locale);
                messageObject.color = Util.resolveColor('YELLOW');
                break;
            case MessageType.Error:
                messageObject.title = getResourceString('MESSAGE_TITLE_ERROR', locale);
                messageObject.color = Util.resolveColor('RED');
                break;
        }
        return messageObject;
    }
}

module.exports = {
    Message, MessageType
}