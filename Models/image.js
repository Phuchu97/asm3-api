const mongoose = require('mongoose');

const ImageSchema = mongoose.Schema({
    name: String,
    image: Object
})

const ImageModel = mongoose.model('imageModel',ImageSchema);
module.exports = ImageModel;