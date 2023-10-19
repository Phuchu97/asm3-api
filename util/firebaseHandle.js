const { storage } = require('./configFirebase');
const { deleteObject,ref } = require('firebase/storage');

const deleteFile = (imageUpload) => {
    const imageRef = ref(storage,imageUpload);
    deleteObject(imageRef);
};

module.exports = {
    deleteFile,
}