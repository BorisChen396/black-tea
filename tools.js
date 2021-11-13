module.exports = {
    log, error
}

function log(msg, gid) {
    console.log(`${gid ? gid + ": " : ""}${msg}`);
}

function error(msg, gid) {
    console.error(`${gid ? gid + ": " : ""}${msg}`);
}