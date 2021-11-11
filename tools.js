module.exports = {
    log
}

function log(msg, gid) {
    console.log(`[${new Date().toISOString()}] ${gid ? gid + ": " : ""}${msg}`);
}