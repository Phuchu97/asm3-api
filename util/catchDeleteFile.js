const helpDelete = require('../util/delete');

const catchDeleteFile = reqInput => {
    if(reqInput.files) {
        reqInput.files.forEach(obj => {
            helpDelete.deleteFile(obj.path);
        })
    }
    if(reqInput.file) {
        helpDelete.deleteFile(req.file.path);
    }
}

module.exports = {
    catchDeleteFile,
}