const mongoose = require('mongoose');

const slideMiddleSchema = mongoose.Schema({
    name: String,
    description: String,
    image: Array,
})

const SlideMiddleModel = mongoose.model('slideMiddle', slideMiddleSchema);
module.exports = SlideMiddleModel;