const mongoose = require('mongoose');

const catgoriesSchema = mongoose.Schema({
    name: String,
    image: Object
});

const CategoriesModel = mongoose.model('categories',catgoriesSchema);
module.exports = CategoriesModel;