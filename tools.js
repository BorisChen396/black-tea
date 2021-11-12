module.exports = {
    log
}

function log(msg, gid) {
    console.log(`${gid ? gid + ": " : ""}${msg}`);
}