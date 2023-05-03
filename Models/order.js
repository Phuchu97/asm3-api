const mongoose = require('mongoose');

const orderSchema = mongoose.Schema({
    list_cart: Array,
    user_id: String,
    total: Number,
    name_order: String,
    phone: Number,
    address: String,
    email: String,
    delivery: Number,
    status: Number
})

const OrderModel = mongoose.model('orders', orderSchema);
module.exports = OrderModel;