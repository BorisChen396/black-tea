class Table {
    constructor() {
        this.content = [];
        this.lineCount = 0;
    }
    
    addRow(...args) {
        if(this.lineCount < args.length) {
            this.lineCount = args.length;
        }
        const row = [];
        for(var i in args) {
            row.push(typeof args[i] === 'string' ? args[i] : JSON.stringify(args[i]));
        }
        this.content.push(row);
    }

    create() {
        var table = '';
        for(var i in this.content) {
            var row = '';
            for(var j = 0; j < this.lineCount; j++) {
                var value = this.content[i][j];
                if(!value) value = '';
                value = ' ' + value + ' ';
                while(value.length < this.getLineLength(j)) value += ' ';
                value += '|';
                row += value;
            }
            table += row.slice(0, -1) + '\n';
            if(i == 0) {
                for(var i = 0; i < this.lineCount; i++) {
                    for(var j = 0; j < this.getLineLength(i); j++) table += '-';
                    table += '|';
                }
                table = table.slice(0, -1) + '\n';
            }
        }
        return table.slice(0, -1);
    }

    getLineLength(lineIndex) {
        const lengths = [];
        for(var i in this.content) {
            lengths.push(this.getStringByteLength(this.content[i][lineIndex]));
        }
        return lengths.sort((a, b) => b - a)[0] + 2;
    }

    getStringByteLength(string) {
        var byteLength = 0;
        for(var i in string) {
            var s = string.charCodeAt(i);
            while(s > 0) {
                byteLength++;
                s = s >> 8;
            }
        }
        return byteLength;
    }
}

module.exports = {
    Table
}