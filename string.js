const resource = {
    'default': require('./string/en-US.json'),
    'en-US': require('./string/en-US.json'),
    'zh-TW': require('./string/zh-TW.json'),
}

function formatString(string, ...args) {
    if(typeof string !== 'string') string = JSON.stringify(string);
    for(var i in args) {
        string = string.replace('$$$', args[i]);
    }
    return string.replace('\\$\\$\\$', '$$$');
};

function getResourceString(key, locale, ...args) {
    var string = resource[Object.keys(resource).includes(locale) ? locale : 'default'][key];
    if(!string) string = key;
    return formatString(string, ...args);
}

function getTranslated() {
    return Object.keys(resource);
}

module.exports = {
    getTranslated, getResourceString
}