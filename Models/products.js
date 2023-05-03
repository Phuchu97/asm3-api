const mongoose = require('mongoose');

const productsSchema = mongoose.Schema({
    name: String,
    image: Array,
    price: Number,
    description_sale: String,
    description_detail: String,
    category_id: String,
    category_product: String
});

const ProductsModel = mongoose.model('products',productsSchema);
module.exports = ProductsModel;