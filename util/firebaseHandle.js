const { storage } = require('./configFirebase');
const { deleteObject, ref, refFromURL } = require('firebase/storage');

const deleteFile = (imageUpload) => {
    if (!imageUpload) return;

    const imageRef =
        typeof imageUpload === 'string' && imageUpload.startsWith('http')
            ? refFromURL(imageUpload)
            : ref(storage, imageUpload);

    return deleteObject(imageRef);
};

module.exports = {
    deleteFile,
}