const mongoose = require('mongoose');

const cartSchema = mongoose.Schema({
    name_product: String,
    product_id: String,
    category_product_name: String,
    category_id: String,
    price_product: Number,
    quantity: Number,
    image: Object,
    user_id: String,
})

const CartModel = mongoose.model('carts', cartSchema);
module.exports = CartModel;